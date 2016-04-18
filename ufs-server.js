domain = Npm.require('domain');
fs = Npm.require('fs');
Future = Npm.require('fibers/future');
http = Npm.require('http');
https = Npm.require('https');
mkdirp = Npm.require('mkdirp');
stream = Npm.require('stream');
zlib = Npm.require('zlib');

Meteor.startup(function () {
    var path = UploadFS.config.tmpDir;
    var mode = '0744';

    fs.stat(path, function (err) {
        if (err) {
            // Create the temp directory
            mkdirp(path, {mode: mode}, function (err) {
                if (err) {
                    console.error('ufs: cannot create temp directory at ' + path + ' (' + err.message + ')');
                } else {
                    console.log('ufs: temp directory created at ' + path);
                }
            });
        } else {
            // Set directory permissions
            fs.chmod(path, mode, function (err) {
                err && console.error('ufs: cannot set temp directory permissions ' + mode + ' (' + err.message + ')');
            });
        }
    });
});

// Create domain to handle errors
// and possibly avoid server crashes.
var d = domain.create();

d.on('error', function (err) {
    console.error('ufs: ' + err.message);
});

// Listen HTTP requests to serve files
WebApp.connectHandlers.use(function (req, res, next) {
    // Quick check to see if request should be catch
    if (req.url.indexOf(UploadFS.config.storesPath) === -1) {
        next();
        return;
    }

    // Remove store path
    var path = req.url.substr(UploadFS.config.storesPath.length + 1);

    // Get store, file Id and file name
    var regExp = new RegExp('^\/([^\/]+)\/([^\/]+)(?:\/([^\/]+))?$');
    var match = regExp.exec(path);

    if (match !== null) {
        // Get store
        var storeName = match[1];
        var store = UploadFS.getStore(storeName);

        if (!store) {
            res.writeHead(404);
            res.end();
            return;
        }

        if (typeof store.onRead !== 'function') {
            console.error('ufs: store "' + storeName + '" onRead is not a function');
            res.writeHead(500);
            res.end();
            return;
        }

        // Remove file extension from file Id
        var index = match[2].indexOf('.');
        var fileId = index !== -1 ? match[2].substr(0, index) : match[2];

        // Get file from database
        var file = store.getCollection().findOne(fileId);
        if (!file) {
            res.writeHead(404);
            res.end();
            return;
        }

        // Simulate read speed
        if (UploadFS.config.simulateReadDelay) {
            Meteor._sleepForMs(UploadFS.config.simulateReadDelay);
        }

        d.run(function () {
            // Check if the file can be accessed
            if (store.onRead.call(store, fileId, file, req, res)) {
                // Open the file stream
                var rs = store.getReadStream(fileId, file);
                var ws = new stream.PassThrough();

                rs.on('error', function (err) {
                    store.onReadError.call(store, err, fileId, file);
                    res.end();
                });
                ws.on('error', function (err) {
                    store.onReadError.call(store, err, fileId, file);
                    res.end();
                });
                ws.on('close', function () {
                    // Close output stream at the end
                    ws.emit('end');
                });

                var accept = '';
                var headers = {
                    'Content-Type': file.type,
                    'Content-Length': file.size
                };

                if (typeof req.headers === 'object') {
                    accept = req.headers['accept-encoding'];
                }

                // Transform stream
                store.transformRead(rs, ws, fileId, file, req, headers);

                // Compress data using gzip
                if (accept.match(/\bgzip\b/)) {
                    headers['Content-Encoding'] = 'gzip';
                    delete headers['Content-Length'];
                    res.writeHead(200, headers);
                    ws.pipe(zlib.createGzip()).pipe(res);
                }
                // Compress data using deflate
                else if (accept.match(/\bdeflate\b/)) {
                    headers['Content-Encoding'] = 'deflate';
                    delete headers['Content-Length'];
                    res.writeHead(200, headers);
                    ws.pipe(zlib.createDeflate()).pipe(res);
                }
                // Send raw data
                else {
                    res.writeHead(200, headers);
                    ws.pipe(res);
                }
            } else {
                res.end();
            }
        });

    } else {
        next();
    }
});

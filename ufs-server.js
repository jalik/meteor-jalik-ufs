const domain = Npm.require('domain');
const fs = Npm.require('fs');
const http = Npm.require('http');
const https = Npm.require('https');
const mkdirp = Npm.require('mkdirp');
const stream = Npm.require('stream');
const URL = Npm.require('url');
const zlib = Npm.require('zlib');


Meteor.startup(function () {
    let path = UploadFS.config.tmpDir;
    let mode = '0744';

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
let d = domain.create();

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
    let parsedUrl = URL.parse(req.url);
    let path = parsedUrl.pathname.substr(UploadFS.config.storesPath.length + 1);

    if (req.method === 'POST') {
        // Get store
        let regExp = new RegExp('^\/([^\/\?]+)\/([^\/\?]+)$');
        let match = regExp.exec(path);

        // Request is not valid
        if (match === null) {
            res.writeHead(400);
            res.end();
            return;
        }

        // Get store
        let store = UploadFS.getStore(match[1]);
        if (!store) {
            res.writeHead(404);
            res.end();
            return;
        }

        // Get file
        let fileId = match[2];
        let file = store.getCollection().find(fileId);
        if (!file) {
            res.writeHead(404);
            res.end();
            return;
        }

        let tmpFile = UploadFS.getTempFilePath(fileId);
        let ws = fs.createWriteStream(tmpFile, {flags: 'a'});
        let fields = {uploading: true};
        let progress = parseFloat(req.query.progress);
        if (!isNaN(progress) && progress > 0) {
            fields.progress = Math.min(progress, 1);
        }

        req.on('data', (chunk) => {
            ws.write(chunk);
        });
        req.on('error', (err) => {
            res.writeHead(500);
            res.end();
        });
        req.on('end', Meteor.bindEnvironment(function () {
            // Update completed state
            store.getCollection().update(fileId, {$set: fields});
            ws.end();
        }));
        ws.on('error', (err) => {
            console.error('ufs: cannot write chunk of file "' + fileId + '" (' + err.message + ')');
            fs.unlink(tmpFile, (err) => {
                err && console.error('ufs: cannot delete temp file ' + tmpFile + ' (' + err.message + ')');
            });
            res.writeHead(500);
            res.end();
        });
        ws.on('finish', function () {
            res.writeHead(204, {"Content-Type": 'text/plain'});
            res.end();
        });
    }
    else if (req.method == 'GET') {
        // Get store, file Id and file name
        let regExp = new RegExp('^\/([^\/\?]+)\/([^\/\?]+)(?:\/([^\/\?]+))?$');
        let match = regExp.exec(path);

        if (match !== null) {
            // Get store
            let storeName = match[1];
            let store = UploadFS.getStore(storeName);

            if (!store) {
                res.writeHead(404);
                res.end();
                return;
            }

            if (store.onRead !== null && store.onRead !== undefined && typeof store.onRead !== 'function') {
                console.error('ufs: store "' + storeName + '" onRead is not a function');
                res.writeHead(500);
                res.end();
                return;
            }

            // Remove file extension from file Id
            let index = match[2].indexOf('.');
            let fileId = index !== -1 ? match[2].substr(0, index) : match[2];

            // Get file from database
            let file = store.getCollection().findOne(fileId);
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
                if (store.onRead.call(store, fileId, file, req, res) !== false) {
                    // Open the file stream
                    let rs = store.getReadStream(fileId, file);
                    let ws = new stream.PassThrough();

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

                    let headers = {
                        'Content-Type': file.type,
                        'Content-Length': file.size
                    };

                    // Transform stream
                    store.transformRead(rs, ws, fileId, file, req, headers);

                    // Parse headers
                    if (typeof req.headers === 'object') {
                        // Compress data using accept-encoding header
                        if (typeof req.headers['accept-encoding'] === 'string') {
                            let accept = req.headers['accept-encoding'];

                            // Compress with gzip
                            if (accept.match(/\bgzip\b/)) {
                                headers['Content-Encoding'] = 'gzip';
                                delete headers['Content-Length'];
                                res.writeHead(200, headers);
                                ws.pipe(zlib.createGzip()).pipe(res);
                                return;
                            }
                            // Compress with deflate
                            else if (accept.match(/\bdeflate\b/)) {
                                headers['Content-Encoding'] = 'deflate';
                                delete headers['Content-Length'];
                                res.writeHead(200, headers);
                                ws.pipe(zlib.createDeflate()).pipe(res);
                                return;
                            }
                        }
                    }

                    // Send raw data
                    if (!headers['Content-Encoding']) {
                        res.writeHead(200, headers);
                        ws.pipe(res);
                    }

                } else {
                    res.end();
                }
            });
        }
    } else {
        next();
    }
});

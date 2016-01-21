if (Meteor.isServer) {
    domain = Npm.require('domain');
    fs = Npm.require('fs');
    Future = Npm.require('fibers/future');
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

    Meteor.methods({
        /**
         * Completes the file transfer
         * @param fileId
         * @param storeName
         */
        ufsComplete: function (fileId, storeName) {
            check(fileId, String);
            check(storeName, String);

            // Allow other uploads to run concurrently
            this.unblock();

            var store = UploadFS.getStore(storeName);
            if (!store) {
                throw new Meteor.Error(404, 'store "' + storeName + '" does not exist');
            }
            // Check that file exists and is owned by current user
            if (store.getCollection().find({_id: fileId, userId: this.userId}).count() < 1) {
                throw new Meteor.Error(404, 'file "' + fileId + '" does not exist');
            }

            var fut = new Future();
            var tmpFile = UploadFS.getTempFilePath(fileId);

            // Get the temp file
            var rs = fs.createReadStream(tmpFile, {
                flags: 'r',
                encoding: null,
                autoClose: true
            });

            rs.on('error', Meteor.bindEnvironment(function () {
                store.getCollection().remove(fileId);
            }));

            // Save file in the store
            store.write(rs, fileId, Meteor.bindEnvironment(function (err, file) {
                fs.unlink(tmpFile, function (err) {
                    err && console.error('ufs: cannot delete temp file ' + tmpFile + ' (' + err.message + ')');
                });

                if (err) {
                    fut.throw(err);
                } else {
                    fut.return(file);
                }
            }));
            return fut.wait();
        },

        /**
         * Saves a chunk of file
         * @param chunk
         * @param fileId
         * @param storeName
         * @param progress
         * @return {*}
         */
        ufsWrite: function (chunk, fileId, storeName, progress) {
            check(fileId, String);
            check(storeName, String);

            this.unblock();

            // Check arguments
            if (!(chunk instanceof Uint8Array)) {
                throw new Meteor.Error(400, 'chunk is not an Uint8Array');
            }
            if (chunk.length <= 0) {
                throw new Meteor.Error(400, 'chunk is empty');
            }

            var store = UploadFS.getStore(storeName);
            if (!store) {
                throw new Meteor.Error(404, 'store ' + storeName + ' does not exist');
            }

            // Check that file exists, is not complete and is owned by current user
            if (store.getCollection().find({_id: fileId, complete: false, userId: this.userId}).count() < 1) {
                throw new Meteor.Error(404, 'file ' + fileId + ' does not exist');
            }

            var fut = new Future();
            var tmpFile = UploadFS.getTempFilePath(fileId);

            // Save the chunk
            fs.appendFile(tmpFile, new Buffer(chunk), Meteor.bindEnvironment(function (err) {
                if (err) {
                    console.error('ufs: cannot write chunk of file "' + fileId + '" (' + err.message + ')');
                    fs.unlink(tmpFile, function (err) {
                        err && console.error('ufs: cannot delete temp file ' + tmpFile + ' (' + err.message + ')');
                    });
                    fut.throw(err);
                } else {
                    // Update completed state
                    store.getCollection().update(fileId, {
                        $set: {progress: progress}
                    });
                    fut.return(chunk.length);
                }
            }));
            return fut.wait();
        }
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

                    var accept = req.headers['accept-encoding'] || '';
                    var headers = {
                        'Content-Type': file.type,
                        'Content-Length': file.size
                    };

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
}

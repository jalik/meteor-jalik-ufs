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
     * Imports a file from the URL
     * @param url
     * @param file
     * @param storeName
     * @return {*}
     */
    ufsImportURL: function (url, file, storeName) {
        check(url, String);
        check(file, Object);
        check(storeName, String);

        this.unblock();

        var store = UploadFS.getStore(storeName);
        if (!store) {
            throw new Meteor.Error(404, 'Store "' + storeName + '" does not exist');
        }

        try {
            // Extract file info
            if (!file.name) {
                file.name = url.replace(/\?.*$/, '').split('/').pop();
                file.extension = file.name.split('.').pop();
                file.type = 'image/' + file.extension;
            }
            // Check if file is valid
            if (store.getFilter() instanceof UploadFS.Filter) {
                store.getFilter().check(file);
            }
            // Create the file
            var fileId = store.create(file);

        } catch (err) {
            throw new Meteor.Error(500, err.message);
        }

        var fut = new Future();
        var proto;

        // Detect protocol to use
        if (/http:\/\//i.test(url)) {
            proto = http;
        } else if (/https:\/\//i.test(url)) {
            proto = https;
        }

        // Download file
        proto.get(url, Meteor.bindEnvironment(function (res) {
            // Save the file in the store
            store.write(res, fileId, function (err, file) {
                if (err) {
                    fut.throw(err);
                } else {
                    fut.return(fileId);
                }
            });
        })).on('error', function (err) {
            fut.throw(err);
        });
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
        check(progress, Number);

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

var stores = {};

UploadFS = {
    config: {},
    store: {},
    /**
     * Returns the store by its name
     * @param name
     * @return {UploadFS.Store}
     */
    getStore: function (name) {
        return stores[name];
    },
    /**
     * Returns all stores
     * @return {object}
     */
    getStores: function () {
        return stores;
    },
    /**
     * Returns file and data as ArrayBuffer for each files in the event
     * @param event
     * @param callback
     */
    readAsArrayBuffer: function (event, callback) {
        // Check arguments
        if (typeof callback !== 'function') {
            throw new TypeError('callback is not a function');
        }

        var reader = new FileReader();
        var files = event.target.files;

        for (var i = 0; i < files.length; i += 1) {
            var file = files[i];

            (function (file) {
                reader.onloadend = function (ev) {
                    callback.call(UploadFS, ev.target.result, file);
                };
                reader.readAsArrayBuffer(file);
            })(file);
        }
    }
};


if (Meteor.isServer) {
    var Future = Npm.require('fibers/future');
    var mkdirp = Npm.require('mkdirp');
    var fs = Npm.require('fs');

    /**
     * The path to store uploads before saving to a store
     * @type {string}
     */
    UploadFS.config.tmpDir = '/tmp/ufs';

    // Create the temporary upload dir
    Meteor.startup(function () {
        createTempDir();
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

            // Check arguments
            if (!stores[storeName]) {
                throw new Error('store does not exist');
            }
            var store = stores[storeName];

            // Check that file exists and is owned by current user
            if (store.getCollection().find({_id: fileId, userId: this.userId}).count() < 1) {
                throw new Error('file does not exist');
            }

            var fut = new Future();
            var tmpFile = UploadFS.config.tmpDir + '/' + fileId;
            var writeStream = store.getWriteStream(fileId);
            var readStream = fs.createReadStream(tmpFile, {
                flags: 'r',
                encoding: null,
                autoClose: true
            });

            readStream.on('error', function (err) {
                console.error(err);
                store.delete(fileId);
                fut.throw(err);
            });

            writeStream.on('error', function (err) {
                console.error(err);
                store.delete(fileId);
                fut.throw(err);
            });

            writeStream.on('finish', Meteor.bindEnvironment(function () {
                // Delete the temporary file
                Meteor.setTimeout(function () {
                    fs.unlink(tmpFile);
                }, 500);

                // Sets the file URL when file transfer is complete,
                // this way, the image will loads entirely.
                store.getCollection().update(fileId, {
                    $set: {
                        complete: true,
                        uploading: false,
                        uploadedAt: new Date(),
                        url: store.getFileURL(fileId)
                    }
                });

                fut.return(true);
            }));

            // Execute transformation
            store.transform(readStream, writeStream, fileId);

            return fut.wait();
        },

        /**
         * Saves a chunk of file
         * @param chunk
         * @param fileId
         * @param storeName
         * @return {*}
         */
        ufsWrite: function (chunk, fileId, storeName) {
            check(fileId, String);
            check(storeName, String);

            // Check arguments
            if (!(chunk instanceof Uint8Array)) {
                throw new TypeError('chunk is not an Uint8Array');
            }
            if (chunk.length <= 0) {
                throw new Error('chunk is empty');
            }
            if (!stores[storeName]) {
                throw new Error('store does not exist');
            }

            var store = stores[storeName];

            // Check that file exists, is not complete and is owned by current user
            if (store.getCollection().find({_id: fileId, complete: false, userId: this.userId}).count() < 1) {
                throw new Error('file does not exist');
            }

            var fut = new Future();
            var tmpFile = UploadFS.config.tmpDir + '/' + fileId;
            fs.appendFile(tmpFile, new Buffer(chunk), function (err) {
                if (err) {
                    console.error(err);
                    fs.unlink(tmpFile);
                    fut.throw(err);
                } else {
                    fut.return(chunk.length);
                }
            });
            return fut.wait();
        }
    });
}

function createTempDir() {
    var path = UploadFS.config.tmpDir;
    mkdirp(path, function (err) {
        if (err) {
            console.error('ufs: cannot create tmpDir ' + path);
        } else {
            console.log('ufs: created tmpDir ' + path);
        }
    });
}
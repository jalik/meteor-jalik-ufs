/**
 * File store
 * @param options
 * @constructor
 */
UploadFS.Store = function (options) {
    var self = this;

    // Set default options
    options = _.extend({
        collection: null,
        filter: null,
        name: null,
        onCopyError: null,
        onFinishUpload: null,
        onRead: null,
        onReadError: null,
        onWriteError: null,
        transformRead: null,
        transformWrite: null
    }, options);

    // Check instance
    if (!(self instanceof UploadFS.Store)) {
        throw new Error('UploadFS.Store is not an instance');
    }

    // Check options
    if (!(options.collection instanceof Mongo.Collection)) {
        throw new TypeError('collection is not a Mongo.Collection');
    }
    if (options.filter && !(options.filter instanceof UploadFS.Filter)) {
        throw new TypeError('filter is not an UploadFS.Filter');
    }
    if (typeof options.name !== 'string') {
        throw new TypeError('name is not a string');
    }
    if (UploadFS.getStore(options.name)) {
        throw new TypeError('name already exists');
    }
    if (options.onCopyError && typeof options.onCopyError !== 'function') {
        throw new TypeError('onCopyError is not a function');
    }
    if (options.onFinishUpload && typeof options.onFinishUpload !== 'function') {
        throw new TypeError('onFinishUpload is not a function');
    }
    if (options.onRead && typeof options.onRead !== 'function') {
        throw new TypeError('onRead is not a function');
    }
    if (options.onReadError && typeof options.onReadError !== 'function') {
        throw new TypeError('onReadError is not a function');
    }
    if (options.onWriteError && typeof options.onWriteError !== 'function') {
        throw new TypeError('onWriteError is not a function');
    }
    if (options.transformRead && typeof options.transformRead !== 'function') {
        throw new TypeError('transformRead is not a function');
    }
    if (options.transformWrite && typeof options.transformWrite !== 'function') {
        throw new TypeError('transformWrite is not a function');
    }

    // Public attributes
    self.onCopyError = options.onCopyError || self.onCopyError;
    self.onFinishUpload = options.onFinishUpload || self.onFinishUpload;
    self.onRead = options.onRead || self.onRead;
    self.onReadError = options.onReadError || self.onReadError;
    self.onWriteError = options.onWriteError || self.onWriteError;

    // Private attributes
    var collection = options.collection;
    var copyTo = options.copyTo;
    var filter = options.filter;
    var name = options.name;
    var transformRead = options.transformRead;
    var transformWrite = options.transformWrite;

    // Add the store to the list
    UploadFS.getStores()[name] = self;

    /**
     * Creates the file in the collection
     * @param file
     * @return {string}
     */
    self.create = function (file) {
        check(file, Object);
        file.store = name;
        return self.getCollection().insert(file);
    };

    /**
     * Returns the collection
     * @return {Mongo.Collection}
     */
    self.getCollection = function () {
        return collection;
    };

    /**
     * Returns the file filter
     * @return {UploadFS.Filter}
     */
    self.getFilter = function () {
        return filter;
    };

    /**
     * Returns the store name
     * @return {string}
     */
    self.getName = function () {
        return name;
    };


    if (Meteor.isServer) {

        /**
         * Copies the file to a store
         * @param fileId
         * @param store
         * @param callback
         */
        self.copy = function (fileId, store, callback) {
            check(fileId, String);

            if (!(store instanceof UploadFS.Store)) {
                throw new TypeError('store is not an UploadFS.store.Store');
            }

            // Get original file
            var file = self.getCollection().findOne(fileId);
            if (!file) {
                throw new Meteor.Error(404, 'File not found');
            }

            // Prepare copy
            var copy = _.omit(file, '_id', 'url');
            copy.originalStore = self.getName();
            copy.originalId = fileId;

            // Create the copy
            var copyId = store.create(copy);

            // Get original stream
            var rs = self.getReadStream(fileId, file);

            // Catch errors to avoid app crashing
            rs.on('error', Meteor.bindEnvironment(function (error) {
                callback.call(self, error, null);
            }));

            // Copy file data
            store.write(rs, copyId, Meteor.bindEnvironment(function (err) {
                if (err) {
                    store.getCollection().remove(copyId);
                    self.onCopyError.call(self, err, fileId, file);
                }
                if (typeof callback === 'function') {
                    callback.call(self, err, copyId, copy, store);
                }
            }));
        };

        /**
         * Transforms the file on reading
         * @param readStream
         * @param writeStream
         * @param fileId
         * @param file
         * @param request
         * @param headers
         */
        self.transformRead = function (readStream, writeStream, fileId, file, request, headers) {
            if (typeof transformRead === 'function') {
                transformRead.call(self, readStream, writeStream, fileId, file, request, headers);
            } else {
                readStream.pipe(writeStream);
            }
        };

        /**
         * Transforms the file on writing
         * @param readStream
         * @param writeStream
         * @param fileId
         * @param file
         */
        self.transformWrite = function (readStream, writeStream, fileId, file) {
            if (typeof transformWrite === 'function') {
                transformWrite.call(self, readStream, writeStream, fileId, file);
            } else {
                readStream.pipe(writeStream);
            }
        };

        /**
         * Writes the file to the store
         * @param rs
         * @param fileId
         * @param callback
         */
        self.write = function (rs, fileId, callback) {
            var file = self.getCollection().findOne(fileId);
            var ws = self.getWriteStream(fileId, file);

            var errorHandler = Meteor.bindEnvironment(function (err) {
                self.getCollection().remove(fileId);
                self.onWriteError.call(self, err, fileId, file);
                callback.call(self, err);
            });

            ws.on('error', errorHandler);
            ws.on('finish', Meteor.bindEnvironment(function () {
                var size = 0;
                var readStream = self.getReadStream(fileId, file);

                readStream.on('error', Meteor.bindEnvironment(function (error) {
                    callback.call(self, error, null);
                }));
                readStream.on('data', Meteor.bindEnvironment(function (data) {
                    size += data.length;
                }));
                readStream.on('end', Meteor.bindEnvironment(function () {
                    // Set file attribute
                    file.complete = true;
                    file.progress = 1;
                    file.size = size;
                    file.token = UploadFS.generateToken();
                    file.uploading = false;
                    file.uploadedAt = new Date();
                    file.url = self.getFileURL(fileId);

                    // Sets the file URL when file transfer is complete,
                    // this way, the image will loads entirely.
                    self.getCollection().update(fileId, {
                        $set: {
                            complete: file.complete,
                            progress: file.progress,
                            size: file.size,
                            token: file.token,
                            uploading: file.uploading,
                            uploadedAt: file.uploadedAt,
                            url: file.url
                        }
                    });

                    // Return file info
                    callback.call(self, null, file);

                    // Execute callback
                    if (typeof self.onFinishUpload == 'function') {
                        self.onFinishUpload.call(self, file);
                    }

                    // Simulate write speed
                    if (UploadFS.config.simulateWriteDelay) {
                        Meteor._sleepForMs(UploadFS.config.simulateWriteDelay);
                    }

                    // Copy file to other stores
                    if (copyTo instanceof Array) {
                        for (var i = 0; i < copyTo.length; i += 1) {
                            var store = copyTo[i];

                            if (!store.getFilter() || store.getFilter().isValid(file)) {
                                self.copy(fileId, store);
                            }
                        }
                    }
                }));
            }));

            // Execute transformation
            self.transformWrite(rs, ws, fileId, file);
        };
    }

    // Code executed before inserting file
    collection.before.insert(function (userId, file) {
        if (typeof file.name !== 'string' || !file.name.length) {
            throw new Meteor.Error(400, "file name not defined");
        }
        if (typeof file.store !== 'string' || !file.store.length) {
            throw new Meteor.Error(400, "file store not defined");
        }
        if (typeof file.complete !== 'boolean') {
            file.complete = false;
        }
        if (typeof file.uploading !== 'boolean') {
            file.uploading = true;
        }
        file.extension = file.name && file.name.substr((~-file.name.lastIndexOf('.') >>> 0) + 2).toLowerCase();
        file.progress = parseFloat(file.progress) || 0;
        file.size = parseInt(file.size) || 0;
        file.userId = file.userId || userId;
    });

    // Code executed after removing file
    collection.after.remove(function (userId, file) {
        if (Meteor.isServer) {
            if (copyTo instanceof Array) {
                for (var i = 0; i < copyTo.length; i += 1) {
                    // Remove copies in stores
                    copyTo[i].getCollection().remove({originalId: file._id});
                }
            }
        }
    });

    // Code executed before removing file
    collection.before.remove(function (userId, file) {
        if (Meteor.isServer) {
            // Delete the physical file in the store
            self.delete(file._id);

            var tmpFile = UploadFS.getTempFilePath(file._id);

            // Delete the temp file
            fs.stat(tmpFile, function (err) {
                !err && fs.unlink(tmpFile, function (err) {
                    err && console.error('ufs: cannot delete temp file at ' + tmpFile + ' (' + err.message + ')');
                });
            });
        }
    });

    collection.deny({
        // Test filter on file insertion
        insert: function (userId, file) {
            if (filter instanceof UploadFS.Filter) {
                filter.check(file);
            }
            return typeof options.insert === 'function'
                && !options.insert.apply(this, arguments);
        }
    });
};

/**
 * Returns the file URL
 * @param fileId
 */
UploadFS.Store.prototype.getFileURL = function (fileId) {
    var file = this.getCollection().findOne(fileId, {
        fields: {name: 1}
    });
    return file && this.getURL() + '/' + fileId + '/' + encodeURIComponent(file.name);
};

/**
 * Returns the store URL
 */
UploadFS.Store.prototype.getURL = function () {
    return Meteor.absoluteUrl(UploadFS.config.storesPath + '/' + this.getName(), {
        secure: UploadFS.config.https
    });
};

if (Meteor.isServer) {
    /**
     * Deletes a file async
     * @param fileId
     * @param callback
     */
    UploadFS.Store.prototype.delete = function (fileId, callback) {
        throw new Error('delete is not implemented');
    };

    /**
     * Returns the file read stream
     * @param fileId
     * @param file
     */
    UploadFS.Store.prototype.getReadStream = function (fileId, file) {
        throw new Error('getReadStream is not implemented');
    };

    /**
     * Returns the file write stream
     * @param fileId
     * @param file
     */
    UploadFS.Store.prototype.getWriteStream = function (fileId, file) {
        throw new Error('getWriteStream is not implemented');
    };

    /**
     * Callback for copy errors
     * @param err
     * @param fileId
     * @param file
     * @return boolean
     */
    UploadFS.Store.prototype.onCopyError = function (err, fileId, file) {
        console.error('ufs: cannot copy file "' + fileId + '" (' + err.message + ')');
    };

    /**
     * Called when a file has been uploaded
     * @param file
     */
    UploadFS.Store.prototype.onFinishUpload = function (file) {
    };

    /**
     * Called when a file is read from the store
     * @param fileId
     * @param file
     * @param request
     * @param response
     * @return boolean
     */
    UploadFS.Store.prototype.onRead = function (fileId, file, request, response) {
        return true;
    };

    /**
     * Callback for read errors
     * @param err
     * @param fileId
     * @param file
     * @return boolean
     */
    UploadFS.Store.prototype.onReadError = function (err, fileId, file) {
        console.error('ufs: cannot read file "' + fileId + '" (' + err.message + ')');
    };

    /**
     * Callback for write errors
     * @param err
     * @param fileId
     * @param file
     * @return boolean
     */
    UploadFS.Store.prototype.onWriteError = function (err, fileId, file) {
        console.error('ufs: cannot write file "' + fileId + '" (' + err.message + ')');
    };
}

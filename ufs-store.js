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

    // todo remove migration warning
    if (options.transform) {
        console.warn('ufs: store.transform() is deprecated, use store.transformWrite() instead !');
        options.transformWrite = options.transform;
    }

    // Check options
    if (!(options.collection instanceof Mongo.Collection)) {
        throw new TypeError('collection is not a Mongo.Collection');
    }
    if (options.filter && !(options.filter instanceof UploadFS.Filter) && typeof options.filter !== 'function') {
        throw new TypeError('filter is not an UploadFS.Filter or function');
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
    var filter = options.filter;
    var name = options.name;
    var transformRead = options.transformRead;
    var transformWrite = options.transformWrite;

    // Add the store to the list
    UploadFS.getStores()[name] = self;

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
         * Creates the file in the collection
         * @param file
         * @return {string}
         */
        self.create = function (file) {
            file.complete = false;
            file.progress = 0;
            file.store = name;
            file.uploading = true;
            return self.getCollection().insert(file);
        };

        /**
         * Transforms the file on reading
         * @param from
         * @param to
         * @param fileId
         * @param file
         * @param request
         * @param headers
         */
        self.transformRead = function (from, to, fileId, file, request, headers) {
            if (typeof transformRead === 'function') {
                transformRead.call(self, from, to, fileId, file, request, headers);
            } else {
                from.pipe(to);
            }
        };

        /**
         * Transforms the file on writing
         * @param from
         * @param to
         * @param fileId
         * @param file
         */
        self.transformWrite = function (from, to, fileId, file) {
            if (typeof transformWrite === 'function') {
                transformWrite.call(self, from, to, fileId, file);
            } else {
                from.pipe(to);
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
            var errorHandler = function (err) {
                self.getCollection().remove(fileId);
                self.onWriteError.call(self, err, fileId, file);
                callback.call(self, err);
            };

            rs.on('error', Meteor.bindEnvironment(errorHandler));
            ws.on('error', Meteor.bindEnvironment(errorHandler));
            ws.on('finish', Meteor.bindEnvironment(function () {
                var size = 0;
                var from = self.getReadStream(fileId, file);

                from.on('data', function (data) {
                    size += data.length;
                });
                from.on('end', Meteor.bindEnvironment(function () {
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

                    // todo move copy code here

                    // Return file info
                    callback.call(self, null, file);

                    // Execute callback
                    if (typeof self.onFinishUpload == 'function') {
                        self.onFinishUpload.call(self, file);
                    }
                }));
            }));

            // Simulate write speed
            if (UploadFS.config.simulateWriteDelay) {
                Meteor._sleepForMs(UploadFS.config.simulateWriteDelay);
            }

            // todo execute copy after original file saved
            // Copy file to other stores
            if (options.copyTo instanceof Array) {
                for (var i = 0; i < options.copyTo.length; i += 1) {
                    var copyStore = options.copyTo[i];
                    var copyId = null;
                    var copy = _.omit(file, '_id', 'url');
                    copy.originalStore = self.getName();
                    copy.originalId = fileId;

                    try {
                        // Create the copy
                        copyId = copyStore.create(copy);

                        (function (copyStore, copyId, copy) {
                            // Write the copy
                            copyStore.write(rs, copyId, Meteor.bindEnvironment(function (err) {
                                if (err) {
                                    copyStore.getCollection().remove(copyId);
                                    self.onCopyError.call(self, err, copyId, copy);
                                }
                            }));
                        })(copyStore, copyId, copy);
                    } catch (err) {
                        copyStore.getCollection().remove(copyId);
                        self.onCopyError.call(self, err, copyId, copy);
                    }
                }
            }

            // Execute transformation
            self.transformWrite(rs, ws, fileId, file);
        };
    }

    collection.before.insert(function (userId, file) {
        file.complete = false;
        file.extension = file.name && file.name.substr((~-file.name.lastIndexOf('.') >>> 0) + 2).toLowerCase();
        file.progress = 0;
        file.uploading = true;
        file.userId = file.userId || userId;
    });

    collection.after.remove(function (userId, file) {
        if (Meteor.isServer) {
            if (options.copyTo instanceof Array) {
                for (var i = 0; i < options.copyTo.length; i += 1) {
                    // Remove copies in stores
                    options.copyTo[i].getCollection().remove({originalId: file._id});
                }
            }
        }
    });

    collection.before.remove(function (userId, file) {
        if (Meteor.isServer) {
            // Delete the physical file in the store
            self.delete(file._id);

            // Delete the temporary file if uploading
            if (file.uploading || !file.complete) {
                fs.unlink(UploadFS.getTempFilePath(file._id));
            }
        }
    });

    collection.deny({
        // Test filter on file insertion
        insert: function (userId, file) {
            if (filter) {
                if (filter instanceof UploadFS.Filter) {
                    filter.check(file);
                }
                if (typeof filter === 'function') {
                    filter.call(self, userId, file);
                }
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
    return file && this.getURL() + '/' + fileId + '/' + file.name;
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
        console.error('Error copying file ' + fileId + ' : ' + err.message);
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
        console.error('Error reading file ' + fileId + ' : ' + err.message);
    };

    /**
     * Callback for write errors
     * @param err
     * @param fileId
     * @param file
     * @return boolean
     */
    UploadFS.Store.prototype.onWriteError = function (err, fileId, file) {
        console.error('Error writing file ' + fileId + ' : ' + err.message);
    };
}

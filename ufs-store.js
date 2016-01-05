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
        onFinishUpload: null,
        onRead: null,
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
    if (options.filter && !(options.filter instanceof UploadFS.Filter)) {
        throw new TypeError('filter is not a UploadFS.Filter');
    }
    if (typeof options.name !== 'string') {
        throw new TypeError('name is not a string');
    }
    if (UploadFS.getStore(options.name)) {
        throw new TypeError('name already exists');
    }
    if (options.onFinishUpload && typeof options.onFinishUpload !== 'function') {
        throw new TypeError('onFinishUpload is not a function');
    }
    if (options.onRead && typeof options.onRead !== 'function') {
        throw new TypeError('onRead is not a function');
    }
    if (options.transformRead && typeof options.transformRead !== 'function') {
        throw new TypeError('transformRead is not a function');
    }
    if (options.transformWrite && typeof options.transformWrite !== 'function') {
        throw new TypeError('transformWrite is not a function');
    }

    // Public attributes
    self.onFinishUpload = options.onFinishUpload ? options.onFinishUpload : self.onFinishUpload;
    self.onRead = options.onRead ? options.onRead : self.onRead;

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
            file.uploading = true;
            file.uploaded = false;
            return self.getCollection().insert(file);
        };

        /**
         * Transforms the file on reading
         * @param from
         * @param to
         * @param fileId
         * @param file
         * @param request
         */
        self.transformRead = function (from, to, fileId, file, request) {
            if (typeof transformRead === 'function') {
                transformRead.call(self, from, to, fileId, file, request);
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

            rs.on('error', function (err) {
                callback.call(self, err);
                console.error(err);
                self.delete(fileId);
            });

            ws.on('error', function (err) {
                callback.call(self, err);
                console.error(err);
                self.delete(fileId);
            });

            ws.on('finish', Meteor.bindEnvironment(function () {
                // Set file attribute
                file.complete = true;
                file.uploading = false;
                file.uploadedAt = new Date();
                file.url = self.getFileURL(fileId);

                // Sets the file URL when file transfer is complete,
                // this way, the image will loads entirely.
                self.getCollection().update(fileId, {
                    $set: {
                        complete: true,
                        token: UploadFS.generateToken(),
                        uploading: false,
                        uploadedAt: file.uploadedAt,
                        url: file.url
                    }
                });

                // Return file info
                callback.call(self, null, file);

                // Execute callback
                if (typeof self.onFinishUpload == 'function') {
                    self.onFinishUpload(file);
                }
            }));

            // Simulate write speed
            if (UploadFS.config.simulateWriteDelay) {
                Meteor._sleepForMs(UploadFS.config.simulateWriteDelay);
            }

            // Execute transformation
            self.transformWrite(rs, ws, fileId, file);
        };
    }

    collection.before.insert(function (userId, file) {
        file.complete = false;
        file.uploading = true;
        file.store = name;
        file.extension = file.name.substr((~-file.name.lastIndexOf('.') >>> 0) + 2).toLowerCase();
        file.userId = userId;
    });

    collection.before.remove(function (userId, file) {
        if (Meteor.isServer) {
            // Delete the physical file in the store
            if (file.complete) {
                self.delete(file._id);
            }
            // Delete the temporary file if uploading
            if (file.uploading || !file.complete) {
                fs.unlink(UploadFS.getTempFilePath(file._id));
            }
        }
    });

    collection.deny({
        // Test filter on file insertion
        insert: function (userId, file) {
            filter && filter.check(file);
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
}

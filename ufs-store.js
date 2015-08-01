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
        console.warn('use transformWrite instead of transform, it will be removed in the next releases');
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
    self.onRead = options.onRead;

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
         * Transforms the file on reading
         * @param from
         * @param to
         * @param fileId
         * @param file
         */
        self.transformRead = function (from, to, fileId, file) {
            Meteor._sleepForMs(UploadFS.config.simulateReadDelay);

            if (typeof transformRead === 'function') {
                transformRead.call(self, from, to, fileId, file);
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
            Meteor._sleepForMs(UploadFS.config.simulateWriteDelay);

            if (typeof transformWrite === 'function') {
                transformWrite.call(self, from, to, fileId, file);
            } else {
                from.pipe(to);
            }
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
        fields: {extension: 1}
    });
    return file && this.getURL() + '/' + fileId + '.' + file.extension;
};

/**
 * Returns the store URL
 */
UploadFS.Store.prototype.getURL = function () {
    return Meteor.absoluteUrl(UploadFS.config.storesPath + '/' + this.getName());
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
     * Called when a file is read from the store
     * @param fileId
     * @param request
     * @param response
     */
    UploadFS.Store.prototype.onRead = function (fileId, request, response) {
    };
}
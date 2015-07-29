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
        transform: null
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
    if (options.transform && typeof options.transform !== 'function') {
        throw new TypeError('transform is not a function');
    }

    // Public attributes
    self.onRead = options.onRead;

    // Private attributes
    var collection = options.collection;
    var filter = options.filter;
    var name = options.name;
    var transform = options.transform;

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
         * Transforms the file on the fly
         * @param readStream
         * @param writeStream
         * @param fileId
         */
        self.transform = function (readStream, writeStream, fileId) {
            if (typeof transform === 'function') {
                transform.call(self, readStream, writeStream, fileId);
            } else {
                readStream.pipe(writeStream);
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
     */
    UploadFS.Store.prototype.getReadStream = function (fileId) {
        throw new Error('getReadStream is not implemented');
    };

    /**
     * Returns the file write stream
     * @param fileId
     */
    UploadFS.Store.prototype.getWriteStream = function (fileId) {
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
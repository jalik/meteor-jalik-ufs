import {_} from 'meteor/underscore';
import {check} from 'meteor/check';
import {Meteor} from 'meteor/meteor';
import {Mongo} from 'meteor/mongo';

/**
 * File store
 * @param options
 * @constructor
 */
UploadFS.Store = function (options) {
    let self = this;

    // Default options
    options = _.extend({
        collection: null,
        filter: null,
        name: null,
        onCopyError: null,
        onFinishUpload: null,
        onRead: null,
        onReadError: null,
        onWriteError: null,
        permissions: null,
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
        throw new TypeError('filter is not a UploadFS.Filter');
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
    if (options.permissions && !(options.permissions instanceof UploadFS.StorePermissions)) {
        throw new TypeError('permissions is not a UploadFS.StorePermissions');
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
    self.permissions = options.permissions;

    // Private attributes
    let collection = options.collection;
    let copyTo = options.copyTo;
    let filter = options.filter;
    let name = options.name;
    let transformRead = options.transformRead;
    let transformWrite = options.transformWrite;

    // Set default permissions
    if (!(self.permissions instanceof UploadFS.StorePermissions)) {
        // Uses user's default permissions or UFS default permissions
        if (UploadFS.config.defaultStorePermissions instanceof UploadFS.StorePermissions) {
            self.permissions = UploadFS.config.defaultStorePermissions;
        } else {
            self.permissions = new UploadFS.StorePermissions();
            console.warn(`ufs: permissions are not defined for store "${name}"`);
        }
    }

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

    /**
     * Defines the store permissions
     * @param permissions
     */
    self.setPermissions = function (permissions) {
        if (!(permissions instanceof UploadFS.StorePermissions)) {
            throw new TypeError("permissions is not an instance of UploadFS.StorePermissions");
        }
        self.permissions = permissions;
    };

    if (Meteor.isServer) {

        /**
         * Checks token validity
         * @param token
         * @param fileId
         * @returns {boolean}
         */
        self.checkToken = function (token, fileId) {
            check(token, String);
            check(fileId, String);
            return UploadFS.tokens.find({value: token, fileId: fileId}).count() === 1;
        };

        /**
         * Copies the file to a store
         * @param fileId
         * @param store
         * @param callback
         */
        self.copy = function (fileId, store, callback) {
            check(fileId, String);

            if (!(store instanceof UploadFS.Store)) {
                throw new TypeError('store is not a UploadFS.store.Store');
            }
            // Get original file
            let file = collection.findOne({_id: fileId});
            if (!file) {
                throw new Meteor.Error(404, 'File not found');
            }
            // Ignore the file if it does not match store filter
            let filter = store.getFilter();
            if (filter instanceof UploadFS.Filter && !filter.isValid(file)) {
                return;
            }

            // Prepare copy
            let copy = _.omit(file, '_id', 'url');
            copy.originalStore = self.getName();
            copy.originalId = fileId;

            // Create the copy
            let copyId = store.create(copy);

            // Get original stream
            let rs = self.getReadStream(fileId, file);

            // Catch errors to avoid app crashing
            rs.on('error', Meteor.bindEnvironment(function (err) {
                callback.call(self, err, null);
            }));

            // Copy file data
            store.write(rs, copyId, Meteor.bindEnvironment(function (err) {
                if (err) {
                    collection.remove({_id: copyId});
                    self.onCopyError.call(self, err, fileId, file);
                }
                if (typeof callback === 'function') {
                    callback.call(self, err, copyId, copy, store);
                }
            }));
        };

        /**
         * Creates the file in the collection
         * @param file
         * @param callback
         * @return {string}
         */
        self.create = function (file, callback) {
            check(file, Object);
            file.store = name;
            return collection.insert(file, callback);
        };

        /**
         * Creates a token for the file (only needed for client side upload)
         * @param fileId
         * @returns {*}
         */
        self.createToken = function (fileId) {
            let token = self.generateToken();

            // Check if token exists
            if (UploadFS.tokens.find({fileId: fileId}).count()) {
                UploadFS.tokens.update({fileId: fileId}, {
                    $set: {
                        createdAt: new Date(),
                        value: token
                    }
                });
            } else {
                UploadFS.tokens.insert({
                    createdAt: new Date(),
                    fileId: fileId,
                    value: token
                });
            }
            return token;
        };

        /**
         * Generates a random token
         * @param pattern
         * @return {string}
         */
        self.generateToken = function (pattern) {
            return (pattern || 'xyxyxyxyxy').replace(/[xy]/g, function (c) {
                let r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                let s = v.toString(16);
                return Math.round(Math.random()) ? s.toUpperCase() : s;
            });
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
            let file = collection.findOne({_id: fileId});
            let ws = self.getWriteStream(fileId, file);

            let errorHandler = Meteor.bindEnvironment(function (err) {
                collection.remove({_id: fileId});
                self.onWriteError.call(self, err, fileId, file);
                callback.call(self, err);
            });

            ws.on('error', errorHandler);
            ws.on('finish', Meteor.bindEnvironment(function () {
                let size = 0;
                let readStream = self.getReadStream(fileId, file);

                readStream.on('error', Meteor.bindEnvironment(function (error) {
                    callback.call(self, error, null);
                }));
                readStream.on('data', Meteor.bindEnvironment(function (data) {
                    size += data.length;
                }));
                readStream.on('end', Meteor.bindEnvironment(function () {
                    // Set file attribute
                    file.complete = true;
                    file.path = self.getFileRelativeURL(fileId);
                    file.progress = 1;
                    file.size = size;
                    file.token = self.generateToken();
                    file.uploading = false;
                    file.uploadedAt = new Date();
                    file.url = self.getFileURL(fileId);

                    // Sets the file URL when file transfer is complete,
                    // this way, the image will loads entirely.
                    collection.direct.update({_id: fileId}, {
                        $set: {
                            complete: file.complete,
                            path: file.path,
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
                        for (let i = 0; i < copyTo.length; i += 1) {
                            let store = copyTo[i];

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

    if (Meteor.isServer) {
        const fs = Npm.require('fs');

        // Code executed after removing file
        collection.after.remove(function (userId, file) {
            // Remove associated tokens
            UploadFS.tokens.remove({fileId: file._id});

            if (copyTo instanceof Array) {
                for (let i = 0; i < copyTo.length; i += 1) {
                    // Remove copies in stores
                    copyTo[i].getCollection().remove({originalId: file._id});
                }
            }
        });

        // Code executed before inserting file
        collection.before.insert(function (userId, file) {
            if (!self.permissions.checkInsert(userId, file)) {
                throw new Meteor.Error('forbidden', "Forbidden");
            }
        });

        // Code executed before updating file
        collection.before.update(function (userId, file, fields, modifiers) {
            if (!self.permissions.checkUpdate(userId, file, fields, modifiers)) {
                throw new Meteor.Error('forbidden', "Forbidden");
            }
        });

        // Code executed before removing file
        collection.before.remove(function (userId, file) {
            if (!self.permissions.checkRemove(userId, file)) {
                throw new Meteor.Error('forbidden', "Forbidden");
            }

            // Delete the physical file in the store
            self.delete(file._id);

            let tmpFile = UploadFS.getTempFilePath(file._id);

            // Delete the temp file
            fs.stat(tmpFile, function (err) {
                !err && fs.unlink(tmpFile, function (err) {
                    err && console.error(`ufs: cannot delete temp file at ${tmpFile} (${err.message})`);
                });
            });
        });
    }
};

/**
 * Returns the file URL
 * @param fileId
 */
UploadFS.Store.prototype.getFileRelativeURL = function (fileId) {
    let file = this.getCollection().findOne({_id: fileId}, {fields: {name: 1}});
    return file && this.getRelativeURL(fileId + '/' + encodeURIComponent(file.name));
};

/**
 * Returns the file URL
 * @param fileId
 */
UploadFS.Store.prototype.getFileURL = function (fileId) {
    let file = this.getCollection().findOne({_id: fileId}, {fields: {name: 1}});
    return file && this.getURL(fileId + '/' + encodeURIComponent(file.name));
};

/**
 * Returns the store relative URL
 * @param path
 */
UploadFS.Store.prototype.getRelativeURL = function (path) {
    return [UploadFS.config.storesPath, this.getName(), path].join('/').replace(/\/$/, '');
};

/**
 * Returns the store absolute URL
 * @param path
 */
UploadFS.Store.prototype.getURL = function (path) {
    return Meteor.absoluteUrl(this.getRelativeURL(path), {secure: UploadFS.config.https});
};

/**
 * Completes the file upload
 * @param url
 * @param file
 * @param callback
 */
UploadFS.Store.prototype.importFromURL = function (url, file, callback) {
    Meteor.call('ufsImportURL', url, file, this.getName(), callback);
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
        console.error(`ufs: cannot copy file "${fileId}" (${err.message})`, err);
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
        console.error(`ufs: cannot read file "${fileId}" (${err.message})`, err);
    };

    /**
     * Callback for write errors
     * @param err
     * @param fileId
     * @param file
     * @return boolean
     */
    UploadFS.Store.prototype.onWriteError = function (err, fileId, file) {
        console.error(`ufs: cannot write file "${fileId}" (${err.message})`, err);
    };
}

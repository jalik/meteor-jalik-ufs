/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2017 Karl STEIN
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */

import {_} from 'meteor/underscore';
import {check} from 'meteor/check';
import {Meteor} from 'meteor/meteor';
import {Mongo} from 'meteor/mongo';
import {UploadFS} from './ufs';
import {Filter} from './ufs-filter';
import {StorePermissions} from './ufs-store-permissions';
import {Tokens} from './ufs-tokens';


/**
 * File store
 */
export class Store {

    constructor(options) {
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
            onValidate: this.onValidate,
            onWriteError: null,
            permissions: null,
            transformRead: null,
            transformWrite: null
        }, options);

        // Check instance
        if (!(self instanceof Store)) {
            throw new Error('UploadFS.Store is not an instance');
        }

        // Check options
        if (!(options.collection instanceof Mongo.Collection)) {
            throw new TypeError('Store: collection is not a Mongo.Collection');
        }
        if (options.filter && !(options.filter instanceof Filter)) {
            throw new TypeError('Store: filter is not a UploadFS.Filter');
        }
        if (typeof options.name !== 'string') {
            throw new TypeError('Store: name is not a string');
        }
        if (UploadFS.getStore(options.name)) {
            throw new TypeError('Store: name already exists');
        }
        if (options.onCopyError && typeof options.onCopyError !== 'function') {
            throw new TypeError('Store: onCopyError is not a function');
        }
        if (options.onFinishUpload && typeof options.onFinishUpload !== 'function') {
            throw new TypeError('Store: onFinishUpload is not a function');
        }
        if (options.onRead && typeof options.onRead !== 'function') {
            throw new TypeError('Store: onRead is not a function');
        }
        if (options.onReadError && typeof options.onReadError !== 'function') {
            throw new TypeError('Store: onReadError is not a function');
        }
        if (options.onWriteError && typeof options.onWriteError !== 'function') {
            throw new TypeError('Store: onWriteError is not a function');
        }
        if (options.permissions && !(options.permissions instanceof StorePermissions)) {
            throw new TypeError('Store: permissions is not a UploadFS.StorePermissions');
        }
        if (options.transformRead && typeof options.transformRead !== 'function') {
            throw new TypeError('Store: transformRead is not a function');
        }
        if (options.transformWrite && typeof options.transformWrite !== 'function') {
            throw new TypeError('Store: transformWrite is not a function');
        }
        if (options.onValidate && typeof options.onValidate !== 'function') {
            throw new TypeError('Store: onValidate is not a function');
        }

        // Public attributes
        self.onCopyError = options.onCopyError || self.onCopyError;
        self.onFinishUpload = options.onFinishUpload || self.onFinishUpload;
        self.onRead = options.onRead || self.onRead;
        self.onReadError = options.onReadError || self.onReadError;
        self.onWriteError = options.onWriteError || self.onWriteError;
        self.permissions = options.permissions;
        self.onValidate = options.onValidate;

        // Private attributes
        let collection = options.collection;
        let copyTo = options.copyTo;
        let filter = options.filter;
        let name = options.name;
        let transformRead = options.transformRead;
        let transformWrite = options.transformWrite;

        // Set default permissions
        if (!(self.permissions instanceof StorePermissions)) {
            // Uses custom default permissions or UFS default permissions
            if (UploadFS.config.defaultStorePermissions instanceof StorePermissions) {
                self.permissions = UploadFS.config.defaultStorePermissions;
            } else {
                self.permissions = new StorePermissions();
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
            if (!(permissions instanceof StorePermissions)) {
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
                return Tokens.find({value: token, fileId: fileId}).count() === 1;
            };

            /**
             * Copies the file to a store
             * @param fileId
             * @param store
             * @param callback
             */
            self.copy = function (fileId, store, callback) {
                check(fileId, String);

                if (!(store instanceof Store)) {
                    throw new TypeError('store is not an instance of UploadFS.Store');
                }
                // Get original file
                let file = collection.findOne({_id: fileId});
                if (!file) {
                    throw new Meteor.Error('file-not-found', 'File not found');
                }
                // Silently ignore the file if it does not match filter
                let filter = store.getFilter();
                if (filter instanceof Filter && !filter.isValid(file)) {
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
                if (Tokens.find({fileId: fileId}).count()) {
                    Tokens.update({fileId: fileId}, {
                        $set: {
                            createdAt: new Date(),
                            value: token
                        }
                    });
                } else {
                    Tokens.insert({
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
                        file.etag = UploadFS.generateEtag();
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
                                etag: file.etag,
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
                Tokens.remove({fileId: file._id});

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

            /**
             * Deletes a file async
             * @param fileId
             * @param callback
             */
            self.delete = function (fileId, callback) {
                throw new Error('delete is not implemented');
            };

            /**
             * Returns the file read stream
             * @param fileId
             * @param file
             */
            self.getReadStream = function (fileId, file) {
                throw new Error('getReadStream is not implemented');
            };

            /**
             * Returns the file write stream
             * @param fileId
             * @param file
             */
            self.getWriteStream = function (fileId, file) {
                throw new Error('getWriteStream is not implemented');
            };

            /**
             * Callback for copy errors
             * @param err
             * @param fileId
             * @param file
             * @return boolean
             */
            self.onCopyError = function (err, fileId, file) {
                console.error(`ufs: cannot copy file "${fileId}" (${err.message})`, err);
            };

            /**
             * Called when a file has been uploaded
             * @param file
             */
            self.onFinishUpload = function (file) {
            };

            /**
             * Called when a file is read from the store
             * @param fileId
             * @param file
             * @param request
             * @param response
             * @return boolean
             */
            self.onRead = function (fileId, file, request, response) {
                return true;
            };

            /**
             * Callback for read errors
             * @param err
             * @param fileId
             * @param file
             * @return boolean
             */
            self.onReadError = function (err, fileId, file) {
                console.error(`ufs: cannot read file "${fileId}" (${err.message})`, err);
            };

            /**
             * Callback for write errors
             * @param err
             * @param fileId
             * @param file
             * @return boolean
             */
            self.onWriteError = function (err, fileId, file) {
                console.error(`ufs: cannot write file "${fileId}" (${err.message})`, err);
            };
        }
    }

    /**
     * Returns the file URL
     * @param fileId
     */
    getFileRelativeURL(fileId) {
        let file = this.getCollection().findOne(fileId, {fields: {name: 1}});
        return file ? this.getRelativeURL(`${fileId}/${file.name}`) : null;
    }

    /**
     * Returns the file URL
     * @param fileId
     */
    getFileURL(fileId) {
        let file = this.getCollection().findOne(fileId, {fields: {name: 1}});
        return file ? this.getURL(`${fileId}/${file.name}`) : null;
    }

    /**
     * Returns the store relative URL
     * @param path
     */
    getRelativeURL(path) {
        const rootUrl = Meteor.absoluteUrl().replace(/\/+$/, '');
        const rootPath = rootUrl.replace(/^[a-z]+:\/\/[^/]+\/*/gi, '');
        const storeName = this.getName();
        path = String(path).replace(/\/$/, '').trim();
        return encodeURI(`${rootPath}/${UploadFS.config.storesPath}/${storeName}/${path}`);
    }

    /**
     * Returns the store absolute URL
     * @param path
     */
    getURL(path) {
        const rootUrl = Meteor.absoluteUrl().replace(/\/+$/, '');
        const storeName = this.getName();
        path = String(path).replace(/\/$/, '').trim();
        return encodeURI(`${rootUrl}/${UploadFS.config.storesPath}/${storeName}/${path}`);
    }

    /**
     * Completes the file upload
     * @param url
     * @param file
     * @param callback
     */
    importFromURL(url, file, callback) {
        Meteor.call('ufsImportURL', url, file, this.getName(), callback);
    }

    /**
     * Validates the file
     * @param file
     */
    onValidate(file) {
    }

    /**
     * Validates the file
     * @param file
     */
    validate(file) {
        if (typeof this.onValidate === 'function') {
            this.onValidate(file);
        }
    }
}

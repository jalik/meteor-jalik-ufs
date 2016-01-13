/**
 * Upload manager
 * @param options
 * @constructor
 */
UploadFS.Uploader = function (options) {
    var self = this;

    // Set default options
    options = _.extend({
        chunkSize: 1024 * 8,
        data: null,
        file: null,
        maxTries: 5,
        store: null
    }, options);

    // Check instance
    if (!(self instanceof UploadFS.Uploader)) {
        throw new Error('UploadFS.Uploader is not an instance');
    }

    // Check options
    if (typeof options.chunkSize !== 'number') {
        throw new TypeError('chunkSize is not an number');
    }
    if (!(options.data instanceof ArrayBuffer)) {
        throw new TypeError('data is not an ArrayBuffer');
    }
    if (options.file === null || typeof options.file !== 'object') {
        throw new TypeError('file is not an object');
    }
    if (typeof options.maxTries !== 'number') {
        throw new TypeError('maxTries is not an number');
    }
    if (!(options.store instanceof UploadFS.Store)) {
        throw new TypeError('store is not an UploadFS.Store');
    }

    // Listeners
    if (typeof options.onComplete === 'function') {
        self.onComplete = options.onComplete;
    }
    if (typeof options.onError === 'function') {
        self.onError = options.onError;
    }

    // Public attributes
    self.chunkSize = parseInt(options.chunkSize);
    self.maxTries = parseInt(options.maxTries);

    // Private attributes
    var store = options.store;
    var data = options.data;
    var file = options.file;
    var fileId = null;
    var offset = 0;
    var total = options.data.byteLength;
    var tries = 0;

    var complete = new ReactiveVar(false);
    var loaded = new ReactiveVar(0);
    var uploading = new ReactiveVar(false);

    /**
     * Aborts the current transfer
     */
    self.abort = function () {
        uploading.set(false);

        // Remove the file from database
        store.getCollection().remove(fileId, function (err) {
            if (err) {
                console.error(err);
            } else {
                fileId = null;
                offset = 0;
                tries = 0;
                loaded.set(0);
                complete.set(false);
            }
        });
    };

    /**
     * Returns the file
     * @return {object}
     */
    self.getFile = function () {
        return file;
    };

    /**
     * Returns the loaded bits count
     * @return {number}
     */
    self.getLoaded = function () {
        return loaded.get();
    };

    /**
     * Returns current progress
     * @return {number}
     */
    self.getProgress = function () {
        return parseFloat((loaded.get() / total).toFixed(2));
    };

    /**
     * Checks if the transfer is complete
     * @return {boolean}
     */
    self.isComplete = function () {
        return complete.get();
    };

    /**
     * Checks if the transfer is active
     * @return {boolean}
     */
    self.isUploading = function () {
        return uploading.get();
    };

    /**
     * Starts or resumes the transfer
     */
    self.start = function () {
        if (!uploading.get() && !complete.get()) {

            function upload() {
                uploading.set(true);

                function sendChunk() {
                    if (uploading.get() && !complete.get()) {
                        var length = self.chunkSize;

                        // Calculate the chunk size
                        if (offset + length > total) {
                            length = total - offset;
                        }

                        if (offset < total) {
                            // Prepare the chunk
                            var chunk = new Uint8Array(data, offset, length);
                            var progress = (offset + length) / total;

                            // Write the chunk to the store
                            Meteor.call('ufsWrite', chunk, fileId, store.getName(), progress, function (err, length) {
                                if (err || !length) {
                                    // Retry until max tries is reach
                                    // But don't retry if these errors occur
                                    if (tries < self.maxTries && !_.contains([400, 404], err.error)) {
                                        tries += 1;

                                        // Wait 1 sec before retrying
                                        Meteor.setTimeout(function () {
                                            sendChunk();
                                        }, 1000);

                                    } else {
                                        self.abort();
                                        self.onError.call(self, err);
                                    }
                                } else {
                                    offset += length;
                                    loaded.set(loaded.get() + length);
                                    sendChunk();
                                }
                            });
                        } else {
                            // Finish the upload by telling the store the upload is complete
                            Meteor.call('ufsComplete', fileId, store.getName(), function (err, uploadedFile) {
                                if (err) {
                                    self.abort();
                                } else if (uploadedFile) {
                                    uploading.set(false);
                                    complete.set(true);
                                    file = uploadedFile;
                                    self.onComplete.call(self, uploadedFile);
                                }
                            });
                        }
                    }
                }

                sendChunk();
            }

            if (!fileId) {
                // Insert the file in the collection
                store.getCollection().insert(file, function (err, uploadId) {
                    if (err) {
                        self.onError.call(self, err);
                    } else {
                        fileId = uploadId;
                        file._id = fileId;
                        upload();
                    }
                });
            } else {
                upload();
            }
        }
    };

    /**
     * Stops the transfer
     */
    self.stop = function () {
        if (uploading.get()) {
            uploading.set(false);
            store.getCollection().update(fileId, {
                $set: {
                    uploading: false
                }
            });
        }
    };
};

/**
 * Called when the file upload is complete
 * @param file
 */
UploadFS.Uploader.prototype.onComplete = function (file) {
};

/**
 * Called when an error occurs during file upload
 * @param err
 */
UploadFS.Uploader.prototype.onError = function (err) {
    console.error(err);
};

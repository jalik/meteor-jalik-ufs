/**
 * File uploader
 * @param options
 * @constructor
 */
UploadFS.Uploader = function (options) {
    var self = this;

    // Set default options
    options = _.extend({
        adaptive: true,
        capacity: 0.9,
        chunkSize: 8 * 1024,
        data: null,
        file: null,
        maxChunkSize: 0,
        maxTries: 5,
        store: null
    }, options);

    // Check instance
    if (!(self instanceof UploadFS.Uploader)) {
        throw new Error('UploadFS.Uploader is not an instance');
    }

    // Check options
    if (typeof options.adaptive !== 'boolean') {
        throw new TypeError('adaptive is not a number');
    }
    if (typeof options.capacity !== 'number') {
        throw new TypeError('capacity is not a number');
    }
    if (options.capacity <= 0 || options.capacity > 1) {
        throw new RangeError('capacity must be a float between 0.1 and 1.0');
    }
    if (typeof options.chunkSize !== 'number') {
        throw new TypeError('chunkSize is not a number');
    }
    if (!(options.data instanceof ArrayBuffer)) {
        throw new TypeError('data is not an ArrayBuffer');
    }
    if (options.file === null || typeof options.file !== 'object') {
        throw new TypeError('file is not an object');
    }
    if (typeof options.maxChunkSize !== 'number') {
        throw new TypeError('maxChunkSize is not a number');
    }
    if (typeof options.maxTries !== 'number') {
        throw new TypeError('maxTries is not a number');
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
    self.adaptive = options.adaptive;
    self.capacity = parseFloat(options.capacity);
    self.chunkSize = parseInt(options.chunkSize);
    self.maxChunkSize = parseInt(options.maxChunkSize);
    self.maxTries = parseInt(options.maxTries);

    // Private attributes
    var store = options.store;
    var data = options.data;
    var capacityMargin = 10; //%
    var file = options.file;
    var fileId = null;
    var offset = 0;
    var total = options.data.byteLength;
    var tries = 0;

    var complete = new ReactiveVar(false);
    var loaded = new ReactiveVar(0);
    var uploading = new ReactiveVar(false);

    var timeA = null;
    var timeB = null;

    // Assign file to store
    file.store = store.getName();

    /**
     * Aborts the current transfer
     */
    self.abort = function () {
        uploading.set(false);

        // Remove the file from database
        store.getCollection().remove(fileId, function (err) {
            if (err) {
                console.error('ufs: cannot remove file ' + fileId + ' (' + err.message + ')');
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

                var length = self.chunkSize;

                function sendChunk() {
                    if (uploading.get() && !complete.get()) {

                        // Calculate the chunk size
                        if (offset + length > total) {
                            length = total - offset;
                        }

                        if (offset < total) {
                            // Prepare the chunk
                            var chunk = new Uint8Array(data, offset, length);
                            var progress = (offset + length) / total;

                            timeA = Date.now();

                            // Write the chunk to the store
                            Meteor.call('ufsWrite', chunk, fileId, store.getName(), progress, function (err, bytes) {
                                timeB = Date.now();

                                if (err || !bytes) {
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
                                    offset += bytes;
                                    loaded.set(loaded.get() + bytes);

                                    // Use adaptive length
                                    if (self.adaptive && timeA && timeB && timeB > timeA) {
                                        var duration = (timeB - timeA) / 1000;

                                        var max = self.capacity * (1 + (capacityMargin / 100));
                                        var min = self.capacity * (1 - (capacityMargin / 100));

                                        if (duration >= max) {
                                            length = Math.abs(Math.round(bytes * (max - duration)));

                                        } else if (duration < min) {
                                            length = Math.round(bytes * (min / duration));
                                        }
                                        // Limit to max chunk size
                                        if (self.maxChunkSize > 0 && length > self.maxChunkSize) {
                                            length = self.maxChunkSize;
                                        }
                                    }
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
                store.getCollection().update(fileId, {
                    $set: {uploading: true}
                }, function (err, result) {
                    if (!err && result) {
                        upload();
                    }
                });
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
                $set: {uploading: false}
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
    console.error(err.message);
};

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
        maxChunkSize: 4 * 1024 * 1000,
        maxTries: 5,
        onAbort: UploadFS.Uploader.prototype.onAbort,
        onComplete: UploadFS.Uploader.prototype.onComplete,
        onCreate: UploadFS.Uploader.prototype.onCreate,
        onError: UploadFS.Uploader.prototype.onError,
        onProgress: UploadFS.Uploader.prototype.onProgress,
        onStart: UploadFS.Uploader.prototype.onStart,
        onStop: UploadFS.Uploader.prototype.onStop,
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
    if (!(options.data instanceof ArrayBuffer) && !(options.data instanceof File)) {
        throw new TypeError('data is not an ArrayBuffer or File');
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
    if (typeof options.onAbort !== 'function') {
        throw new TypeError('onAbort is not a function');
    }
    if (typeof options.onComplete !== 'function') {
        throw new TypeError('onComplete is not a function');
    }
    if (typeof options.onCreate !== 'function') {
        throw new TypeError('onCreate is not a function');
    }
    if (typeof options.onError !== 'function') {
        throw new TypeError('onError is not a function');
    }
    if (typeof options.onProgress !== 'function') {
        throw new TypeError('onProgress is not a function');
    }
    if (typeof options.onStart !== 'function') {
        throw new TypeError('onStart is not a function');
    }
    if (typeof options.onStop !== 'function') {
        throw new TypeError('onStop is not a function');
    }
    if (!(options.store instanceof UploadFS.Store)) {
        throw new TypeError('store is not an UploadFS.Store');
    }

    // Public attributes
    self.adaptive = options.adaptive;
    self.capacity = parseFloat(options.capacity);
    self.chunkSize = parseInt(options.chunkSize);
    self.maxChunkSize = parseInt(options.maxChunkSize);
    self.maxTries = parseInt(options.maxTries);
    self.onAbort = options.onAbort;
    self.onComplete = options.onComplete;
    self.onCreate = options.onCreate;
    self.onError = options.onError;
    self.onProgress = options.onProgress;
    self.onStart = options.onStart;
    self.onStop = options.onStop;

    // Private attributes
    var store = options.store;
    var data = options.data;
    var capacityMargin = 10; //%
    var file = options.file;
    var fileId = null;
    var offset = 0;
    var total = 0;
    var tries = 0;

    var complete = new ReactiveVar(false);
    var loaded = new ReactiveVar(0);
    var uploading = new ReactiveVar(false);

    var timeA = null;
    var timeB = null;

    var elapsedTime = 0;
    var startTime = 0;

    // Assign file to store
    file.store = store.getName();

    // Get file total size
    if (data instanceof ArrayBuffer) {
        total = data.byteLength;
    }
    if (data instanceof File) {
        total = data.size;
    }

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
                self.onAbort(file);
            }
        });
    };

    /**
     * Returns the average speed in bytes per second
     * @returns {number}
     */
    self.getAverageSpeed = function () {
        return self.getLoaded() / self.getElapsedTime();
    };

    /**
     * Returns the elapsed time in milliseconds
     * @returns {number}
     */
    self.getElapsedTime = function () {
        if (startTime && self.isUploading()) {
            return elapsedTime + (Date.now() - startTime);
        }
        return elapsedTime;
    };

    /**
     * Returns the file
     * @return {object}
     */
    self.getFile = function () {
        return file;
    };

    /**
     * Returns the loaded bytes
     * @return {number}
     */
    self.getLoaded = function () {
        return loaded.get() || 0;
    };

    /**
     * Returns current progress
     * @return {number}
     */
    self.getProgress = function () {
        return Math.min((loaded.get() / total) * 100 / 100, 1.0);
    };

    /**
     * Returns the remaining time in milliseconds
     * @returns {number}
     */
    self.getRemainingTime = function () {
        var averageSpeed = self.getAverageSpeed();
        var remainingBytes = total - self.getLoaded();
        return averageSpeed && remainingBytes ? (remainingBytes / averageSpeed) : 0;
    };

    /**
     * Returns the upload speed in bytes per second
     * @returns {number}
     */
    self.getSpeed = function () {
        if (timeA && timeB && self.isUploading()) {
            var duration = timeB - timeA;
            return self.chunkSize / (duration / 1000);
        }
        return 0;
    };

    /**
     * Returns the total bytes
     * @return {number}
     */
    self.getTotal = function () {
        return total;
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
     * Reads a portion of file
     * @param start
     * @param length
     * @param callback
     * @returns {Uint8Array}
     */
    self.readChunk = function (start, length, callback) {
        if (typeof callback != 'function') {
            throw new Error('missing callback');
        }

        if (data instanceof ArrayBuffer) {
            // Calculate the chunk size
            if (length && start + length > total) {
                length = total - start;
            }
            callback.call(self, null, new Uint8Array(data, start, length));
        }

        if (data instanceof File) {
            // Calculate the chunk size
            if (length && start + length > total) {
                length = total;
            } else {
                length = start + length;
            }
            var blob = data.slice(start, length);
            var reader = new FileReader();
            reader.onerror = function (err) {
                callback.call(self, err);
            };
            reader.onload = function (ev) {
                var result = ev.target.result;
                callback.call(self, null, new Uint8Array(result));
            };
            reader.readAsArrayBuffer(blob);
        }
    };

    /**
     * Starts or resumes the transfer
     */
    self.start = function () {
        if (!uploading.get() && !complete.get()) {
            var length = self.chunkSize;
            startTime = Date.now();
            self.onStart(file);

            function finish() {
                // Finish the upload by telling the store the upload is complete
                store.complete(fileId, function (err, uploadedFile) {
                    if (err) {
                        // todo retry instead of abort
                        self.abort();

                    } else if (uploadedFile) {
                        elapsedTime = Date.now() - startTime;
                        uploading.set(false);
                        complete.set(true);
                        file = uploadedFile;
                        self.onComplete(uploadedFile);
                    }
                });
            }

            function writeChunk() {
                if (uploading.get() && !complete.get()) {
                    if (offset < total) {
                        timeA = Date.now();
                        timeB = null;

                        // Prepare the chunk
                        self.readChunk(offset, length, function (err, chunk) {
                            if (err) {
                                console.error(err);
                                self.onError(err);
                            }

                            var progress = (offset + length) / total;

                            // Write the chunk to the store
                            store.writeChunk(chunk, fileId, progress, function (err, bytes) {
                                if (err || !bytes) {
                                    // Retry until max tries is reach
                                    // But don't retry if these errors occur
                                    if (tries < self.maxTries && !_.contains([400, 404], err.error)) {
                                        tries += 1;

                                        // Wait 1 sec before retrying
                                        Meteor.setTimeout(writeChunk, 1000);

                                    } else {
                                        self.abort();
                                        self.onError(err);
                                    }
                                } else {
                                    timeB = Date.now();
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
                                    self.onProgress(file, self.getProgress());
                                    writeChunk();
                                }
                            });
                        });

                    } else {
                        finish();
                    }
                }
            }

            if (!fileId) {
                // Insert the file in the collection
                store.getCollection().insert(file, function (err, uploadId) {
                    if (err) {
                        self.onError(err);
                    } else {
                        fileId = uploadId;
                        file._id = fileId;
                        self.onCreate(file);
                        uploading.set(true);
                        writeChunk();
                    }
                });
            } else {
                store.getCollection().update(fileId, {
                    $set: {uploading: true}
                }, function (err, result) {
                    if (!err && result) {
                        uploading.set(true);
                        writeChunk();
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
            elapsedTime = Date.now() - startTime;
            uploading.set(false);
            store.getCollection().update(fileId, {
                $set: {uploading: false}
            });
            self.onStop(file);
        }
    };
};

/**
 * Called when the file upload is aborted
 * @param file
 */
UploadFS.Uploader.prototype.onAbort = function (file) {
};

/**
 * Called when the file upload is complete
 * @param file
 */
UploadFS.Uploader.prototype.onComplete = function (file) {
};

/**
 * Called when the file is created in the collection
 * @param file
 */
UploadFS.Uploader.prototype.onCreate = function (file) {
};

/**
 * Called when an error occurs during file upload
 * @param err
 */
UploadFS.Uploader.prototype.onError = function (err) {
    console.error(err.message);
};

/**
 * Called when a file chunk has been sent
 * @param file
 * @param progress is a float from 0.0 to 1.0
 */
UploadFS.Uploader.prototype.onProgress = function (file, progress) {
};

/**
 * Called when the file upload starts
 * @param file
 */
UploadFS.Uploader.prototype.onStart = function (file) {
};

/**
 * Called when the file upload stops
 * @param file
 */
UploadFS.Uploader.prototype.onStop = function (file) {
};

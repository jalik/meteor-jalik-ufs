/**
 * File uploader
 * @param options
 * @constructor
 */
UploadFS.Uploader = function (options) {
    let self = this;

    // Set default options
    options = _.extend({
        adaptive: true,
        capacity: 0.9,
        chunkSize: 16 * 1024,
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
        retryDelay: 2000,
        store: null,
        transferDelay: 100
    }, options);

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
    if (!(options.data instanceof Blob) && !(options.data instanceof File)) {
        throw new TypeError('data is not an Blob or File');
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
    if (typeof options.retryDelay !== 'number') {
        throw new TypeError('retryDelay is not a number');
    }
    if (typeof options.transferDelay !== 'number') {
        throw new TypeError('transferDelay is not a number');
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
    self.retryDelay = parseInt(options.retryDelay);
    self.transferDelay = parseInt(options.transferDelay);
    self.onAbort = options.onAbort;
    self.onComplete = options.onComplete;
    self.onCreate = options.onCreate;
    self.onError = options.onError;
    self.onProgress = options.onProgress;
    self.onStart = options.onStart;
    self.onStop = options.onStop;

    // Private attributes
    let store = options.store;
    let data = options.data;
    let capacityMargin = 0.1;
    let file = options.file;
    let fileId = null;
    let offset = 0;
    let loaded = 0;
    let total = data.size;
    let tries = 0;
    let postUrl = null;
    let token = null;
    let complete = false;
    let uploading = false;

    let timeA = null;
    let timeB = null;

    let elapsedTime = 0;
    let startTime = 0;

    // Assign file to store
    file.store = store.getName();

    function finish() {
        // Finish the upload by telling the store the upload is complete
        Meteor.call('ufsComplete', fileId, store.getName(), token, function (err, uploadedFile) {
            if (err) {
                // todo retry instead of abort
                self.abort();

            } else if (uploadedFile) {
                elapsedTime = Date.now() - startTime;
                uploading = false;
                complete = true;
                file = uploadedFile;
                self.onComplete(uploadedFile);
            }
        });
    }

    /**
     * Aborts the current transfer
     */
    self.abort = function () {
        // Remove the file from database
        Meteor.call('ufsDelete', fileId, store.getName(), token, function (err, result) {
            if (err) {
                console.error('ufs: cannot remove file ' + fileId + ' (' + err.message + ')');
                self.onError(err);
            }
        });

        // Reset uploader status
        uploading = false;
        fileId = null;
        offset = 0;
        tries = 0;
        loaded = 0;
        complete = false;
        startTime = null;
        self.onAbort(file);
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
        return loaded;
    };

    /**
     * Returns current progress
     * @return {number}
     */
    self.getProgress = function () {
        return Math.min((loaded / total) * 100 / 100, 1.0);
    };

    /**
     * Returns the remaining time in milliseconds
     * @returns {number}
     */
    self.getRemainingTime = function () {
        let averageSpeed = self.getAverageSpeed();
        let remainingBytes = total - self.getLoaded();
        return averageSpeed && remainingBytes ? Math.max(remainingBytes / averageSpeed, 0) : 0;
    };

    /**
     * Returns the upload speed in bytes per second
     * @returns {number}
     */
    self.getSpeed = function () {
        if (timeA && timeB && self.isUploading()) {
            let duration = timeB - timeA;
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
        return complete;
    };

    /**
     * Checks if the transfer is active
     * @return {boolean}
     */
    self.isUploading = function () {
        return uploading;
    };

    /**
     * Reads a portion of file
     * @param start
     * @param length
     * @param callback
     * @returns {Blob}
     */
    self.readChunk = function (start, length, callback) {
        if (typeof callback != 'function') {
            throw new Error('readChunk is missing callback');
        }
        try {
            let end;

            // Calculate the chunk size
            if (length && start + length > total) {
                end = total;
            } else {
                end = start + length;
            }
            // Get chunk
            let chunk = data.slice(start, end);
            // Pass chunk to callback
            callback.call(self, null, chunk);

        } catch (err) {
            console.error('read error', err);
            // Retry to read chunk
            Meteor.setTimeout(function () {
                if (tries < self.maxTries) {
                    tries += 1;
                    self.readChunk(start, length, callback);
                }
            }, self.retryDelay);
        }
    };

    /**
     * Sends a file chunk to the store
     */
    self.sendChunk = function () {
        if (!complete && startTime !== null) {
            if (offset < total) {
                let chunkSize = self.chunkSize;

                // Use adaptive length
                if (self.adaptive && timeA && timeB && timeB > timeA) {
                    let duration = (timeB - timeA) / 1000;
                    let max = self.capacity * (1 + capacityMargin);
                    let min = self.capacity * (1 - capacityMargin);

                    if (duration >= max) {
                        chunkSize = Math.abs(Math.round(chunkSize * (max - duration)));

                    } else if (duration < min) {
                        chunkSize = Math.round(chunkSize * (min / duration));
                    }
                    // Limit to max chunk size
                    if (self.maxChunkSize > 0 && chunkSize > self.maxChunkSize) {
                        chunkSize = self.maxChunkSize;
                    }
                }

                // Limit to max chunk size
                if (self.maxChunkSize > 0 && chunkSize > self.maxChunkSize) {
                    chunkSize = self.maxChunkSize;
                }

                // Prepare the chunk
                self.readChunk(offset, chunkSize, function (err, chunk) {
                    if (err) {
                        self.onError(err, file);
                        return;
                    }

                    let xhr = new XMLHttpRequest();
                    xhr.onreadystatechange = function () {
                        if (xhr.readyState === 4) {
                            if (_.contains([200, 201, 202, 204], xhr.status)) {
                                timeB = Date.now();
                                offset += chunkSize;
                                loaded += chunkSize;

                                // Send next chunk
                                self.onProgress(file, self.getProgress());
                                Meteor.setTimeout(self.sendChunk, self.transferDelay);

                            } else if (!_.contains([402, 403, 404, 500], xhr.status)) {
                                // Retry until max tries is reach
                                // But don't retry if these errors occur
                                if (tries <= self.maxTries) {
                                    tries += 1;
                                    // Wait before retrying
                                    Meteor.setTimeout(self.sendChunk, self.retryDelay);
                                } else {
                                    self.abort();
                                }
                            }
                        }
                    };

                    // Calculate upload progress
                    let progress = (offset + chunkSize) / total;
                    // let formData = new FormData();
                    // formData.append('progress', progress);
                    // formData.append('chunk', chunk);
                    let url = postUrl + '&progress=' + progress;

                    timeA = Date.now();
                    timeB = null;
                    uploading = true;

                    // Send chunk to the store
                    xhr.open('POST', url, true);
                    xhr.send(chunk);
                });

            } else {
                finish();
            }
        }
    };

    /**
     * Starts or resumes the transfer
     */
    self.start = function () {
        if (!fileId) {
            // Create the file document and get the token
            // that allows the user to send chunks to the store.
            Meteor.call('ufsCreate', _.extend({}, file), function (err, result) {
                if (err) {
                    self.onError(err, file);
                } else if (result) {
                    token = result.token;
                    postUrl = result.url;
                    fileId = result.fileId;
                    file._id = result.fileId;
                    self.onCreate(file);
                    tries = 0;
                    startTime = Date.now();
                    self.onStart(file);
                    self.sendChunk();
                }
            });
        } else if (!uploading && !complete) {
            // Resume uploading
            tries = 0;
            startTime = Date.now();
            self.onStart(file);
            self.sendChunk();
        }
    };

    /**
     * Stops the transfer
     */
    self.stop = function () {
        if (uploading) {
            // Update elapsed time
            elapsedTime = Date.now() - startTime;
            startTime = null;
            uploading = false;
            self.onStop(file);

            Meteor.call('ufsStop', fileId, store.getName(), token, function (err, result) {
                if (err) {
                    self.onError(err, file);
                }
            });
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

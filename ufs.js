var stores = {};

UploadFS = {
    /**
     * Contains all stores
     */
    store: {},
    /**
     * Returns the temporary file path
     * @param fileId
     * @return {string}
     */
    getTempFilePath: function (fileId) {
        return UploadFS.config.tmpDir + '/' + fileId;
    },
    /**
     * Returns the store by its name
     * @param name
     * @return {UploadFS.Store}
     */
    getStore: function (name) {
        return stores[name];
    },
    /**
     * Returns all stores
     * @return {object}
     */
    getStores: function () {
        return stores;
    },
    /**
     * Returns file and data as ArrayBuffer for each files in the event
     * @param event
     * @param callback
     */
    readAsArrayBuffer: function (event, callback) {
        // Check arguments
        if (typeof callback !== 'function') {
            throw new TypeError('callback is not a function');
        }

        var reader = new FileReader();
        var files = event.target.files;

        for (var i = 0; i < files.length; i += 1) {
            var file = files[i];

            (function (file) {
                reader.onload = function (ev) {
                    callback.call(UploadFS, ev.target.result, file);
                };
                reader.readAsArrayBuffer(file);
            })(file);
        }
    }
};
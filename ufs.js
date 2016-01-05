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

        var files = event.target.files;

        for (var i = 0; i < files.length; i += 1) {
            var file = files[i];

            (function (file) {
                var reader = new FileReader();
                reader.onload = function (ev) {
                    callback.call(UploadFS, ev.target.result, file);
                };
                reader.readAsArrayBuffer(file);
            })(file);
        }
    }
};

if (Meteor.isServer) {
    /**
     * Generates a random token using a pattern (xy)
     * @param pattern
     * @return {string}
     */
    UploadFS.generateToken = function (pattern) {
        return (pattern || 'xyxyxyxyxy').replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            var s = v.toString(16);
            return Math.round(Math.random()) ? s.toUpperCase() : s;
        });
    };
}

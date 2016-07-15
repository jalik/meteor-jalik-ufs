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
     * Imports a file from a URL
     * @param url
     * @param file
     * @param store
     * @param callback
     */
    importFromURL: function (url, file, store, callback) {
        store.importFromURL(url, file, callback);
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

if (Meteor.isClient) {

    /**
     * Returns file and data as ArrayBuffer for each files in the event
     * @deprecated
     * @param event
     * @param callback
     */
    UploadFS.readAsArrayBuffer = function (event, callback) {
        if (typeof callback !== 'function') {
            throw new TypeError('callback is not a function');
        }
        // todo remove warning and method in future releases
        console.warn('UploadFS.readAsArrayBuffer is deprecated and will be removed in future versions, see https://github.com/jalik/jalik-ufs#uploading-from-a-file');

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
    };

    /**
     * Opens a dialog to select a single file
     * @param callback
     */
    UploadFS.selectFile = function (callback) {
        var img = document.createElement('input');
        img.type = 'file';
        img.multiple = false;
        img.onchange = function (ev) {
            var files = ev.target.files;
            callback.call(UploadFS, files[0]);
        };
        img.click();
    };

    /**
     * Opens a dialog to select multiple files
     * @param callback
     */
    UploadFS.selectFiles = function (callback) {
        var img = document.createElement('input');
        img.type = 'file';
        img.multiple = true;
        img.onchange = function (ev) {
            var files = ev.target.files;

            for (var i = 0; i < files.length; i += 1) {
                callback.call(UploadFS, files[i]);
            }
        };
        img.click();
    };
}

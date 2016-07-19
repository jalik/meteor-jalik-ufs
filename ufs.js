let stores = {};

UploadFS = {
    /**
     * Contains all stores
     */
    store: {},
    /**
     * Collection of tokens
     */
    tokens: new Mongo.Collection('ufsTokens'),
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

if (Meteor.isClient) {

    /**
     * Returns file and data as ArrayBuffer for each files in the event
     * @deprecated
     * @param event
     * @param callback
     */
    UploadFS.readAsArrayBuffer = function (event, callback) {
        console.error('UploadFS.readAsArrayBuffer is deprecated, see https://github.com/jalik/jalik-ufs#uploading-from-a-file');
    };

    /**
     * Opens a dialog to select a single file
     * @param callback
     */
    UploadFS.selectFile = function (callback) {
        let img = document.createElement('input');
        img.type = 'file';
        img.multiple = false;
        img.onchange = function (ev) {
            let files = ev.target.files;
            callback.call(UploadFS, files[0]);
        };
        img.click();
    };

    /**
     * Opens a dialog to select multiple files
     * @param callback
     */
    UploadFS.selectFiles = function (callback) {
        let img = document.createElement('input');
        img.type = 'file';
        img.multiple = true;
        img.onchange = function (ev) {
            let files = ev.target.files;

            for (let i = 0; i < files.length; i += 1) {
                callback.call(UploadFS, files[i]);
            }
        };
        img.click();
    };
}

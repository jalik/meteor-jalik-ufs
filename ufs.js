import {_} from 'meteor/underscore';
import {Meteor} from 'meteor/meteor';
import {Mongo} from 'meteor/mongo';

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
    getTempFilePath: (fileId) => {
        return `${UploadFS.config.tmpDir}/${fileId}`;
    },

    /**
     * Returns the store by its name
     * @param name
     * @return {UploadFS.Store}
     */
    getStore: (name) => {
        return stores[name];
    },

    /**
     * Returns all stores
     * @return {object}
     */
    getStores: () => {
        return stores;
    },

    /**
     * Imports a file from a URL
     * @param url
     * @param file
     * @param store
     * @param callback
     */
    importFromURL: (url, file, store, callback) => {
        if (typeof store === 'string') {
            UploadFS.getStore(store).importFromURL(url, file, callback);
        }
        else if (typeof store === 'object') {
            store.importFromURL(url, file, callback);
        }
    }
};

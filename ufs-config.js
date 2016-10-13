import {_} from 'meteor/underscore';
import {Meteor} from 'meteor/meteor';

/**
 * UploadFS configuration
 * @param options
 * @constructor
 */
UploadFS.Config = function (options) {
    // Default options
    options = _.extend({
        defaultStorePermissions: null,
        https: false,
        simulateReadDelay: 0,
        simulateUploadSpeed: 0,
        simulateWriteDelay: 0,
        storesPath: 'ufs',
        tmpDir: '/tmp/ufs',
        tmpDirPermissions: '0700'
    }, options);

    // Check options
    if (options.defaultStorePermissions && !(options.defaultStorePermissions instanceof UploadFS.StorePermissions)) {
        throw new TypeError('defaultStorePermissions is not an instance of UploadFS.StorePermissions');
    }
    if (typeof options.https !== 'boolean') {
        throw new TypeError('https is not a function');
    }
    if (typeof options.simulateReadDelay !== 'number') {
        throw new Meteor.Error('simulateReadDelay is not a number');
    }
    if (typeof options.simulateUploadSpeed !== 'number') {
        throw new Meteor.Error('simulateUploadSpeed is not a number');
    }
    if (typeof options.simulateWriteDelay !== 'number') {
        throw new Meteor.Error('simulateWriteDelay is not a number');
    }
    if (typeof options.storesPath !== 'string') {
        throw new Meteor.Error('storesPath is not a string');
    }
    if (typeof options.tmpDir !== 'string') {
        throw new Meteor.Error('tmpDir is not a string');
    }
    if (typeof options.tmpDirPermissions !== 'string') {
        throw new Meteor.Error('tmpDirPermissions is not a string');
    }

    /**
     * Default store permissions
     * @type {UploadFS.StorePermissions}
     */
    this.defaultStorePermissions = options.defaultStorePermissions;
    /**
     * Use or not secured protocol in URLS
     * @type {boolean}
     */
    this.https = options.https;
    /**
     * The simulation read delay
     * @type {Number}
     */
    this.simulateReadDelay = parseInt(options.simulateReadDelay);
    /**
     * The simulation upload speed
     * @type {Number}
     */
    this.simulateUploadSpeed = parseInt(options.simulateUploadSpeed);
    /**
     * The simulation write delay
     * @type {Number}
     */
    this.simulateWriteDelay = parseInt(options.simulateWriteDelay);
    /**
     * The URL root path of stores
     * @type {string}
     */
    this.storesPath = options.storesPath;
    /**
     * The temporary directory of uploading files
     * @type {string}
     */
    this.tmpDir = options.tmpDir;
    /**
     * The permissions of the temporary directory
     * @type {string}
     */
    this.tmpDirPermissions = options.tmpDirPermissions;
};

/**
 * Global configuration
 * @type {UploadFS.Config}
 */
UploadFS.config = new UploadFS.Config();

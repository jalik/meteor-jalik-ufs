/**
 * UploadFS configuration
 * @param options
 * @constructor
 */
UploadFS.Config = function (options) {
    // Set default options
    options = _.extend({
        https: false,
        simulateReadDelay: 0,
        simulateUploadSpeed: 0,
        simulateWriteDelay: 0,
        storesPath: 'ufs',
        tmpDir: '/tmp/ufs'
    }, options);

    // Check options
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

    // Public attributes
    this.https = options.https;
    this.simulateReadDelay = parseInt(options.simulateReadDelay);
    this.simulateUploadSpeed = parseInt(options.simulateUploadSpeed);
    this.simulateWriteDelay = parseInt(options.simulateWriteDelay);
    this.storesPath = options.storesPath;
    this.tmpDir = options.tmpDir;
};

/**
 * Simulation read delay in milliseconds
 * @type {number}
 */
UploadFS.Config.prototype.simulateReadDelay = 0;

/**
 * Simulation upload speed in milliseconds
 * @type {number}
 */
UploadFS.Config.prototype.simulateUploadSpeed = 0;

/**
 * Simulation write delay in milliseconds
 * @type {number}
 */
UploadFS.Config.prototype.simulateWriteDelay = 0;

/**
 * URL path to stores
 * @type {string}
 */
UploadFS.Config.prototype.storesPath = null;

/**
 * Local temporary directory for uploading files
 * @type {string}
 */
UploadFS.Config.prototype.tmpDir = null;

/**
 * Global configuration
 * @type {UploadFS.Config}
 */
UploadFS.config = new UploadFS.Config();

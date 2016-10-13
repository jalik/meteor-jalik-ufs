import {_} from 'meteor/underscore';

/**
 * Store permissions
 * @param options
 * @constructor
 */
UploadFS.StorePermissions = function (options) {
    // Default options
    options = _.extend({
        insert: null,
        remove: null,
        update: null
    }, options);

    // Check options
    if (typeof options.insert === 'function') {
        this.insert = options.insert;
    }
    if (typeof options.remove === 'function') {
        this.remove = options.remove;
    }
    if (typeof options.update === 'function') {
        this.update = options.update;
    }

    let checkPermission = (permission, userId, file)=> {
        if (typeof this[permission] === 'function') {
            return this[permission](userId, file);
        }
        return true; // by default allow all
    };

    /**
     * Checks the insert permission
     * @param userId
     * @param file
     * @returns {*}
     */
    this.checkInsert = (userId, file) => {
        return checkPermission('insert', userId, file);
    };
    /**
     * Checks the remove permission
     * @param userId
     * @param file
     * @returns {*}
     */
    this.checkRemove = (userId, file) => {
        return checkPermission('remove', userId, file);
    };
    /**
     * Checks the update permission
     * @param userId
     * @param file
     * @returns {*}
     */
    this.checkUpdate = (userId, file) => {
        return checkPermission('update', userId, file);
    };
};

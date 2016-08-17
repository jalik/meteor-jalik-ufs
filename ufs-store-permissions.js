import {_} from 'meteor/underscore';

/**
 * Store permissions
 * @param options
 * @constructor
 */
UploadFS.StorePermissions = function (options) {
    let self = this;

    options = _.extend({
        insert: null,
        remove: null,
        update: null
    }, options);

    if (typeof options.insert === 'function') {
        self.insert = options.insert;
    }
    if (typeof options.remove === 'function') {
        self.remove = options.remove;
    }
    if (typeof options.update === 'function') {
        self.update = options.update;
    }

    self.checkInsert = (userId, file) => {
        if (typeof self.insert === 'function') {
            self.insert.call(self, userId, file);
        }
    };
    self.checkRemove = (userId, file) => {
        if (typeof self.remove === 'function') {
            self.remove.call(self, userId, file);
        }
    };
    self.checkUpdate = (userId, file) => {
        if (typeof self.update === 'function') {
            self.update.call(self, userId, file);
        }
    };
};

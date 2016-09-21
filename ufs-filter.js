import {_} from 'meteor/underscore';

/**
 * File filter
 * @param options
 * @constructor
 */
UploadFS.Filter = function (options) {
    let self = this;

    // Set default options
    options = _.extend({
        contentTypes: null,
        extensions: null,
        minSize: 1,
        maxSize: 0,
        onCheck: null
    }, options);

    // Check options
    if (options.contentTypes && !(options.contentTypes instanceof Array)) {
        throw new TypeError('contentTypes is not an Array');
    }
    if (options.extensions && !(options.extensions instanceof Array)) {
        throw new TypeError('extensions is not an Array');
    }
    if (typeof options.minSize !== 'number') {
        throw new TypeError('minSize is not a number');
    }
    if (typeof options.maxSize !== 'number') {
        throw new TypeError('maxSize is not a number');
    }
    if (options.onCheck && typeof options.onCheck !== 'function') {
        throw new TypeError('onCheck is not a function');
    }

    // Private attributes
    let contentTypes = options.contentTypes;
    let extensions = options.extensions;
    let onCheck = options.onCheck;
    let maxSize = parseInt(options.maxSize);
    let minSize = parseInt(options.minSize);

    /**
     * Checks the file
     * @param file
     */
    self.check = (file) => {
        // Check size
        if (file.size <= 0 || file.size < self.getMinSize()) {
            throw new Meteor.Error('file-too-small', 'File is too small (min =' + self.getMinSize() + ')');
        }
        if (self.getMaxSize() > 0 && file.size > self.getMaxSize()) {
            throw new Meteor.Error('file-too-large', 'File is too large (max = ' + self.getMaxSize() + ')');
        }
        // Check extension
        if (self.getExtensions() && !_.contains(self.getExtensions(), file.extension)) {
            throw new Meteor.Error('invalid-file-extension', 'File extension is not accepted');
        }
        // Check content type
        if (self.getContentTypes() && !checkContentType(file.type, self.getContentTypes())) {
            throw new Meteor.Error('invalid-file-type', 'File type is not accepted');
        }
        // Apply custom check
        if (typeof onCheck === 'function' && !onCheck.call(self, file)) {
            throw new Meteor.Error('invalid-file', 'File does not match filter');
        }
    };

    /**
     * Returns the allowed content types
     * @return {Array}
     */
    self.getContentTypes = () => {
        return contentTypes;
    };

    /**
     * Returns the allowed extensions
     * @return {Array}
     */
    self.getExtensions = () => {
        return extensions;
    };

    /**
     * Returns the maximum file size
     * @return {Number}
     */
    self.getMaxSize = () => {
        return maxSize;
    };

    /**
     * Returns the minimum file size
     * @return {Number}
     */
    self.getMinSize = () => {
        return minSize;
    };

    /**
     * Checks if the file matches filter
     * @param file
     * @return {boolean}
     */
    self.isValid = (file) => {
        let result = true;
        try {
            self.check(file);
        } catch (err) {
            result = false;
        }
        return result;
    };
};

function checkContentType(type, list) {
    if (type) {
        if (_.contains(list, type)) {
            return true;
        } else {
            let wildCardGlob = '/*';
            let wildcards = _.filter(list, (item) => {
                return item.indexOf(wildCardGlob) > 0;
            });

            if (_.contains(wildcards, type.replace(/(\/.*)$/, wildCardGlob))) {
                return true;
            }
        }
    }
    return false;
}

/**
 * File filter
 * @param options
 * @constructor
 */
UploadFS.Filter = function (options) {
    var self = this;

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
    var contentTypes = options.contentTypes;
    var extensions = options.extensions;
    var onCheck = options.onCheck;
    var maxSize = parseInt(options.maxSize);
    var minSize = parseInt(options.minSize);

    /**
     * Checks the file
     * @param file
     */
    self.check = function (file) {
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
    self.getContentTypes = function () {
        return contentTypes;
    };

    /**
     * Returns the allowed extensions
     * @return {Array}
     */
    self.getExtensions = function () {
        return extensions;
    };

    /**
     * Returns the maximum file size
     * @return {Number}
     */
    self.getMaxSize = function () {
        return maxSize;
    };

    /**
     * Returns the minimum file size
     * @return {Number}
     */
    self.getMinSize = function () {
        return minSize;
    };

    /**
     * Checks if the file matches filter
     * @param file
     * @return {boolean}
     */
    self.isValid = function (file) {
        return !(
            file.size <= 0 || file.size < self.getMinSize()
            || self.getMaxSize() > 0 && file.size > self.getMaxSize()
            || self.getExtensions() && !_.contains(self.getExtensions(), file.extension)
            || self.getContentTypes() && !checkContentType(file.type, self.getContentTypes())
            || (typeof onCheck === 'function' && !onCheck.call(self, file))
        );
    };
};

function checkContentType(type, list) {
    if (_.contains(list, type)) {
        return true;
    } else {
        var wildCardGlob = '/*';
        var wildcards = _.filter(list, function (item) {
            return item.indexOf(wildCardGlob) > 0;
        });

        if (_.contains(wildcards, type.replace(/(\/.*)$/, wildCardGlob))) {
            return true;
        }
    }
    return false;
}

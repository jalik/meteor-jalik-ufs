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
        maxSize: 1024 * 1000 * 10
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

    // Private attributes
    var contentTypes = options.contentTypes;
    var extensions = options.extensions;
    var maxSize = parseInt(options.maxSize);
    var minSize = parseInt(options.minSize);

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
};


/**
 * Checks the file
 * @param file
 * @return {boolean}
 */
UploadFS.Filter.prototype.check = function (file) {
    // Check size
    if (file.size < this.getMinSize()) {
        throw new Meteor.Error('file-too-small', 'The file is too small, min size is ' + this.getMinSize());
    }
    if (file.size > this.getMaxSize()) {
        throw new Meteor.Error('file-too-large', 'The file is too large, max size is ' + this.getMaxSize());
    }
    // Check extension
    if (this.getExtensions() && !_.contains(this.getExtensions(), file.extension)) {
        throw new Meteor.Error('invalid-file-extension', 'The file extension is not accepted');
    }
    // Check content type
    if (this.getContentTypes() && !checkContentType(file.type, this.getContentTypes())) {
        throw new Meteor.Error('invalid-file-type', 'The file type is not accepted');
    }
    return true;
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

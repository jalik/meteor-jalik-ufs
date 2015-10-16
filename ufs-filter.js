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
        maxSize: 1024 * 1000 * 10
    }, options);

    // Check options
    if (options.contentTypes && !(options.contentTypes instanceof Array)) {
        throw new TypeError('contentTypes is not an Array');
    }
    if (options.extensions && !(options.extensions instanceof Array)) {
        throw new TypeError('extensions is not an Array');
    }
    if (typeof options.maxSize !== 'number') {
        throw new TypeError('maxSize is not a number');
    }

    // Private attributes
    var contentTypes = options.contentTypes;
    var extensions = options.extensions;
    var maxSize = parseInt(options.maxSize);

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
     * Returns the max file size
     * @return {Number}
     */
    self.getMaxSize = function () {
        return maxSize;
    };
};


/**
 * Checks the file
 * @param file
 * @return {boolean}
 */
UploadFS.Filter.prototype.check = function (file) {
    // Check size
    if (file.size > this.getMaxSize()) {
        throw new Meteor.Error('file-too-large', 'The file is too large, max is ' + this.getMaxSize());
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
        var wildcards = _.filter(list, function (item) { return item.indexOf(wildCardGlob) > 0; });

        if (_.contains(wildcards, type.replace(/(\/.*)$/, wildCardGlob))) {
            return true;
        }
    }

    return false;

}
/*
 * The MIT License (MIT)
 *
 * Copyright (c) 2017 Karl STEIN
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
 */
import {_} from "meteor/underscore";
import {Meteor} from "meteor/meteor";


/**
 * File filter
 */
export class Filter {

    constructor(options) {
        const self = this;

        // Default options
        options = _.extend({
            contentTypes: null,
            extensions: null,
            minSize: 1,
            maxSize: 0,
            onCheck: this.onCheck
        }, options);

        // Check options
        if (options.contentTypes && !(options.contentTypes instanceof Array)) {
            throw new TypeError("Filter: contentTypes is not an Array");
        }
        if (options.extensions && !(options.extensions instanceof Array)) {
            throw new TypeError("Filter: extensions is not an Array");
        }
        if (typeof options.minSize !== "number") {
            throw new TypeError("Filter: minSize is not a number");
        }
        if (typeof options.maxSize !== "number") {
            throw new TypeError("Filter: maxSize is not a number");
        }
        if (options.onCheck && typeof options.onCheck !== "function") {
            throw new TypeError("Filter: onCheck is not a function");
        }

        // Public attributes
        self.options = options;
        _.each([
            'onCheck'
        ], (method) => {
            if (typeof options[method] === 'function') {
                self[method] = options[method];
            }
        });
    }

    /**
     * Checks the file
     * @param file
     */
    check(file) {
        if (typeof file !== "object" || !file) {
            throw new Meteor.Error('invalid-file', "File is not valid");
        }
        // Check size
        if (file.size <= 0 || file.size < this.getMinSize()) {
            throw new Meteor.Error('file-too-small', `File size is too small (min = ${this.getMinSize()})`);
        }
        if (this.getMaxSize() > 0 && file.size > this.getMaxSize()) {
            throw new Meteor.Error('file-too-large', `File size is too large (max = ${this.getMaxSize()})`);
        }
        // Check extension
        if (this.getExtensions() && !_.contains(this.getExtensions(), file.extension)) {
            throw new Meteor.Error('invalid-file-extension', `File extension "${file.extension}" is not accepted`);
        }
        // Check content type
        if (this.getContentTypes() && !this.isContentTypeInList(file.type, this.getContentTypes())) {
            throw new Meteor.Error('invalid-file-type', `File type "${file.type}" is not accepted`);
        }
        // Apply custom check
        if (typeof this.onCheck === 'function' && !this.onCheck(file)) {
            throw new Meteor.Error('invalid-file', "File does not match filter");
        }
    }

    /**
     * Returns the allowed content types
     * @return {Array}
     */
    getContentTypes() {
        return this.options.contentTypes;
    }

    /**
     * Returns the allowed extensions
     * @return {Array}
     */
    getExtensions() {
        return this.options.extensions;
    }

    /**
     * Returns the maximum file size
     * @return {Number}
     */
    getMaxSize() {
        return this.options.maxSize;
    }

    /**
     * Returns the minimum file size
     * @return {Number}
     */
    getMinSize() {
        return this.options.minSize;
    }

    /**
     * Checks if content type is in the given list
     * @param type
     * @param list
     * @return {boolean}
     */
    isContentTypeInList(type, list) {
        if (typeof type === 'string' && list instanceof Array) {
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

    /**
     * Checks if the file matches filter
     * @param file
     * @return {boolean}
     */
    isValid(file) {
        let result = true;
        try {
            this.check(file);
        } catch (err) {
            result = false;
        }
        return result;
    }

    /**
     * Executes custom checks
     * @param file
     * @return {boolean}
     */
    onCheck(file) {
        return true;
    }
}

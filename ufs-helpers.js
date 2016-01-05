var isMIME = function (type, mime) {
    return typeof type === 'string'
        && typeof mime === 'string'
        && mime.indexOf(type + '/') === 0;
};

Template.registerHelper('isAudio', function (type) {
    return isMIME('audio', this.type || type);
});

Template.registerHelper('isImage', function (type) {
    return isMIME('image', this.type || type);
});

Template.registerHelper('isText', function (type) {
    return isMIME('text', this.type || type);
});

Template.registerHelper('isVideo', function (type) {
    return isMIME('video', this.type || type);
});

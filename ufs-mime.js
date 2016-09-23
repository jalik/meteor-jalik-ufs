/**
 * MIME types and extensions
 */
const MIME = {

    // application
    '7z': 'application/x-7z-compressed',
    'arc': 'application/octet-stream',
    'ai': 'application/postscript',
    'bin': 'application/octet-stream',
    'bz': 'application/x-bzip',
    'bz2': 'application/x-bzip2',
    'eps': 'application/postscript',
    'exe': 'application/octet-stream',
    'gz': 'application/x-gzip',
    'gzip': 'application/x-gzip',
    'js': 'application/javascript',
    'json': 'application/json',
    'ogx': 'application/ogg',
    'pdf': 'application/pdf',
    'ps': 'application/postscript',
    'psd': 'application/octet-stream',
    'rar': 'application/x-rar-compressed',
    'rev': 'application/x-rar-compressed',
    'swf': 'application/x-shockwave-flash',
    'tar': 'application/x-tar',
    'xhtml': 'application/xhtml+xml',
    'xml': 'application/xml',
    'zip': 'application/zip',

    // audio
    'aif': 'audio/aiff',
    'aifc': 'audio/aiff',
    'aiff': 'audio/aiff',
    'au': 'audio/basic',
    'flac': 'audio/flac',
    'midi': 'audio/midi',
    'mp2': 'audio/mpeg',
    'mp3': 'audio/mpeg',
    'mpa': 'audio/mpeg',
    'oga': 'audio/ogg',
    'ogg': 'audio/ogg',
    'opus': 'audio/ogg',
    'ra': 'audio/vnd.rn-realaudio',
    'spx': 'audio/ogg',
    'wav': 'audio/x-wav',
    'weba': 'audio/webm',
    'wma': 'audio/x-ms-wma',

    // image
    'avs': 'image/avs-video',
    'bmp': 'image/x-windows-bmp',
    'gif': 'image/gif',
    'ico': 'image/vnd.microsoft.icon',
    'jpeg': 'image/jpeg',
    'jpg': 'image/jpg',
    'mjpg': 'image/x-motion-jpeg',
    'pic': 'image/pic',
    'png': 'image/png',
    'svg': 'image/svg+xml',
    'tif': 'image/tiff',
    'tiff': 'image/tiff',

    // text
    'css': 'text/css',
    'csv': 'text/csv',
    'html': 'text/html',
    'txt': 'text/plain',

    // video
    'avi': 'video/avi',
    'dv': 'video/x-dv',
    'flv': 'video/x-flv',
    'mov': 'video/quicktime',
    'mp4': 'video/mp4',
    'mpeg': 'video/mpeg',
    'mpg': 'video/mpg',
    'ogv': 'video/ogg',
    'vdo': 'video/vdo',
    'webm': 'video/webm',
    'wmv': 'video/x-ms-wmv',

    // specific to vendors
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'odb': 'application/vnd.oasis.opendocument.database',
    'odc': 'application/vnd.oasis.opendocument.chart',
    'odf': 'application/vnd.oasis.opendocument.formula',
    'odg': 'application/vnd.oasis.opendocument.graphics',
    'odi': 'application/vnd.oasis.opendocument.image',
    'odm': 'application/vnd.oasis.opendocument.text-master',
    'odp': 'application/vnd.oasis.opendocument.presentation',
    'ods': 'application/vnd.oasis.opendocument.spreadsheet',
    'odt': 'application/vnd.oasis.opendocument.text',
    'otg': 'application/vnd.oasis.opendocument.graphics-template',
    'otp': 'application/vnd.oasis.opendocument.presentation-template',
    'ots': 'application/vnd.oasis.opendocument.spreadsheet-template',
    'ott': 'application/vnd.oasis.opendocument.text-template',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

};

/**
 * Adds the MIME type for an extension
 * @param extension
 * @param mime
 */
UploadFS.addMimeType = function (extension, mime) {
    MIME[extension.toLowerCase()] = mime;
};

/**
 * Returns the MIME type of the extension
 * @param extension
 * @returns {*}
 */
UploadFS.getMimeType = function (extension) {
    if (extension) {
        extension = extension.toLowerCase();
        return MIME[extension];
    }
};

/**
 * Returns all MIME types
 */
UploadFS.getMimeTypes = function () {
    return MIME;
};

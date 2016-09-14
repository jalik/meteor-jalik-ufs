Package.describe({
    name: 'jalik:ufs',
    version: '0.6.8',
    author: 'karl.stein.pro@gmail.com',
    summary: 'Base package for UploadFS',
    homepage: 'https://github.com/jalik/jalik-ufs',
    git: 'https://github.com/jalik/jalik-ufs.git',
    documentation: 'README.md'
});

Package.onUse(function (api) {
    api.versionsFrom('1.3.4.4');
    api.use('check@1.2.1');
    api.use('ecmascript@0.4.3');
    api.use('matb33:collection-hooks@0.7.13');
    api.use('mongo@1.1.0');
    api.use('templating@1.1.9', 'client');
    api.use('underscore@1.0.3');
    api.use('webapp@1.2.8', 'server');

    api.addFiles('ufs.js');
    api.addFiles('ufs-utilities.js');
    api.addFiles('ufs-config.js');
    api.addFiles('ufs-filter.js');
    api.addFiles('ufs-store-permissions.js');
    api.addFiles('ufs-store.js');
    api.addFiles('ufs-helpers.js', 'client');
    api.addFiles('ufs-uploader.js', 'client');
    api.addFiles('ufs-methods.js', 'server');
    api.addFiles('ufs-server.js', 'server');

    api.export('UploadFS');
});

Npm.depends({
    mkdirp: '0.3.5'
});

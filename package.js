Package.describe({
    name: 'jalik:ufs',
    version: '0.6.9_2',
    author: 'karl.stein.pro@gmail.com',
    summary: 'Base package for UploadFS',
    homepage: 'https://github.com/jalik/jalik-ufs',
    git: 'https://github.com/jalik/jalik-ufs.git',
    documentation: 'README.md'
});

Package.onUse(function (api) {
    api.versionsFrom('1.4.1.1');
    api.use('check');
    api.use('ecmascript');
    api.use('matb33:collection-hooks@0.8.4');
    api.use('mongo');
    api.use('templating', 'client');
    api.use('underscore');
    api.use('webapp', 'server');

    api.addFiles('ufs.js');
    api.addFiles('ufs-mime.js');
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

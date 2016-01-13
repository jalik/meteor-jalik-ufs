Package.describe({
    name: 'jalik:ufs',
    version: '0.3.5',
    author: 'karl.stein.pro@gmail.com',
    summary: 'Base package for UploadFS',
    homepage: 'https://github.com/jalik/jalik-ufs',
    git: 'https://github.com/jalik/jalik-ufs.git',
    documentation: 'README.md'
});

Package.onUse(function (api) {
    api.versionsFrom('1.1.0.2');
    api.use('check');
    api.use('matb33:collection-hooks@0.7.13');
    api.use('mongo');
    api.use('reactive-var', 'client');
    api.use('templating', 'client');
    api.use('underscore');
    api.use('webapp', 'server');

    api.addFiles('ufs.js');
    api.addFiles('ufs-config.js');
    api.addFiles('ufs-filter.js');
    api.addFiles('ufs-store.js');
    api.addFiles('ufs-helpers.js', 'client');
    api.addFiles('ufs-uploader.js', 'client');
    api.addFiles('ufs-server.js', 'server');

    api.export('UploadFS');
});

Npm.depends({
    mkdirp: '0.3.5'
});

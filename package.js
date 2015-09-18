Package.describe({
    name: 'jalik:ufs',
    version: '0.2.9',
    author: 'karl.stein.pro@gmail.com',
    summary: 'Base package for UploadFS',
    homepage: 'https://github.com/jalik/jalik-ufs',
    git: 'https://github.com/jalik/jalik-ufs.git',
    documentation: 'README.md'
});

Package.onUse(function (api) {
    api.versionsFrom('1.1.0.2');
    api.use(['check', 'underscore']);
    api.use(['matb33:collection-hooks@0.7.13']);
    api.use(['minimongo', 'mongo-livedata', 'reactive-var', 'templating'], 'client');
    api.use(['mongo', 'webapp'], 'server');
    api.addFiles(['ufs.js', 'ufs-config.js', 'ufs-filter.js', 'ufs-store.js']);
    api.addFiles(['ufs-uploader.js'], 'client');
    api.addFiles(['ufs-server.js'], 'server');
    api.export('UploadFS');
});

Package.onTest(function (api) {
    api.use('tinytest');
    api.use('jalik:ufs');
    api.addFiles('ufs-tests.js');
});

Npm.depends({
    mkdirp: "0.3.5"
});
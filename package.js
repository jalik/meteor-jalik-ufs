Package.describe({
    name: 'jalik:ufs',
    version: '0.2.1',
    author: 'karl.stein.pro@gmail.com',
    summary: 'Base package for UploadFS',
    homepage: 'https://github.com/jalik/jalik-ufs',
    git: 'https://github.com/jalik/jalik-ufs.git',
    documentation: 'README.md'
});

Package.onUse(function (api) {
    api.versionsFrom('1.1.0.2');
    api.use(['underscore', 'check']);
    api.use(['matb33:collection-hooks@0.7.13']);
    api.use(['minimongo', 'mongo-livedata', 'templating', 'reactive-var'], 'client');
    api.use(['mongo'], 'server');
    api.addFiles(['ufs.js', 'ufs-store.js', 'ufs-filter.js']);
    api.addFiles(['ufs-uploader.js'], 'client');
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
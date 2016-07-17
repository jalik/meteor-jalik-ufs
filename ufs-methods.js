Meteor.methods({

    /**
     * Completes the file transfer
     * @param fileId
     * @param storeName
     */
    ufsComplete: function (fileId, storeName) {
        check(fileId, String);
        check(storeName, String);

        // Allow other uploads to run concurrently
        this.unblock();

        let store = UploadFS.getStore(storeName);
        if (!store) {
            throw new Meteor.Error(404, 'store "' + storeName + '" does not exist');
        }
        // Check that file exists and is owned by current user
        if (store.getCollection().find({_id: fileId, userId: this.userId}).count() < 1) {
            throw new Meteor.Error(404, 'file "' + fileId + '" does not exist');
        }

        let fut = new Future();
        let tmpFile = UploadFS.getTempFilePath(fileId);

        // Get the temp file
        let rs = fs.createReadStream(tmpFile, {
            flags: 'r',
            encoding: null,
            autoClose: true
        });

        rs.on('error', Meteor.bindEnvironment(function (err) {
            console.error(err);
            store.getCollection().remove(fileId);
            fut.throw(err);
        }));

        // Save file in the store
        store.write(rs, fileId, Meteor.bindEnvironment(function (err, file) {
            fs.unlink(tmpFile, function (err) {
                err && console.error('ufs: cannot delete temp file ' + tmpFile + ' (' + err.message + ')');
            });

            if (err) {
                fut.throw(err);
            } else {
                fut.return(file);
            }
        }));
        return fut.wait();
    },

    /**
     * Creates the file and returns the file upload token
     * @param file
     * @returns {{fileId: string, url: string}}
     */
    ufsCreate: function (file) {
        check(file, Object);

        if (typeof file.name !== 'string' || !file.name.length) {
            throw new Meteor.Error('invalid-file-name', "file name is not valid");
        }
        if (typeof file.store !== 'string' || !file.store.length) {
            throw new Meteor.Error('invalid-store', "store is not valid");
        }

        // Get store
        let store = UploadFS.getStore(file.store);
        if (!store) {
            throw new Meteor.Error('invalid-store', "store is not valid");
        }

        // Set default info
        file.complete = false;
        file.uploading = false;
        file.extension = file.name && file.name.substr((~-file.name.lastIndexOf('.') >>> 0) + 2).toLowerCase();
        file.progress = 0;
        file.size = parseInt(file.size) || 0;
        file.userId = file.userId || this.userId;

        // Check if the file matches store filter
        let filter = store.getFilter();
        if (filter instanceof UploadFS.Filter) {
            filter.check(file);
        }

        // Create the file
        let fileId = store.create(file);
        let token = store.createToken(fileId);
        let uploadUrl = store.getURL() + '/' + fileId + '?token=' + token;

        return {fileId: fileId, url: uploadUrl};
    },

    /**
     * Deletes a file
     * @param fileId
     * @param storeName
     * @returns {*}
     */
    ufsDelete: function (fileId, storeName) {
        check(fileId, String);
        check(storeName, String);

        // Check store
        let store = UploadFS.getStore(storeName);
        if (!store) {
            throw new Meteor.Error('invalid-store', "Store not found");
        }
        // Check file
        let file = store.getCollection().find(fileId, {fields: {userId: 1}});
        if (!file) {
            throw new Meteor.Error('invalid-file', "File not found");
        }
        // todo do some security checks
        return store.getCollection().remove(fileId);
    },

    /**
     * Imports a file from the URL
     * @param url
     * @param file
     * @param storeName
     * @return {*}
     */
    ufsImportURL: function (url, file, storeName) {
        check(url, String);
        check(file, Object);
        check(storeName, String);

        this.unblock();

        let store = UploadFS.getStore(storeName);
        if (!store) {
            throw new Meteor.Error(404, 'Store "' + storeName + '" does not exist');
        }

        try {
            // Extract file info
            if (!file.name) {
                file.name = url.replace(/\?.*$/, '').split('/').pop();
                file.extension = file.name.split('.').pop();
                file.type = 'image/' + file.extension;
            }
            // Check if file is valid
            if (store.getFilter() instanceof UploadFS.Filter) {
                store.getFilter().check(file);
            }
            // Create the file
            let fileId = store.create(file);

        } catch (err) {
            throw new Meteor.Error(500, err.message);
        }

        let fut = new Future();
        let proto;

        // Detect protocol to use
        if (/http:\/\//i.test(url)) {
            proto = http;
        } else if (/https:\/\//i.test(url)) {
            proto = https;
        }

        // Download file
        proto.get(url, Meteor.bindEnvironment(function (res) {
            // Save the file in the store
            store.write(res, fileId, function (err, file) {
                if (err) {
                    fut.throw(err);
                } else {
                    fut.return(file);
                }
            });
        })).on('error', function (err) {
            fut.throw(err);
        });
        return fut.wait();
    },

    /**
     * Marks the file uploading as stopped
     * @param fileId
     * @param storeName
     * @returns {*}
     */
    ufsStop: function (fileId, storeName) {
        check(fileId, String);
        check(storeName, String);

        // Check store
        let store = UploadFS.getStore(storeName);
        if (!store) {
            throw new Meteor.Error('invalid-store', "Store not found");
        }
        // Check file
        let file = store.getCollection().find(fileId, {fields: {userId: 1}});
        if (!file) {
            throw new Meteor.Error('invalid-file', "File not found");
        }
        // todo do some security checks
        return store.getCollection().update(fileId, {
            $set: {uploading: false}
        });
    }
});

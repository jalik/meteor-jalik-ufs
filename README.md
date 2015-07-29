# UploadFS

UploadFS is a Meteor package that aims to make file uploading easy, fast and configurable.
An important feature is the ability to **start, stop or even abort a transfer** when you want.
It currently only supports file system storage but it is possible to extend possibilities by creating new Stores yourself.

### Installation

To install the package, execute this command in the root of your project :
```
meteor add jalik:ufs
```

If later you want to remove the package :
```
meteor remove jalik:ufs
```

### Plugins

As the package is modular, you can add support for custom stores.
For now, only `UploadFS.store.Local` is available.

To install file system storage :
```
meteor add jalik:ufs-local
```

### Introduction

In file uploading, you basically have a client and a server, I haven't change those things.
So on the client side, you create an uploader for each file transfer needed, 
while on the server side you only configure a store where the file will be saved.
I'll use the `UploadFS.store.Local` store for the following examples.

### Creating a Store

**The code below is available to the client and the server.**

A store is the place where your files are saved.
Let say you have a **photos** collection :
```js
Meteor.photos = new Mongo.Collection('photos');
```

You need to create the store that will communicate with the above **collection**.
And don't forget to give a **name**, it's the only way for the uploader to know
on which store it should save a file.
```js
Meteor.photosStore = new UploadFS.store.Local({
    collection: Meteor.photos,
    name: 'photos',
    path: '/uploads/photos'
});
```

### Filtering uploads

You can pass an `UploadFS.Filter` to a store to define restrictions on file uploads.
Filter is tested before inserting a file in the collection and uses `Meteor.deny()`.
If the file does not match the filter, it won't be inserted and so not be uploaded.
```js
Meteor.photosStore = new UploadFS.store.Local({
    collection: Meteor.photos,
    name: 'photos',
    path: '/uploads/photos',
    // Apply a filter to restrict file upload
    filter: new UploadFS.Filter({
        maxSize: 1024 * 1000 // 1MB,
        contentTypes: ['image/*'],
        extensions: ['jpg', 'png']
    })
});
```

### Transforming files

If you need to modify the file before it is saved to the store, you have to use the **transform** option.
```js
Meteor.photosStore = new UploadFS.store.Local({
    collection: Meteor.photos,
    name: 'photos',
    path: '/uploads/photos',
    transform: function (readStream, writeStream, fileId) {
        var im = Npm.require('imagemagick-stream');
        var resize = im().resize('200x200').quality(90);
        readStream.pipe(resize).pipe(writeStream);
    }
});
```

### Setting permissions

As the uploader will interact with the collection, you must define permission rules.
By default, there is no restriction (except the filter) on insert, remove and update actions.

```js
Meteor.photos.allow({
    insert: function (userId, doc) {
        return userId;
    },
    update: function (userId, doc) {
        return userId === doc.userId;
    },
    remove: function (userId, doc) {
        return userId === doc.userId;
    }
});
```

### Configuring endpoint

Uploaded files will be accessible via a default URL, you can change it, but don't change after having uploaded files because you will break the URL of previous stored files.

```js
// This path will be appended to the site URL, be sure to not put a "/" as first character
// for example, a PNG file with the _id 12345 in the "photos" store will be available via this URL :
// http://www.yourdomain.com/my/custom/path/photos/12345.png
UploadFS.config.storesPath = 'my/custom/path';
```

### Security

When returning the file for a HTTP request on the endpoint, you can do some checks to decide whether or not the file should be sent to the client.
This is done by defining the **onRead()** method on the store.

```js
Meteor.photosStore = new UploadFS.store.Local({
    collection: Meteor.photos,
    name: 'photos',
    path: '/uploads/photos',
    onRead: function (fileId, request, response) {
        if (isPrivateFile(fileId, request)) {
            throw new Meteor.Error(403, 'the file is private');
            // Because this code is executed before reading and returning the file,
            // throwing an exception will simply stops returning the file to the client.
        }
    }
});
```

### Uploading a file

When the store on the server is configured, you can upload a file.

Here is the template to upload a file :
```html
<template name="upload">
    <input type="file">
</template>
```

And there the code to upload the file :
```js
Template.upload.events({
    'change input[type=file]': function (ev) {
        var self = this;
    
        // Here we get the ArrayBuffer for each file of the event
        UploadFS.readAsArrayBuffer(ev, function (data, file) {
            // Prepare the file to insert in database, note that we don't provide an URL,
            // it will be set automatically by the uploader when file transfer is complete.
            var photo = {
                name: file.name,
                size: file.size,
                type: file.type,
                customField: 1337
            };
    
            // Create a new Uploader for this file
            var upload = new UploadFS.Uploader({
                // This is where the uploader will save the file
                store: Meteor.photosStore,
                // The size of each chunk sent to the server
                chunkSize: 1024 * 8,
                // This tells how many tries to do if an error occurs during upload
                maxTries: 5,
                // The file data
                data: data,
                // The document to save in the collection
                file: photo,
                // The error callback
                onError: function (err) {
                    console.error(err);
                },
                // The complete callback
                onComplete: function () {
                    console.log('transfer complete');
                }
            });
            
            // Reactive method to get upload progress
            Tracker.autorun(function() {
                console.log(upload.getLoaded() + '% completed');
            });
            
            // Reactive method to get upload status
            Tracker.autorun(function() {
                console.log('transfer ' + (upload.isUploading() ? 'started' : 'stopped'));
            });
            
            // Starts the upload
            upload.start();
            
            // Stops the upload
            upload.stop();
            
            // Abort the upload
            upload.abort();
        });
    }
});
```

### Displaying photos

After that, if everything went good, you have you file saved to the store and in database.
You can get the file as usual and display it using the url attribute of the document.

Here is the template to display a list of photos :
```html
<template name="photos">
    <div>
        {{#each photos}}
            {{#if uploading}}
                <img src="/images/spinner.gif" title="{{name}}">
            {{else}}
                <img src="{{url}}" title="{{name}}">
            {{/if}}
        {{/each}}
    </div>
</template>
```

And there the code to load the file :
```js
Template.photos.helpers({
    photos: function() {
        return Meteor.photos.find();
    }
});
```
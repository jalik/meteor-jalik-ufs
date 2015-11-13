# UploadFS

UploadFS is a Meteor package that aims to make file uploading easy, fast and configurable.
An important feature is the ability to **start, stop or even abort a transfer** when you want.
It currently only supports file system storage but it is possible to extend possibilities by creating new Stores yourself.

## Testing

You can test the package by downloading and running [UFS-Example](https://github.com/jalik/ufs-example) which is simple demo of UploadFS.

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

* [UploadFS.store.Local](https://github.com/jalik/jalik-ufs-local)
* [UploadFS.store.GridFS](https://github.com/jalik/jalik-ufs-gridfs)

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
    // Transform file when reading
    transformRead: function (from, to, fileId, file, request) {
        from.pipe(to);
    }
    // Transform file when writing
    transformWrite: function (from, to, fileId, file) {
        var im = Npm.require('imagemagick-stream');
        var resize = im().resize('200x200').quality(90);
        from.pipe(resize).pipe(to);
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

### Configuration

You can access and modify settings via `UploadFS.config`.

```js
// Activate simulation for slowing file reading
UploadFS.config.simulateReadDelay = 1000; // 1 sec

// Activate simulation for slowing file writing
UploadFS.config.simulateWriteDelay = 2000; // 2 sec

// This path will be appended to the site URL, be sure to not put a "/" as first character
// for example, a PNG file with the _id 12345 in the "photos" store will be available via this URL :
// http://www.yourdomain.com/uploads/photos/12345.png
UploadFS.config.storesPath = 'uploads';

// Set the temporary directory where uploading files will be saved
// before sent to the store.
UploadFS.config.tmpDir = '/tmp/uploads';
```

### Security

When returning the file for a HTTP request on the endpoint, you can do some checks to decide whether or not the file should be sent to the client.
This is done by defining the **onRead()** method on the store.

```js
Meteor.photosStore = new UploadFS.store.Local({
    collection: Meteor.photos,
    name: 'photos',
    path: '/uploads/photos',
    // Called before reading file to check if we can return it (for example)
    onRead: function (fileId, request, response) {
        if (isPrivateFile(fileId, request)) {
            throw new Meteor.Error(403, 'this file is private');
            // Because this code is executed before reading and returning the file,
            // throwing an exception will simply stops returning the file to the client.
        }
    }
});
```

### Server events

Some events are triggered to allow you to do something at the right moment on server side.

```js
Meteor.photosStore = new UploadFS.store.Local({
    collection: Meteor.photos,
    name: 'photos',
    path: '/uploads/photos',
    // Called when file has been uploaded
    onFinishUpload: function (file) {
        console.log(file.name + 'has been uploaded');
    }
});
```

### Uploading files

When the store on the server is configured, you can upload files to it.

Here is the template to upload one or more files :

```html
<template name="upload">
    <input type="files" multiple>
</template>
```

And there the code to upload the selected files :

```js
Template.upload.events({
    'change input[type=files]': function (ev) {
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
                onComplete: function (file) {
                    console.log(file.name + ' has been uploaded');
                }
            });
            
            // Reactive method to get upload progress
            Tracker.autorun(function() {
                console.log((upload.getProgress() * 100) + '% completed');
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

### Writing files

Sometimes you could need to write to the store directly on the server :

```js
// Insert the file in database
var fileId = store.create(file);

// Save the file to the store
store.write(inStream, fileId, function(err, file) {
    if (err) {
        console.error(err);
    }else {
        console.log('file saved to store');
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

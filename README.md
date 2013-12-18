# fsroute [![Build Status](https://secure.travis-ci.org/randymized/fsroute.png?branch=master)](http://travis-ci.org/randymized/fsroute)

> A filesystem-based router.  Resources are served from filesystem paths that correspond to the URL.  Functions may also be organized in a tree structure that corresponds to the URL.

## _Getting Started
Install the module with: `npm install fsroute`

```javascript
var FSRoute = require( 'fsroute' );
```

## Documentation
FSRoute is an Express-compatible middleware router that serves resources from filesystem paths that correspond to the URL.  FSRoute additionally allows organizing functions in a tree structure that corresponds to the URL.

Given a URL of `http://example.com/foo/bar` and a resource root directory of `/root-directory`, a module at `/root-directory/foo/bar` would be run to serve the request.  Alternatively, a number of serving functions could be gathered together in a tree.  In this case, the above request would be served from the following tree:
```javascript
{
    foo: {
        bar: function(descend) {
        }
    }
}
```
Such a tree would probably include more than one function and a more complex tree structure.  If both a tree and a root directory are specified, the two are merged.

### API

#### Request handler functions

The functions in the routing tree and exported from modules in the filesystem resource directory receive one argument, `descend` and are called in a `this` context that is shared by all handlers for a given request.  The context should include a `req` request object and a `res` response object. The router will add `next` to the context, allowing exit from the router to the next middleware layer.

Request handlers must either:

 - Send a response.
 - Call the `descend` callback to pass the request on to the next handler.
 - Call `this.next()` to signal a `not found` condition and pass the request to the next middleware layer.
 - Call `this.next(err)` to signal an error.


#### var fsRoute= new FSRoute(tree)

Creates a new router.

The tree argument is optional.  If present, it should be an object containing functions and embedded objects that define the routing to be done.  For example `{foo:{bar:function() {}}}` would define a router that directs requests for `/foo/bar` to the given function. Read on for more examples.

#### fsRoute.add_modules(rootdir)

Adds the modules in the directory `rootdir` and its subdirectories to the router.

Returns the `fsRoute` object for which is was invoked, allowing chaining.

#### fsRoute.request_handler(context,next)

Handle one request. `request_handler` should be called once for each request to be routed.  The request will be routed to the function or functions from the tree or modules that are to handle the request.  The `request_handler` function is asynchronous.

The handler functions will be called in the context of the `context` object.  It will be `this` in any handler function.  FSRoute expects it to include a `req` request object.  Typically, it would also include a response object, but FSRoute does not require that.  The request object must include a `method` and a `url`.

If no functions are defined to handle the request, or if they all pass the request on to their `descend` callback, the `next` function will be called.

#### fsRoute.connect_middleware()

Convenience method for calling `request_handler` in Connect compatible middleware.

Returns a middleware function that calls `request_handler`.

#### fsRoute.composable_middleware()

Convenience method for calling `request_handler` in [composable middleware](https://npmjs.org/package/composable-middleware).  The composable middleware `this` context will be shared context for all request handler functions.

Returns a middleware function that calls `request_handler`.


#### fsRoute.set_module_extentions(extensions)

Defines the file extensions that will be recognized as modules.  The default is `js` and `coffee`.  The argument(s) should be strings without a leading dot.

Returns the `fsRoute` object for which is was invoked, allowing chaining.

### Determinate and Indeterminate paths

Most paths are determinate.  Requesting `http://example.com/foo/bar` results in the module at `/root-directory/foo/bar` being run.

It is also possible to define indeterminate path handlers.  If a module is defined at `/root-directory/foo/_DEFAULT.js` or in a tree like `{foo:{'*':fn()}}` all requests starting `http://example.com/foo/`, including `http://example.com/foo/bar` or `http://example.com/foo/abc/def/ghi`, even if not explicitly defined as a determinate path will pass through that handler.

If indeterminate handlers are defined for both `http://example.com/` and `http://example.com/foo/` as well as a determinate handler for `http://example.com/foo/bar`, the request will first be handled by the root directory handler, then by the `foo` directory handler before finally being handled by the determinate `http://example.com/foo/bar` handler.  This stack of handlers works as middleware.  Each is called with a `descend` callback.  The request only reaches the next handler if `descend` is called.  See the [Directory default handlers](#default) section and the [Virtual directories](#virtual) section for more information.

In addition to the obvious determinate `http://example.com/foo/bar` path, there are a couple of special case definitions.  A determinate handler can be defined for `http://example.com/foo/` or for `http://example.com/foo` for cases where `foo` is both a directory and a specific resource.  Determinate handlers may also be defined for URLs with extensions, such as `http://example.com/foo/bar.css` and specific to a given HTTP method.

### URL routing guide

In the table below, `fn()` is an abbreviation for `function(descend){}`. The `descend` argument is optional.  The function must either send a response to `this.res`, call `descend()` to descend to the next route handler or call `next()` to punt the request to the next middleware layer.

| URL | file path | tree |notes|
|-----|-----------|------|-----|
|/foo/bar|foo/bar.js|`{foo:{bar:fn()}}`|[[1]](#simple)
|GET /foo/bar|foo/bar._GET.js|`{foo:{'bar._GET':fn()}}`|[[2]](#method-mapping)
|POST /foo/bar|foo/bar._POST.js|`{foo:{'bar._POST':fn()}}`|[[2]](#method-mapping)
|/foo/bar.css|foo/bar.css.js|`{foo:{'bar.css':fn()}}`|[[3]](#url-extension)
|GET /foo/bar.css|foo/bar.css._GET.js|`{foo:{'bar.css._GET':fn()}}`|[[3]](#url-extension) [[2]](#method-mapping)
|/foo|foo.js|`{'foo.':fn(),foo:{...}}`|[[4]](#unslashed)
|GET /foo|foo._GET.js|`{'foo._GET':fn(),foo:{...}}`|[[4]](#unslashed) [[2]](#method-mapping)
|/foo/|foo/_INDEX.js|`{foo:{'/':fn()}}`|[[5]](#slashed)
|GET /foo/|foo/_INDEX._GET.js|`{foo:{'/._GET':fn()}`|[[5]](#slashed) [[2]](#method-mapping)
|/foo/...|foo/_DEFAULT.js|`{foo:{'*':fn()}}`|[[6]](#default)

Here is a tree that puts this all together:
```javascript
{
  '*':fn(),            // all requests http://example.com/... [6]
  'foo.':fn(),         // http://example.com/foo (except DELETE)[4]
  'foo._DELETE':fn(),  // POST http://example.com/foo [4][2]
  foo:{
    '*':fn(),          // all requests http://example.com/foo/... [6]
    '/':fn(),         // http://example.com/foo/ (except DELETE)[5]
    '/._DELETE':fn(), // http://example.com/foo/ [5]
    'bar._GET': fn(),  // GET http://example.com/foo.bar [1][2]
    'bar._POST': fn(), // POST http://example.com/foo.bar [1][2]
    bar: fn(),         // http://example.com/foo.bar (except GET or POST) [1]
    'bar.json._GET': fn(), // GET http://example.com/foo.bar.json [3][2]
    'bar.json': fn()   // http://example.com/foo.bar.json (not GET) [3]
  }
}
```

The same site implemented in individual files:
```
/root-dir/_DEFAULT.js  (all requests http://example.com/... [6])
/root-dir/foo.js       (http://example.com/foo (except DELETE)[4])
/root-dir/foo._DELETE.js (POST http://example.com/foo [4][2])
/root-dir/foo/_INDEX.js (http://example.com/foo/ [5])
/root-dir/foo/_DEFAULT.js  (http://example.com/foo/... all requests (except DELETE)[6])
/root-dir/foo/_DEFAULT._DELETE.js (all DELETE requests http://example.com/foo/... [6][2])
/root-dir/foo/bar._GET.js  (GET http://example.com/foo.bar [1][2])
/root-dir/foo/bar._POST.js (POST http://example.com/foo.bar [1][2])
/root-dir/foo/bar.js (http://example.com/foo.bar (except GET or POST) [1] )
/root-dir/foo/bar.json._GET.js  (GET http://example.com/foo/bar.json [3][2])
/root-dir/foo/bar.json.js (http://example.com/foo/bar.json (except GET) [3] )
```

Since the files are preloaded into a tree and merged with whatever is already in the tree, some handlers could be defined in the tree and some in the filesystem.

#### <a name="simple"></a>Simple URL mapping
In the simplest case, a URL maps directly to a file's path or to the function in the tree:
`http://example.com/foo/bar` maps to `/root-directory/foo/bar.js` or `{foo:{bar:fn()}}`.

The function will be called in context so that `this` is an object that is created for each request and shared by all handlers.  The request object can be referenced as `this.req` and the response object as `this.res`. `this.end()` passes the request to the next middleware layer.

If a handler is defined for any directory (node) along the way, it will be invoked before this, the leaf node handler.  Each of those handlers must call their `descend` callback in order for the request to reach the leaf node handler.

#### <a name="method-mapping"></a>HTTP method (GET, POST, etc) mapping
If only [Simple URL mapping](#simple) is used, requests are routed without regard to HTTP method.  That handler would often have to respond differently depending upon whether the request is a `GET`, `POST` or of some other method.

GET `http://example.com/foo/bar` maps to `/root-directory/foo/bar._GET.js` or `{foo:{'bar._GET':fn()}}`.

POST `http://example.com/foo/bar` maps to `/root-directory/foo/bar._POST.js` or `{foo:{'bar._POST':fn()}}`.

Other methods are mapped in a similar manner.  HEAD will be routed as if it were GET.

If both a method mapping function and a simple URL function are defined, the method mapping function is called first.  The simple function will only be called if the method mapping function calls `descend`.

So if both `/root-directory/foo/bar._GET.js` and `/root-directory/foo/bar.js` exist, the `bar._GET.js` function will be called first.  The `bar.js` function will only be called if `bar._GET.js` calls its `descend` callback.

Similarly, if the tree included `{foo:{'bar._GET':fn(),bar:fn()}}`, `'bar._GET':fn()` would be called before `bar:fn()` and `bar:fn()` would only be called if `'bar._GET':fn()` called its `descend` callback.

As with a simple URL handler, the function will be called in context so that `this` is an object that is created for each request and shared by all handlers.  If the method mapping function calls its `descend` callback, both the method-mapping function and the simple URL function would be called in the same context, allowing data sharing.

#### <a name="url-extension"></a>URLs with extensions

Given a URL like `http://example.com/foo/bar`, a HTML file might be served. Alternatively, a JSON representation of the underlying data might reasonably have a URL of `http://example.com/foo/bar.json`.

The function at `/root-directory/foo/bar.json.js` would be called to serve this request as would a function defined in the tree at `{foo:{'bar.json':fn()}}`

HTTP method-specific functions can also be defined, such as at `/root-directory/foo/bar.json._GET.js` or in the tree at `{foo:{'bar.json._GET':fn()}}`.  These function the same as their non-extended counterparts.

So a site serving css, js and json to go with `foo/bar`, including special handling for POSTs to `foo/bar` might define the following tree:
```javascript
{
    foo: {
        bar: function(descend) {
        }
        bar._POST: function(descend) {
        }
        'bar.css': function(descend) {
        }
        'bar.json': function(descend) {
        }
        'bar.js': function(descend) {
        }
    }
}
```

#### <a name="unslashed"></a>Directory requests
We have been using a URL of `/foo/bar` in several examples above.  But what if, for the same site, a request for `/foo` or for `foo/` is received?  Special naming conventions are used to deal with requests like these where the request is for a directory.

|/foo|foo.js|`{'foo.':fn(),foo:{...}}`|

If the URL is `http://example.com/foo` (without a trailing slash), a file could be defined at `/root-directory/foo.js` without conflicting with the directory defined at `/root-directory/foo`.

But you cannot define both an object and a function at `foo` in the tree, so a special naming convention is employed here: appending a dot to the end of `foo`.  The following tree would serve both `foo/bar` and `foo`:
```javascript
{
  'foo.':fn(), // http://example.com/foo
  foo:{
    bar: fn()  // http://example.com/foo.bar
  }
}
```

#### <a name="slashed"></a>Directory requests (trailing slash)
Naming a handler for a directory request with trailing slash, such as `/foo/` requires special naming conventions.

In the tree, the function is simply keyed by the name followed by a slash as in the following tree: `{'foo/':fn()}`.

`_INDEX` is a reserved name that designates a handler for slashed directory requests, such as a file named: `/root-directory/foo/_INDEX.js`

As in other cases, it is possible to define HTTP method-specific handlers, such as `{'foo/._GET':fn()}` or `/root-directory/foo/_INDEX._GET.js`

#### <a name="default"></a>Directory default handlers

It is possible to define functions that will be called for every request within a directory.  So in the case of a request for `http://example.com/foo/bar`, a function will be called at the root level, at the `foo` level, and finally for the specific `bar` request.

The default handlers can be looked at as middleware, where the middleware stack changes depending on path.

The `descend` callback is more significant for a directory default handler than in most other handlers.  In the other case, the handler is called at the end of the path, but here the handler is called while traversing the path.  If the default handler does not call its `descend` callback, the request will go no further.  As with other handlers, if `descend` is not called, then either a response needs to be sent to `this.res` or `this.next()` needs to be called.

A handler for a directory containing resources that require greater permissions, may, for example, thus block or redirect requests from those not having adequate permission.

Since `this` is shared by all handlers for a given request, values can be added or changed.  One could, for example, create a breadcrumb object in the root directory's handler and push new values into it at each level.  The common bus might also be used to maintain configuration information -- configuration that might change from one part of a site to another.

Currently, HTTP method-specific directory default handlers are not supported.  The handler function may, of course, include code that is conditional upon the value of `this.req.method`.  FSRoute, however, will not select different handlers depending upon HTTP method.

### Function arguments

You may note in the above examples that the functions serving a given request define a single argument, `descend`.  They are also invoked so that `this` references several other objects that might be needed to serve the request.  `this.req` and `this.res` are the request and response objects.  `this.next` punts a request to the next middleware level.  `this.fsroute` is also defined, giving access to its facilities.  As you will see in a following topic, all functions serving a given request are invoked in the same `this` context, and it can then be used as a bus conveying additional data between functions.

The use of `this` as a common resource to all functions serving a request, and the one-argument function, is compatible with [composable-middleware](https://github.com/randymized/composable-middleware).  The common bus can thus extend through several layers of middleware, including one or more FSRoute routing layers.

The `descend` method moves to the next step in FSRoute, whereas `this.next()` goes to the next middleware layer.  More about this in the 'Directory Interception' section below.

### Preloading

When a root directory, such as `/root-directory` is specified, FSRoute loads all the modules found in that directory and its subdirectories and organizes them into a tree.  If both a tree and a root directory are specified, the two will be merged to produce a single tree from which requests will be served.

Since `require` is synchronous and because preloading reasonably should occur during server initialization, the entire preloading process is synchronous.

### Parallel file directories

Although the original intent of FSRoute was that all resources, such as code files, templates, CSS and client-side Javascript all be together in one directory, a conflict tends to arise between server-side Javascript files and those intended for the client.  There is no easy way to separate the Javascript serving requests from code meant for the client.  Measures might also need to be taken to avoid serving raw template files.

FSRoute thus anticipates and supports parallel resource file trees.  The `/root-directory` directory in the above example might be accompanied by a `/user/me/site/resource` or even `/somewhere/else` root.  Given the `/user/me/site/resource` root directory, and the above URL, an FSRoute method would return `/user/me/site/resource/foo/bar`.  You might then append `.css` to that to arrive at the name of an actual file.

### <a name="virtual"></a>Virtual directories

One significant capability associated with directory default handlers is the ability to easily define virtual directories.

Our `example.com` website might, for example, include, in addition to everything else, a blog.  But the content of the blog is dynamically generated with data from the database.  In a URL like `http://example.com/blog/2013/12/13` the `2013/12/13` part of the URL defines the database query.

To implement this blog, we could define a default handler for the `blog` directory in the tree like `{blog:{'*':fn()}}` or in the filesystem at `/root-dir/blog/_DEFAULT.js`.  This would be invoked for any URL starting `http://example.com/blog`.  Instead of calling `descend`, this function would perform the database lookup and produce the requested page.

`FSRoot` maintains two arrays in `this`: `this.left` and `this.right`.  As a request traverses the path, path elements are moved from `right` to `left`.  When our default blog handler is called with the above URL, the two would contain:
`this.left`|`this.right`
----|----
`['blog']`|`['2013','12','13']`

The URL components needed to query the database can thus be found in `this.right`.

## Contributing
In lieu of a formal styleguide, take care to maintain the existing coding style. Add unit tests for any new or changed functionality. Lint and test your code using [Grunt](http://gruntjs.com/).

## Release History
_(Nothing yet)_

## License
Copyright (c) 2013 Randy McLaughlin
Licensed under the MIT license.

> Written with [StackEdit](https://stackedit.io/).
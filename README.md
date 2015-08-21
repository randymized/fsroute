# fsroute [![Build Status](https://secure.travis-ci.org/randymized/fsroute.png?branch=master)](http://travis-ci.org/randymized/fsroute)

> FSRoute is an Express-compatible middleware router that serves resources from a tree structure and/or filesystem paths that correspond to the URL.

## Getting Started
Install the module with: `npm install fsroute`

```javascript
var FSRoute = require( 'fsroute' );
```

## Documentation
FSRoute is an Express-compatible middleware router that serves resources from a tree structure and/or filesystem paths that correspond to the URL.

### Filesystem modules
Given a URL of `http://example.com/foo/bar` and a resource root directory of `/root-directory`, a module at `/root-directory/foo/bar.js` would serve the request. The function that is exported from that module would be called when a request for that URL was received.

The root of the tree is specified by first creating an FSRoute object and then invoking its add_modules method, passing the absolute path of the root directory.

### Tree of objects
Alternatively, a number of serving functions could be gathered together in a tree of javascript objects.  In this case, the above request would be served from the following tree:
```javascript
{
    foo: {
        bar: function(descend) {
        }
    }
}
```
Such a tree would likely, in practice, include more than one function and a more complex tree structure.  If both a tree and a root directory are specified, the two are merged.

The tree of objects is passed to the FSRoute constructor.

### Clustered objects

Instead of exporting a function, filesystem modules may export an object. When FSRoute encounters an exported object, it will iterate through the object's keys. If the associated value is a function, the key will be appended to the module's path and treated as if a module was found at the resulting extended path.

So given `/root-directory/foo.js`:
```javascript
module.exports= {
  a: function() {
    this.res.send('responds to /fooa')
  },
  '': function() {
    this.res.send('special case: empty string as key, responds to /foo')
  },
  '/': function() {
    this.res.send('special case: responds to /foo/')
  },
  '/bar': function() {
    this.res.send('responds to /foo/bar')
  },
  '/*': function(descend) {
    this.res.send('special case: called with all requests in /foo/*')
    descend()
  }
}
```

If the associated object is also an object, rather than a function, its keys specify HTTP methods and the function associated with the method handles requests of that method:
So if we replace '/bar' above with:
```javascript
  '/bar': {
    GET: function() {
        this.res.send('responds to GET /foo/bar')
      },
    POST: function() {
        this.res.send('responds to POST to /foo/bar')
      },
    PUT: function() {
        this.res.send('responds to PUTS to /foo/bar')
      }
    }
```

### Mix and match

A mixture of tree objects and filesystem modules (some or all of which may contain clustered objects) is allowed. Find a mix that works for you.

### API

----------
#### Request handler functions

The functions in the routing tree and exported from modules in the filesystem resource directory receive one argument, `descend` and are called in a `this` context that is shared by all handlers for a given request.  The context should include a `req` request object and a `res` response object. The router will add `next` to the context, allowing exit from the router to the next middleware layer.

The `this` context is shared among all handlers serving a given request.  It can serve as a bus, converying objects or settings from one handler to another. If FSRoute is used as middleware in [composable middleware](https://npmjs.org/package/composable-middleware), `this` will be shared among all that middleware as well.   The common bus can thus extend through several layers of middleware, including one or more FSRoute routing layers.

The `descend` method moves to the next step in FSRoute, whereas `this.next()` goes to the next middleware layer.

If the path is [indeterminate](#indeterminate), `this.remainder` will be everything in the URL to the right of the handler's path.  If the handler is for `/foo/` and the URL is `/foo/a/b/c`, `this.remainder` will be `a/b/c`.

If you name your handler function, the handler's path can be found in `[function-name].path`.  Requesting `/foo/bar` from the following tree will result in a reply of `/foo/bar`:
```
{foo:
  {
    bar:function fn(){
      this.res.send(fn.path)
    }
  }
}
```

A request handler may also have the signature of Connect middleware: `function(request,response,descend)`.

Request handlers must either:

 - Send a response.
 - Call the `descend()` callback to pass the request on to the next handler.
 - Call `this.next()` to signal a `not found` condition and pass the request to the next middleware layer.
 - Call `descend(err)` or `this.next(err)` to signal an error.

----------
#### var fsRoute= new FSRoute(tree)

Creates a new router.

The tree argument is optional.  If present, it should be an object containing functions and embedded objects that define the routing to be done.  For example `{foo:{bar:function() {}}}` would define a router that directs requests for `/foo/bar` to the given function. Read on for more examples.

----------
#### fsRoute.add_modules(rootdir)

Adds the modules in the directory `rootdir` and its subdirectories to the router.

Returns the `fsRoute` object for which is was invoked, allowing chaining.

----------
#### fsRoute.request_handler(context,next)

Handle one request. The `request_handler` is called once for each request to be routed.  The request will be routed to the function or functions from the tree or modules that are to handle the request.  The `request_handler` function is asynchronous.

The handler functions will be called in the context of the `context` object.  It will be `this` in any handler function.  FSRoute expects it to include a `req` request object and a `res` response object, but FSRoute does not require that.  The request object must include a `method` and a `url`.

If no functions are defined to handle the request, or if they all pass the request on to their `descend` callback, the `next` function will be called.

The `request_handler` may be called within a handler function.  This allows support of internal redirection and partials.  A The request handler of a different instance of FSRoute can also be called, allowing complex embedded structures.

----------
#### fsRoute.connect_middleware()

Convenience method for calling `request_handler` in Connect compatible middleware.

Returns a middleware function that calls `request_handler`.

----------
#### fsRoute.composable_middleware()

Convenience method for calling `request_handler` in [composable middleware](https://npmjs.org/package/composable-middleware).  The composable middleware `this` context will be shared context for all request handler functions.

Returns a middleware function that calls `request_handler`.

----------
#### fsRoute.set_module_extentions(extensions)

Defines the file extensions that will be recognized as modules.  The default is `js` and `coffee`.  The argument(s) should be strings without a leading dot.

Returns the `fsRoute` object for which is was invoked, allowing chaining.

----------
#### this.on_no_determinate

If an indeterminate request handler assigns a function to `this.on_no_determinate`, that function will be called whenever a request is received for which there is not a determinate handler.

Given the following:
```javascript
      {foo:
        {
          '*': function(descend) {
            this.on_no_determinate= function() {
              this.res.send('No determinate handler')
            }
            descend()
          },
          bar:function fn(req,res,next){
            ...
          }
        },
        }
      }
```
- A request for `/foo/bar` would be handled by the `foo/bar` handler
- Since there is no handler defined for `foo/qux`, the `on_no_determinate` function would be called.

`on_no_determinate` allows checking first for functions or modules to serve the request, and failing that, looking for resources, such as in the filesystem or in a database, to satisfy the request.

----------

#### this.add_slash_to_directory

If `this.add_slash_to_directory` is set to a truthy value, the URL is not found and adding a slash to the URL would find a handler for the request, a redirect to that slashed URL will result.

Given the following tree:
```javascript
{
  foo: {
    '/': function() {...}
    '*': function() (
      this.add_slash_to_directory= true;
      descend();
    }
  }
}
```

There is no handler for a URL of `/foo`.  But since there is a handler for `/foo/` and `this.add_slash_to_directory` is true because it was set in the `foo` directory default handler, a redirect to `/foo/` will result.

----------
#### this.fsRoute

The FSRoute object serving the request.  Most notably, `this.fsRoute` can be called to effect internal redirection or to load a partial.

----------
#### this.parsed_url

The request's URL as returned from Node's `url.parse`.


----------
####<a name="indir"></a> this.path_in(dir)

Given the path to a directory, returns the path of the URL in that directory.  For example, given a URL of `/foo/bar`, `this.path_in('/my/directory')` returns `/my/directory/foo/bar`

----------
### <a name="determinate"></a><a name="indeterminate"></a>Determinate and Indeterminate paths

Most paths are determinate.  Requesting `http://example.com/foo/bar` results in the module at `/root-directory/foo/bar` being run.

It is also possible to define indeterminate path handlers.  If a module is defined at `/root-directory/foo/_DEFAULT.js` or in a tree like `{foo:{'*':fn()}}` all requests starting `http://example.com/foo/`, including `http://example.com/foo/bar` or `http://example.com/foo/abc/def/ghi`, even if not explicitly defined as a determinate path will pass through that handler.

If indeterminate handlers are defined for both `http://example.com/` and `http://example.com/foo/` as well as a determinate handler for `http://example.com/foo/bar`, the request will first be handled by the root directory handler, then by the `foo` directory handler before finally being handled by the determinate `http://example.com/foo/bar` handler.  This stack of handlers works as middleware.  Each is called with a `descend` callback.  The request only reaches the next handler if `descend` is called.  See the [Directory default handlers](#default) section and the [Virtual directories](#virtual) section for more information.

In addition to the obvious determinate `http://example.com/foo/bar` path, there are a couple of special case definitions.  A determinate handler can be defined for `http://example.com/foo/` or for `http://example.com/foo` for cases where `foo` is both a directory and a specific resource.  Determinate handlers may also be defined for URLs with extensions, such as `http://example.com/foo/bar.css`.  Determinate handlers only serve GET and HEAD requests unless they are defined to be specific to a given HTTP method.

### URL routing guide

In the table below, `fn()` is an abbreviation for `function(descend){}`. The `descend` argument is optional.  The function must either send a response to `this.res`, call `descend()` to descend to the next route handler or call `next()` to punt the request to the next middleware layer.

| URL | file path | tree |notes|
|-----|-----------|------|-----|
|/foo/bar|foo/bar.js|`{foo:{bar:fn()}}`|[[1]](#simple)
|POST /foo/bar|foo/bar._POST.js|`{foo:{'bar._POST':fn()}}`|[[2]](#method-mapping)
|/foo/bar.css|foo/bar.css.js|`{foo:{'bar.css':fn()}}`|[[3]](#url-extension)
|POST /foo/bar.css|foo/bar.css._POST.js|`{foo:{'bar.css._POST':fn()}}`|[[3]](#url-extension) [[2]](#method-mapping)
|/foo|foo.js|`{'foo.':fn(),foo:{...}}`|[[4]](#unslashed)
|POST /foo|foo._POST.js|`{'foo._POST':fn(),foo:{...}}`|[[4]](#unslashed) [[2]](#method-mapping)
|/foo/|foo/_INDEX.js|`{foo:{'/':fn()}}`|[[5]](#slashed)
|POST /foo/|foo/_INDEX._POST.js|`{foo:{'/._POST':fn()}`|[[5]](#slashed) [[2]](#method-mapping)
|/foo/...|foo/_DEFAULT.js|`{foo:{'*':fn()}}`|[[6]](#default)

Here is a tree that puts this all together:
```javascript
{
  '*':fn(),            // all requests http://example.com/... [6]
  'foo.':fn(),         // GET http://example.com/foo [4]
  'foo._POST':fn(),    // POST http://example.com/foo [4][2]
  foo:{
    '*':fn(),          // all requests http://example.com/foo/... [6]
    '/':fn(),          // GET http://example.com/foo/ [5]
    '/._POST':fn(),    // POST http://example.com/foo/ [5]
    'bar._POST': fn(), // POST http://example.com/foo.bar [1][2]
    bar: fn(),         // GET http://example.com/foo.bar [1]
    'bar.json._POST': fn(), // POST http://example.com/foo.bar.json [3][2]
    'bar.json': fn()   // GET http://example.com/foo.bar.json [3]
  }
}
```

The same site implemented in individual files:
```
/root-dir/_DEFAULT.js   (all requests http://example.com/... [6])
/root-dir/foo.js        (GET http://example.com/foo [4])
/root-dir/foo._POST.js  (POST http://example.com/foo [4][2])
/root-dir/foo/_INDEX.js (GET http://example.com/foo/ [5])
/root-dir/foo/_DEFAULT.js  (all requests http://example.com/foo/... [6])
/root-dir/foo/bar.js    (GET http://example.com/foo.bar [1][2])
/root-dir/foo/bar._POST.js (POST http://example.com/foo.bar [1][2])
/root-dir/foo/bar.json.js  (GET http://example.com/foo/bar.json [3][2])
/root-dir/foo/bar.json._POST.js (POST http://example.com/foo/bar.json [3] )
```

Since the files are preloaded into a tree and merged with whatever is already in the tree, some handlers could be defined in the tree and some in the filesystem.

#### <a name="simple"></a>Simple URL mapping (determinate)
In the simplest case, a URL maps directly to a file's path or to the function in the tree:
`http://example.com/foo/bar` maps to `/root-directory/foo/bar.js` or `{foo:{bar:fn()}}`.

The function is only called for GET or HEAD requests.  A [method-specific](#method-mapping) function must be defined for any other method.

The function will be called in context so that `this` is an object that is created for each request and shared by all handlers.  The request object can be referenced as `this.req` and the response object as `this.res`. `this.end()` passes the request to the next middleware layer.

If a handler is defined for any directory (node) along the way, it will be invoked before this, the leaf node handler.  Each of those handlers must call their `descend` callback in order for the request to reach the leaf node handler.

#### <a name="method-mapping"></a>HTTP method (POST, PUT, etc) specific (determinate)
If only [Simple URL mapping](#simple) is used, only GET (or HEAD) requests are routed.

GET `http://example.com/foo/bar` maps to `/root-directory/foo/bar.js` or `{foo:{bar:fn()}}`.

POST `http://example.com/foo/bar` maps to `/root-directory/foo/bar._POST.js` or `{foo:{'bar._POST':fn()}}`.

Other methods are mapped in a similar manner.

As with a simple URL handler, the function will be called in context so that `this` is an object that is created for each request and shared by all handlers.  If the method mapping function calls its `descend` callback, both the method-mapping function and the simple URL function would be called in the same context, allowing data sharing.

#### <a name="url-extension"></a>Handlers for URLs with extensions (determinate)

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

#### <a name="unslashed"></a>Directory requests (determinate)
We have been using a URL of `/foo/bar` in several examples above.  But what if, for the same site, a request for `/foo` or for `foo/` is received?  Special naming conventions are used to deal with requests like these where the request is for a directory.

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

#### <a name="slashed"></a>Directory requests (trailing slash) (determinate)
Naming a handler for a directory request with trailing slash, such as `/foo/` requires special naming conventions.

In the tree, use a slash as a key, as in the following tree: `{foo:{'/':fn()}}`.

`_INDEX` is a reserved name that designates a handler for slashed directory requests, such as a file named: `/root-directory/foo/_INDEX.js`

#### <a name="default"></a>Directory default (indeterminate) handlers

It is possible to define functions that will be called for every request within a directory.  So in the case of a request for `http://example.com/foo/bar`, a function will be called at the root level, at the `foo` level, and finally for the specific `bar` request.

The default handlers can be looked at as middleware, where the middleware stack is different for different paths.

The `descend` callback is more significant for a directory default handler than in most other handlers.  In the other case, the handler is called at the end of the path, but here the handler is called while traversing the path.  If the default handler does not call its `descend` callback, the request will go no further.  As with other handlers, if `descend` is not called, then either a response needs to be sent to `this.res` or `this.next()` needs to be called.

A handler for a directory containing resources that require greater permissions, may, for example, thus block or redirect requests from those not having adequate permission.

Since `this` is shared by all handlers for a given request, values can be added or changed.  One could, for example, create a breadcrumb object in the root directory's handler and push new values into it at each level.  The common bus might also be used to maintain configuration information -- configuration that might change from one part of a site to another.

Indeterminate handlers are called without regard to HTTP method.  The handler function may, of course, include code that is conditional upon the value of `this.req.method`.

### Preloading

When a root directory, such as `/root-directory` is specified, FSRoute loads all the modules found in that directory and its subdirectories and organizes them into a tree.  If both a tree and a root directory are specified, the two will be merged to produce a single tree.

Since `require` is synchronous and because preloading reasonably should occur during server initialization, the entire preloading process is synchronous.

### Parallel file directories

Although the original intent of FSRoute was that all resources, such as code files, templates, CSS and client-side Javascript all be together in one directory, a conflict tends to arise between server-side Javascript files and those intended for the client.  There is no easy way to separate the Javascript serving requests from code meant for the client.  Since all javascript files in the directory passed to the `add_modules` method are preloaded, client-side Javascript should not be in that directory. Measures might also need to be taken to avoid serving raw template files.

The [`this.path_in(dir)`](#indir) function allows mapping URLs to files in any directory.

### <a name="virtual"></a>Virtual directories

One significant capability associated with [indeterminate](#indeterminate) handlers is the ability to easily define virtual directories.

Our `example.com` website might, for example, include, in addition to everything else, a blog.  But the content of the blog is dynamically generated with data from the database.  In a URL like `http://example.com/blog/2013/12/13` the `2013/12/13` part of the URL defines the database query.

To implement this blog, we could define a default handler for the `blog` directory in the tree like `{blog:{'*':fn()}}` or in the filesystem at `/root-dir/blog/_DEFAULT.js`.  This would be invoked for any URL starting `http://example.com/blog`.  Instead of calling `descend`, this function would perform the database lookup and produce the requested page.

A virtual directory might also be backed by a collection of static files.

`this.remainder` will contain the remainder of the URL path, that to the right of the known path.  In this blog example, then, `this.remainder` would contain `2013/12/13`.

## Release History
_(Nothing yet)_

## License
Copyright (c) 2013 Randy McLaughlin
Licensed under the MIT license.

> Written with [StackEdit](https://stackedit.io/).
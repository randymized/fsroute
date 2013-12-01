
/*
 * fsroute
 * https://github.com/randymized/fsroute
 *
 * Copyright (c) 2013 Randy McLaughlin
 * Licensed under the MIT license.
 */

'use strict';

var _= require('underscore')
var Path= require('path')
var Url= require('url')
var fs= require('fs')
var send= require('send')
var composable_middleware= require('composable-middleware')
var require_directory= require('require-directory')

var FSRouteFactory= function(root,roadmap)
{
  if (arguments.length <= 1) {
    if (_.isString(root)) {
      roadmap= {}
    }
    else {
      roadmap= root || {};
      root= null;
    }
  }
  if (roadmap === undefined) roadmap= {}

  var options= roadmap.$options || {};

  if (root) {
    // preload all the modules in this.code_root
    var code_root= options.code_root || Path.join(root,'code');
    var modules= {}
    try {
      if (fs.statSync(code_root).isDirectory()) {
        modules= require_directory(module,code_root)
      }
    }
    catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    var resource_root= options.resource_root || Path.join(root,'resources');
    var public_root= options.public_root || Path.join(root,'public');
  }

  function FSRoute(context,next,err)
  {
    this.context= context;
    this.next= next;
    this.err= err;
    this.options= _.clone(options);
    var req= context.req;
    this.method= req.method == 'HEAD'? 'GET': req.method;
    this.parsed_url= Url.parse(req.url)
    var a= this.parsed_url.pathname.split('/')
    this.trailing_slash= _.last(a) === ''
    this.right= a.filter(function (e){
      return !!e
    })
    this.left= []
    this.mapcursor= roadmap
  }

  FSRoute.prototype.insert= function(elements)
  {
    this.left.push.apply(this.left,_.flatten(arguments))
  }

  FSRoute.prototype._run= function(fn)
  {
    fn.call(this.context,this.err)
  }

  FSRoute.prototype._ran_module= function(mod,name)
  {
    var m= mod[name];
    if (m) {
      this._run(m);
    }
    return !!m;
  }

  FSRoute.prototype._ran_http_method_module= function(mod,name)
  {
    return this._ran_module(mod,name+'.'+this.method.toLowerCase())
  }

  // Run a module from the filesystem, if present, that corresponds to the URL.
  // Returns true if the module was found and run.
  FSRoute.prototype._fsrun= function()
  {
    var mod= modules
    for (var left = this.left, i = 0, len = left.length; i < len; i++) {
      var m= mod[left[i]];
      if (m) mod= m;
      else {
        if (i == len-1) {
          // leaf node:
          var name= left[i]
          if (this.trailing_slash) {
            // try x.index.js
            name+= '.index';
            if (this._ran_module(mod,name)) return true;
          }
          // try x.get.js, x.post.js, etc
          return (this._ran_http_method_module(mod,name));
        }
        return false;
      };
    }
    this._run(m);
    return true;
  }

  FSRoute.prototype.descend= function()
  {
    var current= this.right.shift()
    this.left.push(current)
    debugger
    if (typeof this.mapcursor !== "undefined" && this.mapcursor !== null) {
      var use= this.mapcursor[current]
      this.mapcursor= use || {}
      if (use) {
        if (_.isFunction(use)) {
          return this._run(use)
        }
        else if (_.isObject(use)) {
          var onmethod= use['$'+this.method]
          if (onmethod) return this._run(onmethod)
          else {
            if (this._has_dollars(use)) {
              // methods are provided for some methods but not this one
              this.next()
            }
            else {
              // the object should describe the next step down
              return this.descend()
            }
          }
        }
        else return this.next(
          new Error('Expecting either a function or an object in the map at /'+
            this.left.join('/')+current
          )
        )
      }
    }
    if (this._fsrun()) return;

    // There are no explicit handlers for this request.
    // Serve any static files that match the request.
    if (!resource_root && !public_root) return;
    var tail= Path.join.apply(resource_root,_.flatten(this.left,this.right))
    var fsroute= this;
    function try_static(root,next) {
      if (root) {
        var path= Path.join(root,tail);
        fs.stat(path,function(err,stats) {
          if (err) next();
          else if (stats.isFile()) {
            fsroute._serve_static(path)
          }
          else next();
        })
      }
    }
    try_static(resource_root,function() {
      try_static(public_root,fsroute.next)
    })
  }

  FSRoute.prototype._has_dollars= function(obj) {
    return _.first(_.keys(obj)).substr(0,1) === '$'
  }

  FSRoute.prototype._serve_static= function (path) {
    send(this.context.req,path)
    .index(false)   // todo: optionally support sending an index
    // todo: maxage option
    .on('error',function(err) {
      this.next(err)
    })
    .pipe(this.context.res)
  }

  var composable_middleware_fn= FSRoute.composable_middleware= function (next) {
    new FSRoute(this,next).descend();
  }
  FSRoute.connect_middleware= function (req,res,next) {
    composable_middleware([composable_middleware_fn])(req,res,next)
  }
  var composable_error_handler= FSRoute.composable_error_handler= function (err,next) {
    new FSRoute(this,next,err).descend();
  }
  FSRoute.connect_error_handler= function (req,res,err,next) {
    composable_middleware([composable_error_handler])(req,res,err,next)
  }
  return FSRoute;
}

module.exports = FSRouteFactory;
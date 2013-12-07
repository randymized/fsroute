
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
var fs= require('fs')
var ComposableMiddleware= require('composable-middleware')
var require_directory= require('require-directory')
var RequestHandler= require('./request-handler')

var FSRoute= function(tree)
{
  this.tree= tree || {};

  this.RequestHandler= RequestHandler.bind(this,this)
}

FSRoute.prototype.set_code_root= function(root) {
  // preload all the modules in code_root (synchronously!)
  var code_root= root;
  this.modules= {}
  try {
    if (fs.statSync(code_root).isDirectory()) {
      this.modules= require_directory(module,code_root)
    }
  }
  catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return this;
}

FSRoute.prototype.set_resource_root= function(root) {
  this.resource_root= root;
  return this;
}

FSRoute.prototype.set_code_and_resource_roots= function(root) {
  return this.set_code_root(Path.join(root,'code'))
             .set_resource_root(Path.join(root,'resources'))
}

FSRoute.prototype.createRequestHandler= function(context,next,err) {
  return new this.RequestHandler(context,next,err)
}

FSRoute.prototype.composable_middleware= function (){
  var RequestHandler= this.RequestHandler;
  return function (next) {
    new RequestHandler(this,next).descend();
  }
}

FSRoute.prototype.composable_error_handler= function (){
  var RequestHandler= this.RequestHandler;
  return function (err, next) {
    new RequestHandler(this,next,err).descend();
  }
}

FSRoute.prototype.connect_middleware= function (){
  var mw= ComposableMiddleware(this.composable_middleware())
  return function (req,res,next) {
    mw(req,res,next)
  }
}

FSRoute.prototype.connect_error_handler= function (){
  var mw= ComposableMiddleware(this.composable_error_handler())
  return function (req,res,next) {
    mw(req,res,err,next)
  }
}

module.exports = FSRoute;

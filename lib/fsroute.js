
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
var requestHandler= require('./request-handler')

var InvalidObjKey= /^\*|\/$|\.$/

function validate_tree(tree) {
  for (var key in tree) {
    var val = tree[key];
    if (_.isFunction(val)) continue;
    if (InvalidObjKey.test(key)) throw new Error('Keys starting with "*" or ending with "." or "/" are reserved for functions: '+key+' is not valid.')
    if (_.isObject(val)) validate_tree(val);
    else throw new Error('The tree may contain only objects and functions: '+key+' is neither.')
  }
}

var FSRoute= function(tree)
{
  this.tree= tree || {};

  this._module_extensions= ['js','coffee']

  // validate the tree.  It may only include functions and objects
  validate_tree(tree)
}

FSRoute.prototype.set_module_extentions= function(extensions) {
  if (_.isArray(extensions)) {
    this._module_extensions= extensions
  }
  else if (_.isString(extensions)) {
    this._module_extensions= [extensions]
  }
  else {
    throw new Error('set_module_extentions argument an array of strings or a string')
  }
  return this;
}

FSRoute.prototype.rename_module= function(name)
{
  if (/.*\.LEAF\.[^.]$/) return '$'
}

// Preload all the modules in root and its subdirectories and add them to the tree.
// The loading is done synchronously!
FSRoute.prototype.add_modules= function(root)
{
  var fsroute= this;
  function descend(dest,path) {
    var add_function= function(into,name,module) {
      var ins_name= fsroute.rename_module(name)
      if (into[name]) {
        into[name]= ComposableMiddleware(into[name],module)
      }
      else {
        into[name]= module;
      }
    }
    var names= fs.readdirSync(path)
    for (var i= names.length; --i >= 0;) {
      var name= names[i];
      var fullname= Path.join(path,name);
      var stats= fs.statSync(fullname);
      if (stats.isDirectory()) {
        var newdest= {}
        if (dest[name]) {
          if (_.isFunction(dest[name])) {
            dest[name]= {$:dest[name]}
          }
        }
        else {
          dest[name]= {}
        }
        descend(dest[name],fullname);
        if (_.isEmpty(dest[name])) delete dest[name]
      }
      if (stats.isFile()) {
        var ext= Path.extname(name)
        if (fsroute._module_extensions.indexOf(ext.slice(1)) >= 0) {
          var module= require(fullname)
          var key= name.slice(0,-ext.length)
          if (dest[key]) {
            if (_isFunction(dest[key])) {
              add_function(dest,key,module)
            }
            else {
              add_function(dest[key],'_',module)
            }
          }
          else {
            add_function(dest,key,module)
          }
        }
      }
    }
    return dest
  }
  descend(this.tree,root)

  return this;
}

FSRoute.prototype.requestHandler= function(context,next) {
  return requestHandler(this,context,next)
}

FSRoute.prototype.composable_middleware= function (){
  var fsRoute= this;
  return function (next) {
    fsRoute.requestHandler(fsRoute,this,next);
  }
}

FSRoute.prototype.connect_middleware= function (){
  var mw= ComposableMiddleware(this.composable_middleware())
  return function (req,res,next) {
    mw(req,res,next)
  }
}

module.exports = FSRoute;

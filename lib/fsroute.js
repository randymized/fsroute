
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
var request_handler= require('./request-handler')

var TrailingDot= /\.$/
var LeadingSlash= /^\//
var HasParens= /\(\)/

var FSRoute= function(tree)
{
  this.tree= tree || {};

  this._module_extensions= ['js','coffee']

  this._parse_tree()
}

// Preload all the modules in root and its subdirectories and add them to the tree.
// The loading is done synchronously!
FSRoute.prototype.add_modules= function(root)
{
  var fsroute= this;
  function descend(dest,path) {
    var add_function= function(into,name,module) {
      if (into[name]) {
        into[name]= [into[name],module]
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
        dest[name]= dest[name] || {}
        descend(dest[name],fullname);
        if (_.isEmpty(dest[name])) delete dest[name]
      }
      if (stats.isFile()) {
        var ext= Path.extname(name)
        if (fsroute._module_extensions.indexOf(ext.slice(1)) >= 0) {
          var module= require(fullname)
          var key= name.slice(0,-ext.length)
          key= key.replace(/^_INDEX/,'/').replace(/^_DEFAULT/,'*')
          if (dest[key]) {
            if (_.isFunction(dest[key])) {
              add_function(dest,key,module)
            }
            else {
              add_function(dest,key+'.',module)
            }
          }
          else {
            try {
              if (fs.statSync(Path.join(path,key)).isDirectory()) {
                add_function(dest,key+'.',module)
              }
              else {
                add_function(dest,key,module)
              }
            }
            catch (e) {
              add_function(dest,key,module)
            }
          }
        }
      }
    }
    return dest
  }
  descend(this.tree,root)

  this._parse_tree()
  return this;
}

FSRoute.prototype.set_module_extentions= function(extensions)
{
  this._module_extensions= _.flatten(arguments)
  return this;
}

FSRoute.prototype.request_handler= function(context,next) {
  return request_handler(this,context,next)
}

FSRoute.prototype.composable_middleware= function (){
  var fsRoute= this;
  return function (next) {
    fsRoute.request_handler(this,next);
  }
}

FSRoute.prototype.connect_middleware= function (){
  var cmw= ComposableMiddleware(this.composable_middleware())
  return function (req,res,next) {
    cmw(req,res,next)
  }
}

FSRoute.prototype.get_list_for= function(method,path)
{
  var list= this.determinate[path+'._'+method]
  if (!list) {
    list= this.determinate[path]
    if (!list) {
      list= this._get_indeterminate_list(path)
    }
  }
  return list;
}

FSRoute.prototype._parse_tree= function() {
  var determinate= {}, indeterminate= []
  var layer= function(obj,left) {
    if (obj['*']) {
      var fn= obj['*'];
      if (typeof fn === 'function') {
        var pathof= left+'/';
        if (HasParens.test(pathof)) {
          throw new Error('Parenthesis in indeterminate paths are not supported: '+pathof)
        }
        indeterminate.push([pathof,
          function(descend) {
            this.prefix= pathof;
            fn.call(this,descend)
          }
        ])
      }
      else throw new Error ('Function expected at '+left.join('/')+'/*')
    }
    for (var key in obj) {
      var val = obj[key];
      if (key == '*') {
        // indeterminate: already added above
        continue;
      }
      else {
        if (typeof val === 'function') {
          // determinate
          if (LeadingSlash.test(key)) {
            key= key.slice(1)
          }
          var path_to= left+'/'+key
          if (TrailingDot.test(key)) {
            determinate[path_to.slice(0,-1)]= val
          }
          else {
            determinate[path_to]= val
          }
        }
        else if (_.isObject(val)){
          layer(val,left+'/'+key)
        }
        else throw new Error ('Object or function expected at '+left.join('/')+'/'+key)
      }
    }
  }
  layer(this.tree,'',[])
  indeterminate.sort(function (a,b) {
    var d= b[0].length - a[0].length
    return d !== 0? d: a[0].localeCompare(b[0])
  }
  );
  this.indeterminate= indeterminate;
  this._chain_indeterminates();
  this.indeterminateRegex= new RegExp('(^'+_.map(indeterminate,function(e){
    return e[0].replace(/\//g,'\\/');
  }).join(')|(^')+')');
  this.indeterminateMatches= _.map(indeterminate,function(e){
    return e[1];
  });
  this.indeterminateMatches.unshift([]);
  this.determinate= determinate;
  this._add_indeterminates_to_determinates()
}

FSRoute.prototype._chain_indeterminates= function()
{
  var indeterminate= this.indeterminate;
  var lookup= _.object(indeterminate);
  for (var i= 0; i<indeterminate.length; ++i) {
    var path= indeterminate[i][0]
    if (path === '/') {
      indeterminate[i][1]= [indeterminate[i][1]]
      break;
    }
    var parts= _.compact(path.split('/'))
    var pred= [indeterminate[i][1]]
    while (typeof parts.pop() !== 'undefined') {
      var pfx= (parts.join('/')+'/');
      var action= lookup[pfx];
      if (action) {
        pred.unshift(action)
        break;
      }
    }
    indeterminate[i][1]= pred
  }
}

FSRoute.prototype._get_indeterminate_list= function(path)
{
  var m= path.match(this.indeterminateRegex);
  if (m) {
    for (var i= m.length; --i;) {
      if (m[i]) {
        return this.indeterminateMatches[i];
      }
    }
  }
}

FSRoute.prototype._add_indeterminates_to_determinates= function()
{
  var determinate= this.determinate;
  for (var path in determinate) {
    var indet= this._get_indeterminate_list(path)
    if (indet) {
      determinate[path]= _.flatten([indet,determinate[path]])
    }
    else {
      determinate[path]= [determinate[path]]
    }
  }
}

module.exports = FSRoute;

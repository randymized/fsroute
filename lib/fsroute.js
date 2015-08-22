
/*
 * fsroute
 * https://github.com/randymized/fsroute
 *
 * Copyright (c) 2013 Randy McLaughlin
 * Licensed under the MIT license.
 */

'use strict';

var _= require('lodash')
var Path= require('path')
var fs= require('fs')
var ComposableMiddleware= require('composable-middleware')
var request_handler= require('./request-handler')

var TrailingDot= /\.$/
var LeadingSlash= /^\//
var HasParens= /\(\)/
var StripVerb= /(.*)\._([A-Z])+$/

var default_handler_caller= function(handler,context,descend) {
  return handler.call(context,descend)
}

var FSRoute= function(tree)
{
  this.tree= tree || {};

  this._module_extensions= ['js','coffee']

  this._parse_tree()

  this.determinate_handler_caller= default_handler_caller
  this.indeterminate_handler_caller= default_handler_caller
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
    function add_handler(into,basename,module)
    {
      var key= basename.replace(/^_INDEX/,'/').replace(/^_DEFAULT/,'*')
      if (into[key]) {
        if (_.isFunction(into[key])) {
          add_function(into,key,module)
        }
        else {
          add_function(into,key+'.',module)
        }
      }
      else {
        try {
          if (fs.statSync(Path.join(path,basename)).isDirectory()) {
            add_function(into,key+'.',module)
          }
          else {
            add_function(into,key,module)
          }
        }
        catch (e) {
          add_function(into,key,module)
        }
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
      else if (stats.isFile()) {
        var ext= Path.extname(name)
        if (fsroute._module_extensions.indexOf(ext.slice(1)) >= 0) {
          var module= require(fullname)
          var basename= name.slice(0,-ext.length)
          var add= function(tail,verb,fn)
          {
            var addname= basename+tail
            var into= dest
            switch (verb) {
              case '':
              case 'GET':
                break
              default:
                addname= addname+'._'+verb.toUpperCase()
                break
            }
            var elems= addname.split('/')
            var inter= elems.slice(0,-1)
            for (var j = 0; j < inter.length; j++) {
              var dirname= inter[j]
              into= (into[dirname]= into[dirname] || {})
            }
            add_handler(into,elems.slice(-1)[0],fn)
          }
          switch(typeof module) {
            case 'function':
              add_handler(dest,basename,module)
              break;
            case 'object':
              var verb= '';
              var m= basename.match(StripVerb)
              if (m) {
                basename= m[1]
                verb= m[2]
              }
              for (var tail in module) {
                var sub= module[tail]
                switch(typeof sub) {
                  case 'function':
                    add(tail,verb,sub)
                    break;
                  case 'object':
                    var subverb
                    for (var subverb in sub) {
                      var fn= sub[subverb]
                      if (_.isFunction(fn)) {
                        if (subverb === '') {
                          subverb= verb
                        }
                        add(tail,subverb,fn)
                      }
                      else {
                        throw new Error('A function was expected, but a '+typeof fn+' was encountered in the object exported from '+name)
                      }
                    }
                    break;
                  default:
                    throw new Error('A '+typeof sub+' was unexpectedly encountered in the object exported from '+name)
                }
              }
              break;
            default:
              throw new Error(name+' unexpectedly exported a '+typeof module)
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
    return fsRoute.request_handler(this,next);
  }
}

FSRoute.prototype.connect_middleware= function (){
  var cmw= ComposableMiddleware(this.composable_middleware())
  return function (req,res,next) {
    return cmw(req,res,next)
  }
}

var GetOrHead= /GET|HEAD/i

FSRoute.prototype.get_list_for= function(method,path)
{
  var list;
  if (GetOrHead.test(method)) {
    list= this.determinate[path]
  }
  else {
    list= this.determinate[path+'._'+method.toUpperCase()]
  }
  if (list) {
    list.determinate= true
  }
  else {
    list= this._get_indeterminate_list(path)
  }
  return list;
}

FSRoute.prototype.set_determinate_handler_caller= function(caller)
{
  this.determinate_handler_caller= caller
  return this
}

FSRoute.prototype.set_indeterminate_handler_caller= function(caller)
{
  this.indeterminate_handler_caller= caller
  return this
}

FSRoute.prototype._parse_tree= function() {
  var determinate= {}, indeterminate= []
  var add_determinate= function(path_to,fn) {
    if (fn.length > 1) {
      var shim= function connect_signature_shim(descend) {
        fn.call(this,this.req,this.res,descend)
      }
      shim.wrapping= fn
      determinate[path_to]= shim
    }
    else determinate[path_to]= fn
    fn.path= path_to
  }
  var layer= function(obj,left) {
    if (obj['*']) {
      var fn= obj['*'];
      if (typeof fn === 'function') {
        var pathof= left+'/';
        if (HasParens.test(pathof)) {
          throw new Error('Parenthesis in indeterminate paths are not supported: '+pathof)
        }
        fn.path= pathof
        var shim= function _indeterminate_shim(descend) {
          this.remainder= this.req.url.replace(pathof,'')
          return fn.call(this,descend)
        }
        shim.wrapping= fn
        shim.indeterminate= true
        indeterminate.push([pathof,shim])
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
            add_determinate(path_to.slice(0,-1), val)
          }
          else {
            add_determinate(path_to, val)
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
      var pfx= parts.join('/')+'/';
      if (pfx.length > 1) pfx= '/'+pfx;
      var action= lookup[pfx];
      if (action) {
        pred.unshift(action)
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

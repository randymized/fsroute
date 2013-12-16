var _= require('underscore')
var Path= require('path')
var Url= require('url')
var fs= require('fs')
var send= require('send')

function requestHandler(fsRoute,context,next)
{
  var req= context.req;
  var method= req.method == 'HEAD'? 'GET': req.method.toUpperCase();
  var a= Url.parse(req.url).pathname.split('/')
  var trailing_slash= _.last(a) === ''
  var right= a.filter(function (e){
    return !!e
  })
  if (trailing_slash) right.push('/');
  var left= []
  context.__proto__.next= next
  context.__proto__.path_in= function(root) {
    return Path.join.apply(Path,_.flatten([root,left]))
  }

  var next_level= function(cursor) {
    if (typeof cursor !== "undefined" && cursor !== null) {
      next()
    }
    else {
      var bymethod= function(name,leaf,descend) {
        var maybe= function(ext,cb) {
          var run= function(fn) {
            context.left= left
            context.right= right
            context.treecursor= cursor
            fn.call(context,descend)
          }
          var fn= cursor[name+ext]
          if (_.isFunction(fn)) {
            run(fn,descend)
          }
          else if (leaf && _.isObject(fn)) {
            fn= cursor[name+'.'+ext]
            if (_.isFunction(fn)) {
              run(fn,descend)
            }
            else cb()
          }
          else cb()
        }
        maybe('_'+method,function () {
          maybe('',decend)
        })
      }
      bymethod('*', false, function(){
        var current= right.shift()
        left.push(current)
        if (right.length == 0) {
          // reached end of URL
          if (trailing_slash) {
            bymethod(current+'/', false, next)
          }
          else {
            bymethod(current, true, next)
          }
        }
        else {
          // more URL to go
          next_level(cursor[current])
        }
      })
    }
  }
  next_level(fsRoute.tree)
}

module.exports= requestHandler
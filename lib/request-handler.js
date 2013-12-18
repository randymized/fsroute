var _= require('underscore')
var Path= require('path')
var Url= require('url')
var fs= require('fs')
var send= require('send')

function requestHandler(fsRoute,context,next)
{
  var req= context.req;
  context.next= next;
  var list= fsRoute.get_list_for(
    req.method == 'HEAD'? 'GET': req.method.toUpperCase(),
    Url.parse(req.url).pathname
  )

  if (list) {
    var i= 0
    var descend= function() {
      if (i == list.length) return next()
      list[i++].call(context,descend)
    }
    descend()
  }
  else next()
}

module.exports= requestHandler
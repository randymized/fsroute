var _= require('underscore')
var Path= require('path')
var Url= require('url')
var fs= require('fs')
var send= require('send')

function requestHandler(fsRoute,context,next)
{
  var req= context.req;
  context.next= next;
  context.parsed_url= Url.parse(req.url)
  var list= fsRoute.get_list_for(
    req.method == 'HEAD'? 'GET': req.method.toUpperCase(),
    context.parsed_url.pathname
  )

  if (list) {
    var i= 0
    var descend= function(err) {
      if (err) return next(err)
      if (i == list.length) {
        if (context.on_no_determinate && list.slice(-1)[0].name === '_indeterminate_shim') {
          return context.on_no_determinate.call(context,next)
        }
        else return next()
      }
      list[i++].call(context,descend)
    }
    descend()
  }
  else next()
}

module.exports= requestHandler
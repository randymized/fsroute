var _= require('lodash')
var Path= require('path')
var Url= require('url')
var fs= require('fs')

function requestHandler(fsRoute,context,next)
{
  var req= context.req;
  context.next= next;
  context.fsRoute= fsRoute
  context.parsed_url= Url.parse(req.url)
  context.path_in= function(dir) {
    return Path.join(dir,context.parsed_url.pathname)
  }
  var list= fsRoute.get_list_for(req.method, context.parsed_url.pathname)
  function try_adding_slash_to_directory()
  {
    if (fsRoute.get_list_for(req.method, context.parsed_url.pathname+'/'))
    {
      context.res.writeHead(302, {
        'Location': context.parsed_url.pathname+'/'
      });
      return context.res.end()
    }
    else return next()

  }
  if (list) {
    var i= 0
    var descend= function(err) {
      if (err) return next(err)
      if (i == list.length) {
        if (context.on_no_determinate && list.slice(-1)[0].name === '_indeterminate_shim') {
          return context.on_no_determinate.call(context,next)
        }
        else if (context.add_slash_to_directory) {
          return try_adding_slash_to_directory()
        }
        else return next()
      }
      return fsRoute.handler_caller(list[i++],context,descend)
    }
    return descend()
  }
  else {
    if (context.add_slash_to_directory) {
      return try_adding_slash_to_directory()
    }
    else return next()
  }
}

module.exports= requestHandler
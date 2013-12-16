
'use strict';

var should= require('should')
var assert= require('assert')
var path= require('path')
var http= require('http')
var request = require('request');
var connect= require('connect')
var async= require('async')
var _= require('underscore')
var ComposableMiddleware= require('composable-middleware')

var port= 8889
var host = 'localhost'

var FSRoute = require( '..' );

// The sample tree from README.md
var ReadmeTree= {
  '*':function(descend) {
    this.res.send('in x')
  },
  'foo.':function(descend) {
    this.res.send('in x')
  },
  'foo._DELETE':function(descend) {
    this.res.send('in x')
  },
  'foo/':function(descend) {
    this.res.send('in x')
  },
  'foo/._DELETE':function(descend) {
    this.res.send('in x')
  },
  foo:{
    '*':function(descend) {
      this.res.send('in x')
    },
    '._DELETE':function(descend) {
      this.res.send('in x')
    },
    'bar._GET': function(descend) {
      this.res.send('in GET foo.bar')
    },
    'bar._POST': function(descend) {
      this.res.send('in POST foo.bar')
    },
    bar: function(descend) {
      this.res.send('in foo.bar')
    },
    'bar.json._GET': function(descend) {
      this.res.send('in x')
    },
    'bar.json': function(descend) {
      this.res.send('in x')
    },
  }
}

function noop ()
{
}

function serve(middleware,requests,done) {
  var server= http.createServer(function(req,res){
    res.send= function(status,body) {
      if (1 == arguments.length) {
        body= status;
        status= 200;
      }
      this.statusCode= status;
      this.end(body);
    }
    middleware(req,res,function(err) {
      if (err) {
        res.statusCode= 500
        res.end(err.toString())
      }
      else {
        res.statusCode= 404
        res.end()
      }
    });
  })
  async.series(requests,function (){
    server.close(function() {
      done();
    });
  })
  server.listen(port)
}

function fullURL(url)
{
  return 'http://localhost:'+port+url;
}

function get(url,expected,done) {
  request.get(fullURL(url), function (error, response, body) {
    response.statusCode.should.equal(200);
    body.should.equal(expected);
    done();
  })
}

function get404(url,done) {
  request.get(fullURL(url), function (error, response, body) {
    response.statusCode.should.equal(404);
    done();
  })
}

function new_router(tree) {
  return new FSRoute(tree).add_modules(path.join(__dirname,'../testsite/code'))
}

function simple_get_test(url,expected,tree,done)
{
  if (arguments.length == 3) {
    done= tree;
    tree= undefined;
  }
  var fsRouter= new_router(tree)
  serve(
    fsRouter.connect_middleware(),
    [
      function(cb) {
        get(url,expected,cb)
      },
    ],
    done
  );
}

function readme_get_test(url,expected,done)
{
  debugger
  simple_get_test(url,expected,ReadmeTree,done)
}

function get_404_test(url,tree,done)
{
  if (arguments.length == 2) {
    done= tree;
    tree= undefined;
  }
  var fsRouter= new_router(tree)
  serve(
    fsRouter.connect_middleware(),
    [
      function(cb) {
        get404(url,cb)
      },
    ],
    done
  );
}

describe( 'FSRoute', function() {
  describe( 'FSRoute()', function() {
    it( 'should be a function', function() {
      assert(_.isFunction(FSRoute))
    } );
    it( 'should return a RequestHandler constructor function', function() {
      var fsRouter= new_router()
      assert(_.isFunction(fsRouter.RequestHandler))
      fsRouter.should.have.property('connect_middleware')
      fsRouter.should.have.property('composable_middleware')
    } );
    it( "should start out with fsroute.left being the url's path (less leading slash)", function() {
      var fsRouter= new_router()
      var inst= new fsRouter.RequestHandler({req:{method:'GET',url:'/animals/vertibrates/mammals'}},noop)
      var right= inst.right
      assert(_.isArray(right))
      right.join('/').should.equal('animals/vertibrates/mammals')
    } );
    it( 'should start out with fsroute.right being an empty array', function() {
      var fsRouter= new_router()
      var inst= new fsRouter.RequestHandler({req:{method:'GET',url:'/animals/vertibrates/mammals'}},noop)
      var left= inst.left
      assert(_.isArray(left))
      left.length.should.equal(0)
    } );
    it( 'should simply 404 if no handler for the request', function(done) {
      serve(
        new_router().connect_middleware(),
        [
          function(cb) {
            get404('/zzyzx',cb)
          },
        ],
        done
      );
    } );
    it( 'should find code at the top level of the code branch', function(done) {
      var tree= {
        hello: function (next) {
          this.res.end('world')
        }
      }
      simple_get_test('/hello','world',tree,done);
    } );
    it( 'should support two simulaneous routers', function(done) {
      var fsRouter= new_router({
        foo: function (next) {
                this.res.end('bar')
              }
      })
      var fsRouter2= new_router({
        a: function (next) {
                this.res.end('b')
              }
      })

      serve(
        new ComposableMiddleware(
          function(next) {
            next()
          },
          fsRouter.composable_middleware(),
          fsRouter2.composable_middleware()
        ),
        [
          function(cb) {
            get('/foo','bar',cb)
          },
          function(cb) {
            get('/a','b',cb)
          },
        ],
        done
      );
    } );
    it( 'should support two simulaneous routers, but not confuse them', function(done) {
      var fsRouter= new_router({
        foo: function (next) {
                this.res.end('bar')
              }
      })
      var fsRouter2= new_router({
        a: function (next) {
                this.res.end('b')
              }
      })

      serve(
        new ComposableMiddleware(
          function(next) {
            next()
          },
          fsRouter2.composable_middleware()
        ),
        [
          function(cb) {
            get404('/foo',cb)
          },
          function(cb) {
            get('/a','b',cb)
          },
        ],
        done
      );
    } );
    it( 'should support two simulaneous routers, but not confuse them. part II', function(done) {
      var fsRouter= new_router({
        foo: function (next) {
                this.res.end('bar')
              }
      })
      var fsRouter2= new_router({
        a: function (next) {
                this.res.end('b')
              }
      })

      serve(
        new ComposableMiddleware(
          function(next) {
            next()
          },
          fsRouter.composable_middleware()
        ),
        [
          function(cb) {
            get('/foo','bar',cb)
          },
          function(cb) {
            get404('/a',cb)
          },
        ],
        done
      );
    } );
    it( 'should serve /foo/bar from the README sample', function(done) {
      readme_get_test('/foo/bar','in GET foo.bar',done);
    } );
  } );
} );

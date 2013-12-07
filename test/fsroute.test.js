
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

function an_instance(url_path) {
  var fsroute= new_router()
  return fsroute({url:'//localhost:3000/'+url_path})
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

function new_router(roadmap) {
  return new FSRoute(path.join(__dirname,'../testsite'),roadmap)
}

function simple_get_test(url,expected,roadmap,done)
{
  if (arguments.length == 3) {
    done= roadmap;
    roadmap= undefined;
  }
  var fsRouter= new_router(roadmap)
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

function get_404_test(url,roadmap,done)
{
  if (arguments.length == 2) {
    done= roadmap;
    roadmap= undefined;
  }
  var fsRouter= new_router(roadmap)
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
      fsRouter.should.have.property('connect_error_handler')
      fsRouter.should.have.property('composable_middleware')
      fsRouter.should.have.property('composable_error_handler')
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
    it( 'should simply 404 if no handler in code and the path does not exist', function(done) {
      serve(
        new_router().connect_middleware(),
        [
          function(cb) {
            get404('/fungi',cb)
          },
        ],
        done
      );
    } );
    it( 'should 404 if no handler in code and the resource is not found in the filesystem', function(done) {
      serve(
        new_router().connect_middleware(),
        [
          function(cb) {
            get404('/fungi',cb)
          },
        ],
        done
      );
    } );
    it( 'should find code at the top level of the code branch', function(done) {
      var roadmap= {
        hello: function (next) {
          this.res.end('world')
        }
      }
      simple_get_test('/hello','world',roadmap,done);
    } );
    it( 'should serve a file from the resource branch and not try to interpret is as javascript', function(done) {
      simple_get_test('/protista.js','includes algae and diatoms',done);
    } );
    it( 'should run method-specific code at the top level of the code branch', function(done) {
      var roadmap= {
        hello: {
          $GET: function (next) {
                  this.res.end('world')
                }
        }
      }
      simple_get_test('/hello','world',roadmap,done);
    } );
    it( 'should not run code that is specific to some other method', function(done) {
      var roadmap= {
        hello: {
          $POST: function (next) {
                  this.res.end('world')
                }
        }
      }
      get_404_test('/hello',roadmap,done);
    } );
    it( 'should automatically descend to the second level of a roadmap', function(done) {
      var roadmap= {
        foo: {
          bar: function (next) {
                  this.res.end('bas')
                }
        }
      }
      simple_get_test('/foo/bar','bas',roadmap,done);
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

  } );
} );

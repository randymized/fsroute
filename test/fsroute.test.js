
'use strict';

var should= require('should')
var assert= require('assert')
var path= require('path')
var http= require('http')
var Url= require('url')
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
    var res= this.res
    var stack= this.stack= ['/']
    var svsend= res.send
    res.send= function(msg) {
      svsend.call(res,stack.join(':')+':'+msg)
    }
    descend()
  },
  'foo.':function(descend) {
    this.res.send('in foo.')
  },
  'foo._DELETE':function(descend) {
    this.res.send('in DELETE foo.')
  },
  foo:{
    '*':function(descend) {
      this.stack.push('foo')
      descend()
    },
    '/':function(descend) {
      this.res.send('in foo/')
    },
    '/._DELETE':function(descend) {
      this.res.send('in DELETE foo/')
    },
    'bar._GET': function(descend) {
      this.res.send('in GET foo/bar')
    },
    'bar._POST': function(descend) {
      this.res.send('in POST foo/bar')
    },
    bar: function(descend) {
      this.res.send('in foo/bar')
    },
    'bar.json._GET': function(descend) {
      this.res.send('in GET foo/bar.json')
    },
    'bar.json': function(descend) {
      this.res.send('in GET foo/bar')
    },
  }
}

function noop ()
{
}

function define_router(tree,rootdir)
{
  if (arguments.length == 1 && _.isString(tree)) {
    rootdir= tree;
    tree= {};
  }
  var fsr= new FSRoute(tree)
  if (rootdir) {
    fsr.add_modules(path.resolve(__dirname,rootdir))
  }
  return fsr;
}

function pseudo_server(router,method,url,on_send,on_404)
{
  router.request_handler({
    req: {
      method: method,
      url: url
    },
    res: {
      send: on_send
    }
  }, function () {
    if (on_404) on_404()
    else throw new Error('404')
  })
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

function simple_get_test(url,expected,tree,done)
{
  if (arguments.length == 3) {
    done= tree;
    tree= undefined;
  }
  var fsRouter= define_router(tree)
  serve(
    ComposableMiddleware(
      fsRouter.composable_middleware(),
      function(next) {
        if (this.stack) this.res.send('no determinate handler')
        else next()
      }
    ),
    [
      function(cb) {
        get(url,expected,cb)
      },
    ],
    done
  );
}

function simple_post_test(url,expected,tree,done)
{
  if (arguments.length == 3) {
    done= tree;
    tree= undefined;
  }
  var fsRouter= define_router(tree)
  serve(
    ComposableMiddleware(
      fsRouter.composable_middleware(),
      function(next) {
        if (this.stack) this.res.send('no determinate handler')
        else next()
      }
    ),
    [
      function(done) {
        var options= Url.parse(fullURL(url))
        options.method= 'POST'
        var req= http.request(options, function (res) {
          res.statusCode.should.equal(200);
          var s= ''
          res.on('error',function(e) {
            throw e;
          })
          res.on('data',function(chunk) {
            s+= chunk
          })
          res.on('end', function(){
            s.should.equal(expected);
            done();
          })
        })
        req.end()
      },
    ],
    done
  );
}

function simple_delete_test(url,expected,tree,done)
{
  if (arguments.length == 3) {
    done= tree;
    tree= undefined;
  }
  var fsRouter= define_router(tree)
  serve(
    ComposableMiddleware(
      fsRouter.composable_middleware()
    ),
    [
      function(done) {
        var options= Url.parse(fullURL(url))
        options.method= 'DELETE'
        var req= http.request(options, function (res) {
          res.statusCode.should.equal(200);
          var s= ''
          res.on('error',function(e) {
            throw e;
          })
          res.on('data',function(chunk) {
            s+= chunk
          })
          res.on('end', function(){
            s.should.equal(expected);
            done();
          })
        })
        req.end()
      },
    ],
    done
  );
}

function fs_get_test(url,expected,tree,done)
{
  if (arguments.length == 3) {
    done= tree;
    tree= undefined;
  }
  var fsRouter= define_router('../testsites/foobar')
  serve(
    ComposableMiddleware(
      fsRouter.composable_middleware(),
      function(next) {
        if (this.stack) this.res.send('no determinate handler')
        else next()
      }
    ),
    [
      function(cb) {
        get(url,expected,cb)
      },
    ],
    done
  );
}

function fs_post_test(url,expected,tree,done)
{
  if (arguments.length == 3) {
    done= tree;
    tree= undefined;
  }
  var fsRouter= define_router('../testsites/foobar')
  serve(
    ComposableMiddleware(
      fsRouter.composable_middleware(),
      function(next) {
        if (this.stack) this.res.send('no determinate handler')
        else next()
      }
    ),
    [
      function(done) {
        var options= Url.parse(fullURL(url))
        options.method= 'POST'
        var req= http.request(options, function (res) {
          res.statusCode.should.equal(200);
          var s= ''
          res.on('error',function(e) {
            throw e;
          })
          res.on('data',function(chunk) {
            s+= chunk
          })
          res.on('end', function(){
            s.should.equal(expected);
            done();
          })
        })
        req.end()
      },
    ],
    done
  );
}

function fs_delete_test(url,expected,tree,done)
{
  if (arguments.length == 3) {
    done= tree;
    tree= undefined;
  }
  var fsRouter= define_router('../testsites/foobar')
  serve(
    ComposableMiddleware(
      fsRouter.composable_middleware()
    ),
    [
      function(done) {
        var options= Url.parse(fullURL(url))
        options.method= 'DELETE'
        var req= http.request(options, function (res) {
          res.statusCode.should.equal(200);
          var s= ''
          res.on('error',function(e) {
            throw e;
          })
          res.on('data',function(chunk) {
            s+= chunk
          })
          res.on('end', function(){
            s.should.equal(expected);
            done();
          })
        })
        req.end()
      },
    ],
    done
  );
}

function readme_get_test(url,expected,done)
{
  simple_get_test(url,expected,ReadmeTree,done)
}

function readme_post_test(url,expected,done)
{
  simple_post_test(url,expected,ReadmeTree,done)
}

function readme_delete_test(url,expected,done)
{
  simple_delete_test(url,expected,ReadmeTree,done)
}

function readme_fs_get_test(url,expected,done)
{
  fs_get_test(url,expected,ReadmeTree,done)
}

function readme_fs_post_test(url,expected,done)
{
  fs_post_test(url,expected,ReadmeTree,done)
}

function readme_fs_delete_test(url,expected,done)
{
  fs_delete_test(url,expected,ReadmeTree,done)
}

describe( 'FSRoute', function() {
  describe( 'FSRoute()', function() {
    it( 'should be a function', function() {
      assert(_.isFunction(FSRoute))
    } );
    it( 'should return a RequestHandler constructor function', function() {
      var fsRouter= define_router()
      assert(_.isFunction(fsRouter.request_handler))
      fsRouter.should.have.property('connect_middleware')
      fsRouter.should.have.property('composable_middleware')
    } );
    it( 'should simply 404 if no handler for the request', function(done) {
      serve(
        define_router().connect_middleware(),
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
      var fsRouter= define_router({
        foo: function (next) {
                this.res.end('bar')
              }
      })
      var fsRouter2= define_router({
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
    it( 'should support two simulaneous routers and not confuse them', function(done) {
      var fsRouter= define_router({
        foo: function (next) {
                this.res.end('bar')
              }
      })
      var fsRouter2= define_router({
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
    it( 'should support two simulaneous routers and not confuse them. part II', function(done) {
      var fsRouter= define_router({
        foo: function (next) {
                this.res.end('bar')
              }
      })
      var fsRouter2= define_router({
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
    it( 'should serve /foo/bar from the README filesystem sample', function(done) {
      readme_get_test('/foo/bar','/:foo:in GET foo/bar',done);
    } );
    it( 'should serve POST /foo/bar from the README sample', function(done) {
      readme_post_test('/foo/bar','/:foo:in POST foo/bar',done);
    } );
    it( 'should serve /foo/bar.json from the README sample', function(done) {
      readme_get_test('/foo/bar.json','/:foo:in GET foo/bar.json',done);
    } );
    it( 'should serve /foo (foo as function, not object) from the README sample', function(done) {
      readme_get_test('/foo','/:in foo.',done);
    } );
    it( 'should serve DELETE /foo (foo as function, not object) from the README sample', function(done) {
      readme_delete_test('/foo','/:in DELETE foo.',done);
    } );
    it( 'should serve /foo/ from the README sample', function(done) {
      readme_get_test('/foo/','/:foo:in foo/',done);
    } );
    it( 'should serve DELETE /foo/ from the README sample', function(done) {
      readme_delete_test('/foo/','/:foo:in DELETE foo/',done);
    } );
    it( 'should find that foo/baz is not defined, but still triggers the indeterminate / and /foo handlers', function(done) {
      readme_get_test('/foo/baz','/:foo:no determinate handler',done);
    } );

    it( 'should serve /foo/bar from the README filesystem sample', function(done) {
      readme_fs_get_test('/foo/bar','/:fsfoo:in (fs) GET foo/bar',done);
    } );
    it( 'should serve POST /foo/bar from the README filesystem sample', function(done) {
      readme_fs_post_test('/foo/bar','/:fsfoo:in (fs) POST foo/bar',done);
    } );
    it( 'should serve /foo/bar.json from the README filesystem sample', function(done) {
      readme_fs_get_test('/foo/bar.json','/:fsfoo:in (fs) GET foo/bar.json',done);
    } );
    it( 'should serve /foo (foo as function, not object) from the README filesystem sample', function(done) {
      readme_fs_get_test('/foo','/:in (fs) foo.',done);
    } );
    it( 'should serve DELETE /foo (foo as function, not object) from the README filesystem sample', function(done) {
      readme_fs_delete_test('/foo','/:in (fs) DELETE foo.',done);
    } );
    it( 'should serve /foo/ from the README filesystem sample', function(done) {
      readme_fs_get_test('/foo/','/:fsfoo:in (fs) foo/',done);
    } );
    it( 'should serve DELETE /foo/ from the README filesystem sample', function(done) {
      readme_fs_delete_test('/foo/','/:fsfoo:in (fs) DELETE foo/',done);
    } );

    it( 'should merge tree and filesystem functions', function(done) {
      var fsr= define_router(
        {
          foo: {bah: function(descend) {
            this.res.send('foobah!')
          }}
        },
        '../testsites/foobar'
      )
      pseudo_server(fsr,'GET','/foo/bah',
        function(msg) {
          msg.should.equal('/:fsfoo:foobah!')
          done()
        }
      )
    } );

    it( 'should support virtual directories', function(done) {
      var fsr= define_router(
        {
          foo: {'*': function virt(descend) {
            this.res.send(JSON.stringify([virt.path,this.remainder]))
          }}
        }
      )
      pseudo_server(fsr,'GET','/foo/abc/def',
        function(msg) {
          msg.should.equal('["/foo/","abc/def"]')
          done()
        }
      )
    } );

    it( 'should attach path to a request handler', function(done) {
      var fsr= define_router(
        {foo:
          {
            bar:function fn(){
              this.res.send(fn.path)
            }
          }
        }
      )
      pseudo_server(fsr,'GET','/foo/bar',
        function(msg) {
          msg.should.equal('/foo/bar')
          done()
        }
      )
    } );

  } );
} );

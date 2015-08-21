'use strict';

var should= require('should')
var assert= require('assert')
var FSRoute = require( '..' );

describe( 'FSRoute', function() {
  it( 'should return a RequestHandler constructor function', function(done) {
    var fsr= new FSRoute({
      foo: function (descend) {
        this.msg= 'hello'
        descend()
      }
    })
    fsr.set_handler_caller(function(handler,context,descend) {
      handler.call(context,function (){
        context.msg.should.equal('hello')
        done()
      })
    })
    var req= {
      req: {
        url:'/foo',
        method:'get'
      }
    }
    fsr.request_handler(req,function (){
      throw new "should not end up here"
    })
  } );
} );

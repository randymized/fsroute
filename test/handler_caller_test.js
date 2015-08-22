'use strict';

var should= require('should')
var assert= require('assert')
var FSRoute = require( '..' )
var fs= require('fs')

describe( 'FSRoute', function() {
  it( 'should allow hooking the call of determinate and indeterminate handlers', function(done) {
    var fsr= new FSRoute({
      '*': function () {
        // return a 'thenable'
        return {
          then: function(cb) {
            fs.readFile(__dirname+'/a.txt',function(err,content) {
              cb(new String(content))
            })
          }
        }
      },
      foo: function () {
        // return a 'thenable'
        return {
          then: function(cb) {
            fs.readFile(__dirname+'/a.txt',function(err,content) {
              cb('hello '+content)
            })
          }
        }
      },
    })
    fsr.set_determinate_handler_caller(function(handler,context,descend) {
      handler.call(context).then(function (val) {
        val.should.equal('hello a!')
        context.hooked_indeterminate.should.equal('a!')
        done()
      })
    })
    .set_indeterminate_handler_caller(function(handler,context,descend) {
      handler.call(context).then(function (val) {
        context.hooked_indeterminate= val
        descend()
      })
    })
    var req= {
      req: {
        url:'/foo',
        method:'get'
      }
    }
    fsr.request_handler(req,function (){
      throw new Error("should not end up here")
    })
  } );
} );

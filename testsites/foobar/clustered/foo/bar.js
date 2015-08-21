module.exports= {
  '/*': function(descend) {
    this.stack.push('foobar')
    descend()
  },
  '/bas': function(descend) {
    this.res.send('in (fs) /foo/bar/bas')
  },
  '': {
    GET: function() {
      this.res.send('in (fs) foo/bar')
    },
    POST: function() {
      this.res.send('in (fs) POST foo/bar')
    }
  },
  '.json': function(descend) {
    this.res.send('in (fs) foo/bar.json')
  }
}
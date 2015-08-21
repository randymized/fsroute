module.exports= {
  '': {
    GET: function(descend) {
      this.res.send('in (foo.js object) foo.')
    },
    DELETE: function(descend) {
      this.res.send('in (foo.js object) DELETE foo.')
    }
  },
  'p._POST': function() {
      this.res.send('in (foo.js object) POST foop')
  },
  '/': {
    GET: function(descend) {
      this.res.send('in (foo.js object) foo/')
    },
    DELETE: function(descend) {
      this.res.send('in (foo.js object) DELETE foo/')
    }
  }
}
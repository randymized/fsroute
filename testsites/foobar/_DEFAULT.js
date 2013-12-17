module.exports= function(descend) {
  var res= this.res
  var stack= this.stack= ['/']
  var svsend= res.send
  res.send= function(msg) {
    svsend.call(res,stack.join(':')+':'+msg)
  }
  descend()
}
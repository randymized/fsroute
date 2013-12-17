module.exports= function(descend) {
  this.stack.push('fsfoo')
  descend()
}
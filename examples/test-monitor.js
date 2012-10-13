var monitor = require("../").monitor;
var p = new monitor.process(1000, function(stats) {
  console.log(stats);
});
var n = new monitor.net(1000, function(stats) {
  console.log(stats);
});
require("./WebSocket");
var GoxClient = require("./mtgox").GoxClient;
var channels = {
  depth: "24e67e0d-1cad-4cc0-9e7a-f8523ef460fe",
  ticker: "d5f06780-30a8-4a48-a2f8-7ed181b4a13f",
  trade: "dbf1dee9-4f2e-4a08-8cb7-748919a71b21"
};
var gox = new GoxClient({lowlevel: true});
gox.connect(function() {
  var log = {};
  gox.on('message', function(m) {
    var channel;
    if(!(m.channel in log)) {
      log[m.channel] = [];
    }
    log[m.channel].push(m);
  });
  var repl = require("repl").start({
    prompt: "mt.gox> ",
    input: process.stdin,
    output: process.stdout
  });
  repl.context.gox = gox;
  repl.context.channels = channels;
  repl.context.log = log;
});

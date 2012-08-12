var Parser = require("../").websock.Parser;
var createMessage = require("../").websock.createMessage;

var p = new Parser();
var b = createMessage(require("fs").readFileSync("./test.json"));
p.decode = false;
p.unmask = false;
p.onMessage = function(msg) {
  console.log(JSON.parse(msg.payload.toString("utf8")));
};
p.execute(b, 0, b.length);

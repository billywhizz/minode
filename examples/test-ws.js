require("../");
var sock = new WebSocket("ws://ws.blockchain.info/inv");
function heading(m) {
  console.log("\x1B[32m" + m + "\x1B[39m");
}
sock.onopen = function() {
  heading("onopen");
  sock.send(JSON.stringify({
    op: "unconfirmed_sub"
  }));
};
sock.onclose = function() {
  heading("onclose");
};
sock.onerror = function(err) {
  heading("onerror:");
  console.error(err);
};
sock.onmessage = function(event) {
  heading("onmessage:");
  try {
    console.log(JSON.stringify(JSON.parse(event.data), null, "  ").replace(/\"/g, ""));
  }
  catch(err) {
    console.error(err);
  }
};

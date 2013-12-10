require("../");
var sock = new WebSocket("wss://websocket.mtgox.com/mtgox?Currency=USD");
function heading(m) {
  console.log("\x1B[32m" + m + "\x1B[39m");
}
sock.onopen = function() {
  heading("onopen");
  sock.send(JSON.stringify({
    op: "unsubscribe",
    channel: "24e67e0d-1cad-4cc0-9e7a-f8523ef460fe"
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

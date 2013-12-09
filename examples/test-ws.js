require("./WebSocket");
var sock = new WebSocket("wss://websocket.mtgox.com/mtgox?Currency=USD");
var messages = 0;
sock.onopen = function() {
  console.log("onopen");
  sock.send(JSON.stringify({
    op: "unsubscribe",
    channel: "24e67e0d-1cad-4cc0-9e7a-f8523ef460fe"
  }));
  setInterval(function() {
    console.log(messages);
  }, 1000);
};
sock.onclose = function() {
  console.log("onclose");
};
sock.onerror = function(err) {
  console.log("onerror");
  console.error(err);
};
sock.onmessage = function(event) {
  var m;
  try {
    m = JSON.parse(event.data);
    messages++;
    console.log(m);
  }
  catch(err) {
    console.error(err);
  }
};

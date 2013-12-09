var minsock = require("../lib/minsock");
function connect(host, port) {
  var client = new minsock.TCP();
  var headers = [
    "GET /mtgox?Currency=USD HTTP/1.1",
    "Host: websocket.mtgox.com",
    "Origin: http://websocket.mtgox.com",
    "Connection: Upgrade",
    "Upgrade: WebSocket",
    "Sec-WebSocket-Key: CaH1mGi/Q69BP2o0LXvEoQ==",
    "Sec-WebSocket-Version: 13"
  ];
  var b = new Buffer(headers.join("\r\n") + "\r\n\r\n");
  var r = client.connect(host, port);
  if(!r) {
    var err = new Error("client.connect");
    err.errno = global.errno;
    console.log(err);
    client.close();
    return;
  }
  r.oncomplete = function(status, peer, req) {
    var err;
    if(status !== 0) {
      err = new Error("peer.connect");
      err.errno = global.errno;
      console.log(err);
      peer.close();
      return;
    }
    minsock.Create(peer);
    peer.onerror = function(err) {
      console.log("peer.error:");
      console.log(err);
      peer.kill();
    };
    peer.onclose = function() {
      console.log("peer.close");
      client.close();
    };
    peer.onread = function(buffer, start, len) {
      if(!buffer) {
        peer.kill();
        return;
      }
      console.log("peer.read:");
      console.log(buffer.asciiSlice(start, start + len));
    };
    peer.onSecure = function(err) {
      console.log("peer.secure:");
      if(err) console.log(err);
      if(!peer.verified) {
        console.error("not verified!!!");
      }
      peer.send(b, function(status, handle, req) {
        console.log("peer.send:" + status);
      });
      peer.readStart();
    };
    peer.setSecure({
      server: false
    });
    peer.readStart();
  }
  return client;
}
var c = connect(process.argv[2], process.argv[3]);
if(!c) {
  process.exit(1);
}

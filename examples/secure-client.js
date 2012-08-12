var minsock = require("../lib/minsock");
function connect(host, port) {
  var client = new minsock.TCP();
  var b = new Buffer(10);
  b.writeAscii("0123456789");
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
      console.log(buffer.toString("ascii", start, start + len));
    };
    peer.onSecure = function(err) {
      console.log("peer.secure:");
      if(err) console.log(err);
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
var c = connect(host, port);
if(!c) {
  process.exit(1);
}

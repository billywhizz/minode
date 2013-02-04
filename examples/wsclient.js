var createClient = require("../").websock.createClient;
var createMessage = require("../").websock.createMessage;
var Client = require("../").http.Client;
var c = new Client();
var handshake = new Buffer("GET / HTTP/1.1\r\nHost: shuttle.owner.net\r\nConnection: Upgrade\r\nUpgrade: WebSocket\r\nSec-WebSocket-Key: CaH1mGi/Q69BP2o0LXvEoQ==\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: echo-protocol\r\n\r\n");  
var payload = createMessage(new Buffer("hello"));

var b = new Buffer(4096);
var stats = {
  msgin: 0,
  msgout: 0,
  txin: 0,
  txout: 0
};
c.onConnection = function(peer) {
  peer.onResponse = function(info) {
    peer.onWSError = function(err) {
      console.log("websocket.error:");
      console.error(err);
    };
    peer.onWSClose = function() {
      console.log("websocket.close");
    };
    peer.onWSStart = function() {
      var r;
      peer.parser.decode = false;
      peer.parser.unmask = false;
      peer.onWSMessage = function(msg) {
        var r;
        stats.msgin++;
        stats.txin += msg.length;
        r = peer.sendMessage(msg.payload, null, function(status, handle, req) {
          if(status !== 0) {
            console.error("write error!!!");
            return;
          }
          stats.msgout++;
          stats.txout += msg.payload.length;
        });
        if(!r) console.error("write error!!!!");
      };
      r = peer.sendMessage(b, null, function(status, handle, req) {
        if(status !== 0) {
          console.error("write error!!!");
          return
        }
        stats.msgout++;
        stats.txout += b.length;
      });
      if(!r) console.error("write error!!!!");
      return true;
    };
    createClient(peer, info);
  };
  peer.onError = function(err) {
    console.log("socket.error:");
    console.error(err);
  };
  peer.onClose = function() {
    console.log("socket.close");
  }
  peer.send(handshake, function(status, handle, req) {
    if(status !== 0) {
      if(status !== 0) {
        peer.kill();
        return;
      }
    }
  });
  peer.readStart();
}
c.connect("10.11.12.145", 8000);
setInterval(function() {
  console.log(stats);
  stats.msgin = stats.msgout = stats.txin = stats.txout = 0;
}, 1000);
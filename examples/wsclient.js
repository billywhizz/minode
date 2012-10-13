var createClient = require("../").websock.createClient;
var createMessage = require("../").websock.createMessage;
var Client = require("../").http.Client;
var c = new Client();
var handshake = new Buffer("GET / HTTP/1.1\r\nHost: shuttle.owner.net\r\nConnection: Upgrade\r\nUpgrade: WebSocket\r\nSec-WebSocket-Key: CaH1mGi/Q69BP2o0LXvEoQ==\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Protocol: echo-protocol\r\n\r\n");  
var payload = createMessage(new Buffer("hello"));

c.onConnection = function(peer) {
  peer.onResponse = function(info) {
    createClient(peer, info);
    peer.onWSError = function(err) {
      console.log("websocket.error:");
      console.error(err);
    };
    peer.onWSClose = function() {
      console.log("websocket.close");
    };
    peer.onWSStart = function() {
      console.log("websocket.start");
      peer.onWSMessage = function(msg) {
        console.log("websocket.message:");
        console.log(msg);
      };
    };
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
}
c.connect("10.11.12.8", 8080);
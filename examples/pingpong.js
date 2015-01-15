var SocketServer = require("../").Server;
console.pretty = function(m) {
  console.log("\x1B[32m" + m.toString() + "\x1B[39m");
}
var config = {
  httpd: {
    host: "0.0.0.0",
    port: 8000
  },
  service: {
    onError: function(err) {
      console.pretty("service.error");
      console.error(err);
    },
    onListen: function() {
      console.pretty("service.listening");
    },
    onClose: function() {
      console.pretty("service.closed");
    },
    onStart: function(peer, req) {
      console.pretty("service.start (" + req.protocol + "): " + peer.id);
      peer.onJSMessage = function(msg) {
        console.pretty("service.message");
        console.dir(msg);
        peer.sendJS({
          pong: Date.now()
        }, function(err) {
          if(err) {
            console.pretty("service.send.error");
            return console.error(err);
          }
        });
      }
      peer.onServiceError = function(err) {
        console.pretty("service.serviceError");
        console.error(err);
      }
      return true;
    },
    onEnd: function(peer) {
      console.pretty("service.start (" + peer.req.protocol + "): " + peer.id);
    }
  }
};
var tasks = new SocketServer(config).listen();
var sock = new WebSocket("ws://127.0.0.1:8000/", "pingpong");
sock.onopen = function() {
  console.pretty("client.open");
  sock.send(JSON.stringify({
    ping: Date.now()
  }));
};
sock.onclose = function() {
  console.pretty("client.close");
};
sock.onerror = function(err) {
  console.pretty("client.error");
  console.error(err);
};
sock.onmessage = function(event) {
  console.pretty("client.message");
  console.dir(JSON.parse(event.data));
  setTimeout(function() {
    sock.send(JSON.stringify({
      ping: Date.now()
    }));
  }, 1000);
};
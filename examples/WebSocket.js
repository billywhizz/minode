var minsock = require("../");
var createClient = minsock.websock.createClient;
var createMessage = minsock.websock.createMessage;
var Client = minsock.http.Client;
var urllib = require("url");
var dns = require("dns");

WebSocket = function(url, protocol) {
  var _websocket = this;
  this.masking = true;
  var c = new Client();
  url = urllib.parse(url);
  if(url.protocol === "ws:") {
    url.port = url.port || 80;
  }
  else if(url.protocol === "wss:") {
    url.port = url.port || 443;
  }
  else {
    throw new Error("bad protocol");
  }
  var hs = "GET " + url.path + " HTTP/1.1\r\nHost: " + url.host + "\r\nConnection: Upgrade\r\nUpgrade: WebSocket\r\nSec-WebSocket-Key: CaH1mGi/Q69BP2o0LXvEoQ==\r\nOrigin: http://" + url.host + "\r\nSec-WebSocket-Version: 13\r\n";
  if(protocol) {
    hs += "Sec-WebSocket-Protocol: " + protocol + "\r\n";
  }
  hs += "\r\n";
  var handshake = new Buffer(hs);
  this.onopen = this.onclose = this.onmessage = this.onerror = function() {};
  var _closed = true;
  c.onConnection = function(peer) {
    _closed = false;
    peer.onResponse = function(info) {
      peer.onWSError = function(err) {
        _websocket.onerror(err);
      };
      peer.onWSClose = function() {
        if(!_closed) _websocket.onclose();
        _closed = true;
      };
      peer.onWSStart = function() {
        var r;
        peer.parser.decode = true;
        peer.parser.unmask = true;
        peer.masking = _websocket.masking;
        _websocket.onopen();
        peer.onWSMessage = function(msg) {
          _websocket.onmessage({
            data: msg.payload
          });
        };
        return true;
      };
      createClient(peer, info);
    };
    peer.onError = function(err) {
      _websocket.onerror(err);
    };
    peer.onClose = function() {
      if(!_closed) _websocket.onclose();
      _closed = true;
    }
    _websocket.send = function(data) {
      var r;
      r = peer.sendMessage(data, "utf8", function(status, handle, req) {
        if(status !== 0) {
          _websocket.onerror(new Error("Write Error: " + status));
          peer.kill();
        }
      });
      if(!r) {
        _websocket.onerror(new Error("Write Error: " + status));
        peer.kill();
      }
      return r;
    }
    _websocket.close = function() {
      peer.kill();
    }
    if(url.protocol === "ws:") {
      peer.send(handshake, function(status, handle, req) {
        if(status !== 0) {
          _websocket.onerror(new Error("Write Failed: " + status));
          peer.kill();
          return;
        }
      });
    }
    else if(url.protocol === "wss:") {
      peer.onSecure = function(err) {
        if(err) {
          _websocket.onerror(err);
          peer.kill();
          return;
        }
        if(!peer.verified) {
          _websocket.onerror("verified: " + peer.verified);
          peer.kill();
          return;
        }
        peer.send(handshake, function(status, handle, req) {
          if(status !== 0) {
            _websocket.onerror(new Error("Write Failed: " + status));
            peer.kill();
            return;
          }
        });
        peer.readStart();
      };
      peer.setSecure({
        server: false
      });
    }
    peer.readStart();
  }
  dns.lookup(url.hostname, function(err, address, family) {
    if(err) {
      return _websocket.onerror(err);
    }
    c.connect(address, url.port);  
  });
}
if(global) {
  global.WebSocket = WebSocket;
}
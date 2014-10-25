/*jslint bitwise: true, devel: true, node: true, sloppy: false, vars: true, white: true, nomen: true, plusplus: true, maxerr: 1000, maxlen: 80, indent: 2 */
"use strict";
var minode = require("../");
var HTTPServer = minode.http.Server;
var createServer = minode.websock.createServer;
var parseURL = minode.utils.parseURL;
function SocketServer(config) {
  var _server = this;
  var fc;
  var gid = 0;
  var httpd;
  var peers = {};
  _server.subscribers = [];
  function httpHandler(peer) {
    peer.id = peer.fd || (gid++);
    function tidyup() {
      delete peers[peer.id];
      _server.subscribers = Object.keys(peers).map(function(k) {return peers[k]});
    }
    peer.onRequest = function(request) {
      console.log(request);
      if(request.upgrade) {
        request.url = parseURL(request.url, true);
        if(!config.service.onStart) {
          peer.send(httpd.responses.forbidden, function(status, handle, req) {
            if(status !== 0) {
              var err = new Error("write");
              err.errno = global.errno;
              peer.kill();
              return;
            }
            if(!peer.info.shouldKeepAlive) {
              peer.kill();
            }
          });
          return true;
        }
        peer.onWSError = function(err) {
          console.error("client.ws.error");
          console.error(err);
          console.trace();
        };
        peer.onWSClose = function() {
          peer.closed = true;
          tidyup();
          if(config.service && config.service.onEnd) {
            config.service.onEnd(peer);
          }
        };
        peer.onWSStart = function() {
          peer.onWSMessage = function(msg) {
            if(config.service && peer.onJSMessage) {
              try {
                peer.onJSMessage(JSON.parse(msg.payload));
              }
              catch(ex) {
                peer.onWSError(ex);
              }
            }
          };
          peer.parser.decode = true;
          peer.parser.unmask = true;
          peer.sendJS = function(msg, cb) {
            try {
              var b = new Buffer(JSON.stringify(msg));
              peer.sendMessage(b, "utf8", function(status, handle, req) {
                if(status === 0) {
                  return cb(null, msg);
                }
                cb(new Error("Bad Write Status: " + status));
              });
            }
            catch(ex) {
              cb(ex);
            }
          };
          peers[peer.id] = peer;
          _server.subscribers = Object.keys(peers).map(function(k) {return peers[k]});
          return config.service.onStart(peer, request);
        };
        createServer(peer, request);
        return true;
      }
      return false;
    };
    peer.onClose = function() {
      tidyup();
      console.info("peer.onClose");
    };
    peer.onError = function(err) {
      console.error(err);
      console.trace("peer.onError");
    };
  }
  httpd = new HTTPServer(config.httpd);
  httpd.onConnection = httpHandler;
  httpd.onError = function(err) {
    if(config.service.onError) {
      config.service.onError(err);
    }
  };
  _server.listen = function(handle) {
    var rc = httpd.listen(4096, handle);
    if(rc !== 0 && config.service.onError) {
      config.service.onError("Listen failed");
      return _server;
    }
    if(config.service.onListen) {
      config.service.onListen();
    }
    return _server;
  };
  _server.stop = function() {
    httpd.close();
    if(config.service.onClose) {
      config.service.onClose();
    }
  };
}
exports.Server = SocketServer;
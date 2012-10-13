var HTTPServer = require("../").http.Server;
var createServer = require("../").websock.createServer;
var parseURL = require("../").utils.parseURL;
var FileCache = require("../").filecache.FileCache;
var config = {
  httpd: {
    host: "0.0.0.0",
    port: 8000
  },
  filecache: {
    home: "/media/storage",
    chunksize: 4096
  }
};
var fc = new FileCache(config.filecache);
var rc;
var httpd;
function httpHandler(peer) {
  peer.onRequest = function(request) {
    var path;
    request.url = parseURL(request.url, true);
    var pn = request.url.pathname;
    path = pn.split("/");
    path.shift();
    request.service = path.shift();
    if(request.upgrade) {
      if(request.service === "storm") {
        createServer(peer, request);
        peer.onWSClose = function() {
          console.trace("ws.peer.close");
        };
        peer.onWSError = function(err) {
          console.trace("ws.peer.error");
          console.error(err);
        };
        peer.onWSStart = function() {
          peer.onWSMessage = function(message) {

          };
          return true;
        };
        return true;
      }
      return false;
    }
    if(pn[pn.length-1] === "/") {
      fc.generateIndex(request, function(err, html) {
        if(err) {
          console.error(err);
          return;
        }
        fc.sendFile(peer, request, function(err, file) {
          if(err) {
            peer.onError(err);
          }
        });
      });
    }
    else {
      fc.sendFile(peer, request, function(err, file) {
        if(err) {
          peer.onError(err);
        }
      });
    }
    return true;
  };
  peer.onClose = function() {
    console.info("peer.onClose");
  };
  peer.onError = function(err) {
    console.error(err);
    console.trace("peer.onError");
  };
}
httpd = new HTTPServer(config.httpd);
config.httpd.onConnection = httpHandler;
httpd.onError = function(err) {
  console.error(err);
  console.trace("httpd.onError");
};
rc = httpd.listen(4096);
if(rc !== 0) {
  process.exit(1);
}
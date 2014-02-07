var HTTPServer = require("../").http.Server;
var createServer = require("../").websock.createServer;
var parseURL = require("../").utils.parseURL;
var FileCache = require("../").filecache.FileCache;
var config = {
  httpd: {
    host: "0.0.0.0",
    port: 80,
    secure: false,
    cert: "../../../cert.pem",
    key: "../../../key.pem"
  },
  filecache: {
    home: process.argv[2],
    maxfilesize: 20 * 1024 * 1024,
    chunksize: 4096
  }
};
var fc = new FileCache(config.filecache);
var rc;
var httpd;
function httpHandler(peer) {
  peer.onRequest = function(request) {
    request.url = parseURL(request.url, true);
    fc.sendFile(peer, request, function(err, file) {
      if(err) {
        peer.onError(err);
      }
    });
    return true;
  };
  peer.onClose = function() {
    console.info("peer.onClose");
  };
  peer.onError = function(err) {
    console.error(err);
    console.trace("peer.onError");
  };
  if(config.httpd.secure) {
    peer.cert = require("fs").readFileSync(config.httpd.cert).toString();
    peer.key = require("fs").readFileSync(config.httpd.key).toString();
    peer.onSecure = function(err) {
      peer.readStart();
    };
    peer.setSecure();
  }
}
httpd = new HTTPServer(config.httpd);
httpd.onConnection = httpHandler;
httpd.onError = function(err) {
  console.error(err);
  console.trace("httpd.onError");
};
rc = httpd.listen(4096);
if(rc !== 0) {
  process.exit(1);
}

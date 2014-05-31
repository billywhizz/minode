var HTTPServer = require("../").http.Server;
var config = {
  httpd: {
    host: "0.0.0.0",
    port: 8080
  }
};
var rc;
var httpd;
var b = new Buffer("HTTP/1.1 200 OK\r\nDate: Wed, 16 Oct 2013 23:19:43 GMT\r\nConnection: keep-alive\r\nContent-Length: 0\r\n\r\n");
function httpHandler(peer) {
  console.log("connect");
  function sendHandler(status, handle, req) {
    if(status !== 0) {
      console.log("send: " + status);
      peer.kill();
    }
  }
  function errorHandler(err) {
    console.error(err);
    console.trace("peer.onError");
  }
  function requestHandler(request) {
    var r = peer.send(b, sendHandler);
    if(!r) console.error("write failed");
    return true;
  }
  peer.onRequest = requestHandler;
  peer.onError = errorHandler;
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

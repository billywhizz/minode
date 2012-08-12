var minsock = require("../lib/minsock");
var pprint = require("../lib/utils").pprint;
var sock = new minsock.TCP();
var config = {
  host: "0.0.0.0",
  port: 9012,
  secure: false,
  cert: "./cert.pem",
  key: "./key.pem"
};
sock.bind(config.host, config.port);
sock.onconnection = function(peer) {
  console.log("peer.onconnection");
  function startConnection() {
    peer.readStart();
  }
  minsock.Create(peer);
  peer.setNoDelay(true);
  peer.onread = function(buf, start, len) {
    if(!buf) {
      peer.kill();
      return;
    }
    console.log("peer.onread: " + len);
    pprint(buf, start, len, process.stdout);
  };
  peer.onclose = function() {
    console.log("peer.onclose");
  };
  peer.onerror = function(err) {
    console.log("peer.onerror");
    console.error(err);
  };
  if(config.secure) {
    peer.cert = require("fs").readFileSync(config.cert).toString();
    peer.key = require("fs").readFileSync(config.key).toString();
    peer.onSecure = function(err) {
      startConnection();
    };
    peer.setSecure();
  }
  else {
    startConnection();
  }
}
sock.listen(128);
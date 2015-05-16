var minsock = require("../lib/minsock");
var pprint = require("../lib/utils").pprint;
var sock = new minsock.TCP();
var config = {
  host: "0.0.0.0",
  port: 443,
  secure: true,
  cert: "./cert.pem",
  key: "./key.pem"
};
sock.bind(config.host, config.port);
sock.onconnection = function(err, peer) {
  if(err) throw(err);
  console.log("peer.onconnection");
  minsock.Create(peer);
  peer.setNoDelay(true);
  peer.onread = function(len, buf) {
    if(!buf) {
      peer.kill();
      return;
    }
    console.log("peer.onread: " + len);
    pprint(buf, 0, len, process.stdout);
    peer.send(buf, function(status, handle, req) {
      console.log("peer.send:" + status);
    });
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
      console.log("secure");
      peer.readStart();
    };
    peer.setSecure({server: true});
    return;
  }
  peer.readStart();
}
sock.listen(128);
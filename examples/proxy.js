var minsock = require("../lib/minsock");
var pprint = require("../lib/utils").pprint;
var sock = new minsock.TCP();
var proxyPort = parseInt(process.argv[2] || "27017");
var config = {
  host: "0.0.0.0",
  port: proxyPort,
  remotehost: "10.11.12.145",
  remoteport: proxyPort,
  secure: false,
  cert: "./cert.pem",
  key: "./key.pem",
  ca: "./owner.net.pem"
};
sock.bind(config.host, config.port);
sock.onconnection = function(peer) {
  console.log("peer.onconnection");
  function startConnection() {
    client = new minsock.TCP();
    var r = client.connect(config.remotehost, config.remoteport);
    r.oncomplete = function(status, backend, req) {
      console.log("backend.onconnection");
      peer.backend = backend;
      minsock.Create(backend);
      backend.setNoDelay(true);
      backend.onerror = function(err) {
        console.error(err);
        console.trace("backend.onerror");
      };
      backend.onclose = function() {
        console.log("backend.onclose");
        if(!peer.closed) peer.kill();
      };
      backend.onread = function(buf, start, len) {
        if(!buf) {
          backend.kill();
          return;
        }
        console.log("backend.onread: " + len);
        //pprint(buf, start, len, process.stdout);
        if(peer.closed) return;
        peer.send(buf.slice(start, start + len), function(status, handle, req) {
          if(status !== 0) {
            peer.kill();
            return;
          }
          //console.log("peer.send: " + len + ":" + status);
        });
      };
      backend.readStart();
      if(peer.buffers && peer.buffers.length > 0) {
        if(backend.closed) return;
        backend.send(peer.buffers, function(status, handle, req) {
          if(status !== 0) {
            backend.kill();
            return;
          }
        });
        peer.buffers = null;
      }
      peer.readStart();
    };
  }
  minsock.Create(peer);
  peer.setNoDelay(true);
  if(config.secure) {
    peer.onSecure = function(err) {
      //TODO: error handling - callback to user and allow them to check?
      // default should be non-permissive
      if(err) console.error(err);
      //console.log(peer.context);
      //console.log(peer.ssl.verifyError());
      startConnection();
    };
  }
  else {
    startConnection();
  }
  peer.onread = function(buf, start, len) {
    if(!buf) {
      peer.kill();
      return;
    }
    console.log("peer.onread: " + len);
    //pprint(buf, start, len, process.stdout);
    var b = new Buffer(len);
    buf.copy(b, 0, start, start + len);
    if(peer.backend && !peer.backend.closed) {
      peer.backend.send(b, function(status, handle, req) {
        if(status !== 0) {
          peer.backend.kill();
          return;
        }
        //console.log("backend.send: " + len + ":" + status);
      });
    }
    else {
      if(!peer.buffers) {
        peer.buffers = [b];
      }
      else {
        peer.buffers.push(b);
      }
    }
  };
  peer.onclose = function() {
    console.log("peer.onclose");
    if(peer.backend && !peer.backend.closed) peer.backend.kill();
  };
  peer.onerror = function(err) {
    console.error(err);
    console.trace("peer.onerror");
  };
  if(config.secure) {
    peer.cert = require("fs").readFileSync(config.cert).toString();
    peer.key = require("fs").readFileSync(config.key).toString();
    if(config.ca) peer.ca = require("fs").readFileSync(config.ca).toString();
    if(config.ciphers) peer.ciphers = config.ciphers;
    peer.setSecure();
  }
  peer.readStart();
}
sock.listen(128);

"use strict";
/*jslint devel: true, node: true, sloppy: false, vars: true, white: true, nomen: true, plusplus: true, maxerr: 1000, maxlen: 80, indent: 2 */

var TCP = process.binding("tcp_wrap").TCP;
var Pipe = process.binding("pipe_wrap").Pipe;
var coalesce = require("./utils").coalesce;
var crypto;

function setupSocket(peer) {
  function shutdownHandler(status, handle) {
    if(status !== 0) {
      if(peer.onerror) {
        var err = new Error("shutdown");
        err.errno = global.errno;
        //TODO; do we really need to raise an error if we are closing anyway?
        if(err.errno !== "ENOTCONN") {
          peer.onerror(err);
        }
      }
    }
    handle.close();
  }
  function kill() {
    if(!peer.closed) {
      if(peer.secure) {
        peer.cycle();
        peer.ssl.close();
        peer.ssl.onread = function() {};
      }
      peer.readStop();
      peer.onread = function() {};
      var r = peer.shutdown();
      r.oncomplete = shutdownHandler;
      peer.closed = true;
      if(peer.onclose) {
        peer.onclose();
      }
    }
  }
  function send(buff, cb) {
    if(peer.closed) {
      return false;
    }
    if(buff.constructor.name === "Array") {
      buff = coalesce(buff);
    }
    var wr = peer.writeBuffer(buff);
    if (!wr) {
      if(peer.onerror) {
        var err = new Error("write");
        err.errno = global.errno;
        peer.onerror(err);
      }
      peer.kill();
      return false;
    }
    wr.oncomplete = cb;
    return true;
  }
  function setSecure(options) {
    //TODO: return code so we know if it fails or not
    //TODO: trycatch around this in case node not compiled with ssl
    if(!crypto) {
      crypto = process.binding("crypto");
    }
    options = options || {};
    if(!options.hasOwnProperty("server")) {
      options.server = true;
    }
    var isServer = options.server;
    //TODO: cache credentials
    function sendHandler(status, handle, req) {
      //TODO: figure out how to track/match callbacks
      // can we attach the callback to the request in some way?
    }
    peer.onSecure = peer.onSecure || function() {};
    if(!peer.context) {
      peer.context = new crypto.SecureContext();
      peer.context.init();
      peer.context.addRootCerts();
      if(peer.ca) {
        peer.context.addCACert(peer.ca);
      }
      peer.ciphers = peer.ciphers || "RC4-SHA:AES128-SHA:AES256-SHA";
      peer.context.setCiphers(peer.ciphers);
      if(isServer) {
        peer.context.setKey(peer.key);
        peer.context.setCert(peer.cert);
      }
    }
    if(!options.buffers) {
      options.buffers = {
        secure: new Buffer(64*1024),
        clear: new Buffer(64*1024)
      };
    }
    var ssl = new crypto.Connection(peer.context,isServer,false,false);
    peer.ssl = ssl;
    var sbuf = options.buffers.secure;
    var cbuf = options.buffers.clear;
    peer.cycle = function() {
      var rr, r, err;
      do {
        r = ssl.clearOut(cbuf, 0, cbuf.length);
        if(r > 0) {
          peer._onread(cbuf, 0, r);
        }
      } while (r > 0);
      do {
        r = ssl.encOut(sbuf, 0, sbuf.length);
        if(r > 0) {
          rr = peer._send(sbuf.slice(0, r), sendHandler);
        }
      } while (r > 0);
      if(ssl.isInitFinished() && !peer.secure) {
        peer.secure = true;
        err = ssl.verifyError();
        peer.verified = err?false:true;
        peer.readStop();
        peer.onSecure(err);
      }
      if(peer.closed && peer.ssl.receivedShutdown) {
        peer.ssl.receivedShutdown = false;
        peer.ssl.shutdown();
        peer.cycle();
        peer.ssl.close();
        peer.secure = false;
        peer.kill();
      }
    };
    peer._send = peer.send;
    peer.send = function(buff, cb) {
      //TODO: allow sending array of buffers over secure connection
      if(peer.closed) {
        return false;
      }
      if(buff.constructor.name === "Array") {
        buff = coalesce(buff);
      }
      var r = ssl.clearIn(buff, 0, buff.length);
      // Attach cb to r so it can be called later??
      //TODO check return
      cb(0, peer);
      peer.cycle();
      return true;
    };
    peer._onread = peer.onread;
    ssl.onread = peer._onread;
    ssl.onhandshakestart = function() {
      console.log("handshake start");
    };
    ssl.onhandshakedone = function() {
      console.log("handshake done");
    };
    peer.onread = function(buffer, start, len) {
      var r;
      if(!buffer) {
        peer._onread(buffer, start, len);
        return;
      }
      r = ssl.encIn(buffer, start, len);
      peer.cycle();
      //TODO check return
    };
    ssl.start();
    peer.cycle();
  }
  peer.secure = false;
  peer.closed = false;
  peer.kill = kill;
  peer.send = send;
  peer.setSecure = setSecure;
}
exports.Create = setupSocket;
exports.TCP = TCP;
exports.Pipe = Pipe;
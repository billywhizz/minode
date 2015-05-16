"use strict";
/*jslint devel: true, node: true, sloppy: false, vars: true, white: true, nomen: true, plusplus: true, maxerr: 1000, maxlen: 80, indent: 2 */

var TCP = process.binding("tcp_wrap").TCP;
var Pipe = process.binding("pipe_wrap").Pipe;
var WriteWrap = process.binding('stream_wrap').WriteWrap;
var coalesce = require("./utils").coalesce;
var crypto;
var tls_wrap;

function setupSocket(peer) { 
  function kill() {
    if(!peer.closed) {
      if(peer.secure && peer.ssl) {
        peer.ssl.onread = function() {};
      }
      peer.readStop();
      peer.onread = function() {};
      peer.close();
      peer.closed = true;
      if(peer.onclose) {
        peer.onclose();
      }
      return;
    }
  }
  function send(buff, cb) {
    if(peer.closed) {
      return false;
    }
    if(buff.constructor.name === "Array") {
      buff = coalesce(buff);
    }
    var req = new WriteWrap();
    req.oncomplete = cb;
    req.async = false;
    req.buffer = buff;
    var err = peer.writeBuffer(req, buff);    
    if (err) {
      if(peer.onerror) peer.onerror(err);
      peer.kill();
      return false;
    }
    return true;
  }
  function setSecure(options) {
    if(!crypto) {
      crypto = process.binding("crypto");
    }
    if(!tls_wrap) {
      tls_wrap = process.binding('tls_wrap');
    }
    options = options || {};
    if(!options.hasOwnProperty("server")) {
      options.server = true;
    }
    var isServer = options.server;
    function sendHandler(status, handle, req) {

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
    var ssl = peer.ssl = tls_wrap.wrap(peer, peer.context, isServer);
    peer._onread = peer.onread;
    ssl.onread = peer._onread;
    ssl.onhandshakestart = function() {
    };
    ssl.onhandshakedone = function() {
      peer.secure = true;
      var err = ssl.verifyError();
      peer.verified = err?false:true;
      peer.readStop();
      peer.onSecure(err);
    };
    ssl.onclienthello = function() {
      ssl.endParser();
    };
    ssl.onnewsession = function() {
      console.log("session");
    };
    ssl.enableSessionCallbacks();
    peer.onread = function(len, buffer) {
      var r;
      if(!buffer) {
        peer._onread(buffer, 0, len);
        return;
      }
      ssl.receive(buffer);
    };
    ssl.onerror = function(err) {
      console.error(err);
      peer.onerror(err);
      return peer.kill();
    };
    peer.readStart();
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

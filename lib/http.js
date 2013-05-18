"use strict";
/*jslint devel: true, node: true, sloppy: false, vars: true, white: true, nomen: true, plusplus: true, maxerr: 1000, maxlen: 80, indent: 2 */

var minsock = require("./minsock");
var HTTPParser = process.binding("http_parser").HTTPParser;
var addHeaders = require("./utils").addHeaders;
var FreeList = require("./utils").FreeList;

var ClientPool = new FreeList("ClientPool", 1024, function() {
  var parser = new HTTPParser(HTTPParser.RESPONSE);
  parser.onHeadersComplete = function(info) {
    var peer = this.peer;
    var headers = {};
    addHeaders(headers, info.headers);
    info.headers = headers;
    peer.info = info;
    if(peer.onHeaders) {
      var r = peer.onHeaders(peer.info);
      if(r) {
        return;
      }
    }
  };
  parser.onBody = function(buffer, start, len) {
    var peer = this.peer;
    if(peer.onBody) {
      peer.onBody(buffer, start, len);
    }
  };
  parser.onMessageComplete = function() {
    var peer = this.peer;
    if(peer.onResponse) {
      var r = peer.onResponse(peer.info);
      if(r) {
        return;
      }
    }
  };
  return parser;
});

var ServerPool = new FreeList("ServerPool", 1024, function() {
  var parser = new HTTPParser(HTTPParser.REQUEST);
  parser.onHeadersComplete = function(info) {
    var peer = this.peer;
    var headers = {};
    addHeaders(headers, info.headers);
    info.headers = headers;
    peer.info = info;
    if(peer.onHeaders) {
      var r = peer.onHeaders(peer.info);
      if(r) {
        return;
      }
    }
  };
  parser.onBody = function(buffer, start, len) {
    var peer = this.peer;
    if(peer.onBody) {
      peer.onBody(buffer, start, len);
    }
  };
  parser.onMessageComplete = function() {
    var peer = this.peer;
    if(peer.onRequest) {
      var r = peer.onRequest(peer.info);
      if(r) {
        return;
      }
    }
    var resp = peer.info.shouldKeepAlive?peer.server.responses.keepalive:peer.server.responses.close;
    peer.send(resp, function(status, handle, req) {
      if(status !== 0) {
        var err = new Error("write");
        err.errno = global.errno;
        parser.logger.error(err);
        peer.kill();
        return;
      }
      if(!peer.info.shouldKeepAlive) {
        peer.kill();
      }
    });
  };
  return parser;
});

function initLogging(logger) {
  ["log", "error", "info", "trace", "warn"].forEach(function(method) {
    if(!logger.hasOwnProperty(method)) {
      logger[method] = console[method];
    }
  });
}
  
function HTTPServer(options) {
  if (!(this instanceof HTTPServer)) {
    return new HTTPServer();
  }
  var _httpd = this;
  var _stats_timer; // timer variable for monitoring stats
  var logger = options.logger || {};
  var then = new Date().getTime();
  var statcb;
  _httpd.onConnection = options.onConnection;
  options.statsInterval = options.statsInterval || 1000;
  options.host = options.host || "127.0.0.1";
  options.port = options.port || 80;
  options.type = options.type || "tcp";
  options.hostname = options.hostname || require("os").hostname();
  _httpd.secure = options.secure;
  var crossdomain, b;
  if(options.flashpolicy) {
    crossdomain = "<?xml version=\"1.0\"?><!DOCTYPE cross-domain-policy SYSTEM \"http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd\"><cross-domain-policy>";
    options.flashpolicy.rules.forEach(function(policy) {
      crossdomain += "<allow-access-from domain=\"" + policy.domain + "\" to-ports=\"" + policy.ports + "\" ";
      if(policy.secure) {
        crossdomain += "secure=\"" + policy.secure + "\"";
      }
      crossdomain += "/>";
    });
    crossdomain += "</cross-domain-policy>";
    b = new Buffer(crossdomain.length);
    b.asciiWrite(crossdomain);
    crossdomain = b;
  }
  var policyreq = "<policy-file-request/>";

  var stats = {
    conn: 0,
    send: 0,
    recv: 0,
    errors: 0,
    uptime: 0,
    time: Date.now()
  };

  var responses = {
    keepalive: "HTTP/1.1 404 Not Found\r\nServer: " + options.hostname + 
      "\r\nContent-Type: text/plain\r\nContent-Length: 0\r\n" + 
      "Connection: Keep-Alive\r\n\r\n",
    close: "HTTP/1.1 404 Not Found\r\nServer: " + options.hostname + 
      "\r\nContent-Type: text/plain\r\nContent-Length: 0\r\n" + 
      "Connection: Close\r\n\r\n"
  };
  
  function initResponses() {
    var key, val;
    for(key in responses) {
      if(responses.hasOwnProperty(key)) {
        val = responses[key];
        responses[key] = new Buffer(val.length);
        responses[key].asciiWrite(val);
      }
    }
  }

  function statHandler() {
    var now = new Date().getTime();
    stats.uptime += (now-then);
    stats.time = now;
    if(statcb) {
      statcb(stats);
    }
    then = now;
  }

  function onStats(cb, interval) {
    if(_stats_timer) {
      _stats_timer.close();
      return;
    }
    statcb = cb;
    _stats_timer = setInterval(statHandler, interval || options.statsInterval);
    if(interval) {
      options.statsInterval = interval;
    }
    return _stats_timer;
  }

  function onConnection(peer) {
    if(!peer) {
      var err = new Error("accept");
      err.errno = global.errno;
      if(_httpd.onError) {
        _httpd.onError(err);
      }
      return;
    }
    stats.conn++;
    minsock.Create(peer);
    peer.policycheck = false;
    peer.server = _httpd;
    var parser = ServerPool.alloc();
    parser.reinitialize(HTTPParser.REQUEST);
    parser.logger = logger;
    parser.peer = peer;
    peer.onread = function(buf, start, len) {
      var err, r;
      if(!buf) {
        if(parser) {
          try {
            parser.finish();
          }
          catch(ex) {}
        }
        peer.kill();
        return;
      }
      if(options.flashpolicy && !peer.policycheck) {
        peer.policycheck = true;
        if(buf.asciiSlice(start, start + policyreq.length).toString() === policyreq) {
          peer.send(crossdomain, function(status, handle, req) {
            if(status != 0) {
              var err = new Error("write");
              err.errno = errno;
              peer.onError(err);
            }
            peer.kill();
          });
          return;
        }
      }
      stats.recv += len;
      r = parser.execute(buf, start, len);
      if(r < 0) {
        err = new Error("parse");
        if(peer.onError) {
          peer.onError(err);
        }
        peer.kill();
        return;
      }
    };
    peer.onerror = function(err) {
      if(peer.onError) {
        peer.onError(err);
      }
    };
    peer.onclose = function() {
      if(parser) {
        //parser.finish();
        ServerPool.free(parser);
        parser = null;
      }
      stats.conn--;
      if(peer.onClose) {
        peer.onClose();
      }
    };
    peer.free = function() {
      if(parser) {
        //parser.finish();
        parser.peer = null;
        ServerPool.free(parser);
        parser = null;
      }
/*
      peer.onread = function(buf) {
        if(!buf) {
          var err = new Error("EOF");
          err.errno = global.errno;
          if(peer.onError) {
            peer.onError(err);
          }
          peer.kill();
          return;
        }
      };
*/
    };
    if(_httpd.onConnection) {
      _httpd.onConnection(peer);
    }
    peer.readStart();
  }
  
  this.listen = function(backlog, sock) {
    backlog = backlog || 128;
    var r, err;
    if(!sock) {
      if(options.type === "tcp") {
        sock = new minsock.TCP();
        r = sock.bind(options.host, options.port);
      }
      else {
        sock = new minsock.Pipe();
        r = sock.bind(options.port);
      }
      if(r < 0) {
        err = new Error("sock.bind");
        err.errno = global.errno;
        if(_httpd.onError) {
          _httpd.onError(err);
        }
        return r;
      }
    }
    sock.onconnection = onConnection;
    r = sock.listen(backlog);
    if(r < 0) {
      err = new Error("sock.listen");
      err.errno = global.errno;
      if(_httpd.onError) {
        _httpd.onError(err);
      }
      return r;
    }
    _httpd.sock = sock;
    return 0;
  };

  initResponses();
  initLogging(logger);

  this.close = function() {
    if(_httpd.sock) return _httpd.sock.close();
  };
  _httpd.onStats = onStats;
  _httpd.responses = responses;
  _httpd.options = options;
  _httpd.stats = stats;
  _httpd.parsers = ServerPool;
}

function HTTPClient(options) {
  if (!(this instanceof HTTPClient)) {
    return new HTTPClient();
  }
  options = options || {};
  options.type = options.type || "tcp";
  var logger = options.logger || console;
  var _client = this;
  var client = null;
  _client.connect = function(host, port) {
    //TODO: check if already connected
    var r;
    if(options.type === "tcp") {
      client = new minsock.TCP();
      r = client.connect(host, port);
    }
    else {
      client = new minsock.Pipe();
      r = client.connect(port);
    }
    if(!r) {
      var err = new Error("client.connect");
      err.errno = global.errno;
      if(_client.onError) _client.onError(err);
      client.close();
      return;
    }
    r.oncomplete = function(status, peer, req) {
      //logger.log("peer.connect: " + status);
      var err;
      if(status !== 0) {
        err = new Error("client.connect");
        err.errno = global.errno;
        if(_client.onError) _client.onError(err);
        // peer.kill() fails on RST with "TypeError: Object #<TCP> has no method 'kill'"
        //peer.kill();
        return;
      }
      minsock.Create(peer);
      var parser = ClientPool.alloc();
      peer.parser = parser;
      peer.parser.peer = peer;
      peer.onerror = function(err) {
        if(_client.onError) _client.onError(err);
        peer.kill();
      };
      peer.onclose = function() {
        client.close();
        if(_client.onClose) {
          _client.onClose();
        }
      };
      peer.onread = function(buffer, start, len) {
        if(!buffer) {
          peer.kill();
          return;
        }
        peer.parser.execute(buffer.slice(start, start + len), 0, len);
      };
      peer.free = function() {
        if(parser) {
          parser.peer = null;
          ClientPool.free(parser);
          parser = null;
        }
      };
      peer.readStart();
      if(_client.onConnection) {
        _client.onConnection(peer);
      }
    };
    return r;
  };
  initLogging(logger);
}

exports.Server = HTTPServer;
exports.Client = HTTPClient;
exports.Parser = HTTPParser;

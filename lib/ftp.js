"use strict";
/*jslint devel: true, node: true, sloppy: false, vars: true, white: true, nomen: true, plusplus: true, maxerr: 1000, maxlen: 80, indent: 2 */

var minsock = require("./minsock");
var coalesce = require("./utils").coalesce;
/*
TODO:
- optional callback for each command received and sent for tracing
- trace mode
- server shutdown
- LIST, RETR
- break functions out of onConnection so they do not get created on each 
  connection
- Signal/UncaughtException handling
- setgid, setuid
- remove from tty session
*/

function FTPParser(_command) {
  if (!(this instanceof FTPParser)) {
    return new FTPParser(_command);
  }
  var _parser = this;
  if(!_command) {
    _command = new Buffer(1024);
  }
  var _blen = _command.length;
  var _loc = 0;
  var _fspace = 0;
  var current = {
    cmd: null,
    params: null
  };
  this.command = current;
  this.onCommand = function() {};
  _parser.execute = function(buffer, start, len) {
    _parser.error = null;
    var end = start + len;
    if(end > buffer.length) {
      _parser.error = new Error("parser.oob");
      return -1;
    }
    var pos = start;
    var cancel = false;
    while (pos < end) {
      var c = buffer[pos];
      if(c > 127) {
        _parser.error = new Error("parser.ascii");
        return -1;
      }
      if(_loc >= _blen) {
        _parser.error = new Error("parser.oob");
        return -1;
      }
      switch(c) {
        case 10:
          if(_loc < 3) {
            _parser.error = new Error("parser.command");
            return -1;
          }
          var line = _command.asciiSlice(0, _loc);
          if(_fspace > 0) {
            current.cmd = line.substring(0, _fspace);
            current.params = line.substring(_fspace+1);
          }
          else {
            current.cmd = line;
            current.params = null;
          }
          _fspace = 0;
          _loc = 0;
          cancel = _parser.onCommand();
          if(cancel) {
            return pos;
          }
          break;
        case 13:
          break;
        case 32:
          if(_fspace === 0) {
            _fspace = _loc;
          }
          _command[_loc++] = c;
          break;
        default:
          if(_fspace === 0 && (c >= 65 && c <= 90)) {
            c += 32;
          }
          _command[_loc++] = c;
          break;
      }
      pos++;
    }
    return pos;
  };
  
  _parser.reset = function() {
    _loc = 0;
    _fspace = 0;
  };
}

function FTPServer(options) {
  if (!(this instanceof FTPServer)) {
    return new FTPServer();
  }
  var _ftpd = this;
  var _stats_timer; // timer variable for monitoring stats
  var _ports = []; // list of available ports for passive mode
  var stats = {
    conn: 0,
    send: 0,
    recv: 0,
    commands: 0,
    responses: 0,
    uploads: 0,
    errors: 0,
    uptime: 0
  };
  var logger = options.logger || {};
  var then = new Date().getTime();
  var statcb = null;
  var paddr;
  var _totalports;
  var listbuf = new Buffer("total 0\n");
  var responses = {
    r125: "125 connection established",
    r150: "150 waiting for connection",
    r200: "200 command ok",
    r202: "202 command not supported",
    r215: "215 unix emulated by minftpd",
    r220: "220 ftp server minftpd ready",
    r221: "221 goodbye",
    r226: "226 data transfer ok",
    r230: "230 logged on",
    r257: "257 \"/\" is current directory",
    r331: "331 password required",
    r332: "332 username required",
    r425: "425 cannot open data connection",
    r426: "426 data transfer aborted",
    r450: "450 action not taken",
    r451: "451 transfer aborted",
    r452: "452 upload not allowed",
    r502: "502 command not implemented",
    r550: "550 permission denied",
    r530: "530 not logged on",
    r551: "551 aborted. page type unknown",
    r552: "552 exceeded limit",
    r553: "553 illegal file name"
  }; // standard responses

  // set defaults
  options.portrange = options.portrange || {lo: 1024, hi: 2047};
  options.port = options.port || 21;
  options.type = options.type || "tcp";
  options.host = options.host || "127.0.0.1";
  options.pasvip = options.pasvip || options.host;
  options.statsInterval = options.statsInterval || 1000;
  options.setNoDelay = options.setNoDelay || false;
  options.maxconn = options.maxconn || 1024;
  paddr = options.pasvip.split(".").join(",");
  _totalports = options.portrange.hi - options.portrange.lo;
  
  // convert standard responses into buffers for faster writing
  function initResponses() {
    // TODO: allow changing of responses on the fly from client
    var name;
    for (name in options.responses) {
      if(options.responses.hasOwnProperty(name)) {
        responses[name] = options.responses[name];
      }
    }
    for (name in responses) {
      if(responses.hasOwnProperty(name)) {
        responses[name] = new Buffer(responses[name] + "\r\n");
      }
    }
  }

  function initPorts() {
    var i;
    for(i=options.portrange.lo; i<=options.portrange.hi; i++) {
      var pport = parseInt(i / 256, 10) + "," + parseInt(i % 256, 10);
      var msg = "227 Entering Passive Mode (" + paddr + "," + pport + ")\r\n";
      var port = {
        port: i,
        response: new Buffer(msg.length)
      };
      port.response.asciiWrite(msg, 0);
      _ports.push(port);
    }
  }

  function initLogging() {
    ["log", "error", "info", "trace", "warn"].forEach(function(method) {
      if(!logger.hasOwnProperty(method)) {
        logger[method] = console[method];
      }
    });
  }

  function statHandler() {
    var now = new Date().getTime();
    stats.uptime += (now-then);
    stats.ports = {
      free: _ports.length,
      inuse: _totalports - _ports.length + 1
    };
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
  }
  
  function onConnection(peer) {
    var r, err;
    if(!peer) {
      if(_ftpd.onError) {
        err = new Error("peer.accept");
        err.errno = global.errno;
        _ftpd.onError(err);
      }
      return;
    }
    if(stats.conn >= options.maxconn) {
      peer.close();
      return;
    }
    var queue = [];
    var parser = new FTPParser();
    var session = {};
    session.stats = {
      recv: 0,
      send: 0,
      upload: 0,
      download: 0,
      uploads: 0,
      downloads: 0
    };

    function sendResponse(resp, after) {
      peer.send(resp, function(status, handle, req) {
        if(status !== 0) {
          err = new Error("send");
          err.errno = global.errno;
          peer.onerror(err);
          peer.kill();
          return;
        }
        if(session.trace && session.onResponse) {
          session.onResponse(resp.toString().replace("\r\n", ""), status);
        }
        stats.send += resp.length;
        session.stats.send += resp.length;
        stats.responses++;
        if(peer.killaftersend) {
          peer.kill();
          return;
        }
        if(after) {
          after();
        }
      });
    }
  
    function initPeer(transfer) {
      var peer = transfer.peer;
      peer.onread = function(buffer, start, len) {
        if(!buffer) {
          peer.kill();
          return;
        }
        stats.recv += len;
        session.stats.upload += len;
        transfer.size += len;
        if(transfer.buffer) {
          transfer.buffers.push(buffer.slice(start, start + len));
          if(transfer.onData) {
            transfer.onData(buffer.slice(start, start + len));
          }
        }
        else {
          if(transfer.onData && transfer.buffers.length === 0) {
            transfer.onData(buffer.slice(start, start + len));
          }
          else if(transfer.onData) {
            transfer.buffers.push(buffer.slice(start, start + len));
            transfer.onData(coalesce(transfer.buffers));
            transfer.buffers = [];
          }
          else {
            transfer.buffers.push(buffer.slice(start, start + len));
          }
        }
      };
      peer.onclose = function() {
        stats.uploads++;
        session.stats.uploads++;
        if(transfer.onClose) {
          transfer.onClose();
        }
      };
      peer.onerror = function(err) {
        logger.error({err: err});
        logger.trace("peer.onerror");
        transfer.error = err;
        if(transfer.onError) {
          transfer.onError(err);
        }
      };
      peer.readStart();
    }
    
    function createTransfer(ispassive, cb, ahost, aport) {
      var r, sock, err, port;
      var transfer = {
        buffers: [],
        size: 0,
        buffer: true
      };
      if(ispassive) {
        if(_ports.length === 0) {
          err = new Error("out of ports");
          //logger.error({err: err});
          //logger.trace("createTransfer");
          cb(err);
          return;
        }
        port = _ports[0];
        sock = new minsock.TCP();
        r = sock.bind(options.host, port.port);
        if(r < 0) {
          err = new Error("sock.bind");
          err.errno = global.errno;
          //logger.error({err: err});
          //logger.trace("createTransfer");
          sock.close();
          cb(err);
          return;
        }
        sock.connected = 0;
        sock.onconnection = function(peer) {
          if(!peer) {
            err = new Error("sock.accept");
            err.errno = global.errno;
            //logger.error({err: err});
            //logger.trace("sock.onconnection");
            sock.close();
            sock.listening = false;
            //shutdownTransfer();
            cb(err);
            return;
          }
          sock.onconnection = function(peer) {
            peer.close();
          };
          sock.close();
          sock.listening = false;
          //TODO: what happens if we have a backlog of connections that call
          // accept in a loop and we get multiple connections here? should
          // we set sock.onconnection to an empty function?
          sock.connected++;
          transfer.peer = peer;
          minsock.Create(peer);
          initPeer(transfer);
          cb(null, transfer);
        };
        r = sock.listen(128);
        if(r < 0) {
          err = new Error("data.listen");
          err.errno = global.errno;
          //logger.error({err: err});
          //logger.trace("sock.listen");
          // TODO: call an error callback
          // don't unshift as the it's either in use by something else or
          // will be unshifted if in use by another data connection in this
          // server. this is a sign something bad is wrong!
          // TODO:
          // should we return an error here? if so, client should retry as
          // it is a 4xx error. if we want to handle this without an error
          // to the client then we need to shift the next port off the pool
          // and try again
          sock.onconnection = function(peer) {
            peer.close();
          };
          sock.close();
          cb(err);
          return;
        }
        transfer.port = port;
        _ports.shift();
        sock.listening = true;
      }
      else {
        sock = new minsock.TCP();
        sock.connected = 0;
        r = sock.connect(ahost, aport);
        if(!r) {
          err = new Error("data.connect");
          err.errno = global.errno;
          //logger.error({err: err});
          //logger.trace("data.connect");
          sock.close();
          cb(err);
          return;
        }
        r.oncomplete = function(status, peer, req) {
          if(status !== 0) {
            err = new Error("client.connect");
            err.errno = global.errno;
            //logger.error({err: err});
            //logger.trace("client.connect");
            sock.close();
            cb(err);
            return;
          }
          sock.connected++;
          transfer.peer = peer;
          minsock.Create(peer);
          initPeer(transfer);
          cb(null, transfer);
        };
      }
      transfer.passive = ispassive;
      transfer.sock = sock;
      return transfer;
    }

    function shutdownTransfer() {
      session.txactive = false;
      if(!session.transfer) {
        return;
      }
      var transfer = session.transfer;
      if(transfer.peer && !transfer.peer.closed) {
        transfer.peer.close();
      }
      if(transfer.passive && transfer.sock && transfer.sock.listening) {
        transfer.sock.close();
      }
      if(transfer.passive && transfer.port) {
        _ports.push(transfer.port);
      }
      transfer.port = null;
      session.transfer = null;
    }
    
    function processCommand() {
      if(queue.length === 0) {
        return;
      }
      var command = queue.shift();
      if(session.trace && session.onCommand) {
        session.onCommand(command);
      }
      var addr, host, port, b;
      session.command = command;
      var transfer = session.transfer;
      stats.commands++;
      if(session.txactive && session.auth) {
        switch(command.cmd) {
          case "retr":
            transfer.file = {
              name: command.params,
              size: 0
            };
            transfer.command = command;
            transfer.onStart = function() {
              transfer.onStart = null;
              if(session.onDownloadStart) {
                session.onDownloadStart(function() {
                  command.response = command.response || responses.r552;
                  if(transfer.cancel) {
                    sendResponse(command.response, processCommand);
                    shutdownTransfer();
                    //TODO: do we need these checks??
                    if(queue.length > 0) {
                      process.nextTick(processCommand);
                    }
                  }
                });
                return;
              }
              b = new Buffer("total 0\n");
              transfer.peer.send(b, function(status, handle, req) {
                //TODO: check status
                transfer.peer.kill();
              });
            };
            transfer.onError = function(err) {
              if(session.onError) {
                session.onError(err);
              }
            };
            transfer.onClose = function() {
              if(transfer.error) {
                sendResponse(responses.r450, processCommand);
              }
              else {
                sendResponse(responses.r226, processCommand);
              }
              if(session.onDownloadComplete) {
                session.onDownloadComplete();
              }
              shutdownTransfer();
              if(queue.length > 0) {
                process.nextTick(processCommand);
              }
            };
            sendResponse(transfer.peer?responses.r125:responses.r150);
            if(transfer.peer) {
              transfer.onStart();
            }
            break;
          case "nlst":
          case "list":
            transfer.command = command;
            transfer.onStart = function() {
              transfer.onStart = null;
              if(session.onList) {
                session.onList(command.params, function() {
                  //transfer.peer.kill();
                });
                return;
              }
              transfer.peer.send(listbuf, function(status, handle, req) {
                //TODO: check status
                transfer.peer.kill();
              });
            };
            transfer.onError = function(err) {
              if(session.onError) {
                session.onError(err);
              }
            };
            transfer.onClose = function() {
              if(transfer.error) {
                sendResponse(responses.r450, processCommand);
              }
              else {
                sendResponse(responses.r226, processCommand);
              }
              shutdownTransfer();
              if(queue.length > 0) {
                process.nextTick(processCommand);
              }
            };
            sendResponse(transfer.peer?responses.r125:responses.r150);
            if(transfer.peer) {
              transfer.onStart();
            }
            break;
          case "stor":
            transfer.file = {
              name: command.params,
              size: 0
            };
            transfer.command = command;
            transfer.onStart = function() {
              if(transfer.peer && transfer.peer.closed) {
                if(transfer.error) {
                  sendResponse(responses.r450, processCommand);
                }
                else {
                  if(!transfer.cancel) {
                    transfer.file.size = transfer.size;
                    if(transfer.buffers.length > 0) {
                      transfer.file.buffer = coalesce(transfer.buffers);
                    }
                    if(session.onUploadComplete) {
                      session.onUploadComplete();
                    }
                    sendResponse(command.response || responses.r226, processCommand);
                  }
                }
                shutdownTransfer();
                if(queue.length > 0) {
                  process.nextTick(processCommand);
                }
              }
              else {
                if(session.onUploadChunk) {
                  transfer.onData = function(buffer) {
                    session.stats.recv += buffer.length;
                    transfer.file.size = transfer.size;
                    if(transfer.cancel) {
                      command.response = command.response || responses.r552;
                      sendResponse(command.response, processCommand);
                      shutdownTransfer();
                      if(queue.length > 0) {
                        process.nextTick(processCommand);
                      }
                    }
                    else {
                      session.onUploadChunk(buffer);
                    }
                  };
                }
                transfer.onError = function(err) {
                  if(session.onError) {
                    session.onError(err);
                  }
                };
                transfer.onClose = function() {
                  if(!transfer.cancel) {
                    if(!session.onUploadChunk || transfer.buffer) {
                      transfer.file.buffer = coalesce(transfer.buffers);
                      transfer.file.size = transfer.size;
                    }
                    if(session.onUploadComplete) {
                      session.onUploadComplete();
                    }
                    if(transfer.error) {
                      command.response = command.response || responses.r450;
                    }
                    else {
                      command.response = command.response || responses.r226;
                    }
                    sendResponse(command.response, processCommand);
                  }
                  shutdownTransfer();
                  if(queue.length > 0) {
                    process.nextTick(processCommand);
                  }
                };
                if(session.onUploadStart) {
                  session.onUploadStart(function() {
                    if(transfer.cancel) {
                      command.response = command.response || responses.r552;
                      shutdownTransfer();
                      sendResponse(command.response, processCommand);
                    }
                    else {
                      var resp = transfer.peer?responses.r125:responses.r150;
                      sendResponse(resp);
                    }
                  });
                }
              }
            };
            if(transfer.peer) {
              transfer.onStart();
            }
            break;
          case "abor":
            transfer.onClose = function() {
              var err = new Error("I wasn't expecting this to be called");
              logger.error({err: err});
              logger.trace("transfer.onClose");
            };
            sendResponse(responses.r426, processCommand);
            shutdownTransfer();
            break;
          default:
            // unsupported data transfer command
            sendResponse(responses.r502, processCommand);
            shutdownTransfer();
            break;
        }
        return;
      }
      session.txactive = false;
      if(!session.auth) {
        switch(command.cmd) {
          case "user":
            // TODO: check if user exists and return a failure code if not
            session.username = command.params;
            sendResponse(responses.r331, processCommand);
            break;
          case "pass":
            if(!session.username) {
              sendResponse(responses.r332, processCommand);
              return;
            }
            session.password = command.params;
            if(session.onLogin) {
              session.onLogin(function() {
                if(session.auth) {
                  command.response = command.response || responses.r230;
                }
                else {
                  command.response = command.response || responses.r530;
                }
                sendResponse(command.response, processCommand);
              });
              return;
            }
            session.auth = true;
            sendResponse(responses.r230, processCommand);
            break;
          case "syst":
            sendResponse(responses.r215, processCommand);
            break;
          case "quit":
            peer.killaftersend = true;
            sendResponse(responses.r221, processCommand);
            break;
          default:
            sendResponse(responses.r220, processCommand);
            break;
        }
      }
      else {
        switch(command.cmd) {
          case "pwd":
          case "xpwd":
            if(session.onWorkingDir) {
              session.onWorkingDir(function(path) {
                var resp = "257 " + path + " is current directory\r\n";
                var buf = new Buffer(resp);
                sendResponse(buf, processCommand);
              });
              return;
            }
            sendResponse(responses.r257, processCommand);
            break;
          case "pasv":
            if(session.transfer) {
              sendResponse(responses.r425, processCommand);
              if(session.onError) {
                session.onError(new Error("existing data transfer"));
              }
              return;
            }
            transfer = createTransfer(true, function(err, transfer) {
              if(err) {
                if(session.transfer) {
                  shutdownTransfer();
                  sendResponse(responses.r425, processCommand);
                }
                if(session.onError) {
                  session.onError(err);
                }
                return;
              }
              if(transfer.onStart) {
                transfer.onStart();
              }
            });
            if(transfer) {
              sendResponse(transfer.port.response, processCommand);
              session.transfer = transfer;
              session.txactive = true;
            }
            else {
              //TODO: set command.response here and then call sendResponse which
              // will send it. this allows user to set the response in the 
              // callbacks if they want to
              sendResponse(responses.r425, processCommand);
              if(session.onError) {
                session.onError(new Error("error initialising transfer"));
              }
            }
            break;
          case "port":
            addr = command.params.split(",");
            host = addr[0]+"."+addr[1]+"."+addr[2]+"."+addr[3];
            port = (parseInt(addr[4], 10) * 256) + parseInt(addr[5], 10);
            if(session.transfer) {
              sendResponse(responses.r425, processCommand);
              if(session.onError) {
                session.onError(new Error("existing data transfer"));
              }
              return;
            }
            transfer = createTransfer(false, function(err, transfer) {
              if(err) {
                if(session.transfer) {
                  shutdownTransfer();
                  sendResponse(responses.r425, processCommand);
                }
                if(session.onError) {
                  session.onError(err);
                }
                return;
              }
              if(transfer.onStart) {
                transfer.onStart();
              }
            }, host, port);
            if(transfer) {
              session.transfer = transfer;
              sendResponse(responses.r200, processCommand);
              session.txactive = true;
            }
            else {
              //TODO: set command.response here and then call sendResponse which
              // will send it. this allows user to set the response in the 
              // callbacks if they want to
              sendResponse(responses.r425, processCommand);
              if(session.onError) {
                session.onError(new Error("error initialising transfer"));
              }
            }
            break;
          case "type":
            sendResponse(responses.r200, processCommand);
            break;
          case "syst":
            sendResponse(responses.r215, processCommand);
            break;
          case "quit":
            peer.killaftersend = true;
            sendResponse(responses.r221);
            break;
          default:
            sendResponse(responses.r202, processCommand);
            break;
        }
      }
    }

    peer.onread = function(buffer, start, len) {
      if(!buffer) {
        peer.kill();
        return;
      }
      stats.recv += len;
      session.stats.recv += len;
      session.lastActive = then;
      r = parser.execute(buffer, start, len);
      if(r < 0) {
        peer.killaftersend = true;
        sendResponse(responses.r221);
        parser.error.command = parser.command;
        peer.onerror(parser.error);
      }
    };

    peer.onerror = function(err) {
      logger.error(err);
      logger.trace("peer.onerror");
      if(session.onError) {
        session.onError(err);
      }
      stats.errors++;
    };

    peer.onclose = function() {
      shutdownTransfer();
      if(session.onClose) {
        session.onClose();
      }
      stats.conn--;
    };

    parser.onCommand = function() {
      queue.push({
        cmd: parser.command.cmd,
        params: parser.command.params
      });
      if(queue.length === 1) {
        processCommand();
      }
    };

    session.quit = function() {
      peer.killaftersend = true;
      sendResponse(responses.r221);
    };
    stats.conn++;
    minsock.Create(peer);
    peer.setNoDelay(options.setNoDelay);
    //peer.session = session;
    session.control = peer;
    peer.parser = parser;
    sendResponse(responses.r220, processCommand);
    if(_ftpd.onConnection) {
      _ftpd.onConnection(session);
    }
    peer.readStart();
  }
  
  _ftpd.listen = function(backlog, sock) {
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
        if(_ftpd.onError) {
          _ftpd.onError(err);
        }
        return r;
      }
    }
    sock.onconnection = onConnection;
    r = sock.listen(backlog);
    if(r < 0) {
      err = new Error("sock.listen");
      err.errno = global.errno;
      if(_ftpd.onError) {
        _ftpd.onError(err);
      }
      return r;
    }
    then = new Date().getTime();
    return 0;
  };
  
  // preload the ports and PASV messages for them
  initPorts();
  // preload server responses  
  initResponses();
  // default logging to inbuilt console object
  initLogging();

  _ftpd.onStats = onStats;
  _ftpd.responses = responses;
  _ftpd.options = options;
  _ftpd.stats = stats;
}

exports.Server = FTPServer;
exports.Parser = FTPParser;

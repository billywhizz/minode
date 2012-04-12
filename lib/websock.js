"use strict";
/*jslint devel: true, node: true, sloppy: false, vars: true, bitwise: true, white: true, nomen: true, plusplus: true, maxerr: 1000, maxlen: 80, indent: 2 */

var FreeList = require("../lib/utils").FreeList;
var noop = require("../lib/utils").noop;
var Hash = require("../lib/utils").Hash;

function HYBIMessage() {
  this.FIN = 1;
  this.RSV1 = 0;
  this.RSV2 = 0;
  this.RSV3 = 0;
  this.OpCode = 1;
  this.length = 0;
  this.payload = null;
  this.mask = 0;
  this.maskkey = [0,0,0,0];
}

function HYBIParser() {
  var _parser = this;
  var current = new HYBIMessage();
  var pos = 0;
  var bpos = 0;
  var _complete = false;
  var _inheader = true;
  var _payload16 = false;
  var _payload64 = false;
  var _maskpos = 0;
  
  // set to true if you want unmasking of data to be performed automatically
  this.unmask = false;
  // set to true if you want text messages to be utf8 decoded
  this.decode = false;
  
  function onMessage() {
    // if it is a text message and we have the decode flag set
    if(_parser.decode && current.OpCode === 1 && current.length > 0) {
      current.payload = current.payload.toString("utf8");
    }
    if(_parser.onMessage) {
      _parser.onMessage(current);
    }
    pos = 0;
    _complete = true;
  }
  
  this.reset = function() {
    current = new HYBIMessage();
    pos = 0;
    bpos = 0;
    _complete = false;
    _inheader = true;
    _payload16 = false;
    _payload64 = false;
    _maskpos = 0;
  };
  //TODO: buffer overrun
  _parser.execute = function(buffer, start, end) {
    var toread, count, cbyte;
    while(start < end) {
      if(_inheader) {
        cbyte = buffer[start++];
        switch(pos) {
          case 0:
            _payload16 = false;
            _payload64 = false;
            _complete = false;
            _maskpos = 0;
            current.FIN = cbyte >> 7 & 0x01;
            current.RSV1 = cbyte >> 6 & 0x01;
            current.RSV2 = cbyte >> 5 & 0x01;
            current.RSV3 = cbyte >> 4 & 0x01;
            current.OpCode = cbyte & 0x0f;
            current.maskkey = [0,0,0,0];
            current.payload = null;
            break;
          case 1:
            current.mask = cbyte >> 7 & 0x01;
            current.length = cbyte & 0x7f;
            if(current.length === 126) {
              _payload16 = true;
            }
            else if(current.length === 127) {
              _payload64 = true;
            }
            else {
              if(!current.mask) {
                if(current.length) {
                  _inheader = false;
                  bpos = 0;
                  current.payload = new Buffer(current.length);
                }
                else {
                  onMessage();
                }
              }
            }
            break;
          case 2:
            if(_payload16) {
              current.length = cbyte << 8;
            }
            else if(!_payload64) {
              //ignore most significant byte for js - 56 bit only
              current.maskkey[0] = cbyte;
            }
            break;
          case 3:
            if(_payload16) {
              current.length += cbyte;
              if(!current.mask) {
                if(current.length) {
                  _inheader = false;
                  bpos = 0;
                  current.payload = new Buffer(current.length);
                }
                else {
                  onMessage();
                }
              }
            }
            else if(_payload64) {
              current.length = cbyte << 48;
            }
            else {
              current.maskkey[1] = cbyte;
            }
            break;
          case 4:
            if(_payload16) {
              current.maskkey[0] = cbyte;
            }
            else if(_payload64) {
              current.length += cbyte << 40;
            }
            else {
              current.maskkey[2] = cbyte;
            }
            break;
          case 5:
            if(_payload16) {
              current.maskkey[1] = cbyte;
            }
            else if(_payload64) {
              current.length += cbyte << 32;
            }
            else {
              current.maskkey[3] = cbyte;
              if(current.length) {
                _inheader = false;
                bpos = 0;
                current.payload = new Buffer(current.length);
              }
              else {
                onMessage();
              }
            }
            break;
          case 6:
            if(_payload16) {
              current.maskkey[2] = cbyte;
            }
            else if(_payload64) {
              current.length += cbyte << 24;
            }
            break;
          case 7:
            if(_payload16) {
              current.maskkey[3] = cbyte;
              if(current.length) {
                _inheader = false;
                bpos = 0;
                current.payload = new Buffer(current.length);
              }
              else {
                onMessage();
              }
            }
            else if(_payload64) {
              current.length += cbyte << 16;
            }
            break;
          case 8:
            if(_payload64) {
              current.length += cbyte << 8;
            }
            break;
          case 9:
            if(_payload64) {
              current.length += cbyte;
            }
            break;
          case 10:
            if(_payload64) {
              current.maskkey[0] = cbyte;
            }
            break;
          case 11:
            if(_payload64) {
              current.maskkey[1] = cbyte;
            }
            break;
          case 12:
            if(_payload64) {
              current.maskkey[2] = cbyte;
            }
            break;
          case 13:
            if(_payload64) {
              current.maskkey[3] = cbyte;
              if(current.length) {
                _inheader = false;
                bpos = 0;
                current.payload = new Buffer(current.length);
              }
              else {
                onMessage();
              }
            }
            break;
          default:
            // error
            break;
        }
        if(!_complete) {
          pos++;
        }
        else {
          _complete = false;
        }
      }
      else {
        if(current.mask && this.unmask) {
          toread = current.length - bpos;
          count = toread;
          if(toread === 0) {
            _inheader = true;
          }
          else if(toread <= end-start) {
            while(count--) {
              current.payload[bpos++] = buffer[start++] ^ 
                current.maskkey[_maskpos++];
              if(_maskpos === 4) {
                _maskpos = 0;
              }
            }
            onMessage();
            _inheader = true;
          }
          else {
            toread = end - start;
            count = toread;
            while(count--) {
              current.payload[bpos++] = buffer[start++] ^ 
                current.maskkey[_maskpos++];
              if(_maskpos === 4) {
                _maskpos = 0;
              }
            }
          }
        }
        else {
          toread = current.length - bpos;
          if(toread === 0) {
            _inheader = true;
          }
          else if(toread <= end-start) {
            buffer.copy(current.payload, bpos, start, start + toread);
            start += toread;
            bpos += toread;
            onMessage();
            _inheader = true;
          }
          else {
            toread = end - start;
            buffer.copy(current.payload, bpos, start, start + toread);
            start += toread;
            bpos += toread;
          }
        }
      }
    }
  };
}

var ParserPool = new FreeList("ParserPool", 1024, function() {
  var parser = new HYBIParser();
  parser.decode = false;
  parser.unmask = true;
  parser.onMessage = function(msg) {
    var peer = parser.peer;
    if(msg.OpCode === 8) {
      peer.kill();
    }
    else {
      if(peer.onWSMessage) {
        peer.onWSMessage(msg);
      }
    }
  };
  return parser;
});

function createMessage(buff, encoding) {
  var OpCode = 0x81;
  if(encoding) {
    buff = new Buffer(buff, encoding);
  }
  else {
    OpCode = 0x82;
  }
  var dataLength = buff.length;
  var startOffset = 2;
  var secondByte = dataLength;
  var i = 0;
  if (dataLength > 65536) {
    startOffset = 10;
    secondByte = 127;
  }
  else if (dataLength > 125) {
    startOffset = 4;
    secondByte = 126;
  }
  var out = new Buffer(dataLength + startOffset);
  out.fill(0);
  out[0] = OpCode;
  out[1] = secondByte;
  buff.copy(out, startOffset, 0, dataLength);
  switch (secondByte) {
    case 126:
      out[2] = dataLength >>> 8;
      out[3] = dataLength % 256;
      break;
    case 127:
      var l = dataLength;
      for (i = 1; i <= 8; ++i) {
        out[startOffset - i] = l & 0xff;
        l >>>= 8;
      }
      break;
  }
  return out;
}

function createServer(peer, request) {
  request.version = request.headers["sec-websocket-version"][0];
  var wskey = request.headers["sec-websocket-key"][0];
  var cookie = "";
  if(request.headers.hasOwnProperty("cookie")) {
    cookie = request.headers.cookie[0];
  }
  var shasum = new Hash("sha1");
  shasum.update(wskey);
  shasum.update("258EAFA5-E914-47DA-95CA-C5AB0DC85B11");
  var res = "HTTP/1.1 101 Switching Protocols\r\n"
    + "Upgrade: websocket\r\n"
    + "Connection: Upgrade\r\n"
    + "Set-Cookie: " + cookie + "\r\n"
    + "Sec-WebSocket-Accept: " + shasum.digest("base64") + "\r\n";
  if(request.headers.hasOwnProperty("sec-websocket-protocol")) {
    request.protocol = request.headers["sec-websocket-protocol"][0];
    res += "Sec-Websocket-Protocol: " + request.protocol + "\r\n";
  }
  res += "\r\n";
  peer.readStop();
  peer._onclose = null;
  if(peer.onclose) {
    peer._onclose = peer.onclose;
  }
  peer.sendMessage = function(buff, encoding, cb) {
    if(!buff) {
      return false;
    }
    var message = createMessage(buff, encoding);
    return peer.send(message, cb);
  };
  peer.send(new Buffer(res), function(status, handle, req, buffer) {
    //TODO: check status
    peer.handshake = true;
    if(peer.onWSStart && !peer.onWSStart()) {
      peer.kill();
      peer.onClose = peer.onWSClose;
      return;
    }
    var parser = ParserPool.alloc();
    parser.peer = peer;
    peer.parser = parser;
    peer.onread = function(buffer, start, len) {
      if(!buffer) {
        peer.kill();
        return;
      }
      parser.execute(buffer.slice(start, start + len), 0, len);
    };
    peer.onclose = function() {
      peer.parser.peer = null;
      ParserPool.free(peer.parser);
      //if(peer._onclose) peer._onclose();
      if(peer.onWSClose) {
        peer.onWSClose();
      }
    };
    peer.onerror = function(err) {
      console.perror("websocket.peer.error", err);
      if(peer.onWSError) {
        peer.onWSError(err);
      }
    };
    peer.readStart();
  });
  return peer;
}

function createClient(peer, response) {
  peer.sendMessage = function(buff, encoding, cb) {
    var message = createMessage(buff, encoding);
    peer.send(message, cb);
  };
  peer.onWSClose = peer.onWSClose || peer.onClose;
  peer.onWSError = peer.onWSError || peer.onError;
  if(peer.free) peer.free();
  var parser = ParserPool.alloc();
  parser.peer = peer;
  peer.parser = parser;
  peer.onread = function(buffer, start, len) {
    if(!buffer) {
      peer.kill();
      return;
    }
    parser.execute(buffer.slice(start, start + len), 0, len);
  };
  peer.onclose = function() {
    peer.parser.peer = null;
    ParserPool.free(peer.parser);
    if(peer.onWSClose) {
      peer.onWSClose();
    }
  };
  peer.onerror = function(err) {
    console.perror("websocket.peer.error", err);
    if(peer.onWSError) {
      peer.onWSError(err);
    }
  };
  if(response.statusCode === 101) {
    if(response.headers.upgrade && response.headers.upgrade[0] === "websocket") {
      if(peer.onWSStart && !peer.onWSStart()) {
        peer.readStart();
        return;
      }
      peer.kill();
    }
  }
}

exports.createServer = createServer;
exports.createClient = createClient;
exports.createMessage = createMessage;
exports.ParserPool = ParserPool;
exports.Parser = HYBIParser;
exports.Message = HYBIMessage;
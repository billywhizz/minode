var minsock = require("./minsock");
var cares = process.binding("cares_wrap");

Buffer.prototype.pack = function(fields, offset) {
  var e = fields.length + 1;
  var i = offset;
  var next = 0;
  while(--e) {
    var field = fields[next++];
    if("s" in field) {
      this.asciiWrite(field.s, i);
      i += field.s.length;
    }
    else if("o" in field) {
      this[i++] = field.o & 0xff;
    }
    else if("n" in field) {
      this[i++] = (field.n >> 8) & 0xff;
      this[i++] = field.n & 0xff;
    }
    else if("N" in field) {
      this[i++] = (field.N >> 24) & 0xff;      
      this[i++] = (field.N >> 16) & 0xff;
      this[i++] = (field.N >> 8) & 0xff;
      this[i++] = field.N & 0xff;
    }
  }
  return (i - offset);
}

Buffer.prototype.unpack = function(pattern, offset) {
  var len = pattern.length;
  var i = offset;
  var pi = 0;
  var res = [];
  while(pi < len) {
    switch(pattern[pi]) {
      case "N":
        res.push((this[i++] << 24) + (this[i++] << 16) + (this[i++] << 8) + this[i++]);
        pi++;
        break;
      case "n":
        res.push((this[i++] << 8) + this[i++]);
        pi++;
        break;
      case "o":
        res.push(this[i++]);
        pi++;
        break;
      case "s":
      case "a":
        var slen = 1;
        var tmp = 0;
        while(true) {
          tmp = pattern[pi + slen];
          if(!(tmp >= "0" && tmp <= "9")) {
            break;
          }
          slen++;
        }
        var strlen = parseInt(pattern.substring(pi + 1, pi + slen));
        res.push(this.asciiSlice(i, i+strlen));
        i += strlen;
        pi += slen;
        break;
      case "u":
        break;
    }
  }
  return res;
}

var constants = {
  "opcodes": {
    "GET": 0x00,
    "SET": 0x01,
    "ADD": 0x02,
    "REPLACE": 0x03,
    "DELETE": 0x04,
    "INCREMENT": 0x05,
    "DECREMENT": 0x06,
    "QUIT": 0x07,
    "FLUSH": 0x08,
    "GETQ": 0x09,
    "NOOP": 0x0A,
    "VERSION": 0x0B,
    "GETK": 0x0C,
    "GETKQ": 0x0D,
    "APPEND": 0x0E,
    "PREPEND": 0x0F,
    "STAT": 0x10,
    "SETQ": 0x11,
    "ADDQ": 0x12,
    "REPLACEQ": 0x13,
    "DELETEQ": 0x14,
    "INCREMENTQ": 0x15,
    "DECREMENTQ": 0x16,
    "QUITQ": 0x17,
    "FLUSHQ": 0x18,
    "APPENDQ": 0x19,
    "PREPENDQ": 0x1A,
    "SASLLIST": 0x20,
    "SASLAUTH": 0x21,
    "SASLSTEP": 0x22,
    "RGET": 0x30,
    "RSET": 0x31,
    "RSETQ": 0x32,
    "RAPPEND": 0x33,
    "RAPPENDQ": 0x34,
    "RPREPEND": 0x35,
    "RPREPENDQ": 0x36,
    "RDELETE": 0x37,
    "RDELETEQ": 0x38,
    "RINCR": 0x39,
    "RINCRQ": 0x3a,
    "RDECR": 0x3b,
    "RDECRQ": 0x3c,
    "TAPCONN": 0x40,
    "TAPMUTATE": 0x41,
    "TAPDELETE": 0x42,
    "TAPFLUSH": 0x43,
    "TAPOPAQUE": 0x44,
    "TAPBUCKETSET": 0x45
  },
  "encodings": {
    "BINARY": 0,
    "ASCII": 1,
    "UTF8": 2
  },
  "general": {
    "HEADER_LEN": 24,
    "MAGIC": {
      "request": 0x80,
      "response": 0x81
    },
    "MAX_BODY": 1048477
  },
  "parser": {
    "state": {
      "HEADER": 0,
      "EXTRA": 1,
      "KEY": 2,
      "BODY": 3
    }
  },
  "status": {
    "NO_ERROR": 0x00,
    "KEY_NOT_FOUND": 0x01,
    "KEY_EXISTS": 0x02,
    "VALUE_TOO_LARGE": 0x03,
    "INVALID_ARGUMENTS": 0x04,
    "ITEM_NOT_STORED": 0x05,
    "INCR_DECR_NON_NUMERIC": 0x06,
    "VBUCKET_WRONG_SERVER": 0x07,
    "AUTH_ERROR": 0x08,
    "AUTH_CONTINUE": 0x09,
    "UNKNOWN_COMMAND": 0x81,
    "OUT_OF_MEMORY": 0x82,
    "NOT_SUPPORTED": 0x83,
    "INTERNAL_ERROR": 0x84,
    "BUSY": 0x85,
    "TEMPORARY_FAILURE": 0x86
  }
};

//TODO:
/*
  * Key length can be up to 65535 bytes so should probably have a chunked option for it too.
  * Opaque allows matching responses with requests
  * CAS can be used to not update if the version you have is stale
*/
function Parser(options) {
  var _parser = this;
  var loc = 0;
  var message = {};
  
  var _header = new Buffer(constants.general.HEADER_LEN);
  var _extras = null;
  var _key = null;
  var _body = null;
  var toparse = 0;
  var pos = 0;
  var skip = false;
  
  _parser.chunked = true;
  _parser.encoding = constants.encodings.BINARY;
  if(options) {
    _parser.chunked = options.chunked;
    _parser.encoding = options.encoding;
  }
  _parser.state = constants.parser.state.HEADER;
  _parser.onMessage  = _parser.onHeader = _parser.onBody = _parser.onKey = _parser.onExtras = null;
  _parser.current = message;
  _parser.position = pos;
  
  _parser.reset = function() {
    loc = 0;
    message = {};
    _extras = null;
    _key = null;
    _body = null;
    toparse = 0;
    _parser.state = constants.parser.state.HEADER;
    pos = 0;
    skip = false;
  }
  
  _parser.execute = function(buffer, start, end) {
    if(!start) start = 0;
    if(!end) end = buffer.length;
    pos = start;
    while (pos < end) {
      switch(_parser.state) {
        case constants.parser.state.HEADER:
          if(loc == constants.general.HEADER_LEN - 1) {
            message = {
              "header": {}
            };
            _parser.current = message;
            _header[loc++] = buffer[pos];
            var obj = _header.unpack("oonoonNNNN", 0);
            message.header.magic = obj[0];
            message.header.opcode = obj[1];
            message.header.keylen = obj[2];
            message.header.exlen = obj[3];
            message.header.datatype = obj[4];
            if(message.header.magic == constants.general.MAGIC.request) {
              // new protocol - http://code.google.com/p/memcached/wiki/BinaryProtocolRevamped
              message.header.vbucket = obj[5];
            }
            else {
              message.header.status = obj[5];
            }
            message.header.totlen = obj[6];
            message.header.opaque = obj[7];
            message.header.cashi = obj[8];
            message.header.caslo = obj[9];
            message.header.bodylen = message.header.totlen - (message.header.exlen + message.header.keylen);
            
            if(_parser.onHeader) _parser.onHeader(message.header);
            if(message.header.exlen > 0) {
              _extras = new Buffer(message.header.exlen);
              _parser.state = constants.parser.state.EXTRA;
            }
            else if(message.header.keylen > 0) {
              _key = new Buffer(message.header.keylen);
              _parser.state = constants.parser.state.KEY;
            }
            else if(message.header.bodylen) {
              if(!_parser.chunked) _body = new Buffer(message.header.bodylen);
              _parser.state = constants.parser.state.BODY;
            }
            else {
              if(_parser.onMessage) _parser.onMessage();
            }
            loc = 0;
            toparse = message.header.bodylen;
          }
          else {
            _header[loc++] = buffer[pos];
          }
          pos++;
          break;
        case constants.parser.state.EXTRA:
          if(loc == message.header.exlen - 1) {
            message.extras = {};
            _extras[loc++] = buffer[pos];
            switch(message.header.opcode)
            {
              case constants.opcodes.INCREMENT:
              case constants.opcodes.DECREMENT:
                obj = _extras.unpack("NNNNN", 0);
                message.extras.deltahi = obj[0];
                message.extras.deltalo = obj[1];
                message.extras.initialhi = obj[2];
                message.extras.initiallo = obj[3];
                message.extras.expires = obj[4];
                break;
              case constants.opcodes.GET:
              case constants.opcodes.GETQ:
              case constants.opcodes.GETK:
              case constants.opcodes.GETKQ:
                obj = _extras.unpack("N", 0);
                message.extras.flags = obj[0];
                break;
              case constants.opcodes.FLUSH:
              case constants.opcodes.FLUSHQ:
                obj = _extras.unpack("N", 0);
                message.extras.expires = obj[0];
                break;
              case constants.opcodes.SET:
              case constants.opcodes.ADD:
              case constants.opcodes.REPLACE:
                obj = _extras.unpack("NN", 0);
                message.extras.flags = obj[0];
                message.extras.expires = obj[1];
                break;
              default:
                break;
            }
            if(_parser.onExtras) _parser.onExtras(message.extras);
            if(message.header.keylen > 0) {
              _key = new Buffer(message.header.keylen);
              _parser.state = constants.parser.state.KEY;
            }
            else if(message.header.bodylen > 0) {
              if(!_parser.chunked) _body = new Buffer(message.header.bodylen);
              _parser.state = constants.parser.state.BODY;
            }
            else {
              if(_parser.onMessage) _parser.onMessage();
              _parser.state = constants.parser.state.HEADER;
            }
            _extras = null;
            loc = 0;
          }
          else {
            _extras[loc++] = buffer[pos];
          }
          pos++;
          break;
        case constants.parser.state.KEY:
          if(loc == message.header.keylen - 1) {
            _key[loc++] = buffer[pos];
            start += message.header.keylen;
            message.key = _key.toString();
            if(_parser.onKey) _parser.onKey(message.key);
            if(message.header.bodylen > 0) {
              if(!_parser.chunked) _body = new Buffer(message.header.bodylen);
              _parser.state = constants.parser.state.BODY;
            }
            else {
              if(_parser.onMessage) _parser.onMessage();
              _parser.state = constants.parser.state.HEADER;
            }
            loc = 0;
            _key = null;
          }
          else {
            _key[loc++] = buffer[pos];
          }
          pos++;
          break;
        case constants.parser.state.BODY:
          if(!_parser.chunked) {
            if(loc == message.header.bodylen - 1) {
              _body[loc++] = buffer[pos];
              switch(_parser.encoding) {
                case constants.encodings.ASCII:
                  message.body = _body.toString("ascii");
                  break;
                case constants.encodings.UTF8:
                  message.body = _body.toString("utf8");
                  break;
                default:
                  message.body = _body;
                  break;
              }
              if(_parser.onBody) _parser.onBody(message.body);
              if(_parser.onMessage) _parser.onMessage();
              _parser.state = constants.parser.state.HEADER;
              loc = 0;
            }
            else {
              _body[loc++] = buffer[pos];
            }
            pos++;
          }
          else {
            if(end >= pos + toparse) {
              if(_parser.onBody) _parser.onBody(buffer, pos, pos + toparse);
              if(_parser.onMessage) _parser.onMessage();
              _parser.state = constants.parser.state.HEADER;
              pos += toparse;
              toparse = 0;
              loc = 0;
            }
            else {
              if(_parser.onBody) _parser.onBody(buffer, pos, end);
              toparse -= (end - pos);
              pos = end;
            }
          }
          break;
      }
    }
  }
}

function Client(options) {
  if (!(this instanceof Client)) {
    return new Client();
  }
  var _client = this;
  var client = null;
  var parser = new Parser(options);
  var p;
  var _cb = {};
  var _seq = 1;
  function getHandler(key, cb) {
    var encoder = new Buffer(24 + key.length);
    var size = encoder.pack([
      {o: constants.general.MAGIC.request},
      {o: constants.opcodes.GET},
      {n: key.length},
      {o: 0},
      {o: 0},
      {n: 0},
      {N: key.length},
      {N: _seq},
      {N: 0},
      {N: 0},
      {s: key}
    ], 0);
    _cb["K_" + _seq++] = cb;
    p.send(encoder, function(status, handle, req) {
      if(status !== 0) {
        var err = new Error("get.send");
        err.errno = errno;
        if(_client.onError) _client.onError(err);
        p.kill();
        return;
      }
    });
  }
  function setHandler(key, value, expiration, cb) {
		var encoder = new Buffer(32 + key.length + value.length);
    var size = encoder.pack([
      {o: constants.general.MAGIC.request},
      {o: constants.opcodes.SET},
      {n: key.length},
      {o: 0x08},
      {o: 0},
      {n: 0},
      {N: key.length + 8 + value.length},
      {N: _seq},
      {N: 0},
      {N: 0},
      {N: 0x01},
      {N: expiration},
      {s: key},
      {s: value}
    ], 0);
    _cb["K_" + _seq++] = cb;
    p.send(encoder, function(status, handle, req) {
      if(status !== 0) {
        var err = new Error("set.send");
        err.errno = errno;
        if(_client.onError) _client.onError(err);
        p.kill();
        return;
      }
    });
  }
  function delHandler(key, cb) {
		var encoder = new Buffer(24 + key.length);
    var size = encoder.pack([
      {o: constants.general.MAGIC.request},
      {o: constants.opcodes.DELETE},
      {n: key.length},
      {o: 0},
      {o: 0},
      {n: 0},
      {N: key.length},
      {N: _seq},
      {N: 0},
      {N: 0},
      {s: key}
    ], 0);
    _cb["K_" + _seq++] = cb;
    p.send(encoder, function(status, handle, req) {
      if(status !== 0) {
        var err = new Error("del.send");
        err.errno = errno;
        if(_client.onError) _client.onError(err);
        p.kill();
        return;
      }
    });
  }
  _client.connect = function(host, port) {
    cares.queryA(host, function(err, addresses) {
      if(err) {
        err.errno = global.errno;
        if(_client.onError) _client.onError(err);
        return;
      }
      client = new minsock.TCP();
      var r = client.connect(addresses[0], port);
      if(!r) {
        err = new Error("client.connect");
        err.errno = global.errno;
        if(_client.onError) _client.onError(err);
        client.close();
        return;
      }
      r.oncomplete = function(status, peer, req) {
        var err;
        if(status !== 0) {
          err = new Error("client.connect");
          err.errno = global.errno;
          if(_client.onError) _client.onError(err);
          peer.kill();
          return;
        }
        minsock.Create(peer);
        p = peer;
        p.onerror = function(err) {
          if(_client.onError) _client.onError(err);
          p.kill();
        };
        p.onclose = function() {
          client.close();
          if(_client.onClose) {
            _client.onClose();
          }
        };
        p.onread = function(buffer, start, len) {
          if(!buffer) {
            p.kill();
            return;
          }
          parser.execute(buffer.slice(start, start + len), 0, len);
        };
        parser.reset();
        parser.onMessage = function() {
          var m = parser.current;
          _cb["K_" + m.header.opaque](m);
        };
        p.readStart();
        p.get = getHandler;
        p.set = setHandler;
        p.del = delHandler;
        if(_client.onConnect) {
          _client.onConnect(p);
        }
      };
    });
  };
}

exports.Client = Client;
exports.Parser = Parser;
exports.constants = constants;

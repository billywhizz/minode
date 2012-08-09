"use strict";
/*jslint devel: true, node: true, sloppy: false, vars: true, white: true, nomen: true, plusplus: true, maxerr: 1000, maxlen: 80, indent: 2 */

var fs = process.binding("fs");

function extend(source, destination) {
  for (var i in source) {
    destination[i] = source[i];
  }
  return destination;
}

function coalesce(buffers) {
  var len = buffers.length;
  if(len === 0) return null;
  var blen = 0, off = 0, i = len, j = 0;
  while(i--) {
    blen += buffers[j++].length;
  }
  var bb = new Buffer(blen);
  i = len;
  j = 0;
  while(i--) {
    off += buffers[j++].copy(bb, off);
  }
  return bb;
}

var perms = parseInt(755, 8);
function checkDir(path) {
  try {
    fs.stat(path);
    return true;
  }
  catch(ex) {
    try {
      fs.mkdir(path, perms);
      return true;
    }
    catch(ex) {
      return false;
    }
  }
}

function noop(){}

function pprint(buf, offset, size, stream) {
	if(size<=0) {
    return 0;
  }
	var i = 0, j = 0, vv, ss, bb;
	var end = buf.length;
	if(size) {
		end = offset + size;
	}
	while(i + offset < end)
	{
		var val = buf[i + offset];
		if(i % 8 === 0 && i > 0) {
			stream.write(" ");
		}
		if(i % 16 === 0) {
			if(i > 0) {
				stream.write(" ");
				for(j = i + offset - 16; j < i + offset; j++) {
					vv = buf[j];
					if(vv > 0x20 && vv < 0x7e) {
						stream.write(String.fromCharCode(vv));
					}
					else {
						stream.write(".");
					}
				}
				stream.write("\n");
			}
			ss = "00000000" + i.toString(10);
			stream.write(ss.slice(ss.length - 8) + ": ");
		}
		bb = "0" + val.toString(16);
		stream.write(bb.slice(bb.length - 2) + " ");
		i++;
	}
	if(size % 16 !== 0) {
		for(j = 0; j< (16 - (size % 16)); j++) {
			stream.write("   ");
		}
		stream.write("  ");
		if(size % 16 <= 8) {
      stream.write(" ");
    }
		for(j= i + offset - (size % 16); j < i + offset; j++) {
			vv = buf[j];
			if(vv > 0x20 && vv < 0x7e) {
				stream.write(String.fromCharCode(vv));
			}
			else {
				stream.write(".");
			}
		}
	}
	else {
		stream.write("  ");
		for(j = size - 16; j < size; j++) {
			vv = buf[j];
			if(vv > 0x20 && vv < 0x7e) {
				stream.write(String.fromCharCode(vv));
			}
			else {
				stream.write(".");
			}
		}
	}
	stream.write("\n");
}

console.perror = function(msg, err) {
	console.error(msg + ":");
	if(err instanceof Error) {
		var obj = {
			message: err.message,
		};
		if(err.type) {
      obj.type = err.type;
    }
		if(err.errno) {
      obj.errno = err.errno;
    }
		if(err.stack) {
      obj.stack = err.stack;
    }
		console.error(obj);
		console.trace();
	}
	else {
		console.error(err);
	}
};

function inherits(ctor, superCtor) {
  ctor.super_ = superCtor;
  ctor.prototype = Object.create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
}

var FreeList = function(name, max, constructor) {
	this.name = name;
	this.constructor = constructor;
	this.max = max;
	this.list = [];
};

FreeList.prototype.alloc = function() {
	return this.list.length ? 
    this.list.shift() : 
    this.constructor.apply(this, arguments);
};

FreeList.prototype.free = function(obj) {
  if(this.list.length < this.max) {
    this.list.push(obj);
  }
};

function addHeaders(to, from) {
	var i = from.length;
	var j = 0;
	while(i) {
		var field = from[j++].toLowerCase();
		var value = from[j++];
		if(to.hasOwnProperty(field)) {
			to[field].push(value);
		}
		else {
			to[field] = [value];
		}
		i-=2;
	}
}

function Request() {
	this.headers = {};
	this.info = null;
}

var qscache = {};

function charCode(c) {
  return c.charCodeAt(0);
}

function unescapeBuffer(s, decodeSpaces) {
  var out = new Buffer(s.length);
  var state = 'CHAR'; // states: CHAR, HEX0, HEX1
  var n, m, hexchar;
  var inIndex = 0, outIndex = 0;
  for (inIndex = 0, outIndex = 0; inIndex <= s.length; inIndex++) {
    var c = s.charCodeAt(inIndex);
    switch (state) {
      case 'CHAR':
        switch (c) {
          case charCode('%'):
            n = 0;
            m = 0;
            state = 'HEX0';
            break;
          case charCode('+'):
            if (decodeSpaces) {
              c = charCode(' ');
            }
            out[outIndex++] = c;
            break;
          default:
            out[outIndex++] = c;
            break;
        }
        break;

      case 'HEX0':
        state = 'HEX1';
        hexchar = c;
        if (charCode('0') <= c && c <= charCode('9')) {
          n = c - charCode('0');
        } else if (charCode('a') <= c && c <= charCode('f')) {
          n = c - charCode('a') + 10;
        } else if (charCode('A') <= c && c <= charCode('F')) {
          n = c - charCode('A') + 10;
        } else {
          out[outIndex++] = charCode('%');
          out[outIndex++] = c;
          state = 'CHAR';
          break;
        }
        break;

      case 'HEX1':
        state = 'CHAR';
        if (charCode('0') <= c && c <= charCode('9')) {
          m = c - charCode('0');
        } else if (charCode('a') <= c && c <= charCode('f')) {
          m = c - charCode('a') + 10;
        } else if (charCode('A') <= c && c <= charCode('F')) {
          m = c - charCode('A') + 10;
        } else {
          out[outIndex++] = charCode('%');
          out[outIndex++] = hexchar;
          out[outIndex++] = c;
          break;
        }
        out[outIndex++] = 16 * n + m;
        break;
    }
  }

  // TODO support returning arbitrary buffers.

  return out.slice(0, outIndex - 1);
}

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

function parseQueryString(qs, sep, eq) {
	if (typeof qs !== 'string' || qs.length === 0) {
		return null;
	}
	sep = sep || '&';
	eq = eq || '=';
	var out = qscache[qs + sep];
	if(!out) {
    out = {};
    qs.split(sep).forEach(function(kvp) {
      var x = kvp.split(eq), k, v, useQS=false;
      if (kvp.match(/\+/)) {
        k = unescapeBuffer(x[0], true).toString();
        v = unescapeBuffer(x.slice(1).join(eq), true).toString();
      }
      else {
        k = decodeURIComponent(x[0]);
        v = decodeURIComponent(x.slice(1).join(eq) || "");
      }
      if (!hasOwnProperty(out, k)) {
        out[k] = v;
      } 
      else if (!Array.isArray(out[k])) {
        out[k] = [out[k], v];
      }
      else {
        out[k].push(v);
      }
    });
    qscache[qs + sep] = out;
  }
  return out;
}

var urlcache = {};
function parseURL(rest, parseqs) {
	var out = urlcache[rest];
	if(!out) {
		out = {};
		var hash = rest.indexOf('#');
		if (hash !== -1) {
			out.hash = rest.substr(hash);
			rest = rest.slice(0, hash);
		}
		var qm = rest.indexOf('?');
		if (qm !== -1) {
			out.search = rest.substr(qm);
			out.query = rest.substr(qm + 1);
			if (parseqs && parseQueryString) {
				out.query = parseQueryString(out.query);
			}
			rest = rest.slice(0, qm);
		} 
		else if(parseqs) {
			out.search = '';
			out.query = {};
		}
		if(rest) {
      out.pathname = rest;
    }
		if (out.hostname && !out.pathname) {
			out.pathname = '/';
		}
		if (out.pathname || out.search) {
			out.path = (out.pathname || '') + (out.search || '');
		}
		out.pathname = decodeURIComponent(out.pathname);
		urlcache[rest] = out;
	}
	return out;
}

String.prototype.pad = function(l, s){
	return (l -= this.length) > 0
        ? (s = [Math.ceil(l / s.length) + 1].join(s)).substr(0, 
          s.length) + this + s.substr(0, l - s.length)
        : this;
};

function LineParser(_command) {
  if (!(this instanceof LineParser)) {
    return new LineParser(_command);
  }
  var _parser = this;
  if(!_command) {
    _command = new Buffer(64 * 1024 * 1024);
  }
  var _blen = _command.length;
  var _loc = 0;
  var current = null;
  this.onMessage = function() {};
  _parser.execute = function(buffer, start, len) {
    _parser.error = null;
    var end = start + len;
    if(end > buffer.length) {
      _parser.error = new Error("parser.oob");
      return -1;
    }
    var pos = start;
    while (pos < end) {
      var c = buffer[pos];
      if(_loc >= _blen) {
        _parser.error = new Error("parser.oob");
        return -1;
      }
      switch(c) {
        case 10:
          current = _command.utf8Slice(0, _loc);
          _loc = 0;
          if(_parser.onMessage(current)) {
            return (pos - start);
          }
          break;
        case 13:
          break;
        default:
          _command[_loc++] = c;
          break;
      }
      pos++;
    }
    return pos - start;
  };
  
  _parser.reset = function() {
    _loc = 0;
  };
}

function CGIParser() {
  var state = 0; // NONE
  var headers = [];
  var current = new Buffer(1024);
  var pos = 0;
  this.reset = function() {
    state = 0;
    pos = 0;
    headers = [];
  };
  this.execute = function(b) {
    var start = 0;
    var end = b.length;
    var c;
    while(start < end) {
      c = b[start];
      switch(state) {
        case 0: //NONE
          current[pos++] = c;
          state = 1;
          start++;
          break;
        case 1: //IN HEADER
          switch(c) {
            case 13:
              headers.push(current.toString("ascii", 0, pos));
              pos = 0;
              break;
            case 10:
              state = 2;
              break;
            default:
              current[pos++] = c;
              break;
          }
          start++;
          break;
        case 2: //END OF HEADER
          switch(c) {
            case 13:
              break;
            case 10:
              this.onHeaders(headers);
              state = 3;
              break;
            default:
              current[pos++] = c;
              state = 1;
              break;
          }
          start++;
          break;
        case 3: //BODY
          this.onBody(b.slice(start, end));
          start = end;
          break;
      }
    }
  };
}

exports.checkDir = checkDir;
exports.Inherits = inherits;
exports.noop = noop;
exports.FreeList = FreeList;
exports.addHeaders = addHeaders;
exports.Request = Request;
exports.parseURL = parseURL;
exports.parseQueryString = parseQueryString;
exports.coalesce = coalesce;
exports.LineParser = LineParser;
exports.extend = extend;
exports.pprint = pprint;
exports.CGIParser = CGIParser;
try {
  var crypto = process.binding("crypto");
  exports.Hash = crypto.Hash;
}
catch(ex) {

}
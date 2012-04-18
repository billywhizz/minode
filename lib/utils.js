"use strict";
/*jslint devel: true, node: true, sloppy: false, vars: true, white: true, nomen: true, plusplus: true, maxerr: 1000, maxlen: 80, indent: 2 */

var fs = process.binding("fs");

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

function checkdir(path) {
  try {
    fs.stat(path);
    return true;
  }
  catch(ex1) {
    try {
      fs.mkdir(path, parseInt(755, 8));
      return true;
    }
    catch(ex2) {
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
			if (parseQueryString) {
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

Date.prototype.toMyString = function() {
	var year = this.getUTCFullYear();
	var month = this.getUTCMonth() + 1;
	var day = this.getUTCDate();
	var hour = this.getUTCHours();
	var minute = this.getUTCMinutes();
	var second = this.getUTCSeconds();
	var ms = this.getUTCMilliseconds();
	return year + "-" + month.toString().pad(2, "0") + "-" + 
    day.toString().pad(2, "0") + " " + hour.toString().pad(2, "0") + ":" + 
    minute.toString().pad(2, "0") + ":" + second.toString().pad(2, "0");
};

var camera_formats = {
	"ycam": /^([A-z]+)_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})_(\d*)/,
	"axis": /^image(\d{2})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})-(\d{2})/,
	"teltonika": /^img_(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})_(\d{2})/,
	"panasonicbl": /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{3})/,
	"lynip390e": /^(\d{2})_(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/,
	"linksys_cisco": /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{3})/,
	"dlink": /^video[tp][ro][ges](\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/
};

function getBlock(now, tz) {
	var hour = "0" + now.getHours().toString();
	return(now.getDay().toString() + hour.substring(hour.length-2));
}

function getMeta(model, filename, timezone) {
  var match, dte;
	switch(model.toLowerCase()) {
		case "ycam":
		case "ycam2":
		case "jabbakam":
			match = camera_formats.ycam.exec(filename);
			if (match !== null && match.length > 7) {
				dte = new Date();
				dte.setUTCFullYear(match[2], match[3]-1, match[4]);
				dte.setUTCHours(match[5]);
				dte.setUTCMinutes(match[6]);
				dte.setUTCSeconds(match[7]);
				dte.setUTCMilliseconds(match[8]);
				return {
          prefix: match[1],
          date: dte
        };
			}
			return null;
		case "axis":
			match = camera_formats.axis.exec(filename);
			if (match !== null && match.length > 6) {
				dte = new Date();
				dte.setUTCFullYear(2000 + parseInt(match[1], 10), 
          match[2]-1, match[3]);
				dte.setUTCHours(match[4]);
				dte.setUTCMinutes(match[5]);
				dte.setUTCSeconds(match[6]);
				dte.setUTCMilliseconds(match[7]);
				return {"date": dte};
			}
			return null;
		case "panasonicbl":
			match = camera_formats.panasonicbl.exec(filename);
			if (match !== null && match.length > 6) {
				dte = new Date();
				dte.setUTCFullYear(match[1], match[2]-1, match[3]);
				dte.setUTCHours(match[4]);
				dte.setUTCMinutes(match[5]);
				dte.setUTCSeconds(match[6]);
				dte.setUTCMilliseconds(match[7]);
				return {"date": dte};
			}
		  return null;
		case "teltonika":
			match = camera_formats.teltonika.exec(filename);
			if (match !== null && match.length > 6) {
				dte = new Date();
				dte.setUTCFullYear(match[1], match[2]-1, match[3]);
				dte.setUTCHours(match[4]);
				dte.setUTCMinutes(match[5]);
				dte.setUTCSeconds(match[6]);
				dte.setUTCMilliseconds(match[7]);
				return {"date": dte};
			}
		  return null;
		case "lynip390e":
			match = camera_formats.lynip390e.exec(filename);
			if (match !== null && match.length > 5) {
				dte = new Date();
				dte.setUTCFullYear(2000 + parseInt(match[1], 10), 
          match[2]-1, match[3]);
				dte.setUTCHours(match[4]);
				dte.setUTCMinutes(match[5]);
				dte.setUTCSeconds(match[6]);
				return {"date": dte};
			}
			return null;
		case "linksys_cisco":
			match = camera_formats.linksys_cisco.exec(filename);
			if (match !== null && match.length > 6) {
				dte = new Date();
				dte.setUTCFullYear(2000 + parseInt(match[1], 10), 
          match[2]-1, match[3]);
				dte.setUTCHours(match[4]);
				dte.setUTCMinutes(match[5]);
				dte.setUTCSeconds(match[6]);
				dte.setUTCMilliseconds(match[7]);
				return {"date": dte};
			}
			return null;
		case "dlink":
			match = camera_formats.dlink.exec(filename);
			if (match !== null && match.length > 5) {
				dte = new Date();
				dte.setUTCFullYear(match[1], match[2]-1, match[3]);
				dte.setUTCHours(match[4]);
				dte.setUTCMinutes(match[5]);
				dte.setUTCSeconds(match[6]);
				return {"date": dte};
			}
			return null;
		case "eyespy":
		case "other":
			return {"date": new Date()};
	}
}

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

exports.checkDir = checkDir;
exports.Inherits = inherits;
exports.noop = noop;
exports.FreeList = FreeList;
exports.addHeaders = addHeaders;
exports.Request = Request;
exports.parseURL = parseURL;
exports.parseQueryString = parseQueryString;
exports.checkdir = checkdir;
exports.coalesce = coalesce;
exports.getBlock = getBlock;
exports.getMeta = getMeta;
exports.LineParser = LineParser;
exports.pprint = pprint;
try {
  var crypto = process.binding("crypto");
  exports.Hash = crypto.Hash;
}
catch(ex) {

}
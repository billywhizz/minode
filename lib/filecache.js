var mimeTypes = require("./mime").mimeTypes;
var fs = process.binding("fs");
var constants = process.binding("constants");
var zlib = process.binding("zlib");
var coalesce = require("./utils").coalesce;

var _IF_MODIFIED = "if-modified-since";
var _ACCEPT_ENCODING = "accept-encoding";
var _ETAG = "etag";
var _OK_STATUS = "HTTP/1.1 200 OK\r\n";
var _NOT_MODIFIED_STATUS = "HTTP/1.1 304 Not Modified\r\n";
var _RANGE = "range";
var _RANGE_STATUS = "HTTP/1.1 206 Partial Content\r\n";

var errors = {
	404: new Buffer("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: Close\r\n\r\n"),
	405: new Buffer("HTTP/1.1 405 Method Not Allowed\r\nContent-Length: 0\r\nConnection: Close\r\n\r\n")
}

var elbuf = new Buffer("\r\n");
var endbuf = new Buffer("0\r\n\r\n");

function handleCallbacks(fn, pending, err, file) {
  if(!(fn in pending)) {
    return;
  } 
  pending[fn].callbacks.forEach(function(cb) {
   cb(err, file);
  });
  delete pending[fn];
}

function FileCache(options) {
	options = options || {};
	options.home = options.home || process.cwd();
	options.chunksize = options.chunksize || 16384;
  options.maxfilesize = options.maxfilesize || (1024 * 1024);
  var pending = {};
	var openfiles = {};
	this.load = function(fn, cb, cachecontrol) {
    var expires = new Date(Date.now() + 86400000);
    expires = expires.toUTCString();
		var file = null;
		if(fn in openfiles) {
			cb(null, openfiles[fn]);
			return;
		}
    if(fn in pending) {
      pending[fn].callbacks.push(cb);
      return;
    }
    pending[fn] = {callbacks: [cb]};
    fs.open(fn, constants.O_RDONLY, 0775, function(err, fd) {
      if(err) {
        handleCallbacks(fn, pending, err);
        return;
      }
			fs.fstat(fd, function(err, fstat) {
        if(err) {
          handleCallbacks(fn, pending, err);
          return;
        }
        var off = 0;
        function readFile(fd, size, cb) {
          var off = 0;
          var buf = new Buffer(options.maxfilesize);
          function chunk(err, bytesRead) {
            if(err) {
              handleCallbacks(fn, pending, err);
              return;
            }
            off += bytesRead;
            if(bytesRead > 0) {
              fs.read(fd, buf, off, size - off, off, chunk);
            }
            else {
              cb(null, buf.slice(0, off));
            }
          }
          fs.read(fd, buf, off, size - off, 0, chunk);
        }
        readFile(fd, fstat.size, function(err, buf) {
          if(err) handleCallbacks(fn, pending, err);
          var extension = fn.split(".").pop();
    			var cachecontrol = cachecontrol || "public, max-age=86400, s-maxage=86400";
    			file = {
    				path: fn,
    				size: fstat.size,
    				fd: fd,
    				mime: mimeTypes[extension] || "application/octet-stream",
    				modified: Date.parse(fstat.mtime),
    				stat: fstat,
    				etag: [fstat.ino.toString(16), fstat.size.toString(16), Date.parse(fstat.mtime).toString(16)].join("-")
    			};
    			file.headers = "Accept-Ranges: bytes\r\nExpires: " + expires + "\r\nCache-Control: " + cachecontrol + "\r\nEtag: " + file.etag + "\r\nLast-Modified: " + new(Date)(fstat.mtime).toUTCString() + "\r\nContent-Type: " + file.mime + "\r\n\r\n";
    			file.body = buf;
      	  openfiles[fn] = file;
          var zbuf = new Buffer(1024*1024);
          var gz = new zlib.Gzip();
          gz.init(15, zlib.Z_DEFAULT_COMPRESSION, 9, zlib.Z_DEFAULT_STRATEGY);
          var req = gz.write(zlib.Z_SYNC_FLUSH, file.body, 0, file.size, zbuf, 0, zbuf.length);
          req.callback = function(availInAfter, availOutAfter, buffer) {
            if(availInAfter > 0) {
              //TODO:
              handleCallbacks(fn, pending, new Error("gzip buffer overflow"));
              return;
            }
            file.gzip = {
              buf: zbuf.slice(0, zbuf.length - availOutAfter),
              headers: "Content-Encoding: gzip\r\n" + file.headers
            };
            file.gzip.size = file.gzip.buf.length;
            var watcher = new fs.StatWatcher();
            watcher.onchange = function(curr, prev) {
              if(Date.parse(curr.mtime) != Date.parse(prev.mtime)) {
      					setTimeout(function() {
                  fs.fstat(fd, function(err, ffstat) {
                    readFile(fd, ffstat.size, function(err, buf) {
            					var f = openfiles[fn];
            					f.modified = Date.parse(ffstat.mtime);
            					f.size = ffstat.size;
            					f.etag = [ffstat.ino.toString(16), ffstat.size.toString(16), Date.parse(ffstat.mtime).toString(16)].join("-");
            					f.headers = "Accept-Ranges: bytes\r\nExpires: " + expires + "\r\nCache-Control: " + cachecontrol + "\r\nEtag: " + f.etag + "\r\nLast-Modified: " + new(Date)(curr.mtime).toUTCString() + "\r\nContent-Type: " + f.mime + "\r\n\r\n";
                      f.body = buf;
                      var zbuf = new Buffer(1024*1024);
                      var gz = new zlib.Gzip();
                      gz.init(15, zlib.Z_DEFAULT_COMPRESSION, 9, zlib.Z_DEFAULT_STRATEGY);
                      var req = gz.write(zlib.Z_SYNC_FLUSH, file.body, 0, file.size, zbuf, 0, zbuf.length);
                      req.callback = function(availInAfter, availOutAfter, buffer) {
                        if(availInAfter > 0) {
                          //TODO:
                          cb(new Error("gzip buffer overflow"));
                          return;
                        }
                        f.gzip = {
                          buf: zbuf.slice(0, zbuf.length - availOutAfter),
                          headers: "Content-Encoding: gzip\r\n" + f.headers
                        };
                        f.gzip.size = f.gzip.buf.length;
      	                openfiles[fn] = f;
                      };
                    });
                  });
                }, 1000);
      				}
            }
            watcher.onstop = function() {
              console.log("watcher stopped: " + fn);
            }
            watcher.start(fn, false, 3000);
      	    handleCallbacks(fn, pending, null, file);
          };
        });
      });
    });
	}
	this.unload = function() {
		for(fn in openfiles) {
			var file = openfiles[fn];
			fs.unwatchFile(fn);
			fs.closeSync(file.fd);
		}
		openfiles = {};
	}
	this.sendFile = function(peer, request, cb, cachecontrol, index) {
		//TODO: change this to use request.pathname
    index = index || "index.html";
    var fn = options.home + request.url.pathname;
		if(fn.indexOf("..") > -1) {
			peer.send(errors["404"], function(status, handle, req) {
				cb(new Error("Illegal Path"));
			});
			return;
		}
    if(fn[fn.length-1] === "/") {
      fn = fn + index;
    }
		this.load(fn, function(err, file) {
			if(err) {
				peer.send(errors["404"], function(status, handle, req) {
					cb(err, file);
				});
				return;
			}
			var statusLine = _OK_STATUS;
			file.status = 200;
			var isHead = (request.method === "HEAD");
			var sendbody = !isHead;
			var length = file.size;
			var start = 0;
			var end = file.size;
			if((_ETAG in request.headers)) {
				if(file.etag === request.headers[_ETAG][0]) {
					file.status = 304;
					statusLine = _NOT_MODIFIED_STATUS; 
					sendbody = false;
				}
			}
			else if((_IF_MODIFIED in request.headers)) {
				if(file.modified <= Date.parse(request.headers[_IF_MODIFIED][0])) {
					file.status = 304;
					statusLine = _NOT_MODIFIED_STATUS; 
					sendbody = false;
				}
			}
			else if((_RANGE in request.headers)) {
				var brange = request.headers[_RANGE][0].match(/bytes=(\d{0,10})-(\d{0,10})?/);
				file.status = 206;
				statusLine = _RANGE_STATUS;
				if(brange) {
					start = parseInt(brange[1]);
					if(brange[2]) {
						end = parseInt(brange[2]);
					}
					else {
						end = file.size - 1;
					}
				}
				length = end - start + 1;
				statusLine += "Content-Range: bytes " + start + "-" + end + "/" + file.size + "\r\n";
				sendbody = true;
			}
      var payload = {
        headers: file.headers,
        body: file.body,
        size: file.size
      }
			if(file.gzip && (_ACCEPT_ENCODING in request.headers)) {
        var enc = request.headers[_ACCEPT_ENCODING][0].split(",");
        enc.some(function(e) {
          if(e === "gzip") {
            payload.headers = file.gzip.headers;
            payload.body = file.gzip.buf;
            payload.size = file.gzip.size;
            return true;
          }
        });
      }
			if(isHead) {
				statusLine += "Content-Length: " + payload.size + "\r\n";
			}
			else if(request.chunked && sendbody) {
				statusLine += "Transfer-Encoding: chunked\r\n";
			}
			else if(sendbody) {
				statusLine += "Content-Length: " + payload.size + "\r\n";
			}
			else {
				statusLine += "Content-Length: 0\r\n";
			}
			if(request.shouldKeepAlive) {
				statusLine += "Connection: Keep-Alive\r\n";
			}
			else {
				statusLine += "Connection: Close\r\n";
			}
      if(sendbody) {
        peer.send([new Buffer(statusLine + payload.headers), payload.body], function(status, handle, req) {
          cb(null, file);
          if(!request.shouldKeepAlive) peer.kill();
        });
      }
      else {
        peer.send(new Buffer(statusLine + payload.headers), function(status, handle, req) {
          cb(null, file);
          if(!request.shouldKeepAlive) peer.kill();
        });
      }
		}, cachecontrol);
	}
}
exports.FileCache = FileCache;
var cares = process.binding('cares_wrap');
function systemError(call, cb) {
  var e = new Error(call + " " + process._errno);
  e.errno = e.code = process._errno;
  e.syscall = call;
  if(cb) return cb(e);
  throw(e);
}
function lookup(host, cb) {
  var wrap = cares.getaddrinfo(host, 4);
  if (!wrap) return systemError("getaddrinfo", cb);
  wrap.oncomplete = function (addresses) {
    if (!addresses) return systemError("getaddrinfo", cb);
    cb(null, addresses);
  };
}
exports.lookup = lookup;
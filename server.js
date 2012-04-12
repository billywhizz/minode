var HTTPServer = require("./lib/http").Server;
var createServer = require("./lib/websock").createServer;
var parseURL = require("./lib/utils").parseURL;
var FileCache = require("./lib/filecache").FileCache;
var quotes = require("./prices").quotes;

var fc = new FileCache({
  home: "./static",
  chunksize: 65536
});

var subscribers = [];
var index = 0;

function Subscriber(peer) {
  function handleError(msg) {
    err = new Error(msg);
    err.errno = global.errno;
    peer.onError(err);
    peer.kill();
  }
  function handleWrite(status, handle, req) {
    if(status !== 0) {
      handleError("sendMessage.write");
      return;
    }
  }
  this.push = function(quote) {
    peer.sendMessage(JSON.stringify(quote), "ascii", handleWrite);
  }
}

setInterval(function() {
  subscribers.forEach(function(subscriber) {
    subscriber.push(quotes[index++]);
    if(index > quotes.length) {
      index = 0;
    }
  });
}, 10);

function httpHandler(peer) {
  peer.onRequest = function(request) {
    request.url = parseURL(request.url, true);
    if(request.upgrade) {
      var path = request.url.pathname.split("/");
      path.shift();
      request.service = path.shift();
      if(request.service === "quotes") {
        createServer(peer, request);
        peer.onWSClose = function() {
          console.log("ws.peer.close");
        };
        peer.onWSError = function(err) {
          console.trace("ws.peer.error");
          console.error(err);
        };
        peer.onWSStart = function() {
          switch(request.service) {
            case "quotes":
              subscribers.push(new Subscriber(peer));
              peer.onWSMessage = function(message) {
                console.log("ws.peer.message");
                console.log(message);
              };
              return true;
              break;
            default:
              break;
          }
        };
        return true;
      }
    }
    fc.sendFile(peer, request, function(err, file) {
      if(err) {
        peer.onError(err);
      }
    });
    return true;
    // if we drop out here, the false return value will mean a 404 will be served
  };
  peer.onClose = function() {
    console.info("peer.onClose");
  };
  peer.onError = function(err) {
    console.error(err);
    console.trace("peer.onError");
  };
}

var rc;
var httpd = new HTTPServer({
  host: "0.0.0.0",
  port: 8080,
  onConnection: httpHandler
});

// httpd error handler
httpd.onError = function(err) {
  console.error(err);
  logger.trace("httpd.onError");
};

// httpd statistics handler
httpd.onStats(function(st) {
  console.info(st);
}, 1000);

rc = httpd.listen(128);
if(rc !== 0) {
  process.exit(1);
}



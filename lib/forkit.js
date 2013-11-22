"use strict";
/*jslint devel: true, node: true, sloppy: false, vars: true, white: true, nomen: true, plusplus: true, maxerr: 1000, maxlen: 80, indent: 2 */

//var daemon = require("../build/Release/daemon");
var TCP = process.binding("tcp_wrap").TCP;
var Pipe = process.binding("pipe_wrap").Pipe;
var Process = process.binding("process_wrap").Process;
var constants = process.binding("constants");
//var LineParser = require("./utils").LineParser;
/*
if(!global.time) {
  global.time = new function() {
    var _time = this;
    _time.current = new Date().getTime();
    setInterval(function() {
      _time.current = new Date().getTime();
    }, 10);
  }();
}
*/
function Cluster(options) {
  if (!(this instanceof Cluster)) {
    return new Cluster(options);
  }
  var _cluster = this;
  var id = 0;
  var workers = [];
  var magic = new Buffer([0,1,2,3]);
  this.workers = workers;
  var PID = process.pid;
  
  //TODO: config validation
  this.fork = function(cb) {
    require("fs").open(options.out, "w+", function (err, outfd) {
      if(err) {
        return console.error("Error starting daemon: ",  err);
      }
      require("fs").open(options.err, 'w+', function (err, errfd) {
        if(err) {
          return console.error("Error starting daemon: ",  err);
        }
        var children;
        var socket;
        var res;
        //TODO: separate daemon stuff from clustering so i can
        // daemonize once and create a number of clusters, each
        // with their own groups of child processes
        //daemon.start(outfd, errfd);
        //daemon.closeStdin();
        //if(options.lockFile) {
          //daemon.lock(options.lockFile);
        //}
        //if(options.chroot) daemon.chroot(options.chroot);
        children = options.workers;
        //TODO: handle signals
        //TODO: do a graceful restart of cluster on SIGHUP
        //TODO: shouldn't this be in the child?
        process.on("uncaughtException", function(ex) {
          console.error(ex);
          workers.forEach(function(worker) {
            //if(worker.kill) worker.kill();
          });
          process.exit(1);
        });
        function createPipe() {
          return new Pipe(false);
        }
        function Worker(socket) {
          var _worker = this;
          var ipc = new Pipe(true);
          ipc.seq = 0;
          var env = process.env;
          var args = [];
          var key;
          var cenv = [];
          var cwd = null;
          var opt;
          var worker;
          var stderr = createPipe();
          var stdout = createPipe();
          if(options.args && options.args.length) {
            args = options.args.shift();
          }
          args.unshift(options.script);
          args.unshift(process.execPath);
          if(options.cwd && options.cwd.length) {
            cwd = options.cwd.shift();
          }
          //TODO: optimise this
          _worker.onexit = function() {};
          for(key in env) {
            cenv.push(key + "=" + env[key]);
          }
          if(options.uid) {
            cenv.push("RSUID=" + options.uid);
          }
          if(options.gid) {
            cenv.push("RSGID=" + options.gid);
          }
          if(options.title) {
            cenv.push("RSTITLE=" + options.title);
          }
          cenv.push("MINSOCK_WORKER=true");
          opt = {
            file: process.execPath,
            args: args,
            cwd: cwd,
            envPairs: cenv,
            stdio: [{type: 'pipe', handle: ipc}, {type: 'pipe', handle: stdout}, {type: 'pipe', handle: stderr}]
          };
          worker = new Process();
          function start() {
            var writeReq, err;
            worker.spawn(opt);
            _worker.pid = worker.pid;
            _worker.exitCode = 0;
            _worker.signalCode = 0;
            _worker.id = id++;
            worker.onexit = function(exitCode, signalCode) {
              stdout.readStop();
              stderr.readStop();
              _worker.exitCode = exitCode;
              _worker.signalCode = signalCode;
              //worker.close();
              if(options.onexit) {
                if(options.onexit.call(_cluster, _worker)) {
                  start();
                }
              }
            };
            stdout.readStart();
            _worker.stdout = stdout;
            stderr.readStart();
            _worker.stderr = stderr;
            _worker.channel = ipc;
            writeReq = ipc.writeUtf8String("1234", socket);
            if (!writeReq) {
              err = new Error("IPC write error: " + global.errno);
              if(options.onstart) {
                options.onstart(_cluster, err);
              }
            }
            writeReq.oncomplete = function(status) {
              if(status !== 0) {
                err = new Error("IPC failed: " + global.errno);
                if(options.onstart) {
                  options.onstart.call(_cluster, err);
                }
              }
              else {
                if(options.onstart) {
                  options.onstart.call(_cluster, null, _worker);
                }
                ipc.onread = function(pool, offset, length) {
                
                };
/*
                ipc.parser = new LineParser();
                ipc.parser.onMessage = function(s) {
                  if(ipc.onMessage) {
                    ipc.onMessage(JSON.parse(s));
                  }
                };
                ipc.onread = function(pool, offset, length) {
                  var r = ipc.parser.execute(pool, offset, length);
                  if(r < 0) {
                    throw new Error("wah");
                  }
                };
                ipc.sendMessage = function(event) {
                  var wr, buf, err;
                  event.seq = ipc.seq++;
                  event.time = global.time.current;
                  event.pid = PID;
                  buf = new Buffer(JSON.stringify(event) + "\n");
                  wr = ipc.write(buf);
                  if(!wr) {
                    //TODO: this is really bad! we should probably shut down 
                    // if we cannot communicate with the master process
                    err = new Error("channel.write");
                    err.errno = global.errno;
                    console.error(err);
                    return;
                  }
                  wr.oncomplete = function(status, handle, req) {
                    if(status !== 0) {
                      err = new Error("channel.write");
                      err.errno = global.errno;
                      console.error(err);
                      return;
                    }
                  };
                };
*/
                ipc.readStart();
              }
            };
          }
          this.stop = function() {
            worker.kill(constants.SIGTERM);
          };
          start();
        }
        if(options.type.toLowerCase() === "tcp") {
          socket = new TCP();
          res = socket.bind(options.host, options.port);
        }
        else {
          socket = new Pipe();
          res = socket.bind(options.port);
        }
        if(res !== 0) {
          if(options.onerror) {
            err = new Error("bind error: " + global.errno);
            options.onerror.call(_cluster, err);
          }
        }
        else {
          while(children--) {
            try {
              var w = new Worker(socket);
              workers.push(w);
              if(cb) {
                cb(w);
              }
            }
            catch(ex) {
              if(options.onerror) {
                options.onerror.call(_cluster, ex);
              }
            }
          }
        }
      });
    });
  };
}
function Worker(cb) {
  //TODO: signal and uncaughtException handlers
  if (!(this instanceof Worker)) {
    return new Worker(cb);
  }
  var _worker = this;
  try {
    var ipc = new Pipe(true);
    var PID = process.pid;
    var err;
    //TODO: check for errors
    ipc.open(0);
    ipc.seq = 0;
    _worker.stdin = ipc;
    ipc.onread = function(pool, offset, length, handle) {
      if(handle) {
        cb(null, handle, ipc);
/*
        ipc.parser = new LineParser();
        ipc.parser.onMessage = function(s) {
          if(ipc.onMessage) {
            ipc.onMessage(JSON.parse(s));
          }
        };
        ipc.onread = function(pool, offset, length) {
          var r = ipc.parser.execute(pool, offset, length);
          if(r < 0) {
            throw new Error("wah");
          }
        };
*/
      }
      else {
        err = new Error("no handle supplied");
        cb(err);
      }
    };
    ipc.sendMessage = function(event) {
      var wr, buf, err;
      event.seq = ipc.seq++;
      event.time = global.time.current;
      event.pid = PID;
      buf = new Buffer(JSON.stringify(event) + "\n");
      wr = ipc.write(buf);
      if(!wr) {
        //TODO: this is really bad! we should probably shut down if we cannot
        // communicate with the master process
        err = new Error("channel.write");
        err.errno = global.errno;
        console.error(err);
        return;
      }
      wr.oncomplete = function(status, handle, req) {
        if(status !== 0) {
          err = new Error("channel.write");
          err.errno = global.errno;
          console.error(err);
          return;
        }
      };
    };
    ipc.readStart();
  }
  catch(ex) {
    cb(ex);
  }
}
exports.Cluster = Cluster;
exports.Worker = Worker;
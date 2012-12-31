var sys = require("sys");
var fs = require("fs");
var buff = require("buffer");

function psmonitor(interval, fn) {
  var stat = new Object();
  var _self = this;
  var procrx = new RegExp("(\\d{1,1000}) (.*?) (\\w) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000}) (\\d{1,1000})");
  var sysrx = new RegExp("cpu  (-?\\d{1,1000}) (-?\\d{1,1000}) (-?\\d{1,1000}) (-?\\d{1,1000}) (-?\\d{1,1000}) (-?\\d{1,1000}) (-?\\d{1,1000}) (-?\\d{1,1000}) (-?\\d{1,1000})");
  _self.statistics = stat;
  fn = fn || function() {};
  fs.stat("/proc/" + process.pid + "/stat", function (err, stats) {
    if(err) {
      fn(err);
      return;
    }
    var buff1 = new buff.Buffer(4096);
    fs.open("/proc/" + process.pid + "/stat", "r", 0644, function(err, fd) {
      if(err) {
        fn(err);
        return;
      }
      fs.open("/proc/stat", "r", 0644, function(err, fd2) {
        if(err) {
          fn(err);
          return;
        }
        _self.tt = setInterval(function() {
          stat["STIME"] = new Date().getTime();
          fs.read(fd, buff1, 0, 4096, 0, function(err, bytesRead) {
          if(err) {
            fn(err);
            return;
          }
          var data = buff1.toString("ascii", 0, bytesRead)
          var match = procrx.exec(data);
          if (match != null && match.length > 1) {
            stat["PID"] = parseInt(match[1]);
            stat["TCOMM"] = match[2];
            stat["STATE"] = match[3];
            stat["PPID"] = parseInt(match[4]);
            stat["PGRP"] = parseInt(match[5]);
            stat["SID"] = parseInt(match[6]);
            stat["TTY"] = parseInt(match[7]);
            stat["TPGID"] = parseInt(match[8]);
            stat["MIFLT"] = parseInt(match[10]);
            stat["MJFLT"] = parseInt(match[12]);
            stat["USR"] = parseInt(match[14]);
            stat["SYS"] = parseInt(match[15]);
            stat["USR-C"] = parseInt(match[16]);
            stat["SYS-C"] = parseInt(match[17]);
            stat["PRI"] = parseInt(match[18]);
            stat["NICE"] = parseInt(match[19]);
            stat["START"] = parseInt(match[20]);
            stat["VSIZE"] = parseInt(match[23]);
            stat["RSS-L"] = parseInt(match[24]);
            fs.read(fd2, buff1, 0, 4096, 0, function(err, bytesRead) {
              if(err) {
                fn(err);
                return;
              }
              var data = buff1.toString("ascii", 0, bytesRead)
              var match = sysrx.exec(data);
                if (match != null && match.length > 1) {
                  stat["S-USR"] = parseInt(match[1]);
                  stat["S-NIC"] = parseInt(match[2]);
                  stat["S-SYS"] = parseInt(match[3]);
                  stat["S-IDL"] = parseInt(match[4]);
                  stat["S-IOWAIT"] = parseInt(match[5]);
                  stat["S-IRQ"] = parseInt(match[6]);
                  stat["S-SOFTIRQ"] = parseInt(match[7]);
                  stat["S-STEAL"] = parseInt(match[8]);
                  stat["S-GUEST"] = parseInt(match[9]);
                }
                fn(stat);
              });
            }
          });
        }, interval);
      });
    });
  });
  _self.stop = function() {
    clearInterval(_self.tt);
  }
  return this;
}

function netmonitor(interval, fn) {
  var netrx = new RegExp("(?:\\s+)?(.+):(?:\\s+)?(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)\\s+(\\d+)", "g");
  var buff1 = new buff.Buffer(4096);
  var interfaces = {};
  var _self = this;
  _self.statistics = interfaces;
  fs.open("/proc/net/dev", "r", 0644, function(err, fd) {
    if(err) {
     fn(err);
     return;
    }
     _self.tt = setInterval(function() {
      fs.read(fd, buff1, 0, 4096, 0, function(err, bytesRead) {
        if(err) {
         fn(err);
         return;
       }
        var stats = buff1.toString("ascii", 0, bytesRead)
        var match = netrx.exec(stats);
        while (match != null && match.length > 16) {
          interfaces[match[1]] = {
            "id": match[1],
            "receive": {
              "bytes": match[2],
              "packets": match[3],
              "errors": match[4],
              "dropped": match[5],
              "fifo": match[6],
              "frame": match[7],
              "compressed": match[8],
              "multicast": match[9]
            },
            "send": {
              "bytes": match[10],
              "packets": match[11],
              "errors": match[12],
              "dropped": match[13],
              "fifo": match[14],
              "colls": match[15],
              "carrier": match[16],
              "compressed": match[17]
            }
          }
          match = netrx.exec(stats);
        }
        if(fn) fn(interfaces);
      });
    }, 1000);
  });
  _self.stop = function() {
    clearInterval(_self.tt);
  }
  return this;
}

exports.profiler = function() {
  var stime = 0;
  this.start = function() {
    stime = new Date().getTime();  
  };
  this.end = function() {
    var now = new Date().getTime();
    return (now-stime);
  };
}

exports.process = psmonitor;
exports.net = netmonitor;
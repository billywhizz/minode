var FTPServer = require("../lib/ftp").Server;
var config = {
  portrange: {
    lo: 50000,
    hi: 50010
  },
  port: 21,
  type: "tcp",
  host: "0.0.0.0",
  pasvip: "10.11.12.145",
  setNoDelay: true,
  statsInterval: 1000,
  maxconn: 10
};
var ftpd = new FTPServer(config);
ftpd.onError = function(err) {

};
ftpd.onConnection = function(session) {
  session.trace = true;
  session.onResponse = function(resp, status) {
  
  };
  session.onCommand = function(command) {
    console.log(command);
  };
  session.onDownloadStart = function(cb) {
    //session.transfer.cancel = true;
    cb();
  };
  session.onError = function(err) {
  
  };
  session.onDownloadComplete = function() {
    console.log(session.transfer);
  };
  session.onUploadComplete = function() {
    console.log(session.transfer);
  };
  session.onUploadChunk = function(buf) {
  
  };
  session.onUploadStart = function(cb) {
    //session.transfer.cancel = true;
    cb();
  };
  session.onLogin = function(cb) {
    console.log(session.username);
    console.log(session.password);
    session.auth = true;
    cb();
  };
  session.onWorkingDir = function(cb) {
    cb("/");
  };
  session.onClose = function() {
  
  };
  session.onList = function(path) {
  
  };
};
ftpd.onStats = function(stats) {

};
// ftpd.options
// ftpd.stats
// ftpd.responses
ftpd.listen();
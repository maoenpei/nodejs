
require("./server/HttpServer");
require("./server/FileManager");
require("./server/ArgParser");
var http = require("http");
var readline = require("readline");
var os = require("os");
var process = require("process");

var args = process.argv;
var argParser = new ArgParser(args);
argParser.setCaseSensitive(false);

var osPlatform = os.platform();
var isHost = osPlatform == "win32";
console.log("platform:", osPlatform, "isHost:", isHost);
console.log("process id:", process.pid);

var urlRoot = argParser.get("root");
urlRoot = (urlRoot ? urlRoot : "");
console.log("argv root: '" + urlRoot + "'");

var ip;
if (isHost) {
    ip = getLocalIP();
} else {
    ip = "127.0.0.1";
}
var port = Number(argParser.get("port"));
port = (port == 0 ? 6013 : port);

console.log("Server running at http://" + ip + ":" + port);

console.log("Working at:" + __dirname, rkey());
$FileManager.RootDirectory = __dirname;
$FileManager.saveFile("/pid", String(process.pid));

var host = new HttpServer(urlRoot, isHost);
http.createServer((req, res) => {host.onVisit(req, res)}).listen(port, ip);

function getLocalIP() {
    const os = require('os');
    const osType = os.type();
    const netInfo = os.networkInterfaces();
    let ip = '';
    if (osType === 'Windows_NT') { 
        for (let dev in netInfo) {
            if (dev === 'Ethernet') {
                for (let j = 0; j < netInfo[dev].length; j++) {
                    if (netInfo[dev][j].family === 'IPv4') {
                        ip = netInfo[dev][j].address;
                        break;
                    }
                }
            }
        }

    } else if (osType === 'Linux') {
        ip = netInfo.eth0[0].address;
    }

    return ip;
}

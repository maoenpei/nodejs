
require("./server/Httphost");
require("./server/FileManager");
require("./server/PersistanceManager");
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
    ip = "192.168.1.3";
} else {
    ip = "127.0.0.1";
}
var port = Number(argParser.get("port"));
port = (port == 0 ? 6013 : port);

console.log("Server running at http://" + ip + ":" + port);

console.log("Working at:" + __dirname, rkey());
$FileManager.RootDirectory = __dirname;

$PersistanceManager.initFiles(() => {
    var host = new Httphost(urlRoot, isHost);

    if (isHost) {
        var reading = readline.createInterface({
            input:process.stdin,
        });
        reading.on("line", (line) => {
            line.replace(/^\s*|\s*$/g, "");
            host.onCommand(line);
        });
    }
    http.createServer((req, res) => {host.onVisit(req, res)}).listen(port, ip);
});

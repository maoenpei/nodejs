
require("./server/Httphost");
require("./server/FileManager");
require("./server/PersistanceManager");
var http = require("http");
var readline = require("readline");
var os = require("os");

var osPlatform = os.platform();
var isHost = osPlatform == "win32";
console.log("platform:", osPlatform, "isHost:", isHost);

var ip;
if (isHost) {
    ip = "192.168.1.3";
} else {
    ip = "127.0.0.1";
}
var port = 6013;

console.log("Working at:" + __dirname, rkey());
$FileManager.RootDirectory = __dirname;

$PersistanceManager.initFiles(() => {
    var host = new Httphost(isHost);

    var reading = readline.createInterface({
        input:process.stdin,
    });
    reading.on("line", (line) => {
        line.replace(/^\s*|\s*$/g, "");
        host.onCommand(line);
    });
    http.createServer((req, res) => {host.onVisit(req, res)}).listen(port, ip);
});

console.log("Server running at http://" + ip + ":" + port);

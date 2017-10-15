
require("../server/FileManager");
require("../server/yzdzz/GameController");

$FileManager.RootDirectory = __dirname;

var accounts = [
    {u:"eyexiaohao001", p:"123456"},
    {u:"eyexiaohao002", p:"123456"},
    {u:"eyexiaohao003", p:"123456"},
    {u:"eyexiaohao004", p:"123456"},
    {u:"lv35679183", p:"zhangpeng1989"},
    {u:"13719987234", p:"xwWZT123"},
    {u:"13801890722", p:"Q950318my"},
];

var servers = [
    "s96", "s93", "s94", "s95",
];

var friendUnion = ["b275705814a85d98"];
var enemyUnion = ["b3b4461918285dc2", "b3bdc946b8285de7"];

var throwCard = true;
var occupyGem = false;

var next = coroutine(function*() {

    var gameController = new GameController();
    var accountManager = gameController.getAccountManager();

    while(true) {
        for (var i = 0; i < accounts.length; ++i) {
            var accountKey = accountManager.add(accounts[i].u, accounts[i].p);
            var conn = accountManager.connectAccount(accountKey);
            var data = yield conn.loginAccount(next);
            console.log("account", data.success);
            if (!data.success) {continue;}
            for (var m = 0; m < servers.length; ++m) {
                yield setTimeout(next, 1000);
                var data = yield conn.loginGame(servers[m], next);
                console.log("game", data.success);
                if (!data.success) {continue;}
                var data = yield conn.getUnionWar(next);
                if (!data.isOpen) {
                    console.log("union war closed");
                    conn.quit();
                    continue;
                }
                if (throwCard) {
                    for (var j = 1; j <= 9; ++j) {
                        var data = yield conn.enterUnionWar(j, next);
                        if (data.mineArray) {
                            if (!data.cardReady) {
                                break;
                            }
                            if (data.isGoodCard) {
                                for (var k = 0; k < friendUnion.length; ++k) {
                                    var data = yield conn.useCard(friendUnion[k], next);
                                }
                            } else {
                                for (var k = 0; k < enemyUnion.length; ++k) {
                                    var data = yield conn.useCard(enemyUnion[k], next);
                                }
                            }
                            break;
                        }
                    }
                }
                if (occupyGem) {
                    for (var j = 9; j >= 1; --j) {
                        var occupied = false;
                        var data = yield conn.enterUnionWar(j, next);
                        if (data.mineArray) {
                            var minCount = data.mineArray.length;
                            for (var k = minCount; k >=1; --k) {
                                var item = data.mineArray[k-1];
                                if (!item.playerId && item.mineLife > 0) {
                                    var data = yield conn.occupy(j, k, next);
                                    console.log("occupy", j, k, data);
                                    occupied = true;
                                    break;
                                }
                            }
                        }
                        if (occupied) {
                            break;
                        }
                    }
                }
                conn.quit();
            }
        }
        yield setTimeout(next, 5000);
    }

}, null);

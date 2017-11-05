
require("../server/FileManager");
require("../server/yzdzz/GameController");

$FileManager.RootDirectory = __dirname + "/..";

var isWeekend = new Date().getDay() == 0;
console.log("isWeekend", isWeekend, new Date().getDay());

var throwCard = true;
var occupyGem = false;

var accounts = [
    {u:"eyexiaohao001", p:"123456"},
    {u:"eyexiaohao002", p:"123456"},
    {u:"eyexiaohao003", p:"123456"},
    {u:"eyexiaohao004", p:"123456"},
    {u:"eyexiaohao005", p:"123456"},
];

if (false) {
    accounts.push({u:"lv35679183", p:"zhangpeng1989"});
    accounts.push({u:"13719987234", p:"xwWZT123"});
    accounts.push({u:"13801890722", p:"Q950318my"});
}

var servers = (isWeekend ? ["s95", "s96", "s93", "s94", ] : [ "s96", ]);

var friendUnion = (isWeekend ? ["b275705814a85d98", "b3b459f1b6a85a2a", "b3b455b0e2a85cc1"] : ["b275705814a85d98"]);
//var enemyUnion = (isWeekend ? ["b26d0533bba85c43"] : ["b3bdc946b8285de7", "b3b4461918285dc2"]);
var enemyUnion = (isWeekend ? [] : ["b3bdc946b8285de7", "b3b4461918285dc2"]);

var next = coroutine(function*() {

    var gameController = new GameController();
    var accountManager = gameController.getAccountManager();
    var accountKeys = [];
    for (var i = 0; i < accounts.length; ++i) {
        accountKeys.push(accountManager.add(accounts[i].u, accounts[i].p));
    }

    while(true) {
        for (var i = 0; i < accountKeys.length; ++i) {
            var conn = accountManager.connectAccount(accountKeys[i]);
            var data = yield conn.loginAccount(next);
            console.log("account", data.success);
            if (!data.success) {continue;}
            for (var m = 0; m < servers.length; ++m) {
                yield setTimeout(next, 100);
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
                            var card = data.card;
                            if (!card.ready) {
                                break;
                            }
                            if (card.isgood) {
                                for (var k = 0; k < friendUnion.length; ++k) {
                                    var data_usecard = yield conn.useCard(friendUnion[k], next);
                                }
                            } else {
                                for (var k = 0; k < enemyUnion.length; ++k) {
                                    var data_usecard = yield conn.useCard(enemyUnion[k], next);
                                }
                            }
                            break;
                        }
                    }
                }
                if (occupyGem) {
                    if (isWeekend) {
                        for (var j = 1; j <= 1; ++j) {
                            var occupied = false;
                            var data = yield conn.enterUnionWar(j, next);
                            if (data.mineArray) {
                                if (conn.getGameInfo().unionWarDouble < 100) {
                                    yield conn.buySpeed(300, next);
                                }
                                if (!data.hasSpeed) {
                                    yield conn.setSpeed(true, next);
                                }
                                var minCount = data.mineArray.length;
                                for (var k = minCount; k >=1; --k) {
                                    var item = data.mineArray[k-1];
                                    if (item.playerId && item.playerId == conn.getGameInfo().playerId) {
                                        occupied = true;
                                        break;
                                    }
                                    if (!item.playerId && item.mineLife > 0) {
                                        var data_occupy = yield conn.occupy(j, k, next);
                                        console.log("occupy", j, k, data_occupy);
                                        occupied = true;
                                        break;
                                    }
                                }
                            }
                            if (occupied) {
                                break;
                            }
                        }
                    } else {
                        for (var j = 4; j >= 4; --j) {
                            var occupied = false;
                            var data = yield conn.enterUnionWar(j, next);
                            if (data.mineArray) {
                                if (!data.hasSpeed) {
                                    yield conn.buySpeed(200, next);
                                    yield conn.setSpeed(true, next);
                                }
                                var minCount = data.mineArray.length;
                                for (var k = minCount; k >= 6; --k) {
                                    var item = data.mineArray[k-1];
                                    if (item.playerId && item.playerId == conn.getGameInfo().playerId) {
                                        occupied = true;
                                        break;
                                    }
                                    if (!item.playerId && item.mineLife > 0) {
                                        var data_occupy = yield conn.occupy(j, k, next);
                                        console.log("occupy", j, k, data_occupy);
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
                }
                conn.quit();
            }
        }
        console.log("waiting 5 seconds");
        yield setTimeout(next, 5000);
    }

}, null);


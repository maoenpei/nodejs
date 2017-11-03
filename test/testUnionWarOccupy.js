
require("../server/FileManager");
require("../server/yzdzz/GameController");
require("../server/StateManager");

GAME_POWER_MAX_CONFIG = "GamePowerMax.d";
$FileManager.RootDirectory = __dirname + "/..";

var isWeekend = new Date().getDay() == 0;

var accounts = [
    {u:"18551855876", p:"sdw123456"},
    {u:"tree44", p:"12345678"},
    {u:"15171335812", p:"12345678"},
    {u:"18983624927", p:"123456"},
    {u:"18757594952", p:"123456"},
    {u:"15831667796", p:"123456"},
    {u:"14741221200", p:"long123"},
    {u:"lv35679183", p:"zhangpeng1989"},
    {u:"13719987234", p:"xwWZT123"},
    {u:"13801890722", p:"Q950318my"},
];

var selfUnion = "b275705814a85d98";

var landTargets = (isWeekend ? [7, 3, 2, 1, 4, 5, 6, 8, 9] : [4, 1, 3, 2, 5, 6, 7, 8, 9]);

var friendUnion = ["b26d0533bba85c43"];
var enemyUnion = [];

var next = coroutine(function*() {

    var gameController = new GameController();
    var accountManager = gameController.getAccountManager();
    yield $StateManager.openState(GAME_POWER_MAX_CONFIG, null, next);
    var allPowerMax = $StateManager.getState(GAME_POWER_MAX_CONFIG);
    var accountKeys = [];
    for (var i = 0; i < accounts.length; ++i) {
        accountKeys.push(accountManager.add(accounts[i].u, accounts[i].p));
    }

    while(true) {
        for (var i = 0; i < accountKeys.length; ++i) {
            var conn = accountManager.connectAccount(accountKeys[i]);
            var data = yield conn.loginAccount(next);
            if (!data.success) {continue;}
            var data = yield conn.loginGame("s96", next);
            if (!data.success) {continue;}
            var data = yield conn.getUnionWar(next);
            if (!data.isOpen) {
                console.log("union war closed");
                conn.quit();
                continue;
            }
            for (var j = 0; j < landTargets.length; ++j) {
                var landId = landTargets[j];
                var data = yield conn.enterUnionWar(landId, next);
                if (data.mineArray) {
                    // use card
                    var card = data.card;
                    if (isWeekend && card.ready) {
                        if (card.isgood) {
                            for (var k = 0; k < friendUnion.length; ++k) {
                                var data_usecard = yield conn.useCard(friendUnion[k], next);
                                if (data_usecard.success) {
                                    break;
                                }
                            }
                        } else {
                            for (var k = 0; k < enemyUnion.length; ++k) {
                                var data_usecard = yield conn.useCard(enemyUnion[k], next);
                                if (data_usecard.success) {
                                    break;
                                }
                            }
                        }
                    }
                    // get mine targets
                    var mineCount = data.mineArray.length;
                    var mineIndices = [];
                    if (isWeekend) {
                        if (conn.getGameInfo().unionWarDouble < 100) {
                            yield conn.buySpeed(300, next);
                        }
                        if (!data.hasSpeed) {
                            yield conn.setSpeed(true, next);
                        }
                        mineIndices = data.mineArray;
                    } else {
                        var avoidCount = Math.floor(data.mineArray.length / 2);
                        for (var k = mineCount-1; k > avoidCount-1; --k) {
                            mineIndices.push(data.mineArray[k]);
                        }
                    }
                    var selfOccupy = 100;
                    var bestOccupy = 100;
                    var bestFight = 100;
                    var worstFight = 100;
                    for (var k = 0; k < mineIndices.length; ++k) {
                        var mineData = mineIndices[k];
                        if (conn.getGameInfo().playerId == mineData.playerId) {
                            selfOccupy = mineData.pos;
                        }
                        if (mineData.mineLife > 0 && !mineData.playerId) {
                            if (mineData.pos < bestOccupy) {
                                bestOccupy = mineData.pos;
                            }
                        }
                        if (mineData.playerId && (mineData.unionId != selfUnion)) {
                            if (mineData.pos < worstFight) {
                                worstFight = mineData.pos;
                            }
                            if (conn.getGameInfo().power + 200000 > allPowerMax[mineData.playerId].maxPower){
                                if (mineData.pos < bestFight) {
                                    bestFight = mineData.pos;
                                }
                            }
                        }
                    }
                    var justOccupy = false;
                    bestFight = (bestFight == 100 ? worstFight : bestFight);
                    if (bestFight != 100 && (selfOccupy == 100 || bestFight < selfOccupy)) {
                        var data_fire = yield conn.fire(landId, bestFight, next);
                        if (data_fire.success) {
                            selfOccupy = 100;
                            var data_occupy = yield conn.occupy(landId, bestFight, next);
                            if (data_occupy.success) {
                                selfOccupy = bestFight;
                                justOccupy = true;
                            }
                        }
                    }
                    if (!justOccupy && bestOccupy != 100 && (selfOccupy == 100 || bestOccupy < selfOccupy)) {
                        var data_occupy = yield conn.occupy(landId, bestOccupy, next);
                        if (data_occupy.success) {
                            selfOccupy = bestOccupy;
                        }
                    }
                    if (selfOccupy != 100) {
                        break;
                    }
                }
            }
            conn.quit();
            yield setTimeout(next, 200);
        }
        console.log("waiting 5 seconds");
        yield setTimeout(next, 5000);
    }

}, null);

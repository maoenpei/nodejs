
require("../server/FileManager");
require("../server/yzdzz/GameController");
require("../server/StateManager");

GAME_POWER_MAX_CONFIG = "GamePowerMax.d";
$FileManager.RootDirectory = __dirname + "/..";

var accounts = [
    {u:"18551855876", p:"sdw123456"},
    {u:"tree44", p:"12345678"},
    {u:"18757594952", p:"123456"},
    {u:"15831667796", p:"123456"},
    {u:"14741221200", p:"long123"},
    {u:"lv35679183", p:"zhangpeng1989"},
    {u:"13719987234", p:"xwWZT123"},
    {u:"13801890722", p:"Q950318my"},
    {u:"13758796288", p:"087200"},
    {u:"nanochill", p:"chong68150287"}, // 小丸小号

    {u:"15171335812", p:"12345678", nonWeekend: true}, // Akon
    {u:"18983624927", p:"123456", nonWeekend: true}, // 突然的自我

    {u:"18367890817", p:"62252377"}, // 挖机
    {u:"18066212025", p:"1234567j"}, // 审判
    {u:"13625821126", p:"gxf396466"}, // 白菜
    {u:"reggiesun", p:"f1032277"}, // 二哥
    {u:"13819153071", p:"123456"}, // 头很铁
    {u:"13913945392", p:"816476"}, // 幻影
    {u:"15880877841", p:"3802832"}, // 顺金
    {u:"13671682107", p:"1234567a"}, // 恶人
    {u:"18604449044", p:"jizai1314"}, // Lc
    //{u:"18963940530", p:"3135134162"}, // 风继续吹
    //{u:"13862891792", p:"gch900708"}, // 殇
    //{u:"13917312804", p:"patm002"}, // 闰土
    //{u:"18030367128", p:"1234567"}, // 闷骚鱼
    {u:"13915642097", p:"hs661119"}, // 小丸
    {u:"13560446211", p:"17140456"}, // 雷顿皇
];

var selfUnion = "b275705814a85d98";

var gameController = new GameController();
var accountManager = gameController.getAccountManager();
var allPowerMax = null;
var occupyEnd = null;
var dropDelay = new Date();

var doUnionWarOccupy = () => {
    var next = coroutine(function*() {

        var isWeekend = new Date().getDay() == 0;
        console.log("isWeekend", isWeekend);
        var cycle = 0;

        var landTargets = (isWeekend ? [7, 3, 2, 1, 4, 5, 6, 8, 9] : [4, 3, 1, 2]);
        //var landTargets = (isWeekend ? [7, 1, 2, 3] : [4, 3, 1, 2]);

        //var friendUnion = (isWeekend ? ["b26d0533bba85c43"] : []);
        var friendUnion = (isWeekend ? ["b2726df76e285c3b","b2683ff563285b91","b263d8a30f285a73"] : []);
        //var enemyUnion = (isWeekend ? ["b26d0533bba85c43"] : []);
        var enemyUnion = (isWeekend ? [] : []);

        if (!allPowerMax) {
            yield $StateManager.openState(GAME_POWER_MAX_CONFIG, next);
            allPowerMax = $StateManager.getState(GAME_POWER_MAX_CONFIG);
        }

        var accountKeys = [];
        for (var i = 0; i < accounts.length; ++i) {
            if (!isWeekend || !accounts[i].nonWeekend) {
                accountKeys.push(accountManager.add(accounts[i].u, accounts[i].p));
            }
        }

        while(true) {
            var joinCount = 0;
            var someoneFull = false;
            for (var i = 0; i < accountKeys.length; ++i) {
                var conn = accountManager.connectAccount(accountKeys[i]);
                var data = yield conn.loginAccount(next);
                if (!data.success) {continue;}
                var data = yield conn.loginGame("s96", next);
                if (!data.success) {continue;}
                var data_UnionWar = yield conn.getUnionWar(next);
                if (!data_UnionWar.isOpen) {
                    console.log("union war closed");
                    conn.quit();
                    continue;
                }
                var allFull = true;
                for (var j = 0; j < landTargets.length; ++j) {
                    var landId = landTargets[j];
                    if (data_UnionWar.lands[landId]) {
                        console.log("land occupied:", landId);
                        continue;
                    }
                    allFull = false;
                    var data = yield conn.enterUnionWar(landId, next);
                    if (data.mineArray) {
                        // use card
                        var card = data.card;
                        if (isWeekend && card.ready && new Date() > dropDelay) {
                            if (card.isgood) {
                                var friendUnionId = friendUnion.random();
                                if (friendUnionId) {
                                    var data_usecard = yield conn.useCard(friendUnionId, next);
                                }
                            } else {
                                var enemyUnionId = enemyUnion.random();
                                if (enemyUnionId) {
                                    var data_usecard = yield conn.useCard(enemyUnion[k], next);
                                }
                            }
                            var nowTick = new Date().getTime();
                            dropDelay = new Date(nowTick + rand(3000));
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
                            for (var k = 0; k < mineCount - 3; ++k) {
                                mineIndices.push(data.mineArray[k]);
                            }
                        } else {
                            var avoidCount = Math.floor(data.mineArray.length / 2);
                            for (var k = mineCount-1; k > avoidCount-1; --k) {
                                mineIndices.push(data.mineArray[k]);
                            }
                        }
                        var selfOccupy = 100;
                        var originOccupy = 100;
                        var bestOccupy = 100;
                        var bestFight = 100;
                        var worstFights = [];
                        for (var k = 0; k < mineIndices.length; ++k) {
                            var mineData = mineIndices[k];
                            if (conn.getGameInfo().playerId == mineData.playerId) {
                                selfOccupy = mineData.pos;
                                originOccupy = mineData.pos;
                            }
                            if (mineData.mineLife > 0 && !mineData.playerId) {
                                if (mineData.pos < bestOccupy) {
                                    bestOccupy = mineData.pos;
                                }
                            }
                            if (mineData.playerId && (mineData.unionId != selfUnion)) {
                                worstFights.push(mineData.pos);
                                maxPowerPlayer = allPowerMax[mineData.playerId];
                                if (!maxPowerPlayer || conn.getGameInfo().power + 200000 > maxPowerPlayer.maxPower){
                                    if (mineData.pos < bestFight) {
                                        bestFight = mineData.pos;
                                    }
                                }
                            }
                        }
                        var justOccupy = false;
                        bestFight = (bestFight == 100 ? worstFights.random() : bestFight);
                        if (bestFight != 100 && (selfOccupy == 100 || bestFight < selfOccupy)) {
                            var data_fire = yield conn.fire(landId, bestFight, next);
                            // fire will lose current pos
                            bestOccupy = (originOccupy < bestOccupy ? originOccupy : bestOccupy);
                            console.log("data_fire", data_fire);
                            if (data_fire.success) {
                                selfOccupy = 100;
                                var data_occupy = yield conn.occupy(landId, bestFight, next);
                                console.log("data_occupy", data_occupy);
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
                            joinCount++;
                            break;
                        }
                    }
                }
                conn.quit();
                if (allFull) {
                    someoneFull = true;
                    break;
                }
                yield setTimeout(next, 200);
            }
            if (someoneFull) {
                console.log("union lands are full!");
                break;
            }
            if (joinCount > 0 && !isWeekend){
                console.log("one cycle!");
                break;
            }
            console.log("waiting 2 seconds");
            yield setTimeout(next, 2000);
        }

        for (var i = 0; i < accountKeys.length; ++i) {
            accountManager.remove(accountKeys[i]);
        }
        if (occupyEnd) {
            occupyEnd();
        }

    }, null);
};

var startTime = new Date();
startTime.setHours(19, 59, 55, 0);
if (new Date() > startTime) {
//if (true) {
    doUnionWarOccupy();
} else {
    var timingManager = new TimingManager();
    //var eventKey = timingManager.setDailyEvent(20, 0, 45, doUnionWarOccupy);
    var eventKey = timingManager.setDailyEvent(20, 0, 1, doUnionWarOccupy);
    occupyEnd = () => {
        timingManager.unsetEvent(eventKey);
    }
}

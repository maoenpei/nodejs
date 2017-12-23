
require("../server/FileManager");
require("../server/Mutex");
require("../server/StateManager");
require("../server/TaskManager");
require("../server/yzdzz/GameController");

$FileManager.RootDirectory = __dirname + "/..";

GAME_ACCOUNTS_CONFIG = "GameAcounts.d";
GAME_DEFAULTS_CONFIG = "GameDefaults.d";
GAME_SETTING_CONFIG = "GameSetting.d";
GAME_KINGWAR_CONFIG = "GameKingwar.d";
GAME_POWER_MAX_CONFIG = "GamePowerMax.d";
GAME_UNIONS_CONFIG = "GameUnions.d";

// TIMING
// KINGWAR
// NOPE
TEST_TYPE = "NOPE";

var next = coroutine(function*() {
    var gameController = new GameController();
    var accountManager = gameController.getAccountManager();

    yield $StateManager.openState(GAME_ACCOUNTS_CONFIG, next);
    yield $StateManager.openState(GAME_SETTING_CONFIG, next);
    yield $StateManager.openState(GAME_DEFAULTS_CONFIG, next);
    yield $StateManager.openState(GAME_KINGWAR_CONFIG, next);
    yield $StateManager.openState(GAME_POWER_MAX_CONFIG, next);
    yield $StateManager.openState(GAME_UNIONS_CONFIG, next);

    var defaultsStates = $StateManager.getState(GAME_DEFAULTS_CONFIG);
    var allKingwars = $StateManager.getState(GAME_KINGWAR_CONFIG);
    gameController.restoreKingwar(allKingwars);
    var allPowerMax = $StateManager.getState(GAME_POWER_MAX_CONFIG);
    gameController.restorePlayers(allPowerMax);

    if (TEST_TYPE == "KINGWAR") {
        var taskManager = new TaskManager((tasks, total) => {
            if (tasks.length == total) {
                gameController.targetingAssignment(tasks, defaultsStates.targeting);
            }
        });
        var players = [];
        if (false) {
            for (var i = 0; i < 6; ++i) {
                players.push({
                    power: rand(6000000) + 10000000,
                    minStar: rand(3) + 1,
                    name: rkey().substr(0, 4),
                });
            }
        } else {
            var playerIds = [
                "b2796cb3a0a85d60",
                "b27abadbd0285d54",
                "b2747e3ad9285dfa",
                "b27a48e4fb285dbf",
                "b27493b6bea85d44",
                "b274882e36a85d19",
                "b2745c5cc1a85d5a", 
                "b27c2f7a72285d28", 
                "b27846ea01a85d60",
                "b278313457285d17",
                "b2746a6167a85d9e",
                "b276ab061a285d09",
                "b27451e8c5285d2b",
                "b2793081de285da7",
                "b274a29c41a85d78",
            ];
            for (var i = 0; i < playerIds.length; ++i) {
                var playerId = playerIds[i];
                var data = allPowerMax[playerId];
                players.push({
                    power: data.maxPower,
                    minStar: 1,
                    name: data.name,
                });
            }
        }
        for (var i = 0; i < players.length; ++i) {
            (() => {
                var index = i;
                var taskItem = taskManager.addTask();
                var tnext = coroutine(function*() {
                    yield setTimeout(tnext, rand(500) + 500);
                    var playerData = players[index];
                    var kingwarKey = yield taskItem.getAssignment(playerData, tnext);
                    console.log("-- kingwar assignment -- assign target", kingwarKey, Math.floor(playerData.power / 10000), playerData.name);
                });
            })();
        }
    } else if (TEST_TYPE == "TIMING") {
        var timingManager = new TimingManager();
        var key = timingManager.setWeeklyEvent(2, 23, 14, 0, () => {
            console.log("now!!", new Date());
            timingManager.unsetEvent(key);
        });
    } else if (TEST_TYPE == "NOPE") {
        for (var i = 0; i < 50; ++i) {
            yield $StateManager.commitState(GAME_UNIONS_CONFIG, next);
        }
    }
});

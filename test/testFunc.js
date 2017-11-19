
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
TEST_TYPE = "KINGWAR";

var next = coroutine(function*() {
    var gameController = new GameController();
    var accountManager = gameController.getAccountManager();

    yield $StateManager.openState(GAME_ACCOUNTS_CONFIG, null, next);
    yield $StateManager.openState(GAME_SETTING_CONFIG, null, next);
    yield $StateManager.openState(GAME_DEFAULTS_CONFIG, null, next);
    yield $StateManager.openState(GAME_KINGWAR_CONFIG, null, next);
    yield $StateManager.openState(GAME_POWER_MAX_CONFIG, null, next);
    yield $StateManager.openState(GAME_UNIONS_CONFIG, null, next);

    var defaultsStates = $StateManager.getState(GAME_DEFAULTS_CONFIG);
    var allKingwars = $StateManager.getState(GAME_KINGWAR_CONFIG);
    gameController.restoreKingwar(allKingwars);
    var allPowerMax = $StateManager.getState(GAME_POWER_MAX_CONFIG);
    gameController.restorePlayers(allPowerMax);

    if (TEST_TYPE == "KINGWAR") {
        var taskManager = new TaskManager((tasks, total) => {
            if (tasks.length == total) {
                gameController.kingwarAssignment(tasks, defaultsStates.targeting);
            }
        });
        for (var i = 0; i < 6; ++i) {
            (() => {
                var index = i;
                var taskItem = taskManager.addTask();
                var tnext = coroutine(function*() {
                    yield setTimeout(tnext, rand(500) + 500);
                    var playerData = {power: rand(6000000) + 10000000, minStar: rand(3) + 1};
                    var kingwarKey = yield taskItem.getAssignment(playerData, tnext);
                    console.log("assigned", index, Math.floor(playerData.power / 10000), playerData.minStar, kingwarKey);
                });
            })();
        }
    } else if (TEST_TYPE == "TIMING") {
        var timingManager = new TimingManager();
        var key = timingManager.setWeeklyEvent(2, 23, 14, 0, () => {
            console.log("now!!", new Date());
            timingManager.unsetEvent(key);
        });
    }
});

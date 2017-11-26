
require("../server/FileManager");
require("../server/Mutex");
require("../server/StateManager");
require("../server/TaskManager");
require("../server/yzdzz/GameController");

$FileManager.RootDirectory = __dirname + "/..";

USER_CONFIG = "UserStates.d";

GAME_ACCOUNTS_CONFIG = "GameAcounts.d";
GAME_DEFAULTS_CONFIG = "GameDefaults.d";
GAME_SETTING_CONFIG = "GameSetting.d";

GAME_POWER_MAX_CONFIG = "GamePowerMax.d";
GAME_UNIONS_CONFIG = "GameUnions.d";
GAME_KINGWAR_CONFIG = "GameKingwar.d";
GAME_PLAYER_NAME_CONFIG = "GamePlayerNames.d";


var next = coroutine(function*() {

    yield $StateManager.openState(USER_CONFIG, next);
    yield $StateManager.openState(GAME_ACCOUNTS_CONFIG, next);
    yield $StateManager.openState(GAME_SETTING_CONFIG, next);
    yield $StateManager.openState(GAME_DEFAULTS_CONFIG, next);
    yield $StateManager.openState(GAME_KINGWAR_CONFIG, next);
    yield $StateManager.openState(GAME_POWER_MAX_CONFIG, next);
    yield $StateManager.openState(GAME_UNIONS_CONFIG, next);
    yield $StateManager.openState(GAME_PLAYER_NAME_CONFIG, next);

    var stateUser = $StateManager.getState(USER_CONFIG);
    var stateAccounts = $StateManager.getState(GAME_ACCOUNTS_CONFIG);
    var stateSetting = $StateManager.getState(GAME_SETTING_CONFIG);
    var stateDefaults = $StateManager.getState(GAME_DEFAULTS_CONFIG);
    var stateKingwar = $StateManager.getState(GAME_KINGWAR_CONFIG);
    var statePowerMax = $StateManager.getState(GAME_POWER_MAX_CONFIG);
    var stateUnions = $StateManager.getState(GAME_UNIONS_CONFIG);
    var statePlayerName = $StateManager.getState(GAME_PLAYER_NAME_CONFIG);

    var playerKeys = [];
    for (var playerKey in stateAccounts.players) {
        playerKeys.push(playerKey);
    }
    var repeatKeys = {};
    for (var i = 0; i < playerKeys.length; ++i) {
        var key1 = playerKeys[i];
        var player1 = stateAccounts.players[key1];
        for (var j = i + 1; j < playerKeys.length; ++j) {
            var key2 = playerKeys[j];
            var player2 = stateAccounts.players[key2];
            if (player1.account == player2.account && player1.server == player2.server) {
                if (!repeatKeys[key2]) {
                    repeatKeys[key2] = key1;
                }
            }
        }
    }

    for (var userKey in stateUser.users) {
        var userData = stateUser.users[userKey];
        if (userData.players) {
            for (var i = 0; i < userData.players.length; ++i) {
                var playerKey = userData.players[i];
                var playerTarget = repeatKeys[playerKey];
                if (playerTarget) {
                    userData.players.splice(i, 1, playerTarget);
                }
            }
        }
    }
    for (var repeated in repeatKeys) {
        var target = repeatKeys[repeated];

        delete stateAccounts.players[repeated];
        delete statePlayerName[repeated];
        if (stateSetting.automation[repeated]) {
            stateSetting.automation[target] = stateSetting.automation[repeated];
            delete stateSetting.automation[repeated];
        }
    }

    yield $StateManager.commitState(USER_CONFIG, next);
    yield $StateManager.commitState(GAME_ACCOUNTS_CONFIG, next);
    yield $StateManager.commitState(GAME_SETTING_CONFIG, next);
    yield $StateManager.commitState(GAME_KINGWAR_CONFIG, next);
    yield $StateManager.commitState(GAME_POWER_MAX_CONFIG, next);
    yield $StateManager.commitState(GAME_UNIONS_CONFIG, next);
    yield $StateManager.commitState(GAME_PLAYER_NAME_CONFIG, next);

}, null);

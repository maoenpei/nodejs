
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

    var briefs = clone(statePlayerName);
    for (var playerKey in statePlayerName) {
        delete statePlayerName[playerKey];
    }
    statePlayerName.savedDay = -1;
    statePlayerName.briefs = briefs;
    statePlayerName.daily = {};

    yield $StateManager.commitState(USER_CONFIG, next);
    yield $StateManager.commitState(GAME_ACCOUNTS_CONFIG, next);
    yield $StateManager.commitState(GAME_SETTING_CONFIG, next);
    yield $StateManager.commitState(GAME_KINGWAR_CONFIG, next);
    yield $StateManager.commitState(GAME_POWER_MAX_CONFIG, next);
    yield $StateManager.commitState(GAME_UNIONS_CONFIG, next);
    yield $StateManager.commitState(GAME_PLAYER_NAME_CONFIG, next);

}, null);

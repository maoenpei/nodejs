
require("../Base");
require("../LoginManager");
require("../StateManager");
require("./GameController");

var RefreshInterval = 60 * 6;

GAME_ACCOUNTS_CONFIG = "GameAcounts.d";
GAME_SETTING_CONFIG = "GameSetting.d";
GAME_POWER_MAX_CONFIG = "GamePowerMax.d";
GAME_UNIONS_CONFIG = "GameUnions.d";

var allFuncs = [
    {name:"refresh", authBase:2},
    {name:"kingwar", authBase:1},
    {name:"playerlist", authBase:1},
    {name:"serverInfo", authBase:1},
    {name:"automation", authBase:2},
    {name:"setting", authBase:3},
    {name:"users", authBase:3},
];

$HttpModel.addClass({
    _constructor:function(httpServer) {
        this.httpServer = httpServer;
        this.controller = new GameController();
        this.accountManager = this.controller.getAccountManager();
        this.accounts = {};

        this.playersMd5 = "";
        this.unionMd5 = "";
        this.onRefreshEnd = [];

        httpServer.registerCommand("checkrefresh", this);
        httpServer.registerCommand("manrefresh", this);
        httpServer.registerCommand("playersinfo", this);
        httpServer.registerCommand("kingwarinfo", this);
        httpServer.registerCommand("functions", this);
    },
    initialize:function(done) {
        var next = coroutine(function*() {
            yield $StateManager.openState(GAME_ACCOUNTS_CONFIG, null, next);
            var accountStates = $StateManager.getState(GAME_ACCOUNTS_CONFIG);
            for (var key in accountStates.players) {
                var playerInfo = accountStates.players[key];
                var accountInfo = accountStates.accounts[playerInfo.account];
                this.accounts[key] = {
                    username:accountInfo.username,
                    accountKey:this.accountManager.add(accountInfo.username, accountInfo.password),
                    server: playerInfo.server,
                };
            }
            yield $StateManager.openState(GAME_POWER_MAX_CONFIG, null, next);
            var allPowerMax = $StateManager.getState(GAME_POWER_MAX_CONFIG);
            this.controller.setMaxPowers(allPowerMax);
            yield $StateManager.openState(GAME_UNIONS_CONFIG, null, next);

            yield this.refreshAccounts(next);
            safe(done)();
        }, this);
    },
    refreshAccounts:function(done) {
        var next = coroutine(function*() {
            yield $StateManager.openState(GAME_SETTING_CONFIG, null, next);
            var settingStates = $StateManager.getState(GAME_SETTING_CONFIG);
            for (var player in settingStates.automation.configs) {
                var automationConfig = settingStates.automation.configs[player];
                var playerInfo = this.accounts[player];
                var autoConfigs = {};
                for (var configType in settingStates.automation.defaults) {
                    if (automationConfig[configType]) {
                        autoConfigs[configType] = automationConfig[configType];
                    } else {
                        autoConfigs[configType] = settingStates.automation.defaults[configType];
                    }
                }
                playerInfo.refreshAutomationKey =
                    this.controller.setPlayerAutomation(playerInfo.accountKey, playerInfo.server, 3, autoConfigs);
            }
            for (var i = 0; i < settingStates.players.length; ++i) {
                var playerConfig = settingStates.players[i];
                var playerInfo = this.accounts[playerConfig.player];
                playerInfo.refreshPlayerKey =
                    this.controller.setPlayerListAccount(playerInfo.accountKey, playerInfo.server, 1, 10, 3000000, 8000000, 20);
            }
            for (var i = 0; i < settingStates.kingwar.length; ++i) {
                var kingwarConfig = settingStates.kingwar[i];
                var playerInfo = this.accounts[kingwarConfig.player];
                playerInfo.refreshKingwarKey =
                    this.controller.setKingwarAccount(playerInfo.accountKey, playerInfo.server, 1, kingwarConfig.area, kingwarConfig.star);
            }
            this.doRefresh();
            safe(done)();
        }, this);
    },
    doRefresh:function() {
        var refreshCallback = (done) => {
            var next = coroutine(function*() {
                var players = this.controller.getPlayers();
                var md5 = this.getTag(players);
                if (this.playersMd5 != md5) {
                    this.playersMd5 = md5;
                    var allPowerMax = $StateManager.getState(GAME_POWER_MAX_CONFIG);
                    for (var playerId in players) {
                        allPowerMax[playerId] = {
                            name: players[playerId].name,
                            maxPower: players[playerId].maxPower,
                        };
                    }
                    yield $StateManager.commitState(GAME_POWER_MAX_CONFIG, next);
                }
                var unions = this.controller.getUnions();
                var md5 = this.getTag(unions);
                if (this.unionMd5 != md5) {
                    this.unionMd5 = md5;
                    var allUnions = $StateManager.getState(GAME_UNIONS_CONFIG);
                    for (var unionId in unions) {
                        allUnions[unionId] = unions[unionId];
                    }
                    yield $StateManager.commitState(GAME_UNIONS_CONFIG, next);
                }
                if (this.onRefreshEnd.length > 0) {
                    for (var i = 0; i < this.onRefreshEnd.length; ++i) {
                        this.onRefreshEnd[i](true);
                    }
                    this.onRefreshEnd = [];
                }
                safe(done)();
            }, this);
        };
        this.controller.cancelRefresh();
        this.controller.startRefresh(RefreshInterval, refreshCallback);
    },
    noConfliction:function(fun) {
        if (this.controller.isRefreshing()) {
            this.onRefreshEnd.push(fun);
            return true;
        } else {
            fun(false);
            return false;
        }
    },

    checkrefresh:function(requestor, responder, done) {
        var next = coroutine(function*() {
            if (requestor.getMethod() == "GET") {
                responder.addError("Not valid for 'GET' method.");
                return responder.respondJson({}, done);
            }

            var obj = yield this.httpServer.tokenValid(requestor, next);
            if (!obj) {
                responder.addError("Not valid token for logout.");
                return responder.respondJson({}, done);
            }

            var userStates = $StateManager.getState(USER_CONFIG);
            var keyData = userStates.keys[obj.getSerial()];
            if (!keyData || !keyData.userKey) {
                responder.addError("Not an authorized user.");
                return responder.respondJson({}, done);
            }

            var userData = userStates.users[keyData.userKey];
            if (!userData || userData.auth < 2) {
                responder.addError("Admin level not enough.");
                return responder.respondJson({}, done);
            }

            var json = yield requestor.visitBodyJson(next);
            if (!json || !json.nexus) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            responder.respondJson({
                success: true,
                isRefresh: this.controller.isRefreshing(),
            }, done);
        }, this);
    },
    manrefresh:function(requestor, responder, done) {
        var next = coroutine(function*() {
            if (requestor.getMethod() == "GET") {
                responder.addError("Not valid for 'GET' method.");
                return responder.respondJson({}, done);
            }

            var obj = yield this.httpServer.tokenValid(requestor, next);
            if (!obj) {
                responder.addError("Not valid token for logout.");
                return responder.respondJson({}, done);
            }

            var userStates = $StateManager.getState(USER_CONFIG);
            var keyData = userStates.keys[obj.getSerial()];
            if (!keyData || !keyData.userKey) {
                responder.addError("Not an authorized user.");
                return responder.respondJson({}, done);
            }

            var userData = userStates.users[keyData.userKey];
            if (!userData || userData.auth < 2) {
                responder.addError("Admin level not enough.");
                return responder.respondJson({}, done);
            }

            var json = yield requestor.visitBodyJson(next);
            if (!json || !json.integrity) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var delay = this.noConfliction((delayed) => {
                this.doRefresh();
            });

            responder.respondJson({
                success: true,
                isDelay: delay,
            }, done);
        }, this);
    },
    playersinfo:function(requestor, responder, done) {
        var next = coroutine(function*() {
            var obj = yield this.httpServer.tokenValid(requestor, next);
            if (!obj) {
                responder.addError("Not valid token for logout.");
                return responder.respondJson({}, done);
            }

            var userStates = $StateManager.getState(USER_CONFIG);
            var keyData = userStates.keys[obj.getSerial()];
            if (!keyData || !keyData.userKey) {
                responder.addError("Not an authorized user.");
                return responder.respondJson({}, done);
            }

            var userData = userStates.users[keyData.userKey];
            if (!userData || userData.auth < 1) {
                responder.addError("Admin level not enough.");
                return responder.respondJson({}, done);
            }

            var playersData = this.controller.getSortedPlayers(100);
            var tag = this.getTag(playersData);
            if (!requestor.compareTags(tag)) {
                responder.setCode(304);
                return responder.respondData(Buffer.alloc(0), safe(done));
            }

            responder.setTag(tag);
            responder.respondJson({
                players: playersData,
            }, done);
        }, this);
    },
    kingwarinfo:function(requestor, responder, done) {
        var next = coroutine(function*() {
            var obj = yield this.httpServer.tokenValid(requestor, next);
            if (!obj) {
                responder.addError("Not valid token for logout.");
                return responder.respondJson({}, done);
            }

            var userStates = $StateManager.getState(USER_CONFIG);
            var keyData = userStates.keys[obj.getSerial()];
            if (!keyData || !keyData.userKey) {
                responder.addError("Not an authorized user.");
                return responder.respondJson({}, done);
            }

            var userData = userStates.users[keyData.userKey];
            if (!userData || userData.auth < 1) {
                responder.addError("Admin level not enough.");
                return responder.respondJson({}, done);
            }

            var kingwarData = this.controller.getKingwar();
            var tag = this.getTag(kingwarData);
            if (!requestor.compareTags(tag)) {
                responder.setCode(304);
                return responder.respondData(Buffer.alloc(0), safe(done));
            }
            responder.setTag(tag);
            responder.respondJson({
                areastars:kingwarData,
            }, done);
        }, this);
    },
    functions:function(requestor, responder, done) {
        var next = coroutine(function*() {
            var obj = yield this.httpServer.tokenValid(requestor, next);
            if (!obj) {
                responder.addError("Not valid token for logout.");
                return responder.respondJson({}, done);
            }

            var userStates = $StateManager.getState(USER_CONFIG);
            var keyData = userStates.keys[obj.getSerial()];
            if (!keyData || !keyData.userKey) {
                responder.addError("Not an authorized user.");
                return responder.respondJson({}, done);
            }

            var userData = userStates.users[keyData.userKey];
            if (!userData || userData.auth < 1) {
                responder.addError("Admin level not enough.");
                return responder.respondJson({}, done);
            }

            var funcs = [];
            for (var i = 0; i < allFuncs.length; ++i) {
                if (userData.auth >= allFuncs[i].authBase) {
                    funcs.push(allFuncs[i].name);
                }
            }

            responder.respondJson({funcs:funcs}, done);
        }, this);
    },
});

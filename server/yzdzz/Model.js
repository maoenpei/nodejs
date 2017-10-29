
require("../Base");
require("../LoginManager");
require("../StateManager");
require("./GameController");

var RefreshInterval = 60 * 6;

GAME_ACCOUNTS_CONFIG = "GameAcounts.d";
GAME_DEFAULTS_CONFIG = "GameDefaults.d";
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
        this.players = {};

        this.playersMd5 = "";
        this.unionMd5 = "";
        this.onRefreshEnd = [];

        httpServer.registerCommand("addaccount", this);
        httpServer.registerCommand("delaccount", this);
        httpServer.registerCommand("addplayer", this);
        httpServer.registerCommand("delplayer", this);
        httpServer.registerCommand("playerautomation", this);
        httpServer.registerCommand("playermanual", this);
        httpServer.registerCommand("listautomation", this);
        httpServer.registerCommand("checkrefresh", this);
        httpServer.registerCommand("manrefresh", this);
        httpServer.registerCommand("listplayers", this);
        httpServer.registerCommand("listkingwars", this);
        httpServer.registerCommand("functions", this);
    },
    initialize:function(done) {
        var next = coroutine(function*() {
            yield $StateManager.openState(GAME_ACCOUNTS_CONFIG, null, next);
            var accountStates = $StateManager.getState(GAME_ACCOUNTS_CONFIG);
            for (var accountKey in accountStates.accounts) {
                var accountInfo = accountStates.accounts[accountKey];
                this.addAccount(accountKey, accountInfo.username,
                                this.accountManager.add(accountInfo.username, accountInfo.password));
            }
            for (var playerKey in accountStates.players) {
                var playerInfo = accountStates.players[playerKey];
                this.addPlayer(playerKey, playerInfo.account, playerInfo.server);
            }
            yield $StateManager.openState(GAME_SETTING_CONFIG, null, next);
            yield $StateManager.openState(GAME_DEFAULTS_CONFIG, null, next);
            yield $StateManager.openState(GAME_POWER_MAX_CONFIG, null, next);
            var allPowerMax = $StateManager.getState(GAME_POWER_MAX_CONFIG);
            this.controller.setMaxPowers(allPowerMax);
            yield $StateManager.openState(GAME_UNIONS_CONFIG, null, next);

            yield this.startRefreshSettings(next);
            safe(done)();
        }, this);
    },
    erasePlayerSettings:function(playerKey) {
        var changed = false;
        var settingStates = $StateManager.getState(GAME_SETTING_CONFIG);
        if (settingStates.automation[playerKey]) {
            delete settingStates.automation[playerKey];
            changed = true;
        }
        if (settingStates.playerinfo[playerKey]) {
            delete settingStates.playerinfo[playerKey];
            changed = true;
        }
        if (settingStates.kingwar[playerKey]) {
            delete settingStates.kingwar[playerKey];
            changed = true;
        }
        return changed;
    },
    startRefreshSettings:function(done) {
        var next = coroutine(function*() {
            var settingStates = $StateManager.getState(GAME_SETTING_CONFIG);
            for (var playerKey in settingStates.automation) {
                var automationConfig = settingStates.automation[playerKey];
                this.startRefreshAutomation(playerKey, automationConfig);
            }
            for (var playerKey in settingStates.playerinfo) {
                var playerConfig = settingStates.playerinfo[playerKey];
                this.startRefreshPlayerinfo(playerKey);
            }
            for (var playerKey in settingStates.kingwar) {
                var kingwarConfig = settingStates.kingwar[playerKey];
                this.startRefreshKingwar(playerKey, kingwarConfig.area, kingwarConfig.star);
            }
            this.doRefresh();
            safe(done)();
        }, this);
    },
    doRefresh:function() {
        var invokeNoConflictions = () => {
            if (this.onRefreshEnd.length > 0) {
                for (var i = 0; i < this.onRefreshEnd.length; ++i) {
                    this.onRefreshEnd[i](true);
                }
                this.onRefreshEnd = [];
            }
        }
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
                invokeNoConflictions();
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

    startRefreshAutomation:function(playerKey, automationConfig) {
        var playerData = this.players[playerKey];
        if (automationConfig.disabled) {
            this.stopRefreshAutomation(playerKey);
            return;
        }
        var autoConfigs = this.generateConfig(automationConfig, false);
        if (playerData.refreshAutomationKey) {
            this.controller.modifyPlayerAutomation(playerData.refreshAutomationKey, 3, autoConfigs);
        } else {
            playerData.refreshAutomationKey =
                this.controller.setPlayerAutomation(playerData, 3, autoConfigs);
        }
    },
    stopRefreshAutomation:function(playerKey) {
        var playerData = this.players[playerKey];
        if (playerData.refreshAutomationKey) {
            var refreshKey = playerData.refreshAutomationKey;
            playerData.refreshAutomationKey = null;
            this.noConfliction(() => {
                this.controller.stopRefresh(refreshKey);
            });
        }
    },
    startRefreshPlayerinfo:function(playerKey) {
        var playerData = this.players[playerKey];
        if (playerData.refreshPlayerKey) {
            return;
        }
        playerData.refreshPlayerKey =
            this.controller.setPlayerListAccount(playerData, 1, 10, 300, 800, 20);
    },
    stopRefreshPlayerinfo:function(playerKey) {
        var playerData = this.players[playerKey];
        if (playerData.refreshPlayerKey) {
            var refreshKey = playerData.refreshPlayerKey;
            playerData.refreshPlayerKey = null;
            this.noConfliction(() => {
                this.controller.stopRefresh(refreshKey);
            });
        }
    },
    startRefreshKingwar:function(playerKey, area, star) {
        var playerData = this.players[playerKey];
        if (playerData.refreshKingwarKey) {
            return;
        }
        playerData.refreshKingwarKey =
            this.controller.setKingwarAccount(playerData, 1, area, star);
    },
    stopRefreshKingwar:function(playerKey) {
        var playerData = this.players[playerKey];
        if (playerData.refreshKingwarKey) {
            var refreshKey = playerData.refreshKingwarKey;
            playerData.refreshKingwarKey = null;
            this.noConfliction(() => {
                this.controller.stopRefresh(refreshKey);
            });
        }
    },

    generateConfig:function(automationConfig, needDisabled) {
        var defaultsStates = $StateManager.getState(GAME_DEFAULTS_CONFIG);
        var autoConfigs = {};
        if (needDisabled) {
            autoConfigs.disabled = automationConfig.disabled;
        }
        for (var configType in defaultsStates.automation) {
            var config = automationConfig[configType];
            if (config) {
                autoConfigs[configType] = config;
            } else {
                autoConfigs[configType] = defaultsStates.automation[configType];
            }
        }
        return autoConfigs;
    },
    validateConfig:function(autoConfigs) {
        var defaultsStates = $StateManager.getState(GAME_DEFAULTS_CONFIG);
        var automationConfig = {};
        automationConfig.disabled = (autoConfigs.disabled ? true : undefined);
        for (var configType in defaultsStates.automation) {
            var config = autoConfigs[configType];
            if (config) {
                var newConfig = {
                    disabled: (config.disabled ? true : undefined),
                };
                var baseConfig = defaultsStates.automation[configType];
                for (var key in baseConfig) {
                    if (typeof(baseConfig[key]) != typeof(config[key])) {
                        return null;
                    }
                    newConfig[key] = config[key];
                }
                automationConfig[configType] = newConfig;
            }
        }
        return automationConfig;
    },
    playersOfAccount:function(accountKey) {
        var accountStates = $StateManager.getState(GAME_ACCOUNTS_CONFIG);
        var playerKeys = {};
        for (var playerKey in accountStates.players) {
            var playerInfo = accountStates.players[playerKey];
            if (playerInfo.account == accountKey) {
                playerKeys[playerKey] = true;
            }
        }
        return playerKeys;
    },
    addAccount:function(accountKey, username, account) {
        this.accounts[accountKey] = {
            username: username,
            account: account,
        };
    },
    delAccount:function(accountKey) {
        var playerKeys = this.playersOfAccount(accountKey);
        for (var playerKey in playerKeys) {
            this.delPlayer(playerKey);
        }
        var accountData = this.accounts[accountKey];
        var account = accountData.account;
        this.noConfliction(() => {
            this.accountManager.remove(account);
        });
        delete this.accounts[accountKey];
    },
    addPlayer:function(playerKey, accountKey, server) {
        this.players[playerKey] = {
            accountKey: accountKey,
            account: this.accounts[accountKey].account,
            server: server,
            validator: new GameValidator(),
        };
    },
    delPlayer:function(playerKey) {
        this.stopRefreshAutomation(playerKey);
        this.stopRefreshPlayerinfo(playerKey);
        this.stopRefreshKingwar(playerKey);
        delete this.players[playerKey];
    },
    getAccountIndex:function(userData, accountKey) {
        var accountIndex = -1;
        var userAccounts = userData.accounts;
        if (userAccounts) {
            for (var i = 0; i < userAccounts.length; ++i) {
                if (accountKey == userAccounts[i]) {
                    accountIndex = i;
                    break;
                }
            }
        }
        return accountIndex;
    },
    getPlayerIndex:function(userData, playerKey) {
        var playerIndex = -1;
        var userPlayers = userData.players;
        if (userPlayers) {
            for (var i = 0; i < userPlayers.length; ++i) {
                if (playerKey == userPlayers[i]) {
                    playerIndex = i;
                    break;
                }
            }
        }
        return playerIndex;
    },

    addaccount:function(requestor, responder, done) {
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
            if (!userData || userData.auth < 2) {
                responder.addError("Admin level not enough.");
                return responder.respondJson({}, done);
            }

            var json = yield requestor.visitBodyJson(next);
            if (!json || !json.un || !json.pd) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var username = json.un;
            var password = json.pd;
            for (var accountKey in this.accounts) {
                var accountData = this.accounts[accountKey];
                if (accountData.username == username) {
                    responder.addError("Username already exists.");
                    return responder.respondJson({fail:"user_exists"}, done);
                }
            }

            var account = this.accountManager.add(username, password);
            var conn = this.accountManager.connectAccount(account, null);
            var data = yield conn.loginAccount(next);
            if (!data.success) {
                this.accountManager.remove(account);
                responder.addError("Account password error.");
                return responder.respondJson({fail:"account_fault"}, done);
            }

            var accountKey = rkey();
            while(this.accounts[accountKey]){ accountKey = rkey(); }
            var accountStates = $StateManager.getState(GAME_ACCOUNTS_CONFIG);
            accountStates.accounts[accountKey] = {
                username: username,
                password: password,
            };
            this.addAccount(accountKey, username, account);
            var userAccounts = userData.accounts;
            userAccounts = (userAccounts ? userAccounts : []);
            userAccounts.push(accountKey);
            userData.accounts = userAccounts;
            yield $StateManager.commitState(GAME_ACCOUNTS_CONFIG, next);
            yield $StateManager.commitState(USER_CONFIG, next);

            responder.respondJson({
                success: true,
                key: accountKey,
            }, done);
        }, this);
    },
    delaccount:function(requestor, responder, done) {
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
            if (!userData || userData.auth < 2) {
                responder.addError("Admin level not enough.");
                return responder.respondJson({}, done);
            }

            var json = yield requestor.visitBodyJson(next);
            if (!json || !json.key) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var accountKey = json.key;
            if (!this.accounts[accountKey]) {
                responder.addError("Invalid account key.");
                return responder.respondJson({}, done);
            }

            var accountBelong = this.getAccountIndex(userData, accountKey);
            if (accountBelong < 0) {
                responder.addError("Account doesn't belong to user.");
                return responder.respondJson({}, done);
            }

            var playerKeys = this.playersOfAccount(accountKey);
            var accountStates = $StateManager.getState(GAME_ACCOUNTS_CONFIG);
            var settingsChanged = false;
            for (var playerKey in playerKeys) {
                settingsChanged = settingsChanged || this.erasePlayerSettings(playerKey);
                var playerBelong = this.getPlayerIndex(userData, playerKey);
                userData.players.splice(playerBelong, 1);
                delete accountStates.players[playerKey];
            }

            delete accountStates.accounts[accountKey];
            this.delAccount(accountKey);
            userData.accounts.splice(accountBelong, 1);

            if (settingsChanged) {
                yield $StateManager.commitState(GAME_SETTING_CONFIG, next);
            }
            yield $StateManager.commitState(GAME_ACCOUNTS_CONFIG, next);
            yield $StateManager.commitState(USER_CONFIG, next);

            responder.respondJson({
                success: true,
            }, done);
        }, this);
    },
    addplayer:function(requestor, responder, done) {
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
            if (!userData || userData.auth < 2) {
                responder.addError("Admin level not enough.");
                return responder.respondJson({}, done);
            }

            var json = yield requestor.visitBodyJson(next);
            if (!json || !json.key || !json.server) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var accountKey = json.key;
            var server = json.server;
            if (!this.accounts[accountKey]) {
                responder.addError("Invalid account key.");
                return responder.respondJson({}, done);
            }

            var accountBelong = this.getAccountIndex(userData, accountKey);
            if (accountBelong < 0) {
                responder.addError("Account doesn't belong to user.");
                return responder.respondJson({}, done);
            }

            if (userData.players) {
                for (var i = 0; i < userData.players.length; ++i) {
                    var playerKey = userData.players[i];
                    var playerData = this.players[playerKey];
                    if (playerData.accountKey == accountKey && playerData.server == server) {
                        responder.addError("Player already added.");
                        return responder.respondJson({}, done);
                    }
                }
            }

            var playerKey = rkey();
            while(this.players[playerKey]) { playerKey = rkey(); }
            var accountStates = $StateManager.getState(GAME_ACCOUNTS_CONFIG);
            accountStates.players[playerKey] = {
                account: accountKey,
                server: server,
            };
            this.addPlayer(playerKey, accountKey, server);
            var userPlayers = userData.players;
            userPlayers = (userPlayers ? userPlayers : []);
            userPlayers.push(playerKey);
            userData.players = userPlayers;
            yield $StateManager.commitState(GAME_ACCOUNTS_CONFIG, next);
            yield $StateManager.commitState(USER_CONFIG, next);

            responder.respondJson({
                success: true,
                key: playerKey,
                configs: this.generateConfig({ disabled: true }, true),
            }, done);
        }, this);
    },
    delplayer:function(requestor, responder, done) {
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
            if (!userData || userData.auth < 2) {
                responder.addError("Admin level not enough.");
                return responder.respondJson({}, done);
            }

            var json = yield requestor.visitBodyJson(next);
            if (!json || !json.key) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var playerKey = json.key;
            if (!this.players[playerKey]) {
                responder.addError("Invalid player key.");
                return responder.respondJson({}, done);
            }

            var playerBelong = this.getPlayerIndex(userData, playerKey);
            if (playerBelong < 0) {
                responder.addError("Player doesn't belong to user.");
                return responder.respondJson({}, done);
            }

            var accountStates = $StateManager.getState(GAME_ACCOUNTS_CONFIG);
            var settingsChanged = this.erasePlayerSettings(playerKey);
            delete accountStates.players[playerKey];
            this.delPlayer(playerKey);
            userData.players.splice(playerBelong, 1);
            if (settingsChanged) {
                yield $StateManager.commitState(GAME_SETTING_CONFIG, next);
            }
            yield $StateManager.commitState(GAME_ACCOUNTS_CONFIG, next);
            yield $StateManager.commitState(USER_CONFIG, next);

            responder.respondJson({
                success: true,
            }, done);
        }, this);
    },
    playerautomation:function(requestor, responder, done) {
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
            if (!userData || userData.auth < 2) {
                responder.addError("Admin level not enough.");
                return responder.respondJson({}, done);
            }

            var json = yield requestor.visitBodyJson(next);
            if (!json || !json.key || !json.configs) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var playerKey = json.key;
            var configs = json.configs;
            if (!this.players[playerKey]) {
                responder.addError("Invalid player key.");
                return responder.respondJson({}, done);
            }

            var playerBelong = this.getPlayerIndex(userData, playerKey);
            if (playerBelong < 0) {
                responder.addError("Player doesn't belong to user.");
                return responder.respondJson({}, done);
            }

            var automationConfig = this.validateConfig(configs);
            if (!automationConfig) {
                responder.addError("Not valid config information.");
                return responder.respondJson({}, done);
            }

            var settingStates = $StateManager.getState(GAME_SETTING_CONFIG);
            settingStates.automation[playerKey] = automationConfig;
            this.startRefreshAutomation(playerKey, automationConfig);
            yield $StateManager.commitState(GAME_SETTING_CONFIG, next);

            responder.respondJson({
                success: true,
            }, done);
        }, this);
    },
    playermanual:function(requestor, responder, done) {
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
            if (!userData || userData.auth < 2) {
                responder.addError("Admin level not enough.");
                return responder.respondJson({}, done);
            }

            var json = yield requestor.visitBodyJson(next);
            if (!json || !json.key) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var playerKey = json.key;
            var playerData = this.players[playerKey];
            if (!playerData) {
                responder.addError("Invalid player key.");
                return responder.respondJson({}, done);
            }

            var playerBelong = this.getPlayerIndex(userData, playerKey);
            if (playerBelong < 0) {
                responder.addError("Player doesn't belong to user.");
                return responder.respondJson({}, done);
            }

            var settingStates = $StateManager.getState(GAME_SETTING_CONFIG);
            var automationConfig = settingStates.automation[playerKey];
            if (!automationConfig.disabled) {
                responder.addError("Automation enabled config cannot do manual.");
                return responder.respondJson({}, done);
            }
            
            var autoConfigs = this.generateConfig(automationConfig, false);
            var data = yield this.controller.manualPlayerAutomation(playerData, autoConfigs, next);

            responder.respondJson({
                success: !!data.success,
            }, done);
        }, this);
    },
    listautomation:function(requestor, responder, done) {
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
            if (!userData || userData.auth < 2) {
                responder.addError("Admin level not enough.");
                return responder.respondJson({}, done);
            }

            var settingStates = $StateManager.getState(GAME_SETTING_CONFIG);
            var accounts = [];
            if (userData.accounts) {
                for (var i = 0; i < userData.accounts.length; ++i) {
                    var accountKey = userData.accounts[i];
                    var accountData = this.accounts[accountKey];
                    accounts.push({
                        key: accountKey,
                        username: accountData.username,
                        players: [],
                    });
                }
            }
            if (userData.players) {
                for (var i = 0; i < userData.players.length; ++i) {
                    var playerKey = userData.players[i];
                    var playerData = this.players[playerKey];
                    for (var j = 0; j < accounts.length; ++j) {
                        if (playerData.accountKey == accounts[j].key) {
                            var automationConfig = settingStates.automation[playerKey];
                            automationConfig = (automationConfig ? automationConfig : { disabled: true, });
                            accounts[j].players.push({
                                server: playerData.server,
                                key: playerKey,
                                configs: this.generateConfig(automationConfig, true),
                            });
                            break;
                        }
                    }
                }
            }

            responder.respondJson({
                accounts: accounts,
            }, done);
        }, this);
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
    listplayers:function(requestor, responder, done) {
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
    listkingwars:function(requestor, responder, done) {
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

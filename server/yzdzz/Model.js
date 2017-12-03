
require("../Base");
require("../LoginManager");
require("../Mutex");
require("../StateManager");
require("./Database");
require("./GameController");

GAME_ACCOUNTS_CONFIG = "GameAcounts.d";
GAME_DEFAULTS_CONFIG = "GameDefaults.d";
GAME_SETTING_CONFIG = "GameSetting.d";

GAME_POWER_MAX_CONFIG = "GamePowerMax.d";
GAME_UNIONS_CONFIG = "GameUnions.d";
GAME_KINGWAR_CONFIG = "GameKingwar.d";
GAME_PLAYER_NAME_CONFIG = "GamePlayerNames.d";
GAME_HEROSHOP_CONFIG = "GameHeroshop.d";

var AllFuncs = [
    //{name:"refresh", authBase:2},
    {name:"kingwar", authBase:1, refreshType:"kingwar", },
    {name:"playerlist", authBase:1, refreshType:"kingwar;playerlist", },
    {name:"serverInfo", authBase:1},
    {name:"automation", authBase:2, refreshType:"automation", },
    {name:"setting", authBase:3},
    {name:"users", authBase:3},
];
var AllFuncStr = ";";
var AllFuncMap = {};
for (var i = 0; i < AllFuncs.length; ++i) {
    var funcItem = AllFuncs[i];
    AllFuncStr += funcItem.name + ";";
    AllFuncMap[funcItem.name] = funcItem;
}

$HttpModel.addClass("YZDZZ_CLASS", {
    _constructor:function(httpServer) {
        this.httpServer = httpServer;
        this.controller = new GameController();
        this.accountManager = this.controller.getAccountManager();
        this.accounts = {};
        this.players = {};

        this.onRefreshEnd = [];
        this.delayRefresh = "";

        this.randKey2PlayerId = {};
        this.playerId2RandKey = {};

        httpServer.registerCommand("addaccount", this);
        httpServer.registerCommand("delaccount", this);
        httpServer.registerCommand("addplayer", this);
        httpServer.registerCommand("delplayer", this);
        httpServer.registerCommand("playersetting", this);
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

        this.userModel = this.httpServer.findModel("USER_CLASS");
        if (this.userModel) {
            console.log("find user model!");
            this.userModel.listenUserModification({
                added:(userData) => { this.onUserAdded(userData); },
                deleting:(userData) => { this.onUserDeleting(userData); },
            });
        }

        var next = coroutine(function*() {
            yield $StateManager.openState(GAME_ACCOUNTS_CONFIG, next);
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
            yield $StateManager.openState(GAME_SETTING_CONFIG, next);
            yield $StateManager.openState(GAME_DEFAULTS_CONFIG, next);
            yield $StateManager.openState(GAME_POWER_MAX_CONFIG, next);
            yield $StateManager.openState(GAME_UNIONS_CONFIG, next);
            yield $StateManager.openState(GAME_KINGWAR_CONFIG, next);
            yield $StateManager.openState(GAME_PLAYER_NAME_CONFIG, next);
            yield $StateManager.openState(GAME_HEROSHOP_CONFIG, next);

            var allPowerMax = $StateManager.getState(GAME_POWER_MAX_CONFIG);
            this.playersMd5 = this.getTag(allPowerMax);
            this.controller.restorePlayers(allPowerMax);
            var allUnions = $StateManager.getState(GAME_UNIONS_CONFIG);
            this.unionMd5 = this.getTag(allUnions);
            this.controller.restoreUnions(allUnions);
            var allKingwars = $StateManager.getState(GAME_KINGWAR_CONFIG);
            this.kingwarMd5 = this.getTag(allKingwars);
            this.controller.restoreKingwar(allKingwars);
            var allPlayerNames = $StateManager.getState(GAME_PLAYER_NAME_CONFIG);
            this.playerNamesMd5 = this.getTag(allPlayerNames);
            for (var playerKey in this.players) {
                var playerData = this.players[playerKey];
                var brief = allPlayerNames[playerKey];
                if (brief) {
                    this.controller.setPlayerBrief(playerData, brief);
                }
            }
            var heroshopInfo = $StateManager.getState(GAME_HEROSHOP_CONFIG);
            this.heroshopMd5 = this.getTag(heroshopInfo);
            this.controller.setHeroshopInfo(heroshopInfo.date, heroshopInfo.info, (date, info) => {
                heroshopInfo.date = date;
                heroshopInfo.info = info;
                var md5 = this.getTag(heroshopInfo);
                if (md5 != this.heroshopMd5) {
                    this.heroshopMd5 = md5;
                    $StateManager.commitState(GAME_HEROSHOP_CONFIG);
                }
            });

            yield this.startRefreshSettings(next);
            safe(done)();
        }, this);
    },

    erasePlayerSettings:function(playerKey) {
        console.log("erasePlayerSettings", playerKey);
        var changed = false;
        var settingStates = $StateManager.getState(GAME_SETTING_CONFIG);
        if (settingStates.automation[playerKey]) {
            delete settingStates.automation[playerKey];
            changed = true;
        }
        if (settingStates.listing[playerKey]) {
            delete settingStates.listing[playerKey];
            changed = true;
        }
        if (settingStates.kingwar[playerKey]) {
            delete settingStates.kingwar[playerKey];
            changed = true;
        }
        if (settingStates.targeting[playerKey]) {
            delete settingStates.targeting[playerKey];
            changed = true;
        }
        if (settingStates.dropping[playerKey]) {
            delete settingStates.dropping[playerKey];
            changed = true;
        }
        if (settingStates.heroshop[playerKey]) {
            delete settingStates.heroshop[playerKey];
            changed = true;
        }
        return changed;
    },
    erasePlayerNames:function(playerKey) {
        console.log("erasePlayerNames", playerKey);
        var changed = false;
        var allPlayerNames = $StateManager.getState(GAME_PLAYER_NAME_CONFIG);
        if (allPlayerNames[playerKey]) {
            delete allPlayerNames[playerKey];
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
            for (var playerKey in settingStates.listing) {
                var listingConfig = settingStates.listing[playerKey];
                this.startRefreshListing(playerKey, listingConfig);
            }
            for (var playerKey in settingStates.kingwar) {
                var kingwarConfig = settingStates.kingwar[playerKey];
                this.startRefreshKingwar(playerKey, kingwarConfig);
            }
            for (var playerKey in settingStates.targeting) {
                var targetingConfig = settingStates.targeting[playerKey];
                this.startRefreshTargeting(playerKey, targetingConfig);
            }
            for (var playerKey in settingStates.dropping) {
                var droppingConfig = settingStates.dropping[playerKey];
                this.startRefreshDropping(playerKey, droppingConfig);
            }
            for (var playerKey in settingStates.heroshop) {
                var heroshopConfig = settingStates.heroshop[playerKey];
                this.startRefreshHeroshop(playerKey, heroshopConfig);
            }
            var defaultsStates = $StateManager.getState(GAME_DEFAULTS_CONFIG);
            this.controller.startDailyTask(defaultsStates.dailyTask);
            this.controller.setRepeatRange(defaultsStates.repeatRange.start, defaultsStates.repeatRange.end);
            this.controller.setTargetingEvent(defaultsStates.targeting);
            this.controller.setDroppingEvent(defaultsStates.dropping);
            this.controller.setHeroshopEvent(defaultsStates.heroshop);
            this.doRefresh(AllFuncStr);
            safe(done)();
        }, this);
    },
    doRefresh:function(refreshType) {
        var invokeNoConflictions = () => {
            if (this.onRefreshEnd.length > 0) {
                var onRefreshEnd = this.onRefreshEnd;
                this.onRefreshEnd = [];
                for (var i = 0; i < onRefreshEnd.length; ++i) {
                    onRefreshEnd[i](true);
                }
            }
        }
        var refreshCallback = (done) => {
            var next = coroutine(function*() {
                // Save all players
                var players = this.controller.savePlayers();
                var md5 = this.getTag(players);
                if (this.playersMd5 != md5) {
                    this.playersMd5 = md5;
                    var allPowerMax = $StateManager.getState(GAME_POWER_MAX_CONFIG);
                    for (var playerId in players) {
                        if (!this.playerId2RandKey[playerId]) {
                            var randKey = rkey();
                            while(this.randKey2PlayerId[randKey]) { randKey = rkey(); }
                            this.playerId2RandKey[playerId] = randKey;
                            this.randKey2PlayerId[randKey] = playerId;
                        }
                        allPowerMax[playerId] = players[playerId];
                    }
                    yield $StateManager.commitState(GAME_POWER_MAX_CONFIG, next);
                }
                // Save all unions
                var unions = this.controller.saveUnions();
                var md5 = this.getTag(unions);
                if (this.unionMd5 != md5) {
                    this.unionMd5 = md5;
                    var allUnions = $StateManager.getState(GAME_UNIONS_CONFIG);
                    for (var unionId in unions) {
                        allUnions[unionId] = unions[unionId];
                    }
                    yield $StateManager.commitState(GAME_UNIONS_CONFIG, next);
                }
                // Save kingwars
                var kingwarPlayers = this.controller.saveKingwar();
                var md5 = this.getTag(kingwarPlayers);
                if (this.kingwarMd5 != md5) {
                    this.kingwarMd5 = md5;
                    var allKingwars = $StateManager.getState(GAME_KINGWAR_CONFIG);
                    for (var kingwarKey in kingwarPlayers) {
                        allKingwars[kingwarKey] = kingwarPlayers[kingwarKey];
                    }
                    yield $StateManager.commitState(GAME_KINGWAR_CONFIG, next);
                }
                // Save player names for added accounts
                var allPlayerNames = $StateManager.getState(GAME_PLAYER_NAME_CONFIG);
                for (var playerKey in this.players) {
                    var playerData = this.players[playerKey];
                    var brief = this.controller.getPlayerBrief(playerData);
                    if (brief) {
                        allPlayerNames[playerKey] = brief;
                    }
                }
                var md5 = this.getTag(allPlayerNames);
                if (this.playerNamesMd5 != md5) {
                    this.playerNamesMd5 = md5;
                    yield $StateManager.commitState(GAME_PLAYER_NAME_CONFIG, next);
                }
                invokeNoConflictions();
                safe(done)();
            }, this);
        };
        var defaultsStates = $StateManager.getState(GAME_DEFAULTS_CONFIG);
        this.controller.cancelPeriodic();
        this.controller.startPeriodic(defaultsStates.periodic.interval, refreshType, refreshCallback);
    },
    noConfliction:function(fun) {
        if (this.controller.duringPeriodic()) {
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
            return this.stopRefreshAutomation(playerKey);
        }
        console.log("startRefreshAutomation", playerKey);
        var autoConfigs = this.generateConfig(automationConfig, false);
        if (playerData.refreshAutomationKey) {
            this.controller.modifyPlayerAutomation(playerData.refreshAutomationKey, autoConfigs);
        } else {
            playerData.refreshAutomationKey =
                this.controller.setPlayerAutomation(playerData, autoConfigs);
        }
    },
    stopRefreshAutomation:function(playerKey) {
        var playerData = this.players[playerKey];
        if (playerData.refreshAutomationKey) {
            console.log("stopRefreshAutomation", playerKey);
            var refreshKey = playerData.refreshAutomationKey;
            playerData.refreshAutomationKey = null;
            this.noConfliction(() => {
                console.log("unsetPlayer", playerKey);
                this.controller.unsetPlayer(refreshKey);
            });
        }
    },
    startRefreshTargeting:function(playerKey, targetingConfig) {
        var playerData = this.players[playerKey];
        if (!targetingConfig.reachPLID && !targetingConfig.allowAssign) {
            return this.stopRefreshTargeting(playerKey);
        }
        console.log("startRefreshTargeting", playerKey);
        if (playerData.refreshTargetingKey) {
            this.controller.modifyPlayerTargeting(playerData.refreshTargetingKey, targetingConfig);
        } else {
            playerData.refreshTargetingKey =
                this.controller.setPlayerTargeting(playerData, targetingConfig);
        }
    },
    stopRefreshTargeting:function(playerKey) {
        var playerData = this.players[playerKey];
        if (playerData.refreshTargetingKey) {
            console.log("stopRefreshTargeting", playerKey);
            this.controller.unsetPlayer(playerData.refreshTargetingKey);
            playerData.refreshTargetingKey = null;
        }
    },
    startRefreshDropping:function(playerKey, droppingConfig) {
        var playerData = this.players[playerKey];
        if (!droppingConfig.allowDrop) {
            return this.stopRefreshDropping(playerKey);
        }
        console.log("startRefreshDropping", playerKey);
        if (playerData.refreshDroppingKey) {
            this.controller.modifyPlayerDropping(playerData.refreshDroppingKey, droppingConfig);
        } else {
            playerData.refreshDroppingKey =
                this.controller.setPlayerDropping(playerData, droppingConfig);
        }
    },
    stopRefreshDropping:function(playerKey) {
        var playerData = this.players[playerKey];
        if (playerData.refreshDroppingKey) {
            console.log("stopRefreshDropping", playerKey);
            this.controller.unsetPlayer(playerData.refreshDroppingKey);
            playerData.refreshDroppingKey = null;
        }
    },
    startRefreshHeroshop:function(playerKey, heroshopConfig) {
        var playerData = this.players[playerKey];
        if (!heroshopConfig.enabled) {
            return this.stopRefreshHeroshop(playerKey);
        }
        console.log("startRefreshHeroshop", playerKey);
        if (playerData.refreshHeroshopKey) {
            this.controller.modifyPlayerHeroshop(playerData.refreshHeroshopKey, heroshopConfig);
        } else {
            playerData.refreshHeroshopKey =
                this.controller.setPlayerHeroshop(playerData, heroshopConfig);
        }
    },
    stopRefreshHeroshop:function(playerKey) {
        var playerData = this.players[playerKey];
        if (playerData.refreshHeroshopKey) {
            console.log("stopRefreshHeroshop", playerKey);
            this.controller.unsetPlayer(playerData.refreshHeroshopKey);
            playerData.refreshHeroshopKey = null;
        }
    },
    startRefreshKingwar:function(playerKey, kingwarConfig) {
        var playerData = this.players[playerKey];
        if (kingwarConfig.area == 0 || kingwarConfig.star == 0) {
            return this.stopRefreshKingwar(playerKey);
        }
        console.log("startRefreshKingwar", playerKey);
        if (playerData.refreshKingwarKey) {
            this.controller.modifyPlayerKingwar(playerData.refreshKingwarKey, kingwarConfig);
        } else {
            playerData.refreshKingwarKey =
                this.controller.setPlayerKingwar(playerData, kingwarConfig);
        }
    },
    stopRefreshKingwar:function(playerKey) {
        var playerData = this.players[playerKey];
        if (playerData.refreshKingwarKey) {
            console.log("stopRefreshKingwar", playerKey);
            var refreshKey = playerData.refreshKingwarKey;
            playerData.refreshKingwarKey = null;
            this.noConfliction(() => {
                console.log("unsetPlayer", playerKey);
                this.controller.unsetPlayer(refreshKey);
            });
        }
    },
    startRefreshListing:function(playerKey, listingConfig) {
        var playerData = this.players[playerKey];
        if (listingConfig.minPower == 0 || listingConfig.limitPower == 0) {
            return this.stopRefreshListing(playerKey);
        }
        console.log("startRefreshListing", playerKey);
        if (playerData.refreshPlayerKey) {
            this.controller.modifyPlayerListing(playerData.refreshPlayerKey, listingConfig);
        } else {
            playerData.refreshPlayerKey =
                this.controller.setPlayerListing(playerData, listingConfig);
        }
    },
    stopRefreshListing:function(playerKey) {
        var playerData = this.players[playerKey];
        if (playerData.refreshPlayerKey) {
            console.log("stopRefreshListing", playerKey);
            var refreshKey = playerData.refreshPlayerKey;
            playerData.refreshPlayerKey = null;
            this.noConfliction(() => {
                console.log("unsetPlayer", playerKey);
                this.controller.unsetPlayer(refreshKey);
            });
        }
    },

    generateConfig:function(automationConfig, needDisabled) {
        var defaultsStates = $StateManager.getState(GAME_DEFAULTS_CONFIG);
        var autoConfigs = {};
        if (needDisabled && automationConfig.disabled) {
            autoConfigs.disabled = true;
        }
        for (var configType in defaultsStates.automation) {
            var config = automationConfig[configType];
            var baseConfig = defaultsStates.automation[configType];
            if (config) {
                for (var key in baseConfig) {
                    if (typeof(config[key]) == "undefined") {
                        config[key] = baseConfig[key];
                    }
                }
                autoConfigs[configType] = config;
            } else {
                autoConfigs[configType] = baseConfig;
            }
        }
        return autoConfigs;
    },
    validateConfig:function(autoConfigs) {
        var defaultsStates = $StateManager.getState(GAME_DEFAULTS_CONFIG);
        var automationConfig = {};
        if (autoConfigs.disabled) {
            automationConfig.disabled = true;
        }
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
        console.log("addAccount", accountKey, username, account);
        this.accounts[accountKey] = {
            username: username,
            account: account,
        };
    },
    delAccount:function(accountKey) {
        console.log("delAccount", accountKey);
        var accountData = this.accounts[accountKey];
        var account = accountData.account;
        this.noConfliction(() => {
            this.accountManager.remove(account);
        });
        delete this.accounts[accountKey];
    },
    addPlayer:function(playerKey, accountKey, server) {
        console.log("addPlayer", playerKey, accountKey, server);
        this.players[playerKey] = {
            accountKey: accountKey,
            account: this.accounts[accountKey].account,
            server: server,
            validator: new GameValidator(),
            mutex: new Mutex(),
        };
    },
    delPlayer:function(playerKey) {
        console.log("delPlayer", playerKey);
        this.stopRefreshAutomation(playerKey);
        this.stopRefreshTargeting(playerKey);
        this.stopRefreshListing(playerKey);
        this.stopRefreshKingwar(playerKey);
        this.stopRefreshDropping(playerKey);
        this.stopRefreshHeroshop(playerKey);
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
    getSettingAutomation:function(playerKey) {
        var settingStates = $StateManager.getState(GAME_SETTING_CONFIG);
        var automationConfig = settingStates.automation[playerKey];
        automationConfig = (automationConfig ? automationConfig : { disabled: true, });
        return this.generateConfig(automationConfig, true);
    },
    setSettingAutomation:function(playerKey, automationConfig) {
        var settingStates = $StateManager.getState(GAME_SETTING_CONFIG);
        settingStates.automation[playerKey] = automationConfig;
        this.startRefreshAutomation(playerKey, automationConfig);
    },
    getSettingTyped:function(settingType, playerKey) {
        var settingStates = $StateManager.getState(GAME_SETTING_CONFIG);
        var settingBlock = settingStates[settingType];
        if (settingBlock) {
            var setting = settingBlock[playerKey];
            if (!setting) {
                return {};
            } else {
                var result = {};
                for (var key in setting) {
                    var tail = key.length > 4 && key.substr(key.length - 4);
                    if (tail == "PLID") {
                        result[key] = this.playerId2RandKey[setting[key]];
                    } else {
                        result[key] = setting[key];
                    }
                }
                return result;
            }
        }
    },
    compareSetting:function(configA, configB) {
        if (!configB) {
            return false;
        }
        for (var key in configA) {
            if (typeof(configA[key]) != typeof(configB[key]) || configA[key] != configB[key]) {
                return false;
            }
        }
        return true;
    },
    getSettingNumber:function(val, min, max, def) {
        if (typeof(val) == "number") {
            if (val >= min && val <= max) {
                return val;
            }
        }
        return def;
    },
    setSettingKingwar:function(playerKey, kingwar) {
        var settingStates = $StateManager.getState(GAME_SETTING_CONFIG);
        var kingwarConfig = {
            area: this.getSettingNumber(kingwar.area, 1, 3, 0),
            star: this.getSettingNumber(kingwar.star, 1, 10, 0),
        };
        if (this.compareSetting(kingwarConfig, settingStates.kingwar[playerKey])) {
            return false;
        }
        console.log("set kingwar for player", playerKey);
        settingStates.kingwar[playerKey] = kingwarConfig;
        this.startRefreshKingwar(playerKey, kingwarConfig);
        return true;
    },
    setSettingListing:function(playerKey, listing) {
        var settingStates = $StateManager.getState(GAME_SETTING_CONFIG);
        var listingConfig = {
            unionCount: 10,
            minPower: this.getSettingNumber(listing.minPower, 10, 999, 0),
            limitPower: this.getSettingNumber(listing.limitPower, 50, 9999, 0),
            limitDay: 20,
        };
        if (this.compareSetting(listingConfig, settingStates.listing[playerKey])) {
            return false;
        }
        console.log("set listing for player", playerKey);
        settingStates.listing[playerKey] = listingConfig;
        this.startRefreshListing(playerKey, listingConfig);
        return true;
    },
    setSettingTargeting:function(playerKey, targeting) {
        var settingStates = $StateManager.getState(GAME_SETTING_CONFIG);
        var targetingConfig = {
            reachPLID: this.randKey2PlayerId[targeting.reachPLID] || "",
            allowAssign: (targeting.allowAssign ? true : false),
            minStar: this.getSettingNumber(targeting.minStar, 1, 10, 0),
        };
        if (this.compareSetting(targetingConfig, settingStates.targeting[playerKey])) {
            return false;
        }
        console.log("set targeting for player", playerKey);
        settingStates.targeting[playerKey] = targetingConfig;
        this.startRefreshTargeting(playerKey, targetingConfig);
        return true;
    },
    setSettingDropping:function(playerKey, dropping) {
        var settingStates = $StateManager.getState(GAME_SETTING_CONFIG);
        var droppingConfig = {
            allowDrop: (dropping.allowDrop ? true : false),
        };
        if (this.compareSetting(droppingConfig, settingStates.dropping[playerKey])) {
            return false;
        }
        console.log("set dropping for player", playerKey);
        settingStates.dropping[playerKey] = droppingConfig;
        this.startRefreshDropping(playerKey, droppingConfig);
        return true;
    },
    setSettingHeroshop:function(playerKey, heroshop) {
        var settingStates = $StateManager.getState(GAME_SETTING_CONFIG);
        var heroshopConfig = {
            enabled: (heroshop.enabled ? true : false),
            maxReduce: this.getSettingNumber(heroshop.maxReduce, 50, 60, 55),
            refresh: this.getSettingNumber(heroshop.refresh, 0, 8, 0),
        };
        if (this.compareSetting(heroshopConfig, settingStates.heroshop[playerKey])) {
            return false;
        }
        console.log("set heroshop for player", playerKey);
        settingStates.heroshop[playerKey] = heroshopConfig;
        this.startRefreshHeroshop(playerKey, heroshopConfig);
        return true;
    },

    onUserAdded:function(userData) {
        console.log("onUserAdded");
    },
    onUserDeleting:function(userData) {
        if (!userData.accounts || userData.accounts.length == 0) {
            return;
        }

        console.log("onUserDeleting");
        var info = {};
        while (userData.accounts.length > 0) {
            this.delUserAccount(userData, 0, info);
        }
        if (userData.players.length > 0) {
            console.log("=================== deleting account without all players! =====================");
            while (userData.players.length > 0) {
                this.delUserPlayer(userData, 0, info);
            }
        }

        var next = coroutine(function*() {
            if (info.settingsChanged) {
                yield $StateManager.commitState(GAME_SETTING_CONFIG, next);
            }
            if (info.namesChanged) {
                yield $StateManager.commitState(GAME_PLAYER_NAME_CONFIG, next);
            }
            yield $StateManager.commitState(GAME_ACCOUNTS_CONFIG, next);
        }, this);
    },
    delUserPlayer:function(userData, playerBelong, info) {
        var playerKey = userData.players[playerBelong];
        console.log("delUserPlayer", playerKey);

        this.delPlayer(playerKey);

        info.settingsChanged = this.erasePlayerSettings(playerKey) || info.settingsChanged;
        info.namesChanged = this.erasePlayerNames(playerKey) || info.namesChanged;

        var accountStates = $StateManager.getState(GAME_ACCOUNTS_CONFIG);
        delete accountStates.players[playerKey];
        userData.players.splice(playerBelong, 1);
    },
    delUserAccount:function(userData, accountBelong, info) {
        var accountKey = userData.accounts[accountBelong];
        console.log("delUserAccount", accountKey);

        this.delAccount(accountKey);

        var playerKeys = this.playersOfAccount(accountKey);
        for (var playerKey in playerKeys) {
            var playerBelong = this.getPlayerIndex(userData, playerKey);
            this.delUserPlayer(userData, playerBelong, info);
        }

        var accountStates = $StateManager.getState(GAME_ACCOUNTS_CONFIG);
        delete accountStates.accounts[accountKey];
        userData.accounts.splice(accountBelong, 1);
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

            var info = {};
            this.delUserAccount(userData, accountBelong, info);

            if (info.settingsChanged) {
                yield $StateManager.commitState(GAME_SETTING_CONFIG, next);
            }
            if (info.namesChanged) {
                yield $StateManager.commitState(GAME_PLAYER_NAME_CONFIG, next);
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
                configs: this.getSettingAutomation(playerKey),
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

            var info = {};
            this.delUserPlayer(userData, playerBelong, info);

            if (info.settingsChanged) {
                yield $StateManager.commitState(GAME_SETTING_CONFIG, next);
            }
            if (info.namesChanged) {
                yield $StateManager.commitState(GAME_PLAYER_NAME_CONFIG, next);
            }
            yield $StateManager.commitState(GAME_ACCOUNTS_CONFIG, next);
            yield $StateManager.commitState(USER_CONFIG, next);

            responder.respondJson({
                success: true,
            }, done);
        }, this);
    },
    playersetting:function(requestor, responder, done) {
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
            if (!json || !json.key || !json.settings) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var playerKey = json.key;
            var settings = json.settings;
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

            var isAdmin = userData.auth >= 3;
            var changed = false;
            if (isAdmin && settings.kingwar) {
                playerData.validator.resetDaily();
                changed = this.setSettingKingwar(playerKey, settings.kingwar) || changed;
            }
            if (isAdmin && settings.listing) {
                changed = this.setSettingListing(playerKey, settings.listing) || changed;
            }
            if (settings.targeting) {
                changed = this.setSettingTargeting(playerKey, settings.targeting) || changed;
            }
            if (settings.dropping) {
                changed = this.setSettingDropping(playerKey, settings.dropping) || changed;
            }
            if (settings.heroshop) {
                changed = this.setSettingHeroshop(playerKey, settings.heroshop) || changed;
            }
            if (changed) {
                yield $StateManager.commitState(GAME_SETTING_CONFIG, next);
            }

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

            var automationConfig = this.validateConfig(configs);
            if (!automationConfig) {
                responder.addError("Not valid config information.");
                return responder.respondJson({}, done);
            }

            playerData.validator.resetDaily();
            playerData.validator.resetHourly();
            this.setSettingAutomation(playerKey, automationConfig);
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

            var autoConfigs = this.getSettingAutomation(playerKey);
            playerData.validator.resetDaily();
            playerData.validator.resetHourly();
            var data = yield this.controller.manualPlayerAutomation(playerData, autoConfigs, next);
            console.log("Manual finished!");

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

            var isAdmin = userData.auth >= 3;
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
                            var brief = this.controller.getPlayerBrief(playerData);
                            accounts[j].players.push({
                                name: (brief ? brief.name : undefined),
                                power: (brief ? brief.power : undefined),
                                server: playerData.server,
                                key: playerKey,
                                configs: this.getSettingAutomation(playerKey),
                                settings: {
                                    kingwar: (isAdmin ? this.getSettingTyped("kingwar", playerKey) : undefined),
                                    listing: (isAdmin ? this.getSettingTyped("listing", playerKey) : undefined),
                                    targeting: this.getSettingTyped("targeting", playerKey),
                                    dropping: this.getSettingTyped("dropping", playerKey),
                                    heroshop: this.getSettingTyped("heroshop", playerKey),
                                },
                            });
                            break;
                        }
                    }
                }
            }
            var players = [];
            var playersData = this.controller.getSortedPlayers(40);
            for (var i = 0; i < playersData.length; ++i) {
                var playerItem = playersData[i];
                var rawKey = this.playerId2RandKey[playerItem.key];
                if (rawKey) {
                    players.push({
                        key: rawKey,
                        server: playerItem.server,
                        uShort: playerItem.uShort,
                        name: playerItem.name,
                        power: playerItem.power,
                    });
                }
            }

            responder.respondJson({
                accounts: accounts,
                players: players,
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
                isRefresh: this.controller.duringPeriodic(),
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
            if (!json || !json.integrity || !json.func) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var func = json.func;
            var funcItem = AllFuncMap[func];
            if (!funcItem || !funcItem.refreshType) {
                responder.addError("Not valid func.");
                return responder.respondJson({}, done);
            }

            var delay = this.delayRefresh != "";
            if (!delay) {
                delay = this.noConfliction((delayed) => {
                    var refreshType = (delayed ? this.delayRefresh : funcItem.refreshType);
                    this.delayRefresh = "";
                    console.log("delayRefresh end");
                    this.doRefresh(refreshType);
                });
            }
            if (delay) {
                this.delayRefresh += ";" + funcItem.refreshType;
                console.log("delayRefresh", this.delayRefresh);
            }

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

            var players = [];
            var playersData = this.controller.getSortedPlayers(100);
            for (var i = 0; i < playersData.length; ++i) {
                var playerItem = playersData[i];
                players.push({
                    server: playerItem.server,
                    uShort: playerItem.uShort,
                    name: playerItem.name,
                    power: playerItem.power,
                    last: playerItem.last,
                    kingwar: playerItem.kingwar,
                });
            }
            var hasRefresh = userData.auth >= 2;
            var tag = this.getTag(playersData) + String(hasRefresh);
            if (!requestor.compareTags(tag)) {
                responder.setCode(304);
                return responder.respondData(Buffer.alloc(0), safe(done));
            }

            responder.setTag(tag);
            responder.respondJson({
                hasRefresh: userData.auth >= 2,
                players: players,
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
            var hasRefresh = userData.auth >= 2;
            var tag = this.getTag(kingwarData) + String(hasRefresh);
            if (!requestor.compareTags(tag)) {
                responder.setCode(304);
                return responder.respondData(Buffer.alloc(0), safe(done));
            }
            responder.setTag(tag);
            responder.respondJson({
                hasRefresh: userData.auth >= 2,
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
            for (var i = 0; i < AllFuncs.length; ++i) {
                if (userData.auth >= AllFuncs[i].authBase) {
                    funcs.push(AllFuncs[i].name);
                }
            }

            responder.respondJson({funcs:funcs}, done);
        }, this);
    },
});

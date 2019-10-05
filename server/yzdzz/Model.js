
require("../Base");
require("../LoginManager");
require("../Mutex");
require("../StateManager");
require("./Database");
require("./GameController");

var assert = require("assert");

GAME_ACCOUNTS_CONFIG = "GameAcounts.d";
GAME_DEFAULTS_CONFIG = "GameDefaults.d";
GAME_SETTING_CONFIG = "GameSetting.d";

GAME_POWER_MAX_CONFIG = "GamePowerMax.d";
GAME_UNIONS_CONFIG = "GameUnions.d";
GAME_KINGWAR_CONFIG = "GameKingwar.d";
GAME_PLAYER_NAME_CONFIG = "GamePlayerNames.d";
GAME_HEROSHOP_CONFIG = "GameHeroshop.d";

GAME_USER_CONFIG = "GameUsers.d";

var AllFuncs = [
    {name:"kingwar", requirement:"view_kingwar", },
    {name:"playerlist", requirement:"view_playerlist", },
    {name:"serverInfo", requirement:"server", },
    {name:"automation", requirement:"automation", },
    {name:"payment", requirement:"payment", },
    {name:"users", authBase:3, },
    {name:"selfdesc", authBase:1, },
];
var AllFuncStr = ";";
var AllFuncMap = {};
for (var i = 0; i < AllFuncs.length; ++i) {
    var funcItem = AllFuncs[i];
    AllFuncStr += funcItem.name + ";";
    AllFuncMap[funcItem.name] = funcItem;
}

var PaymentData = {
    "automation":{ pay:100, max:1 },
    "manual":{ pay:10, max:5 },
};

$HttpModel.addClass("YZDZZ_CLASS", {
    _constructor:function(httpServer) {
        this.httpServer = httpServer;
        this.controller = new GameController();
        this.accountManager = this.controller.getAccountManager();
        this.accounts = {};
        this.players = {};
        this.playerHerosInfo = {};
        this.playerKey2UserKey = {};

        this.onRefreshEnd = [];

        this.randKey2PlayerId = {};
        this.playerId2RandKey = {};

        this.randKey2UnionId = {};
        this.unionId2RandKey = {};

        httpServer.registerCommand("listheros", this);
        httpServer.registerCommand("operatehero", this);
        httpServer.registerCommand("addaccount", this);
        httpServer.registerCommand("delaccount", this);
        httpServer.registerCommand("addplayer", this);
        httpServer.registerCommand("changepwd", this);
        httpServer.registerCommand("delplayer", this);
        httpServer.registerCommand("playersetting", this);
        httpServer.registerCommand("playerautomation", this);
        httpServer.registerCommand("playermanual", this);
        httpServer.registerCommand("listautomation", this);
        httpServer.registerCommand("orderautomation", this);
        httpServer.registerCommand("checkrefresh", this);
        httpServer.registerCommand("manrefresh", this);
        httpServer.registerCommand("setheroshop", this);
        httpServer.registerCommand("listserverinfo", this);
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
            this.userModel.setServerListing(() => {
                return this.controller.getAllServerDesc();
            });
        }

        var next = coroutine(function*() {
            yield $StateManager.openState(GAME_ACCOUNTS_CONFIG, next);
            yield $StateManager.openState(GAME_SETTING_CONFIG, next);
            yield $StateManager.openState(GAME_DEFAULTS_CONFIG, next);
            yield $StateManager.openState(GAME_POWER_MAX_CONFIG, next);
            yield $StateManager.openState(GAME_UNIONS_CONFIG, next);
            yield $StateManager.openState(GAME_KINGWAR_CONFIG, next);
            yield $StateManager.openState(GAME_PLAYER_NAME_CONFIG, next);
            yield $StateManager.openState(GAME_HEROSHOP_CONFIG, next);
            yield $StateManager.openState(GAME_USER_CONFIG, next);

            this.initPlayerToPayment();

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
            var allPowerMax = $StateManager.getState(GAME_POWER_MAX_CONFIG);
            this.playersMd5 = this.getTag(allPowerMax);
            this.updatePlayerIdKeys();
            this.controller.restorePlayers(allPowerMax);
            var allUnions = $StateManager.getState(GAME_UNIONS_CONFIG);
            this.unionMd5 = this.getTag(allUnions);
            this.updateUnionIdKeys();
            this.controller.restoreUnions(allUnions);
            var allKingwars = $StateManager.getState(GAME_KINGWAR_CONFIG);
            this.kingwarMd5 = this.getTag(allKingwars);
            this.controller.restoreKingwar(allKingwars);
            var allPlayerNames = $StateManager.getState(GAME_PLAYER_NAME_CONFIG);
            this.playerNamesMd5 = this.getTag(allPlayerNames);
            for (var playerKey in this.players) {
                var playerData = this.players[playerKey];
                var brief = allPlayerNames.briefs[playerKey];
                if (brief) {
                    this.controller.setPlayerBrief(playerData, brief);
                }
                var daily = allPlayerNames.daily[playerKey];
                if (daily) {
                    playerData.validator.setDailyState(allPlayerNames.savedDay, daily);
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
        if (settingStates.unionwar[playerKey]) {
            delete settingStates.unionwar[playerKey];
            changed = true;
        }
        return changed;
    },
    erasePlayerNames:function(playerKey) {
        console.log("erasePlayerNames", playerKey);
        var changed = false;
        var allPlayerNames = $StateManager.getState(GAME_PLAYER_NAME_CONFIG);
        if (allPlayerNames.briefs[playerKey]) {
            delete allPlayerNames.briefs[playerKey];
            changed = true;
        }
        if (allPlayerNames.daily[playerKey]) {
            delete allPlayerNames.daily[playerKey];
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
            for (var playerKey in settingStates.unionwar) {
                var unionwarConfig = settingStates.unionwar[playerKey];
                this.startRefreshUnionwar(playerKey, unionwarConfig);
            }
            var defaultsStates = $StateManager.getState(GAME_DEFAULTS_CONFIG);
            var configOps = {};
            for (var i = 0; i < defaultsStates.automationOrder.length; ++i) {
                var op = defaultsStates.automationOrder[i];
                configOps[op] = true;
                assert(defaultsStates.automation[op], " ===== '{0}' doesn't exist".format(op));
            }
            for (var op in defaultsStates.automation) {
                assert(configOps[op], " ===== must define order for '{0}'".format(op));
            }
            this.controller.setAutomationOrder(defaultsStates.automationOrder);
            this.controller.startDailyTask(defaultsStates.dailyTask);
            this.controller.setRepeatRange(defaultsStates.repeatRange.start, defaultsStates.repeatRange.end);
            this.controller.setTargetingEvent(defaultsStates.targeting);
            this.controller.setDroppingEvent(defaultsStates.dropping);
            this.controller.setHeroshopEvent(defaultsStates.heroshop);
            this.controller.setUnionwarEvent(defaultsStates.unionwar);
            this.doRefresh(AllFuncStr);
            safe(done)();
        }, this);
    },
    updatePlayerIdKeys:function() {
        var allPowerMax = $StateManager.getState(GAME_POWER_MAX_CONFIG);
        for (var playerId in allPowerMax) {
            if (!this.playerId2RandKey[playerId]) {
                var randKey = rkey();
                while(this.randKey2PlayerId[randKey]) { randKey = rkey(); }
                this.playerId2RandKey[playerId] = randKey;
                this.randKey2PlayerId[randKey] = playerId;
            }
        }
    },
    updateUnionIdKeys:function() {
        var allUnions = $StateManager.getState(GAME_UNIONS_CONFIG);
        for (var unionId in allUnions) {
            if (!this.unionId2RandKey[unionId]) {
                var randKey = rkey();
                while (this.randKey2UnionId[randKey]) { randKey = rkey(); }
                this.unionId2RandKey[unionId] = randKey;
                this.randKey2UnionId[randKey] = unionId;
            }
        }
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
        var refreshCallback = () => {
            // Save all players
            var players = this.controller.savePlayers();
            var md5 = this.getTag(players);
            if (this.playersMd5 != md5) {
                this.playersMd5 = md5;
                var allPowerMax = $StateManager.getState(GAME_POWER_MAX_CONFIG);
                for (var playerId in players) {
                    allPowerMax[playerId] = players[playerId];
                }
                this.updatePlayerIdKeys();
                $StateManager.commitState(GAME_POWER_MAX_CONFIG);
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
                this.updateUnionIdKeys();
                $StateManager.commitState(GAME_UNIONS_CONFIG);
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
                $StateManager.commitState(GAME_KINGWAR_CONFIG);
            }
            // Save player names for added accounts
            var allPlayerNames = $StateManager.getState(GAME_PLAYER_NAME_CONFIG);
            var currDay = new Date().getDay();
            allPlayerNames.savedDay = currDay;
            for (var playerKey in this.players) {
                var playerData = this.players[playerKey];
                var brief = this.controller.getPlayerBrief(playerData);
                if (brief) {
                    allPlayerNames.briefs[playerKey] = brief;
                }
                var daily = playerData.validator.getDailyState(currDay);
                if (daily.length > 0) {
                    allPlayerNames.daily[playerKey] = daily;
                } else {
                    delete allPlayerNames.daily[playerKey];
                }
            }
            var md5 = this.getTag(allPlayerNames);
            if (this.playerNamesMd5 != md5) {
                this.playerNamesMd5 = md5;
                $StateManager.commitState(GAME_PLAYER_NAME_CONFIG);
            }
            invokeNoConflictions();
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

    initPlayerToPayment:function() {
        var userStates = $StateManager.getState(USER_CONFIG);
        for (var userKey in userStates.users) {
            var userData = userStates.users[userKey];
            if (userData.players) {
                for (var i = 0; i < userData.players.length; ++i) {
                    var playerKey = userData.players[i];
                    this.playerKey2UserKey[playerKey] = userKey;
                    console.log("[PAYMENT] init playerKey:{0} -> userKey:{1}".format(playerKey, userKey));
                }
            }
        }
    },
    spendPayment:function(playerKey, payment) {
        var userKey = this.playerKey2UserKey[playerKey];
        var userStates = $StateManager.getState(USER_CONFIG);
        var userData = userStates.users[userKey];
        var totalPay = userData.totalPay || 0;
        console.log("[PAYMENT] spend userData.totalPay:{0} -> payment:{1}, playerKey:{2}, userKey:{3}".format(userData.totalPay, payment, playerKey, userKey));
        if (totalPay >= payment) {
            totalPay -= payment;
            userData.totalPay = totalPay;
            $StateManager.commitState(USER_CONFIG);
            console.log("[PAYMENT] spend success");
            return true;
        }
        console.log("[PAYMENT] spend failed");
        return false;
    },
    hasDailyPayment:function(playerKey, name, index) {
        var dateKey = "date_" + name + "_" + String(index);
        var userKey = this.playerKey2UserKey[playerKey];
        var gameUserStates = $StateManager.getState(GAME_USER_CONFIG);
        var gameUserData = gameUserStates[userKey];
        if (!gameUserData) {
            console.log("[PAYMENT] checkDaily dateKey:{0} -> undef, playerKey:{1}, userKey:{2}".format(dateKey, playerKey, userKey));
            return false;
        }
        var gameUserPlayerData = gameUserData[playerKey];
        if (!gameUserPlayerData) {
            console.log("[PAYMENT] checkDaily dateKey:{0} -> undef2, playerKey:{1}, userKey:{2}".format(dateKey, playerKey, userKey));
            return false;
        }
        var recordDate = gameUserPlayerData[dateKey];
        var date = new Date();
        var dateStr = String(date.getFullYear()) + "-" + String(date.getMonth()) + "-" + String(date.getDate());
        console.log("[PAYMENT] checkDaily dateKey:{0} -> recordDate:{1}, dateStr:{2}, playerKey:{3}, userKey:{4}".format(dateKey, recordDate, dateStr, playerKey, userKey));
        return dateStr == recordDate;
    },
    setDailyPayment:function(playerKey, name, index) {
        var dateKey = "date_" + name + "_" + String(index);
        var userKey = this.playerKey2UserKey[playerKey];
        var gameUserStates = $StateManager.getState(GAME_USER_CONFIG);
        var gameUserData = gameUserStates[userKey];
        gameUserData = (gameUserData ? gameUserData : {});
        gameUserStates[userKey] = gameUserData;
        var gameUserPlayerData = gameUserData[playerKey];
        gameUserPlayerData = (gameUserPlayerData ? gameUserPlayerData : {});
        gameUserData[playerKey] = gameUserPlayerData;
        var date = new Date();
        var dateStr = String(date.getFullYear()) + "-" + String(date.getMonth()) + "-" + String(date.getDate());
        gameUserPlayerData[dateKey] = dateStr;
        $StateManager.commitState(GAME_USER_CONFIG);
        console.log("[PAYMENT] setDaily dateKey:{0} -> dateStr:{1}, playerKey:{2}, userKey:{3}".format(dateKey, dateStr, playerKey, userKey));
    },
    getTodayPayment:function(playerKey) {
        var maxPay = 0;
        for (var name in PaymentData) {
            var data = PaymentData[name];
            for (var i = 0; i < data.max; ++i) {
                var pay = data.pay * (i + 1);
                if (pay < maxPay) {
                    continue;
                }
                if (this.hasDailyPayment(playerKey, name, i)) {
                    maxPay = pay;
                }
            }
        }
        return maxPay;
    },
    spendPaymentName:function(playerKey, name) {
        var oriPay = this.getTodayPayment(playerKey);
        var data = PaymentData[name];
        var spendIndex = -1;
        for (var i = 0; i < data.max; ++i) {
            if (!this.hasDailyPayment(playerKey, name, i)) {
                spendIndex = i;
                break;
            }
        }
        if (spendIndex < 0) {
            console.log("[PAYMENT] byname0 name:{0} -> spendIndex:{1}, playerKey:{2}".format(name, spendIndex, playerKey));
            return true;
        }
        var nowPay = data.pay * (spendIndex + 1);
        if (nowPay <= oriPay) {
            this.setDailyPayment(playerKey, name, spendIndex);
            console.log("[PAYMENT] byname1 name:{0} -> spendIndex:{1}, playerKey:{2}".format(name, spendIndex, playerKey));
            return true;
        }
        if (this.spendPayment(playerKey, nowPay - oriPay)) {
            this.setDailyPayment(playerKey, name, spendIndex);
            console.log("[PAYMENT] byname2 name:{0} -> spendIndex:{1}, playerKey:{2}".format(name, spendIndex, playerKey));
            return true;
        }
        console.log("[PAYMENT] byname3 name:{0} -> spendIndex:{1}, playerKey:{2}".format(name, spendIndex, playerKey));
        return false;
    },

    startRefreshAutomation:function(playerKey, automationConfig) {
        var playerData = this.players[playerKey];
        if (!automationConfig || automationConfig.disabled) {
            return this.stopRefreshAutomation(playerKey);
        }
        console.log("startRefreshAutomation", playerKey);
        var autoConfigs = this.generateConfig(automationConfig, false);
        if (playerData.refreshAutomationKey) {
            this.controller.modifyPlayerAutomation(playerData.refreshAutomationKey, autoConfigs);
        } else {
            playerData.refreshAutomationKey =
                this.controller.setPlayerAutomation(playerData, autoConfigs, () => {
                    return this.spendPaymentName(playerKey, "automation");
                });
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
        if (!targetingConfig || (!targetingConfig.reachPLID && !targetingConfig.allowAssign)) {
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
        if (!droppingConfig || !droppingConfig.allowDrop) {
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
        if (!heroshopConfig || !heroshopConfig.enabled) {
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
    startRefreshUnionwar:function(playerKey, unionwarConfig) {
        var playerData = this.players[playerKey];
        if (!unionwarConfig || (!unionwarConfig.enabled && !unionwarConfig.goodUNID && !unionwarConfig.badUNID)) {
            return this.stopRefreshUnionwar(playerKey);
        }
        console.log("startRefreshUnionwar", playerKey);
        if (playerData.refreshUnionwarKey) {
            this.controller.modifyPlayerUnionwar(playerData.refreshUnionwarKey, unionwarConfig);
        } else {
            playerData.refreshUnionwarKey =
                this.controller.setPlayerUnionwar(playerData, unionwarConfig);
        }
    },
    stopRefreshUnionwar:function(playerKey) {
        var playerData = this.players[playerKey];
        if (playerData.refreshUnionwarKey) {
            console.log("stopRefreshUnionwar", playerKey);
            this.controller.unsetPlayer(playerData.refreshUnionwarKey);
            playerData.refreshUnionwarKey = null;
        }
    },
    startRefreshKingwar:function(playerKey, kingwarConfig) {
        var playerData = this.players[playerKey];
        if (!kingwarConfig || kingwarConfig.area == 0) {
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
        if (!listingConfig || listingConfig.unionCount == 0) {
            return this.stopRefreshListing(playerKey);
        }
        console.log("startRefreshListing", playerKey, listingConfig);
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
        delete this.playerKey2UserKey[playerKey];
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
                    } else if (tail == "UNID") {
                        result[key] = this.unionId2RandKey[setting[key]];
                    } else {
                        result[key] = setting[key];
                    }
                }
                return result;
            }
        }
    },
    compareSetting:function(configA, configB) {
        if (!configA && !configB) {
            return true;
        }
        if ((configA && !configB) || (!configA && configB)) {
            return false;
        }
        for (var key in configA) {
            if (typeof(configA[key]) != typeof(configB[key]) || configA[key] != configB[key]) {
                return false;
            }
        }
        return true;
    },
    evaluateSettingBool:function(val) {
        return (val ? true : false);
    },
    evaluateSettingNumber:function(val, min, max, def) {
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
            area: this.evaluateSettingNumber(kingwar.area, 0, 4, 0),
            star: this.evaluateSettingNumber(kingwar.star, 1, 10, 1),
        };
        if (kingwarConfig.area == 0) {
            kingwarConfig = undefined;
        } else if (kingwarConfig.area == 4) {
            kingwarConfig.star = 1;
        }
        if (this.compareSetting(kingwarConfig, settingStates.kingwar[playerKey])) {
            return false;
        }
        console.log("set kingwar for player", playerKey, kingwarConfig);
        settingStates.kingwar[playerKey] = kingwarConfig;
        this.startRefreshKingwar(playerKey, kingwarConfig);
        return true;
    },
    setSettingListing:function(playerKey, listing) {
        var settingStates = $StateManager.getState(GAME_SETTING_CONFIG);
        var listingConfig = {
            unionCount: this.evaluateSettingNumber(listing.unionCount, 0, 20, 0),
            minPower: 300,
            limitPower: 800,
            limitDay: this.evaluateSettingNumber(listing.limitDay, 10, 20, 20),
        };
        if (listingConfig.unionCount == 0) {
            listingConfig = undefined;
        }
        if (this.compareSetting(listingConfig, settingStates.listing[playerKey])) {
            return false;
        }
        console.log("set listing for player", playerKey, listingConfig);
        settingStates.listing[playerKey] = listingConfig;
        this.startRefreshListing(playerKey, listingConfig);
        return true;
    },
    setSettingTargeting:function(playerKey, targeting) {
        var settingStates = $StateManager.getState(GAME_SETTING_CONFIG);
        var targetingConfig = {
            reachPLID: this.randKey2PlayerId[targeting.reachPLID] || "",
            disableEmperor: this.evaluateSettingBool(targeting.disableEmperor),
            allowAssign: this.evaluateSettingBool(targeting.allowAssign),
            minStar: this.evaluateSettingNumber(targeting.minStar, 1, 10, 1),
            forceEmperor: this.evaluateSettingBool(targeting.forceEmperor),
        };
        if (targetingConfig.reachPLID == "" && !targetingConfig.allowAssign) {
            targetingConfig = undefined;
        }
        if (this.compareSetting(targetingConfig, settingStates.targeting[playerKey])) {
            return false;
        }
        console.log("set targeting for player", playerKey, targetingConfig);
        settingStates.targeting[playerKey] = targetingConfig;
        this.startRefreshTargeting(playerKey, targetingConfig);
        return true;
    },
    setSettingDropping:function(playerKey, dropping) {
        var settingStates = $StateManager.getState(GAME_SETTING_CONFIG);
        var droppingConfig = {
            allowDrop: this.evaluateSettingBool(dropping.allowDrop),
        };
        if (!droppingConfig.allowDrop) {
            droppingConfig = undefined;
        }
        if (this.compareSetting(droppingConfig, settingStates.dropping[playerKey])) {
            return false;
        }
        console.log("set dropping for player", playerKey, droppingConfig);
        settingStates.dropping[playerKey] = droppingConfig;
        this.startRefreshDropping(playerKey, droppingConfig);
        return true;
    },
    setSettingHeroshop:function(playerKey, heroshop) {
        var settingStates = $StateManager.getState(GAME_SETTING_CONFIG);
        var heroshopConfig = {
            enabled: this.evaluateSettingBool(heroshop.enabled),
            maxReduce: this.evaluateSettingNumber(heroshop.maxReduce, 50, 60, 55),
            refresh: this.evaluateSettingNumber(heroshop.refresh, 0, 8, 0),
        };
        if (!heroshopConfig.enabled) {
            heroshopConfig = undefined;
        }
        if (this.compareSetting(heroshopConfig, settingStates.heroshop[playerKey])) {
            return false;
        }
        console.log("set heroshop for player", playerKey, heroshopConfig);
        settingStates.heroshop[playerKey] = heroshopConfig;
        this.startRefreshHeroshop(playerKey, heroshopConfig);
        return true;
    },
    setSettingUnionwar:function(playerKey, unionwar) {
        var settingStates = $StateManager.getState(GAME_SETTING_CONFIG);
        var unionwarConfig = {
            enabled: this.evaluateSettingBool(unionwar.enabled),
            onlyOccupy: this.evaluateSettingBool(unionwar.onlyOccupy),
            reverseOrder: this.evaluateSettingBool(unionwar.reverseOrder),
            goodUNID: this.randKey2UnionId[unionwar.goodUNID] || "",
            badUNID: this.randKey2UnionId[unionwar.badUNID] || "",
        };
        if (!unionwarConfig.enabled && !unionwarConfig.goodUNID && !unionwarConfig.badUNID) {
            unionwarConfig = undefined;
        }
        if (this.compareSetting(unionwarConfig, settingStates.unionwar[playerKey])) {
            return false;
        }
        console.log("set unionwar for player", playerKey, unionwarConfig);
        settingStates.unionwar[playerKey] = unionwarConfig;
        this.startRefreshUnionwar(playerKey, unionwarConfig);
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

        if (info.settingsChanged) {
            $StateManager.commitState(GAME_SETTING_CONFIG);
        }
        if (info.namesChanged) {
            $StateManager.commitState(GAME_PLAYER_NAME_CONFIG);
        }
        $StateManager.commitState(GAME_ACCOUNTS_CONFIG);
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

    findHeroCache:function(playerKey) {
        var heroCache = this.playerHerosInfo[playerKey];
        if (heroCache) {
            var nowTime = new Date().getTime();
            if (nowTime - heroCache.time < 5 * 60 * 1000) {
                return heroCache.heros;
            }
        }
        return null;
    },
    commitHeroCache:function(playerKey, heros) {
        this.playerHerosInfo[playerKey] = {
            time: new Date().getTime(),
            heros: heros,
        };
    },

    setupPlayerAuto:function(playerKey, session, playerAuto) {
        if (session.authorized(0, "auto_heropanel")) {
            playerAuto.heroPanel = true;
        }
        if (session.authorized(0, "auto_daily")) {
            playerAuto.configs = this.getSettingAutomation(playerKey);
        }
        var auth_kingwar = session.authorized(0, "auto_kingwar");
        var auth_heroshop = session.authorized(0, "auto_heroshop");
        var auth_unionwar = session.authorized(0, "auto_unionwar");
        var auth_detail = session.authorized(0, "auto_detail");
        if (auth_kingwar || auth_heroshop || auth_unionwar || auth_detail) {
            playerAuto.settings = {};
            if (auth_kingwar) {
                playerAuto.settings.targeting = this.getSettingTyped("targeting", playerKey);
                playerAuto.settings.dropping = this.getSettingTyped("dropping", playerKey);
            }
            if (auth_heroshop) {
                playerAuto.settings.heroshop = this.getSettingTyped("heroshop", playerKey);
            }
            if (auth_unionwar) {
                playerAuto.settings.unionwar = this.getSettingTyped("unionwar", playerKey);
            }
            if (auth_detail) {
                playerAuto.settings.kingwar = this.getSettingTyped("kingwar", playerKey);
                playerAuto.settings.listing = this.getSettingTyped("listing", playerKey);
            }
        }
        return playerAuto;
    },

    listheros:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({USER:3, REQ:"auto_heropanel"}, next))) {
                return safe(done)();
            }

            var json = yield requestor.visitBodyJson(next);
            if (!json || !json.key) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var playerKey = json.key;
            var isForce = json.force;
            var playerData = this.players[playerKey];
            if (!playerData) {
                responder.addError("Invalid player key.");
                return responder.respondJson({}, done);
            }

            var playerBelong = this.getPlayerIndex(session.getUserData(), playerKey);
            if (playerBelong < 0) {
                responder.addError("Player doesn't belong to user.");
                return responder.respondJson({}, done);
            }

            var heros = (!isForce ? this.findHeroCache(playerKey) : null);
            if (!heros) {
                heros = yield this.controller.getPlayerHeroData(playerData, next);
                if (heros.length > 0) {
                    this.commitHeroCache(playerKey, heros);
                }
            }
            responder.respondJson({
                heros: heros,
            }, done);
        }, this);
    },
    operatehero:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({USER:3, REQ:"auto_heropanel"}, next))) {
                return safe(done)();
            }

            var json = yield requestor.visitBodyJson(next);
            if (!json || !json.key || !json.heros) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var playerKey = json.key;
            var heroOps = json.heros;
            var playerData = this.players[playerKey];
            if (!playerData) {
                responder.addError("Invalid player key.");
                return responder.respondJson({}, done);
            }

            var playerBelong = this.getPlayerIndex(session.getUserData(), playerKey);
            if (playerBelong < 0) {
                responder.addError("Player doesn't belong to user.");
                return responder.respondJson({}, done);
            }

            var heroIds = [];
            for (var heroId in heroOps) {
                heroIds.push(heroId);
            }
            var heros = yield this.controller.dealWithPlayerHeros(playerData, heroIds, (heroId, heroObj, tdone) => {
                var tnext = coroutine(function*() {
                    var oriPos = heroObj.getPos();
                    var oriUpgrade = heroObj.getUpgrade();
                    var oriFood = heroObj.getFood();
                    var oriStoneLevel = heroObj.getStoneLevel();
                    var oriSkillLevel = heroObj.getSkillLevel();
                    var oriGemWake = heroObj.getGemWake();
                    var oriGemLevel = heroObj.getGemLevel();
                    var ops = heroOps[heroId];
                    if (ops.renew) {
                        if (oriPos != 0) {
                            return safe(tdone)();
                        }
                        yield heroObj.renew(tnext);
                    }
                    if (ops.pos) {
                        var data = yield heroObj.setPos(ops.pos.target, tnext);
                    }
                    if (ops.upgrade) {
                        if (ops.upgrade == 1) {
                            yield heroObj.setUpgrade(oriUpgrade, tnext);
                        } else if (ops.upgrade == 2) {
                            yield heroObj.fullUpgrade(tnext);
                        }
                    }
                    if (ops.food) {
                        if (ops.food == 1) {
                            yield heroObj.setFood(oriFood, tnext);
                        } else if (ops.food == 2) {
                            yield heroObj.fullFood(tnext);
                        }
                    }
                    if (ops.stone) {
                        if (ops.stone == 1) {
                            yield heroObj.setStoneLevel(oriStoneLevel, tnext);
                            yield heroObj.setSkillLevel(oriSkillLevel, tnext);
                        } else if (ops.stone == 2) {
                            yield heroObj.fullStone(tnext);
                        }
                    }
                    if (ops.gem) {
                        if (ops.gem == 1) {
                            yield heroObj.setGemWake(oriGemWake, tnext);
                            yield heroObj.setGemLevel(oriGemLevel, tnext);
                        } else if (ops.gem == 2) {
                            yield heroObj.fullGem(tnext);
                        }
                    }
                    safe(tdone)();
                }, this);
            }, next);

            if (heros.length > 0) {
                this.commitHeroCache(playerKey, heros);
            }

            responder.respondJson({
                success: true,
            }, done);
        }, this);
    },
    addaccount:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({USER:3, REQ:"automation"}, next))) {
                return safe(done)();
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
            var userAccounts = session.getUserData().accounts;
            userAccounts = (userAccounts ? userAccounts : []);
            userAccounts.push(accountKey);
            session.getUserData().accounts = userAccounts;
            $StateManager.commitState(GAME_ACCOUNTS_CONFIG);
            $StateManager.commitState(USER_CONFIG);

            responder.respondJson({
                success: true,
                key: accountKey,
            }, done);
        }, this);
    },
    changepwd:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({USER:3, REQ:"automation"}, next))) {
                return safe(done)();
            }

            var json = yield requestor.visitBodyJson(next);
            if (!json || !json.key || !json.pd) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var accountKey = json.key;
            var password = json.pd;
            if (!this.accounts[accountKey]) {
                responder.addError("Invalid account key.");
                return responder.respondJson({}, done);
            }

            var accountData = this.accounts[accountKey];
            var newAccount = this.accountManager.add(accountData.username, password);
            var conn = this.accountManager.connectAccount(newAccount, null);
            var data = yield conn.loginAccount(next);
            this.accountManager.remove(newAccount);
            if (!data.success) {
                responder.addError("Account password error.");
                return responder.respondJson({fail:"account_fault"}, done);
            }

            var account = accountData.account;
            this.accountManager.change(account, password);

            var accountStates = $StateManager.getState(GAME_ACCOUNTS_CONFIG);
            accountStates.accounts[accountKey].password = password;
            $StateManager.commitState(GAME_ACCOUNTS_CONFIG);

            responder.respondJson({
                success: true,
            }, done);
        }, this);
    },
    delaccount:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({USER:3, REQ:"automation"}, next))) {
                return safe(done)();
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

            var accountBelong = this.getAccountIndex(session.getUserData(), accountKey);
            if (accountBelong < 0) {
                responder.addError("Account doesn't belong to user.");
                return responder.respondJson({}, done);
            }

            var info = {};
            this.delUserAccount(session.getUserData(), accountBelong, info);

            if (info.settingsChanged) {
                $StateManager.commitState(GAME_SETTING_CONFIG);
            }
            if (info.namesChanged) {
                $StateManager.commitState(GAME_PLAYER_NAME_CONFIG);
            }
            $StateManager.commitState(GAME_ACCOUNTS_CONFIG);
            $StateManager.commitState(USER_CONFIG);

            responder.respondJson({
                success: true,
            }, done);
        }, this);
    },
    addplayer:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({USER:3, REQ:"automation"}, next))) {
                return safe(done)();
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

            var accountBelong = this.getAccountIndex(session.getUserData(), accountKey);
            if (accountBelong < 0) {
                responder.addError("Account doesn't belong to user.");
                return responder.respondJson({}, done);
            }

            for (var playerKey in this.players) {
                var playerData = this.players[playerKey];
                if (playerData.accountKey == accountKey && playerData.server == server) {
                    responder.addError("Player already added.");
                    return responder.respondJson({}, done);
                }
            }

            var playerKey = rkey();
            while(this.players[playerKey]) { playerKey = rkey(); }
            var accountStates = $StateManager.getState(GAME_ACCOUNTS_CONFIG);
            accountStates.players[playerKey] = {
                account: accountKey,
                server: server,
            };
            this.playerKey2UserKey[playerKey] = session.getUserKey();
            this.addPlayer(playerKey, accountKey, server);
            var userPlayers = session.getUserData().players;
            userPlayers = (userPlayers ? userPlayers : []);
            userPlayers.push(playerKey);
            session.getUserData().players = userPlayers;
            $StateManager.commitState(GAME_ACCOUNTS_CONFIG);
            $StateManager.commitState(USER_CONFIG);

            var playerAuto = this.setupPlayerAuto(playerKey, session, {
                success: true,
                key: playerKey,
            });
            responder.respondJson(playerAuto, done);
        }, this);
    },
    delplayer:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({USER:3, REQ:"automation"}, next))) {
                return safe(done)();
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

            var playerBelong = this.getPlayerIndex(session.getUserData(), playerKey);
            if (playerBelong < 0) {
                responder.addError("Player doesn't belong to user.");
                return responder.respondJson({}, done);
            }

            var info = {};
            this.delUserPlayer(session.getUserData(), playerBelong, info);

            if (info.settingsChanged) {
                $StateManager.commitState(GAME_SETTING_CONFIG);
            }
            if (info.namesChanged) {
                $StateManager.commitState(GAME_PLAYER_NAME_CONFIG);
            }
            $StateManager.commitState(GAME_ACCOUNTS_CONFIG);
            $StateManager.commitState(USER_CONFIG);

            responder.respondJson({
                success: true,
            }, done);
        }, this);
    },
    playersetting:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({USER:3, REQ:"automation"}, next))) {
                return safe(done)();
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

            var playerBelong = this.getPlayerIndex(session.getUserData(), playerKey);
            if (playerBelong < 0) {
                responder.addError("Player doesn't belong to user.");
                return responder.respondJson({}, done);
            }

            var auth_kingwar = session.authorized(0, "auto_kingwar");
            var auth_heroshop = session.authorized(0, "auto_heroshop");
            var auth_unionwar = session.authorized(0, "auto_unionwar");
            var auth_detail = session.authorized(0, "auto_detail");
            var changed = false;
            if (auth_kingwar && settings.targeting) {
                changed = this.setSettingTargeting(playerKey, settings.targeting) || changed;
            }
            if (auth_kingwar && settings.dropping) {
                changed = this.setSettingDropping(playerKey, settings.dropping) || changed;
            }
            if (auth_heroshop && settings.heroshop) {
                changed = this.setSettingHeroshop(playerKey, settings.heroshop) || changed;
            }
            if (auth_unionwar && settings.unionwar) {
                changed = this.setSettingUnionwar(playerKey, settings.unionwar) || changed;
            }
            if (auth_detail && settings.kingwar) {
                changed = this.setSettingKingwar(playerKey, settings.kingwar) || changed;
            }
            if (auth_detail && settings.listing) {
                changed = this.setSettingListing(playerKey, settings.listing) || changed;
            }
            if (changed) {
                $StateManager.commitState(GAME_SETTING_CONFIG);
            }

            responder.respondJson({
                success: true,
            }, done);
        }, this);
    },
    playerautomation:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({USER:3, REQ:"auto_daily"}, next))) {
                return safe(done)();
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

            var playerBelong = this.getPlayerIndex(session.getUserData(), playerKey);
            if (playerBelong < 0) {
                responder.addError("Player doesn't belong to user.");
                return responder.respondJson({}, done);
            }

            var automationConfig = this.validateConfig(configs);
            if (!automationConfig) {
                responder.addError("Not valid config information.");
                return responder.respondJson({}, done);
            }

            playerData.validator.resetHourly();
            this.setSettingAutomation(playerKey, automationConfig);
            $StateManager.commitState(GAME_SETTING_CONFIG);

            responder.respondJson({
                success: true,
            }, done);
        }, this);
    },
    playermanual:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({USER:3, REQ:"auto_daily"}, next))) {
                return safe(done)();
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

            var playerBelong = this.getPlayerIndex(session.getUserData(), playerKey);
            if (playerBelong < 0) {
                responder.addError("Player doesn't belong to user.");
                return responder.respondJson({}, done);
            }

            if (!this.spendPaymentName(playerKey, "manual")) {
                responder.addError("Player payment not enough.");
                return responder.respondJson({}, done);
            }

            var autoConfigs = this.getSettingAutomation(playerKey);
            var heroshopConfig = this.getSettingTyped("heroshop", playerKey);
            playerData.validator.resetHourly();
            var data = yield this.controller.manualPlayerAutomation(playerData, autoConfigs, heroshopConfig, next);
            console.log("Manual finished!");

            responder.respondJson({
                success: !!data.success,
            }, done);
        }, this);
    },
    listautomation:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({USER:3, REQ:"automation"}, next))) {
                return safe(done)();
            }

            var userData = session.getUserData();
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
                            var playerAuto = this.setupPlayerAuto(playerKey, session, {
                                name: (brief ? brief.name : undefined),
                                power: (brief ? brief.power : undefined),
                                server: playerData.server,
                                key: playerKey,
                            });
                            accounts[j].players.push(playerAuto);
                            break;
                        }
                    }
                }
            }
            var players = [];
            if (session.authorized(0, "auto_kingwar")) {
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
            }
            var unions = [];
            if (session.authorized(0, "auto_unionwar")) {
                var allUnions = $StateManager.getState(GAME_UNIONS_CONFIG);
                for (var unionId in allUnions) {
                    var unionItem = allUnions[unionId];
                    var rawKey = this.unionId2RandKey[unionId];
                    if (rawKey) {
                        unions.push({
                            key: rawKey,
                            server: unionItem.server,
                            name: unionItem.name,
                            short: unionItem.short,
                        });
                    }
                }
            }

            var servers = (session.authorized(4) ? this.controller.getAllServerDesc() : userData.sev) || [];
            responder.respondJson({
                accounts: accounts,
                players: players,
                unions: unions,
                servers: servers,
            }, done);
        }, this);
    },
    orderautomation:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({USER:3, REQ:"automation"}, next))) {
                return safe(done)();
            }

            var json = yield requestor.visitBodyJson(next);
            if (!json || !json.orders) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            // use new order
            var orders = json.orders;
            var userData = session.getUserData();
            var oldAccounts = clone(userData.accounts);
            var newAccounts = [];
            for (var i = 0; i < orders.length; ++i) {
                var accountKey = orders[i];
                for (var j = 0; j < oldAccounts.length; ++j) {
                    if (accountKey == oldAccounts[j]) {
                        newAccounts.push(accountKey);
                        oldAccounts.splice(j, 1);
                        break;
                    }
                }
            }
            // append the rest
            for (var i = 0; i < oldAccounts.length; ++i) {
                newAccounts.push(oldAccounts[i]);
            }
            userData.accounts = newAccounts;
            $StateManager.commitState(USER_CONFIG);

            responder.respondJson({
                success: true,
            });
        }, this);
    },
    checkrefresh:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({POST:true, USER:3, REQ:"view_refresh"}, next))) {
                return safe(done)();
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
    manrefresh:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({POST:true, USER:3, REQ:"view_refresh"}, next))) {
                return safe(done)();
            }

            var json = yield requestor.visitBodyJson(next);
            if (!json || !json.integrity || !json.func) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var func = json.func;
            var funcItem = AllFuncMap[func];
            if (!funcItem) {
                responder.addError("Not valid func.");
                return responder.respondJson({}, done);
            }

            var delay = !!this.delayRefresh;
            if (!delay) {
                delay = this.noConfliction((delayed) => {
                    this.delayRefresh = false;
                    console.log("delayRefresh end");
                    this.doRefresh("kingwar;playerlist");
                });
            }
            if (delay) {
                this.delayRefresh = true;
                console.log("delayRefresh", this.delayRefresh);
            }

            responder.respondJson({
                success: true,
                isDelay: delay,
            }, done);
        }, this);
    },
    setheroshop:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({USER:3, REQ:"server_heroshop"}, next))) {
                return safe(done)();
            }

            var json = yield requestor.visitBodyJson(next);
            if (!json || !json.heroId || !json.cmd) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var heroId = json.heroId;
            var cmd = json.cmd;
            var heroInfo = Database.heroInfo(heroId);
            if (!heroInfo || heroInfo.level < 8 || (cmd != "add" && cmd != "del")) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var userHeros = session.getUserData().heros || {};
            if (cmd == "add") {
                userHeros[heroId] = true;
            } else {
                delete userHeros[heroId];
            }
            session.getUserData().heros = userHeros;
            $StateManager.commitState(USER_CONFIG);

            responder.respondJson({
                success: true,
            });
        }, this);
    },
    listserverinfo:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({USER:3, REQ:"server"}, next))) {
                return safe(done)();
            }

            var json = yield requestor.visitBodyJson(next);
            if (!json || !json.vulkan) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var allServerInfo = {};

            if (session.authorized(0, "server_heroshop")) {
                var heros = Database.allHeros(8); // at least 'SSS'
                var heroshopInfo = $StateManager.getState(GAME_HEROSHOP_CONFIG);
                var userHeros = session.getUserData().heros || {};
                allServerInfo.heroshop = {
                    heros: heros,
                    heroshop: heroshopInfo.info,
                    userHeros: userHeros,
                };
            }

            responder.respondJson(allServerInfo);
        }, this);
    },
    listplayers:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({USER:3, REQ:"view_playerlist"}, next))) {
                return safe(done)();
            }

            var players = [];
            var playersData = this.controller.getSortedPlayers(500);
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
            var hasRefresh = session.authorized(0, "view_refresh");
            var tag = this.getTag(playersData) + String(hasRefresh);
            if (!requestor.compareTags(tag)) {
                responder.setCode(304);
                return responder.respondData(Buffer.alloc(0), safe(done));
            }

            responder.setTag(tag);
            responder.respondJson({
                hasRefresh: hasRefresh,
                players: players,
            }, done);
        }, this);
    },
    listkingwars:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({USER:3, REQ:"view_kingwar"}, next))) {
                return safe(done)();
            }

            var kingwarData = this.controller.getKingwar();
            var hasRefresh = session.authorized(0, "view_refresh");
            var tag = this.getTag(kingwarData) + String(hasRefresh);
            if (!requestor.compareTags(tag)) {
                responder.setCode(304);
                return responder.respondData(Buffer.alloc(0), safe(done));
            }
            responder.setTag(tag);
            responder.respondJson({
                hasRefresh: hasRefresh,
                areastars:kingwarData,
            }, done);
        }, this);
    },
    functions:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({USER:3, AUTH:1}, next))) {
                return safe(done)();
            }

            var funcs = [];
            for (var i = 0; i < AllFuncs.length; ++i) {
                if (session.authorized(AllFuncs[i].authBase, AllFuncs[i].requirement)) {
                    funcs.push(AllFuncs[i].name);
                }
            }

            responder.respondJson({funcs:funcs}, done);
        }, this);
    },
});


require("../Base");
require("../Heartbeat");
require("../Select");
require("../TimingManager");
require("./GameConnection");

// states:
// 0: 什么都不做
// 1: 定期执行(kingwar/playerlist/automation)
// 2: 执行每日任务(automation)
// 3: 执行极限加入(targeting)
// 4: 极限加入已完成(targeting)
// 5: 执行极限刷新(kingwar)

Base.extends("AccountManager", {
    _constructor:function() {
        this.accounts = {};
    },
    add:function(username, password) {
        var accountKey = rkey();
        while(this.accounts[accountKey]) {accountKey = rkey();}
        this.accounts[accountKey] = {
            username:username,
            password:password,
        }
        console.log("Account added. accountKey:{0}, username:{1}".format(accountKey, username));
        return accountKey;
    },
    remove:function(accountKey) {
        console.log("Account deleted. accountKey:{0}".format(accountKey));
        if (this.accounts[accountKey]) {
            delete this.accounts[accountKey];
        }
    },
    list:function() {
        return this.accounts;
    },

    connectAccount:function(accountKey, validator) {
        var accountData = this.accounts[accountKey];
        if (!accountData) {
            return null;
        }

        var accountObj = new GameConnection(accountData.username, accountData.password, validator);
        return accountObj;
    },
});

// Manage all, including
Base.extends("GameController", {
    _constructor:function() {
        this.accountManager = new AccountManager();
        this.timingManager = new TimingManager();

        this.refreshData = {};
        this.refreshingState = false;
        this.heartbeat = new Heartbeat();
        this.initKingwar();
        this.initPlayerListing();
        this.initPlayerAutomation();
        this.initTargeting();
    },
    getAccountManager:function() {
        return this.accountManager;
    },

    setPlayerAutomation:function(playerData, autoConfigs) {
        return this.appendRefresh(playerData, "automation", 2, (conn, done) => {
            this.refreshAutomation(conn, autoConfigs, done);
        });
    },
    modifyPlayerAutomation:function(key, autoConfigs) {
        return this.setRefreshFunc(key, (conn, done) => {
            this.refreshAutomation(conn, autoConfigs, done);
        });
    },
    manualPlayerAutomation:function(playerData, autoConfigs, done) {
        var next = coroutine(function*() {
            yield playerData.mutex.lock(next);
            var conn = this.accountManager.connectAccount(playerData.account, playerData.validator);
            if (!conn) {
                return safe(done)({});
            }
            var data = yield conn.loginAccount(next);
            if (!data.success) {
                return safe(done)({});
            }
            var data = yield conn.loginGame(playerData.server, next);
            if (!data.success) {
                return safe(done)({});
            }
            yield this.refreshAutomation(conn, autoConfigs, next);
            conn.quit();
            playerData.mutex.unlock();
            safe(done)({
                success: true,
            });
        }, this);
    },

    setPlayerTargeting:function(playerData, targetingConfig) {
        var key = this.appendRefresh(playerData, "targeting", 3, (conn, done) => {
            this.refreshTargeting(conn, targetingConfig, key, done);
        });
        return key;
    },
    modifyPlayerTargeting:function(key, targetingConfig) {
        return this.setRefreshFunc(key, (conn, done) => {
            this.refreshTargeting(conn, targetingConfig, key, done);
        });
    },

    setPlayerListing:function(playerData, listingConfig) {
        return this.appendRefresh(playerData, "playerlist", 1, (conn, done) => {
            this.refreshPlayerListing(conn, {
                unionCount: listingConfig.unionCount,
                minPower: listingConfig.minPower * 10000,
                limitPower: listingConfig.limitPower * 10000,
                limitDay: listingConfig.limitDay,
            }, done);
        });
    },
    modifyPlayerListing:function(key, listingConfig) {
        return this.setRefreshFunc(key, (conn, done) => {
            this.refreshPlayerListing(conn, {
                unionCount: listingConfig.unionCount,
                minPower: listingConfig.minPower * 10000,
                limitPower: listingConfig.limitPower * 10000,
                limitDay: listingConfig.limitDay,
            }, done);
        });
    },
    getPlayers:function() {
        return this.allPlayers;
    },
    getUnions:function() {
        return this.allUnions;
    },
    getSortedPlayers:function(count) {
        var sortedPlayerIds = this.sortedPlayerIds;
        var allPlayerIds = {};
        for (var playerId in this.allPlayers) {
            allPlayerIds[playerId] = true;
        }
        for (var i = 0; i < sortedPlayerIds.length; ++i) {
            var playerId = sortedPlayerIds[i];
            delete allPlayerIds[playerId];
        }
        for (var playerId in allPlayerIds) {
            sortedPlayerIds.push(playerId);
        }
        for (var i = 1; i < sortedPlayerIds.length; ++i) {
            var player = this.allPlayers[sortedPlayerIds[i]];
            var prevPlayer = this.allPlayers[sortedPlayerIds[i - 1]];
            if (player.maxPower > prevPlayer.maxPower) {
                var toExchange = [];
                var startIndex = 0;
                for (var j = i - 1; j >= 0; --j) {
                    prevPlayer = this.allPlayers[sortedPlayerIds[j]];
                    if (player.maxPower <= prevPlayer.maxPower) {
                        startIndex = j + 1;
                        break;
                    } else {
                        toExchange.push(sortedPlayerIds[j]);
                    }
                }
                toExchange.push(sortedPlayerIds[i]);
                toExchange.push(i - startIndex + 1); // length
                toExchange.push(startIndex); // start
                toExchange.reverse();
                Array.prototype.splice.apply(sortedPlayerIds, toExchange);
            }
        }
        var sortedPlayers = [];
        count = (count < sortedPlayerIds.length ? count : sortedPlayerIds.length);
        for (var i = 0; i < count; ++i) {
            var playerId = sortedPlayerIds[i];
            var player = this.allPlayers[playerId];
            var union = (player.unionId ? this.allUnions[player.unionId] : {});
            var kingwarKey = this.playerToKingwar[playerId];
            sortedPlayers.push({
                key: playerId,
                server: (player.server ? player.server : ""),
                uName: (union.name ? union.name : ""),
                uShort: (union.short ? union.short : ""),
                name: (player.name ? player.name : ""),
                power: player.maxPower,
                level: (player.level ? player.level : 0),
                last: (player.lastLogin ? player.lastLogin.getTime() : 0),
                kingwar: (kingwarKey ? kingwarKey : 0),
            });
        }
        return sortedPlayers;
    },
    setMaxPowers:function(allPowerMax) {
        for (var playerId in allPowerMax) {
            var playerInfo = this.allPlayers[playerId];
            playerInfo = (playerInfo ? playerInfo : {});
            playerInfo.maxPower = allPowerMax[playerId].maxPower;
            this.allPlayers[playerId] = playerInfo;
        }
    },

    setPlayerKingwar:function(playerData, kingwarConfig) {
        var kingwarKey = kingwarConfig.area * 100 + kingwarConfig.star;
        return this.appendRefresh(playerData, "kingwar", 1, (conn, done) => {
            this.refreshKingwar(conn, {
                kingwarKey: kingwarKey,
                area: kingwarConfig.area,
                star: kingwarConfig.star,
                server:playerData.server,

                refData:this.kingwarRefs[kingwarKey],
            }, done);
        });
    },
    modifyPlayerKingwar:function(key, kingwarConfig) {
        var kingwarKey = kingwarConfig.area * 100 + kingwarConfig.star;
        return this.setRefreshFunc(key, (conn, done) => {
            this.refreshKingwar(conn, {
                kingwarKey: kingwarKey,
                area: kingwarConfig.area,
                star: kingwarConfig.star,

                refData:this.kingwarRefs[kingwarKey],
            }, done);
        });
    },
    getKingwar:function() {
        var areastars = {};
        for (var key in this.kingwarRefs) {
            var data = this.kingwarRefs[key];
            areastars[key] = [];
            for (var i = 0; i < data.players.length; ++i) {
                var warPlayer = data.players[i];
                var extraPlayerData = this.allPlayers[warPlayer.playerId];
                areastars[key].push({
                    union: warPlayer.union,
                    power: warPlayer.power,
                    name: (extraPlayerData && extraPlayerData.name ? extraPlayerData.name : warPlayer.name),
                    maxPower: (extraPlayerData ? extraPlayerData.maxPower : warPlayer.power),
                });
            }
        }
        return areastars;
    },

    unsetPlayer:function(key) {
        return this.removeRefresh(key);
    },

    startPeriodic:function(interval, refreshType, callback) {
        if (this.periodicUnique) {
            return;
        }
        this.heartbeat.setup(interval * 2, () => {
            console.log("========================= refreshing loop dead! ===========================");
            this.cancelPeriodic();
            this.startPeriodic(interval, null, callback);
        });
        console.log("refreshing start!", refreshType);
        var periodicUnique = { callback: callback };
        this.periodicUnique = periodicUnique;
        var next = coroutine(function*() {
            while(this.periodicUnique === periodicUnique) {
                this.heartbeat.beat();
                var startTime = new Date().getTime();
                this.refreshingState = true;
                console.log("refreshing loop!", new Date());
                yield this.refreshAllPlayers((funcObj) => {
                    if (funcObj.state != 1) {
                        return false;
                    }
                    var matchType = refreshType && refreshType.indexOf(funcObj.refresh) >= 0;
                    if (!refreshType || matchType) {
                        return true;
                    }
                    return false;
                }, next);
                if (this.periodicUnique !== periodicUnique) {
                    break;
                }
                this.refreshingState = false;

                var endTime = new Date().getTime();
                if (periodicUnique.callback) {
                    yield periodicUnique.callback(next);
                    if (this.periodicUnique !== periodicUnique) {
                        break;
                    }
                }
                var period = (endTime - startTime) / 1000;
                console.log("taking {0} seconds. waiting {1} seconds...".format(period, interval), new Date());
                yield setTimeout(next, interval * 1000);
                refreshType = null;
            }
            console.log("refreshing quit!");
        }, this);
    },
    cancelPeriodic:function() {
        this.heartbeat.cancel();
        this.periodicUnique = null;
    },
    duringPeriodic:function() {
        return this.refreshingState;
    },

    startDailyTask:function(dailyTimes) {
        this.unsetEventKeys(this.dailyTasks);
        this.dailyTasks = [];
        var doDailyTask = () => {
            console.log("daily task start!");
            this.refreshAllPlayers((funcObj) => {
                return funcObj.state == 2;
            }, () => {
                console.log("daily task end!");
            });
        };
        for (var i = 0; i < dailyTimes.length; ++i) {
            var dailyInfo = dailyTimes[i];
            var eventKey = this.timingManager.setDailyEvent(dailyInfo.hour, dailyInfo.minute, dailyInfo.second, doDailyTask);
            this.dailyTasks.push(eventKey);
        }
    },
    cancelDailyTask:function() {
        if (this.dailyTasks) {
            this.unsetEventKeys(this.dailyTasks);
            this.dailyTasks = null;
        }
    },

    setRepeatRange:function(startTime, endTime) {
        this.unsetEventKeys(this.repeatRanges);
        this.repeatRanges = [];
        var startKey = this.timingManager.setDailyEvent(startTime.hour, startTime.minute, startTime.second, () => {
            console.log("refreshing automation for period start!");
            this.setRefreshStatesOfType("automation", 1);
        });
        this.repeatRanges.push(startKey);
        var endKey = this.timingManager.setDailyEvent(endTime.hour, endTime.minute, endTime.second, () => {
            console.log("refreshing automation for period end!");
            this.setRefreshStatesOfType("automation", 2);
        });
        this.repeatRanges.push(endKey);
    },

    setTargetingEvent:function(selfUnion, time, forceSec) {
        this.unsetEventKeys(this.targetingTimes);
        this.selfUnion = selfUnion;
        this.targetingTimes = [];
        var targetingKey = this.timingManager.setWeeklyEvent(time.day, time.hour, time.minute, time.second, () => {
            this.setRefreshStatesOfType("kingwar", 5);
            var next = coroutine(function*() {
                while(!this.constantKingwar) {
                    var currSec = new Date().getSeconds();
                    this.forceTargeting = (currSec > forceSec);
                    if (this.forceTargeting) {
                        this.kingwarBrief = {};
                        for (var kingwarKey in this.kingwarRefs) {
                            this.kingwarBrief[kingwarKey] = this.getBriefKingwar(kingwarKey);
                        }
                        this.updateTargeting();
                    }
                    yield this.refreshAllPlayers((funcObj) => { return funcObj.state == 3; }, next);
                    if (this.forceTargeting) {
                        break;
                    }
                    yield this.refreshAllPlayers((funcObj) => { return funcObj.state == 5; }, next);
                }
                this.initTargeting();
            }, this);
        });
        this.targetingTimes.push(targetingKey);
    },

    // Private timing helpers
    unsetEventKeys:function(keyArray) {
        if (keyArray) {
            for (var i = 0; i < keyArray.length; ++i) {
                this.timingManager.unsetEvent(keyArray[i]);
            }
        }
    },

    // Private refresh helpers
    appendRefresh:function(playerData, refreshType, initState, func) {
        var accountGameKey = playerData.account + "$" + playerData.server;
        var refreshInfo = this.refreshData[accountGameKey];
        refreshInfo = (refreshInfo ? refreshInfo : {
            account: playerData.account,
            server: playerData.server,
            funcs: [],
            validator: playerData.validator,
            mutex: playerData.mutex,
        });
        var funcObj = {
            func:func,
            refresh: refreshType,
            state: initState,
        };
        refreshInfo.funcs.push(funcObj);
        this.refreshData[accountGameKey] = refreshInfo;
        return {
            key: accountGameKey,
            obj: funcObj,
        };
    },
    removeRefresh:function(key) {
        var findInfo = this.findRefresh(key);
        if (findInfo) {
            findInfo.refreshInfo.funcs.splice(findInfo.index, 1);
            if (findInfo.refreshInfo.funcs.length == 0) {
                delete this.refreshData[key.key];
            }
            return true;
        }
        return false;
    },
    findRefresh:function(key) {
        var refreshInfo = this.refreshData[key.key];
        if (refreshInfo && refreshInfo.funcs && refreshInfo.funcs.length > 0) {
            for (var i = 0; i < refreshInfo.funcs.length; ++i) {
                if (refreshInfo.funcs[i] === key.obj) {
                    return {
                        refreshInfo: refreshInfo,
                        index: i,
                    };
                }
            }
        }
        return null;
    },
    setRefreshState:function(key, state) {
        var findInfo = this.findRefresh(key);
        if (findInfo) {
            var funcObj = findInfo.refreshInfo.funcs[findInfo.index];
            funcObj.state = state;
        }
    },
    setRefreshStatesOfType:function(refreshType, state) {
        for (var accountGameKey in this.refreshData) {
            var refreshInfo = this.refreshData[accountGameKey];
            for (var i = 0; i < refreshInfo.funcs.length; ++i) {
                var funcObj = refreshInfo.funcs[i];
                if (funcObj.refresh == refreshType) {
                    funcObj.state = state;
                }
            }
        }
    },
    setRefreshFunc:function(key, func) {
        var findInfo = this.findRefresh(key);
        if (findInfo) {
            var funcObj = findInfo.refreshInfo.funcs[findInfo.index];
            // must create a new instance in case old one is still being used.
            funcObj = clone(funcObj);
            funcObj.func = func;
            key.obj = funcObj;
            findInfo.refreshInfo.funcs.splice(i, 1, funcObj);
            return true;
        }
        return false;
    },
    refreshAllPlayers:function(checkFun, done) {
        var select = new Select();
        for (var accountGameKey in this.refreshData) {
            var refreshInfo = this.refreshData[accountGameKey];
            var executables = [];
            for (var i = 0; i < refreshInfo.funcs.length; ++i) {
                var funcObj = refreshInfo.funcs[i];
                if (checkFun(funcObj)) {
                    executables.push(funcObj.func);
                }
            }

            if (executables.length > 0) {
                console.log("refresh for player", refreshInfo.account, refreshInfo.server, executables.length);
                this.refreshOnePlayer(refreshInfo, executables, select.setup());
            }
        }
        select.all(done);
    },
    refreshOnePlayer:function(refreshInfo, executables, done) {
        var next = coroutine(function*() {
            yield refreshInfo.mutex.lock(next);
            var conn = this.accountManager.connectAccount(refreshInfo.account, refreshInfo.validator);
            if (!conn) {
                this.errLog("connectAccount", "account:{0}".format(refreshInfo.account));
                refreshInfo.mutex.unlock();
                return safe(done)();
            }
            console.log("start -- player!", refreshInfo.account, refreshInfo.server);
            var data = yield conn.loginAccount(next);
            if (!data.success) {
                this.errLog("loginAccount", "account({0}), server({1})".format(refreshInfo.account, refreshInfo.server));
                refreshInfo.mutex.unlock();
                return safe(done)();
            }
            var data = yield conn.loginGame(refreshInfo.server, next);
            if (!data.success) {
                this.errLog("loginGame", "account({0}), server({1})".format(refreshInfo.account, refreshInfo.server));
                refreshInfo.mutex.unlock();
                return safe(done)();
            }
            for (var i = 0; i < executables.length; ++i) {
                yield executables[i](conn, next);
            }
            console.log("quit -- player!", refreshInfo.account, refreshInfo.server, conn.getGameInfo().name);
            conn.quit();
            refreshInfo.mutex.unlock();
            safe(done)();
        }, this);
    },

    // Private refresh operations
    joinByKingwarKey:function(conn, kingwarKey, done) {
        var area = Math.floor(kingwarKey / 100);
        var star = kingwarKey % 100;
        conn.joinKingWar(area, star, done);
    },
    updateKingwarPlayers:function(kingwarKey, data) {
        var refData = this.kingwarRefs[kingwarKey];
        var players = [];
        for (var i = 0; i < data.players.length; ++i) {
            var playerData = data.players[i];
            players.push({
                playerId: playerData.playerId,
                union: playerData.union,
                name: playerData.name,
                power: playerData.power,
            });
            this.playerToKingwar[playerData.playerId] = kingwarKey;
        }
        refData.players = players;
    },
    getBriefKingwar:function(kingwarKey) {
        var refData = this.kingwarRefs[kingwarKey];
        var selfMaxIndex = -1;
        var selfMaxPower = 0;
        var enemyMaxIndex = -1;
        var enemyMaxPower = 2000000;
        var playerCount = (refData.players.length <= 16 ? refData.players.length : 16);
        var helpCount = (refData.players.length <= 16 ? 1 : 0);
        for (var i = 0; i < playerCount; ++i) {
            var item = refData.players[i];
            var warPlayer = this.allPlayers[item.playerId];
            if (warPlayer) {
                if (warPlayer.unionId == this.selfUnion) {
                    helpCount ++;
                    if (warPlayer.maxPower > selfMaxPower) {
                        selfMaxPower = warPlayer.maxPower;
                        selfMaxIndex = i;
                    }
                } else if (warPlayer.maxPower > enemyMaxPower) {
                    enemyMaxPower = warPlayer.maxPower;
                    enemyMaxIndex = i;
                }
            } else {
                if (item.power > enemyMaxPower) {
                    enemyMaxPower = item.power;
                    enemyMaxIndex = i;
                }
            }
        }
        var powerDiff = selfMaxPower - enemyMaxPower;
        var brief = {
            kingwarKey: kingwarKey,
            count: refData.players.length,
            helpCount: helpCount,
            maxPower: (selfMaxPower > enemyMaxPower ? selfMaxPower : enemyMaxPower),
            minPower: (refData.players.length < 16 ? 0 : refData.players[15].power),
            helpPower: (refData.players.length < 10 ? 0 : refData.players[9].power),
            powerDiff: powerDiff,
            isOurs: powerDiff > 1000000,
            isOthers: powerDiff <= -200000,
            isMutual: powerDiff <= 1000000 && powerDiff > -200000,
        };
        return brief;
    },
    updateTargeting:function() {
        this.targetingFight = [];
        this.targetingHelp = [];
        this.targetingAll = [];
        for (var kingwarKey in this.kingwarBrief) {
            var brief = this.kingwarBrief[kingwarKey];
            var j;
            for (j = 0; j < this.targetingAll.length; ++j) {
                if (this.targetingAll[j].count > brief.count) {
                    break;
                }
            }
            this.targetingAll.splice(j, 0, brief);
            if (brief.isOthers) {
                for (j = 0; j < this.targetingFight.length; ++j) {
                    if (this.targetingFight[j].maxPower < brief.maxPower) {
                        break;
                    }
                }
                this.targetingFight.splice(j, 0, brief);
            }
            if (brief.isMutual) {
                for (j = 0; j < this.targetingHelp.length; ++j) {
                    if (this.targetingHelp[j].helpCount > brief.helpCount) {
                        break;
                    }
                }
                this.targetingHelp.splice(j, 0, brief);
            }
        }
    },
    initTargeting:function() {
        this.resetTargeting();

        this.targetingFight = [];
        this.targetingHelp = [];
        this.targetingAll = [];
    },
    resetTargeting:function() {
        this.forceTargeting = false;
        this.kingwarBrief = {};
    },
    refreshTargeting:function(conn, targetingConfig, selfKey, done) {
        var next = coroutine(function*() {
            var kingwarKey = this.playerToKingwar[targetingConfig.reachPLID];
            if (kingwarKey) {
                console.log("find target", targetingConfig.reachPLID, conn.getGameInfo().name);
                var data_join = yield this.joinByKingwarKey(conn, kingwarKey, next);
            } else {
                if (this.forceTargeting && targetingConfig.allowAssign) {
                    /*
                    var selfInfo = this.allPlayers[conn.getGameInfo().playerId];
                    var currPower = conn.getGameInfo().power;
                    var selfPower = (selfInfo ? selfInfo.maxPower : currPower);
                    var joinTarget = 0;
                    if (targetingConfig.fightForStar) {
                        for (var i = 0; i < this.targetingFight.length; ++i) {
                            var fightItem = this.targetingFight[i];
                            if (selfPower - fightItem.maxPower > 1000000) {
                                joinTarget = fightItem.kingwarKey;
                                fightItem.isOurs = true;
                                fightItem.isOthers = false;
                                fightItem.maxPower = selfPower;
                                console.log("auto join by star", conn.getGameInfo().name, joinTarget, new Date());
                                break;
                            } else if (selfPower - fightItem.maxPower > -200000 && fightItem.helpCount >= 3) {
                                joinTarget = fightItem.kingwarKey;
                                fightItem.isMutual = true;
                                fightItem.isOthers = false;
                                fightItem.maxPower = (selfPower > fightItem.maxPower ? selfPower : fightItem.maxPower);
                                console.log("auto join by star", conn.getGameInfo().name, joinTarget, new Date());
                                break;
                            } else if (selfPower - fightItem.maxPower > 400000 && fightItem.helpCount >= 1) {
                                joinTarget = fightItem.kingwarKey;
                                fightItem.isMutual = true;
                                fightItem.isOthers = false;
                                fightItem.maxPower = selfPower;
                                console.log("auto join by star", conn.getGameInfo().name, joinTarget, new Date());
                                break;
                            }
                        }
                    }
                    if (!joinTarget) {
                        for (var i = 0; i < this.targetingHelp.length; ++i) {
                            var helpItem = this.targetingHelp[i];
                            if (currPower > helpItem.helpPower) {
                                joinTarget = helpItem.kingwarKey;
                                helpItem.helpCount ++;
                                console.log("auto join by help", conn.getGameInfo().name, joinTarget, new Date());
                                break;
                            }
                        }
                    }
                    if (!joinTarget) {
                        for (var i = 0; i < this.targetingAll.length; ++i) {
                            var someItem = this.targetingAll[i];
                            if (currPower > someItem.minPower) {
                                joinTarget = someItem.kingwarKey;
                                helpItem.helpCount ++;
                                console.log("auto join by nothing", conn.getGameInfo().name, joinTarget, new Date());
                                break;
                            }
                        }
                    }
                    if (joinTarget) {
                        this.updateTargeting();
                        var data_join = yield this.joinByKingwarKey(conn, joinTarget, next);
                    }
                    */
                }
            }
            var data_kingwar = yield conn.getKingWar(next);
            if (data_kingwar.joined) {
                this.setRefreshState(selfKey, 4);
                /*
                var data = yield conn.getKingWarPlayers(next);
                if (data.players) {
                    var kingwarKey = data.areaId * 100 + data.starId;
                    this.updateKingwarPlayers(kingwarKey, data);
                    this.kingwarBrief[kingwarKey] = this.getBriefKingwar(kingwarKey);
                    this.updateTargeting();
                }
                */
            }
            safe(done)();
        }, this);
    },
    initPlayerAutomation:function() {
    },
    refreshAutomation:function(conn, autoConfigs, done) {
        var next = coroutine(function*() {
            console.log("refreshAutomation..", conn.getGameInfo().name);
            for (var op in autoConfigs) {
                if (op == "disabled") {
                    continue;
                }
                var config = autoConfigs[op];
                if (!config.disabled) {
                    //console.log("auto", op, config);
                    yield conn[op].call(conn, config, next);
                }
            }
            safe(done)();
        }, this);
    },
    initPlayerListing:function() {
        this.allUnions = {};
        this.allPlayers = {};
        this.sortedPlayerIds = [];
    },
    refreshPlayerListing:function(conn, refreshData, done) {
        var next = coroutine(function*() {
            console.log("refreshPlayerListing..", conn.getGameInfo().name);
            var data = yield conn.getUnion(next); // dummy
            var data = yield conn.getUnionList(next);
            if (!data.unions) {
                this.errLog("getUnionList", "none");
                return safe(done)();
            }
            var server = conn.getServerInfo().desc;
            var limitMilliSeconds = refreshData.limitDay * 24 * 3600 * 1000
            for (var i = 0; i < data.unions.length; ++i) {
                var unionItem = data.unions[i];
                this.allUnions[unionItem.unionId] = {
                    server: server,
                    name: unionItem.name,
                    short: unionItem.short,
                };
                if (i < refreshData.unionCount) {
                    var playersData = yield conn.getUnionPlayers(unionItem.unionId, next);
                    if (!playersData.players) {
                        this.errLog("getUnionPlayers", "none");
                        return safe(done)();
                    }
                    var now = new Date().getTime();
                    for (var j = 0; j < playersData.players.length; ++j) {
                        var playerItem = playersData.players[j];
                        var playerData = this.allPlayers[playerItem.playerId];
                        var lastPower = (playerData ? playerData.maxPower : 0);
                        var maxPower = (playerItem.power > lastPower ? playerItem.power : lastPower);
                        if (maxPower <= refreshData.minPower) {
                            continue;
                        }
                        var t = playerItem.lastLogin.getTime();
                        if (maxPower <= refreshData.limitPower && now - t > limitMilliSeconds) {
                            continue;
                        }
                        this.allPlayers[playerItem.playerId] = {
                            server: server,
                            unionId: unionItem.unionId,
                            name: playerItem.name,
                            power: playerItem.power,
                            maxPower: maxPower,
                            level: playerItem.level,
                            lastLogin: playerItem.lastLogin,
                        };
                    }
                }
            }
            safe(done)();
        }, this);
    },
    initKingwar:function() {
        this.constantKingwar = false;
        this.playerToKingwar = {};
        this.kingwarRefs = {};
        for (var area = 1; area <= 3; ++area) {
            for (var star = 1; star <= 10; ++star) {
                var key = area * 100 + star;
                this.kingwarRefs[key] = {
                    constant:false,
                    players:[],
                };
            }
        }
    },
    refreshKingwar:function(conn, refreshData, done) {
        var next = coroutine(function*() {
            console.log("refreshKingwar..", conn.getGameInfo().name);
            var area = refreshData.area;
            var star = refreshData.star;
            var server = conn.getServerInfo().desc;
            var validator = conn.getValidator();
            if (this.constantKingwar && !validator.checkDaily("refreshKingwar")) {
                return safe(done)();
            }
            var data = yield conn.getKingWar(next);
            var constant = !data.allowJoin;
            if (this.constantKingwar && !constant) {
                this.constantKingwar = false;
                this.playerToKingwar = {};
                this.resetTargeting();
            } else if (!this.constantKingwar && constant) {
                this.constantKingwar = true;
            }
            if (!data.joined && data.allowJoin) {
                var data_join = yield conn.joinKingWar(area, star, next);
                if (!data_join.success) {
                    this.errLog("joinKingWar", "server({2}) area({0}), star({1})".format(area, star, server));
                    return safe(done)();
                }
            }
            if (refreshData.refData.constant && constant) {
                return safe(done)();
            }
            var data = yield conn.getKingWarPlayers(next);
            if (!data.players) {
                this.errLog("getKingWarPlayers", "server({2}) area({0}), star({1})".format(area, star, server));
                return safe(done)();
            }

            var realKey = data.areaId * 100 + data.starId;
            var realData = this.kingwarRefs[realKey];
            refreshData.refData = realData;
            if (realKey != refreshData.kingwarKey) {
                this.errLog("mismatch", "kingwar search key({0}) doesn't equal to result key({1})".format(refreshData.kingwarKey, realKey));
            }

            realData.constant = constant;
            this.updateKingwarPlayers(realKey, data);
            safe(done)();
        }, this);
    },
    errLog:function(action, state) {
        console.log("Failed to get task '{0}', detail:'{1}'".format(action, state));
    },
});

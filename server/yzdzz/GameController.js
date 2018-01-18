
require("../Base");
require("../Heartbeat");
require("../Mutex");
require("../Select");
require("../TaskManager");
require("../TimingManager");
require("./GameConnection");

var process = require("process");

// states:
// 0: 什么都不做
// 1: 定期执行(kingwar/playerlist/automation)
// 2: 执行每日任务(automation/heroshop)
// 3: 执行极限加入(targeting)
// 4: 极限加入已完成(targeting)
// 5: 执行极限刷新(kingwar)
// 6: 极限丢卡(dropping)
// 7: 平时领地站(unionwar)

Base.extends("AccountManager", {
    _constructor:function() {
        this.accounts = {};
        this.unifyLock = new Mutex();
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

        var accountObj = new GameConnection(accountData.username, accountData.password, this.unifyLock, validator);
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
        this.lastPlayerInfo = {};
        this.initKingwar();
        this.initPlayerListing();
        this.initHeroshop();
    },
    getAccountManager:function() {
        return this.accountManager;
    },

    readPlayerHeros:function(conn, done) {
        var next = coroutine(function*() {
            var heroData = [];
            var heroIds = yield conn.getOnlineHeroIds(next);
            for (var i = 0; i < heroIds.length; ++i) {
                var heroId = heroIds[i];
                var heroObj = yield conn.getOnlineHero(heroId, next);
                if (!heroObj) {
                    return safe(done)([]);
                }
                var stone = heroObj.getStoneLevel();
                heroData.push({
                    heroId: heroId,
                    color: heroObj.getColor(),
                    name: heroObj.getName(),
                    pos: heroObj.getPos(),
                    upgrade: heroObj.getUpgrade(),
                    food: heroObj.getFood(),
                    foodLow: !heroObj.isFoodFull(),
                    stone: stone,
                    stoneColor: Math.floor((stone - 1) / 5) + 1,
                    stoneLevel: (stone - 1) % 5 + 1,
                    skill: (stone >= heroObj.getStoneBase() ? heroObj.getSkillLevel() + 1 : 0),
                    stoneLow: !heroObj.isStoneFull(),
                    gemWake: heroObj.getGemWake(),
                    gemLevel: heroObj.getGemLevel(),
                    gemLow: !heroObj.isGemFull(),
                });
            }
            safe(done)(heroData);
        }, this);
    },
    getPlayerHeroData:function(playerData, done) {
        this.manualOnePlayer(playerData, (conn, tdone) => {
            this.readPlayerHeros(conn, (heroData) => {
                safe(tdone)();
                safe(done)(heroData);
            });
        }, null);
    },
    dealWithPlayerHeros:function(playerData, heroIds, operate, done) {
        this.manualOnePlayer(playerData, (conn, tdone) => {
            var next = coroutine(function*() {
                for (var i = 0; i < heroIds.length; ++i) {
                    var heroId = heroIds[i];
                    var heroObj = yield conn.getOnlineHero(heroId, next);
                    if (!heroObj) {
                        safe(tdone)();
                        safe(done)([]);
                    }
                    yield operate(heroId, heroObj, next);
                }
                this.readPlayerHeros(conn, (heroData) => {
                    safe(tdone)();
                    safe(done)(heroData);
                });
            }, this);
        }, null);
    },

    getPlayerBrief:function(playerData) {
        var accountGameKey = playerData.account + "$" + playerData.server;
        return this.lastPlayerInfo[accountGameKey];
    },
    setPlayerBrief:function(playerData, brief) {
        var accountGameKey = playerData.account + "$" + playerData.server;
        this.lastPlayerInfo[accountGameKey] = brief;
    },

    setAutomationOrder:function(order) {
        this.automationOrder = order;
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
        this.manualOnePlayer(playerData, (conn, tdone) => {
            this.refreshAutomation(conn, autoConfigs, tdone);
        }, done);
    },

    setPlayerTargeting:function(playerData, targetingConfig) {
        var key = this.appendRefresh(playerData, "targeting", 3, (conn, done, taskItem) => {
            this.refreshTargeting(conn, targetingConfig, key, taskItem, done);
        });
        return key;
    },
    modifyPlayerTargeting:function(key, targetingConfig) {
        return this.setRefreshFunc(key, (conn, done, taskItem) => {
            this.refreshTargeting(conn, targetingConfig, key, taskItem, done);
        });
    },

    setPlayerDropping:function(playerData, droppingConfig) {
        var key = this.appendRefresh(playerData, "dropping", 6, (conn, done, taskItem) => {
            this.refreshDropping(conn, droppingConfig, taskItem, done);
        });
        return key;
    },
    modifyPlayerDropping:function(key, droppingConfig) {
        return this.setRefreshFunc(key, (conn, done, taskItem) => {
            this.refreshDropping(conn, droppingConfig, taskItem, done);
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
    savePlayers:function() {
        var players = {};
        for (var playerId in this.allPlayers) {
            var player = this.allPlayers[playerId];
            players[playerId] = {
                name: player.name,
                maxPower: player.maxPower,
                unionId: player.unionId,
            };
        }
        return players;
    },
    restorePlayers:function(allPowerMax) {
        for (var playerId in allPowerMax) {
            this.allPlayers[playerId] = allPowerMax[playerId];
        }
    },
    saveUnions:function() {
        return this.allUnions;
    },
    restoreUnions:function(unions) {
        for (var unionId in unions) {
            this.allUnions[unionId] = unions[unionId];
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
        for (var kingwarKey in this.kingwarRefs) {
            var data = this.kingwarRefs[kingwarKey];
            areastars[kingwarKey] = [];
            for (var i = 0; i < data.players.length; ++i) {
                var warPlayer = data.players[i];
                var extraPlayerData = this.allPlayers[warPlayer.playerId];
                areastars[kingwarKey].push({
                    union: warPlayer.union,
                    power: warPlayer.power,
                    name: (extraPlayerData && extraPlayerData.name ? extraPlayerData.name : warPlayer.name),
                    maxPower: (extraPlayerData ? extraPlayerData.maxPower : warPlayer.power),
                });
            }
        }
        return areastars;
    },
    saveKingwar:function() {
        var kingwarPlayers = {};
        for (var kingwarKey in this.kingwarRefs) {
            var data = this.kingwarRefs[kingwarKey];
            kingwarPlayers[kingwarKey] = [];
            for (var i = 0; i < data.players.length; ++i) {
                var warPlayer = data.players[i];
                kingwarPlayers[kingwarKey].push({
                    playerId: warPlayer.playerId,
                    power: warPlayer.power,
                    union: warPlayer.union,
                });
            }
        }
        return kingwarPlayers;
    },
    restoreKingwar:function(kingwarPlayers) {
        for (var kingwarKey in kingwarPlayers) {
            var players = kingwarPlayers[kingwarKey];
            for (var i = 0; i < players.length; ++i) {
                var playerData = players[i];
                this.playerToKingwar[playerData.playerId] = kingwarKey;
                this.kingwarRefs[kingwarKey].players.push(playerData);
            }
        }
    },

    setPlayerHeroshop:function(playerData, heroshopConfig) {
        return this.appendRefresh(playerData, "heroshop", 2, (conn, done) => {
            this.refreshHeroshop(conn, heroshopConfig, done);
        });
    },
    modifyPlayerHeroshop:function(key, heroshopConfig) {
        return this.setRefreshFunc(key, (conn, done) => {
            this.refreshHeroshop(conn, heroshopConfig, done);
        });
    },
    refreshHeroshop:function(conn, heroshopConfig, done) {
        var next = coroutine(function*() {
            console.log("refreshHeroshop..", conn.getGameInfo().name);
            var server = conn.getServerInfo().desc;
            if (this.heroshopServer && this.heroshopServer == server) {
                yield conn.updateHeroShop(heroshopConfig, this.heroshopInfo, next);
            }
            safe(done)();
        }, this);
    },
    initHeroshop:function() {
        this.heroshopInfo = {};
        this.heroshopDate = -1;
        this.heroshopUpdateCallback = null;
        this.heroshopServer = null;
    },
    setHeroshopEvent:function(defaults) {
        this.unsetEventKeys(this.heroshopTimes);
        this.heroshopServer = defaults.server;
        this.heroshopTimes = [];
        var reset = defaults.reset;
        this.heroshopTimes.push(this.timingManager.setDailyEvent(reset.hour, reset.minute, reset.second, () => {
            this.heroshopDate = -1;
            this.heroshopInfo = {};
            safe(this.heroshopUpdateCallback)(this.heroshopDate, this.heroshopInfo);
        }));
    },
    setHeroshopInfo:function(date, info, callback) {
        if (date == new Date().getDate()) {
            this.heroshopDate = date;
            this.heroshopInfo = {};
            for (var key in info) {
                this.heroshopInfo[key] = info[key];
            }
        }
        this.heroshopUpdateCallback = callback;
    },

    unionwarlands: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    setPlayerUnionwar:function(playerData, unionwarConfig) {
        return this.appendRefresh(playerData, "unionwar", 7, (conn, done) => {
            this.refreshUnionwar(conn, unionwarConfig, done);
        });
    },
    modifyPlayerUnionwar:function(key, unionwarConfig) {
        return this.setRefreshFunc(key, (conn, done) => {
            this.refreshUnionwar(conn, unionwarConfig, done);
        });
    },
    enumUnionwarlands:function(conn, targetLands, deal, done) {
        var next = coroutine(function*() {
            var unionwarInfo = yield conn.getUnionWar(next);
            if (!unionwarInfo.lands) {
                return safe(done)();
            }
            for (var i = 0; i < targetLands.length; ++i) {
                var landId = targetLands[i];
                if (unionwarInfo.lands[landId]) {
                    continue;
                }
                var unionwarLandInfo = yield conn.enterUnionWar(landId, next);
                if (!unionwarLandInfo.mineArray) {
                    continue;
                }
                for (var j = 0; j < unionwarLandInfo.mineArray.length; ++j) {
                    var mineData = unionwarLandInfo.mineArray[j];
                    var finish = safe(deal)(mineData, landId);
                    if (finish) {
                        return safe(done)();
                    }
                }
            }
            safe(done)();
        }, this);
    },
    refreshUnionwar:function(conn, unionwarConfig, done) {
        var next = coroutine(function*() {
            console.log("refreshUnionwar..", conn.getGameInfo().name);
            var unionwarInfo = yield conn.getUnionWar(next);
            if (!unionwarInfo.isOpen) {
                return safe(done)();
            }
            var targetLands = (unionwarConfig.onlyOccupy ? this.unionwarOrder : this.unionwarlands);
            var playerId = conn.getGameInfo().playerId;
            var myQuality = 0;
            yield this.enumUnionwarlands(conn, targetLands, (mineData, landId) => {
                if (mineData.playerId == playerId) {
                    conn.log("Found self at union war:", landId, mineData.pos, mineData.quality);
                    myQuality = mineData.quality;
                    return true; // finish loop
                }
            }, next);

            if (myQuality && unionwarConfig.reverseOrder) {
                return safe(done)();
            }

            var randTime = rand(1500);
            yield setTimeout(next, randTime);
            var lock = this.unionwarLock;
            yield lock.lock(next);

            var maxQuality = 0;
            var maxLand = [];
            var maxPos = [];
            yield this.enumUnionwarlands(conn, targetLands, (mineData, landId) => {
                if (!mineData.playerId && mineData.mineLife > 0) {
                    var match = false;
                    if (unionwarConfig.reverseOrder) {
                        if (maxQuality == 0 || mineData.quality < maxQuality) {
                            match = true;
                        }
                    } else {
                        if (mineData.quality > maxQuality) {
                            match = true;
                        }
                    }
                    if (match) {
                        conn.log("Found new available pos:", landId, mineData.pos, mineData.quality);
                        maxQuality = mineData.quality;
                        maxLand = [landId];
                        maxPos = [mineData.pos];
                    } else if (maxQuality == mineData.quality) {
                        conn.log("Found same available pos:", landId, mineData.pos, mineData.quality);
                        maxLand.push(landId);
                        maxPos.push(mineData.pos);
                    }
                }
            }, next);
            if (maxQuality > myQuality) {
                for (var i = 0; i < maxLand.length; ++i) {
                    var landId = maxLand[i];
                    var pos = maxPos[i];
                    var occupyData = yield conn.occupy(landId, pos, next);
                    if (occupyData.success) {
                        break;
                    }
                }
            }

            lock.unlock();
            safe(done)();
        }, this);
    },
    setUnionwarEvent:function(defaults) {
        this.unsetEventKeys(this.unionwarTimes);
        this.unionwarOrder = defaults.normal_order;
        this.unionwarTimes = [];
        this.unionwarLock = new Mutex();
        var doUnionwar = () => {
            this.refreshAllPlayers((funcObj) => { return funcObj.state == 7; });
        };
        for (var i = 0; i < defaults.normal.length; ++i) {
            var time = defaults.normal[i];
            var unionwarKey = this.timingManager.setWeeklyEvent(time.day, time.hour, time.minute, time.second, doUnionwar);
            this.unionwarTimes.push(unionwarKey);
        }
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
                this.heroshopDate = new Date().getDate();
                safe(this.heroshopUpdateCallback)(this.heroshopDate, this.heroshopInfo);
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
        var startAutomationRepeat = () => {
            console.log("refreshing automation for period start!");
            this.setRefreshStatesOfType("automation", 1);
        };
        var startKey = this.timingManager.setDailyEvent(startTime.hour, startTime.minute, startTime.second, startAutomationRepeat);
        this.repeatRanges.push(startKey);
        var endKey = this.timingManager.setDailyEvent(endTime.hour, endTime.minute, endTime.second, () => {
            console.log("refreshing automation for period end!");
            this.setRefreshStatesOfType("automation", 2);
        });
        this.repeatRanges.push(endKey);
        var mement = new Date();
        var nowTimeSec = mement.getTime();
        mement.setHours(startTime.hour, startTime.minute, startTime.second, 0);
        var startTimeSec = mement.getTime();
        mement.setHours(endTime.hour, endTime.minute, endTime.second, 0);
        var endTimeSec = mement.getTime();
        if (nowTimeSec - startTimeSec > 5 * 1000 && endTimeSec - nowTimeSec > 10 * 1000) {
            console.log("repair automation repeating");
            startAutomationRepeat();
        }
    },

    ownPowerCoef: 0.9,
    hopePowerCoef: 0.95,
    drawPowerCoef: 1.01,
    lessPowerCoef: 1.04,
    emperorKingwarKeys: [110, 109, 210, 209],
    emperorKingwars: {"110":true,"109":true,"210":true,"209":true},
    getAreaStar:function(kingwarKey) {
        var area = Math.floor(kingwarKey / 100);
        var star = kingwarKey % 100;
        return {area:area, star:star};
    },
    getKingwarBrief:function(refData, defaults) {
        var ourMax = -1000000;
        var otherMax = 0;
        var helpCount = (refData.players.length < 16 ? 1 : 0);
        for (var i = 0; i < refData.players.length; ++i) {
            var player = refData.players[i];
            var playerId = player.playerId;
            var playerItem = this.allPlayers[playerId];
            var power = (playerItem ? playerItem.maxPower : player.power);
            var isOurs = (playerItem ? playerItem.unionId == defaults.selfUnion : false);
            if (isOurs) {
                ourMax = (power > ourMax ? power : ourMax);
                helpCount ++;
            } else {
                otherMax = (power > otherMax ? power : otherMax);
            }
        }
        return {
            ourMax: ourMax,
            otherMax: otherMax,
            helpCount: helpCount,
        };
    },
    getMutualLevel:function(ourMax, otherMax) {
        if (ourMax * this.ownPowerCoef > otherMax) {
            return 4;
        } else if (ourMax * this.hopePowerCoef > otherMax) {
            return 3;
        } else if (ourMax * this.drawPowerCoef > otherMax) {
            return 2;
        } else if (ourMax * this.lessPowerCoef > otherMax) {
            return 1;
        } else {
            return 0;
        }
    },
    getKingwarOrder:function(defaults) {
        var kingwarOrder = [];
        for (var kingwarKey in this.kingwarRefs) {
            var refData = this.kingwarRefs[kingwarKey];
            var brief = this.getKingwarBrief(refData, defaults);
            brief.mutual = this.getMutualLevel(brief.ourMax, brief.otherMax);
            var areaStar = this.getAreaStar(kingwarKey);
            brief.kingwarKey = kingwarKey;
            brief.area = areaStar.area;
            brief.star = areaStar.star;
            var insertIndex = kingwarOrder.length;
            for (var i = 0; i < kingwarOrder.length; ++i) {
                if (areaStar.star > kingwarOrder[i].star) {
                    insertIndex = i;
                    break;
                }
            }
            kingwarOrder.splice(insertIndex, 0, brief);
        }
        for (var i = 0; i < kingwarOrder.length; ++i) {
            var brief = kingwarOrder[i];
            console.log("-- kingwar assignment -- brief", brief);
        }
        return kingwarOrder;
    },
    getTasksOrder:function(tasks) {
        var tasksOrder = [];
        for (var i = 0; i < tasks.length; ++i) {
            var data = tasks[i].getValue();
            var insertIndex = tasksOrder.length;
            for (var j = 0; j < tasksOrder.length; ++j) {
                if (data.power > tasksOrder[j].power) {
                    insertIndex = j;
                    break;
                }
            }
            tasksOrder.splice(insertIndex, 0, {
                power: data.power,
                minStar: data.minStar,
                forceEmperor: data.forceEmperor,
                task: tasks[i],
            });
        }
        for (var i = 0; i < tasksOrder.length; ++i) {
            var taskItem = tasksOrder[i];
            console.log("-- kingwar assignment -- taskItem", taskItem.power, taskItem.minStar);
        }
        return tasksOrder;
    },
    tryTargetingAssignment:function(kingwarOrder, tasksOrder, canJoin) {
        for (var i = 0; i < kingwarOrder.length; ++i) {
            var brief = kingwarOrder[i];
            brief.possible = [];
        }
        for (var i = 0; i < tasksOrder.length; ++i) {
            var taskItem = tasksOrder[i];
            if (taskItem.assign) {
                continue;
            }
            for (var j = 0; j < kingwarOrder.length; ++j) {
                var brief = kingwarOrder[j];
                var match = true;
                match = match && (taskItem.forceEmperor ? this.emperorKingwars[brief.kingwarKey] : true);
                match = match && (brief.star >= taskItem.minStar);
                if (match && canJoin(taskItem, brief)) {
                    console.log("-- kingwar assignment -- possible", taskItem.power, brief.kingwarKey);
                    brief.possible.push(taskItem);
                }
            }
        }
        for (var i = kingwarOrder.length - 1; i >= 0; --i) {
            var brief = kingwarOrder[i];
            if (brief.possible.length > 0) {
                var validBrief = brief;
                var isValid = true;
                while(validBrief && isValid) {
                    isValid = false;
                    for (var j = 0; j < validBrief.possible.length; ++j) {
                        var taskItem = validBrief.possible[j];
                        if (!taskItem.assign || validBrief.star > taskItem.assign.star) {
                            console.log("-- kingwar assignment -- try", taskItem.power, validBrief.kingwarKey);
                            var tmpBrief = taskItem.assign;
                            taskItem.assign = validBrief;
                            taskItem.newAdded = true;
                            validBrief = tmpBrief;
                            isValid = true;
                            break;
                        }
                    }
                }
            }
        }
        for (var i = 0; i < tasksOrder.length; ++i) {
            var taskItem = tasksOrder[i];
            if (taskItem.newAdded) {
                taskItem.newAdded = false;
                var brief = taskItem.assign;
                brief.ourMax = (taskItem.power > brief.ourMax ? taskItem.power : brief.ourMax);
                brief.helpCount ++;
                brief.mutual = this.getMutualLevel(brief.ourMax, brief.otherMax);
            }
        }
    },
    getMinEmperorWar:function(kingwarOrder) {
        var minKingwarPower = 1000000000;
        var minEmperorWar = null;
        for (var i = 0; i < kingwarOrder.length; ++i) {
            var brief = kingwarOrder[i];
            var isEmperor = this.emperorKingwars[brief.kingwarKey];
            if (isEmperor) {
                if (brief.otherMax < minKingwarPower) {
                    minKingwarPower = brief.otherMax;
                    minEmperorWar = brief;
                }
            }
        }
        return minEmperorWar;
    },
    targetingAssignment:function(tasks, defaults) {
        var kingwarOrder = this.getKingwarOrder(defaults);
        var tasksOrder = this.getTasksOrder(tasks);
        // try fight
        console.log("-- kingwar assignment -- try fight");
        this.tryTargetingAssignment(kingwarOrder, tasksOrder, (taskItem, brief) => {
            return brief.mutual <= 1 && taskItem.power * this.hopePowerCoef > brief.otherMax;
        });
        console.log("-- kingwar assignment -- try fight - draw");
        this.tryTargetingAssignment(kingwarOrder, tasksOrder, (taskItem, brief) => {
            return brief.mutual <= 2 && taskItem.power * this.ownPowerCoef > brief.otherMax;
        });
        // try help
        console.log("-- kingwar assignment -- try help");
        this.tryTargetingAssignment(kingwarOrder, tasksOrder, (taskItem, brief) => {
            if (brief.mutual == 2) {
                return taskItem.power < brief.ourMax * 0.8 && brief.helpCount < 4;
            } else if (brief.mutual == 3) {
                return taskItem.power < brief.ourMax * 0.8 && brief.helpCount < 3;
            }
            return false;
        });
        
        var restNumber = 0;
        for (var i = 0; i < tasksOrder.length; ++i) {
            var taskItem = tasksOrder[i];
            if (!taskItem.assign) {
                restNumber ++;
            }
        }
        if (restNumber >= 8) {
            // try fight
            console.log("-- kingwar assignment -- try fight Z");
            this.tryTargetingAssignment(kingwarOrder, tasksOrder, (taskItem, brief) => {
                return brief.mutual <= 1 && taskItem.power * this.drawPowerCoef > brief.otherMax;
            });
            // try help
            console.log("-- kingwar assignment -- try help Z");
            this.tryTargetingAssignment(kingwarOrder, tasksOrder, (taskItem, brief) => {
                if (brief.mutual == 2) {
                    return taskItem.power < brief.ourMax * 0.9 && brief.helpCount < 4;
                } else if (brief.mutual == 3) {
                    return taskItem.power < brief.ourMax * 0.9 && brief.helpCount < 3;
                }
                return false;
            });
        }

        var minEmperorWar = this.getMinEmperorWar(kingwarOrder);
        var restIndex = 0;
        for (var i = 0; i < tasksOrder.length; ++i) {
            var taskItem = tasksOrder[i];
            if (taskItem.assign) {
                taskItem.task.setAssignment(taskItem.assign.kingwarKey);
            } else {
                if (taskItem.forceEmperor && minEmperorWar) {
                    taskItem.task.setAssignment(minEmperorWar.kingwarKey);
                } else {
                    taskItem.task.setAssignment(this.emperorKingwarKeys[restIndex]);
                    restIndex = (restIndex + 1) % 4;
                }
            }
        }
    },
    setTargetingEvent:function(defaults) {
        this.unsetEventKeys(this.targetingTimes);
        this.targetingTimes = [];
        var time = defaults.time;
        var targetingKey = this.timingManager.setWeeklyEvent(time.day, time.hour, time.minute, time.second, () => {
            this.setRefreshStatesOfType("kingwar", 5);
            var forceTime = new Date();
            forceTime.setSeconds(defaults.forceSec, 0);
            var next = coroutine(function*() {
                var forceTargeting = false;
                console.log("-- kingwar assignment -- try find target");
                while(!this.constantKingwar && !forceTargeting) {
                    yield this.refreshAllPlayers((funcObj) => { return funcObj.state == 3; }, next);
                    yield this.refreshAllPlayers((funcObj) => { return funcObj.state == 5; }, next);
                    forceTargeting = (new Date() > forceTime);
                }
                console.log("-- kingwar assignment -- try auto assign");
                if (!this.constantKingwar)
                {
                    var targetingTaskManager = new TaskManager((tasks, total) => {
                        if (tasks.length == total) {
                            this.targetingAssignment(tasks, defaults);
                        }
                    });
                    yield this.refreshAllPlayers((funcObj) => { return funcObj.state == 3; }, next, targetingTaskManager);
                    yield this.refreshAllPlayers((funcObj) => { return funcObj.state == 5; }, next);
                }
                console.log("-- kingwar assignment -- finished!");
                this.setRefreshStatesOfType("kingwar", 1);
                this.setRefreshStatesOfType("targeting", 3);
            }, this);
        });
        this.targetingTimes.push(targetingKey);
    },

    getDroppingKingwarInfo:function(kingwarKey, defaults) {
        var ourMax = -1;
        var ourPlayerId = "";
        var enemyMax = -1;
        var enemyPlayerId = "";
        var refData = this.kingwarRefs[kingwarKey];
        var playerCount = (refData.players.length > 16 ? 16 : refData.players.length);
        for (var i = 0; i < playerCount; ++i) {
            var player = refData.players[i];
            if (this.whiteList[player.playerId]) {
                continue;
            }
            var playerItem = this.allPlayers[player.playerId];
            var power = (playerItem ? playerItem.maxPower : player.power);
            if (playerItem && playerItem.unionId == defaults.selfUnion) {
                if (power > ourMax) {
                    ourMax = power;
                    ourPlayerId = player.playerId;
                }
            } else {
                if (power > enemyMax) {
                    enemyMax = power;
                    enemyPlayerId = player.playerId;
                }
            }
        }
        return {
            helpId: ourPlayerId,
            damageId: enemyPlayerId,
        };
    },
    droppingAssignment:function(tasks, kingwarInfos, timings, defaults) {
        for (var i = 0; i < tasks.length; ++i) {
            var taskItem = tasks[i];
            if (!taskItem.isAssigned()) {
                var kingwarKey = taskItem.getValue();
                var kingwarInfo = kingwarInfos[kingwarKey];
                if (!kingwarInfo) {
                    kingwarInfo = this.getDroppingKingwarInfo(kingwarKey, defaults);
                    kingwarInfo.helpLock = new Mutex();
                    kingwarInfo.damageLock = new Mutex();
                    kingwarInfo.startTime = timings.startTime;
                    kingwarInfo.forceTime = timings.forceTime;
                    kingwarInfo.endTime = timings.endTime;
                    kingwarInfos[kingwarKey] = kingwarInfo;
                }
                taskItem.setAssignment(kingwarInfo);
            }
        }
    },
    timeWithSeconds:function(sec) {
        var time = new Date();
        var nsec = Math.floor(sec);
        time.setSeconds(nsec, (sec - nsec) * 1000);
        return time;
    },
    timeOffset:function(time, sec) {
        return new Date(time.getTime() + sec * 1000);
    },
    setDroppingEvent:function(defaults) {
        this.unsetEventKeys(this.droppingTimes);
        this.droppingTimes = [];
        this.whiteList = {};
        for (var i = 0; i < defaults.whitelist.length; ++i) {
            var playerId = defaults.whitelist[i];
            this.whiteList[playerId] = true;
        }
        console.log("white list -", this.whiteList);
        var doDropping = () => {
            var next = coroutine(function*() {
                console.log("dropping started!");
                var assignTime = this.timeWithSeconds(defaults.assign);
                var startTime = this.timeWithSeconds(defaults.start);
                var forceTime = this.timeWithSeconds(defaults.force);
                var endTime = this.timeWithSeconds(0);
                endTime = this.timeOffset(endTime, 60);
                var timings = {
                    startTime: startTime,
                    forceTime: forceTime,
                    endTime: endTime,
                };
                var started = false;
                var kingwarInfos = {};
                var lastTasks = null;
                var droppingTaskManager = new TaskManager((tasks, total) => {
                    lastTasks = tasks;
                    if (started) {
                        this.droppingAssignment(tasks, kingwarInfos, timings, defaults);
                    }
                });
                (() => {
                    var tnext = coroutine(function*() {
                        while (new Date() < assignTime) {
                            yield setTimeout(tnext, 60);
                        }
                        started = true;
                        if (lastTasks) {
                            this.droppingAssignment(lastTasks, kingwarInfos, timings, defaults);
                        }
                    }, this);
                })();
                yield this.refreshAllPlayers((funcObj) => { return funcObj.state == 6; }, next, droppingTaskManager);
                console.log("dropping finished!");
            }, this);
        };
        for (var i = 0; i < defaults.times.length; ++i) {
            var time = defaults.times[i];
            var droppingKey = this.timingManager.setWeeklyEvent(time.day, time.hour, time.minute, time.second, doDropping);
            this.droppingTimes.push(droppingKey);
        }
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
            findInfo.refreshInfo.funcs.splice(findInfo.index, 1, funcObj);
            return true;
        }
        return false;
    },
    refreshAllPlayers:function(checkFun, done, taskManager) {
        console.log("refresh all player start -", process.memoryUsage());
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
                this.refreshOnePlayer(refreshInfo, executables, select.setup(), (taskManager ? taskManager.addTask() : undefined));
            }
        }
        select.all(() => {
            console.log("refresh all player finish -", process.memoryUsage());
            safe(done)();
        });
    },
    refreshOnePlayer:function(refreshInfo, executables, done, taskItem) {
        var next = coroutine(function*() {
            yield refreshInfo.mutex.lock(next);
            var doEnd = (unexpected) => {
                if (unexpected && taskItem) {
                    taskItem.giveup();
                }
                refreshInfo.mutex.unlock();
                safe(done)();
            };
            var conn = this.accountManager.connectAccount(refreshInfo.account, refreshInfo.validator);
            if (!conn) {
                this.errLog("connectAccount", "account:{0}".format(refreshInfo.account));
                return doEnd(true);
            }
            //console.log("start -- player!", refreshInfo.account, refreshInfo.server);
            var data = yield conn.loginAccount(next);
            if (!data.success) {
                this.errLog("loginAccount", "account({0}), server({1})".format(refreshInfo.account, refreshInfo.server));
                return doEnd(true);
            }
            var data = yield conn.loginGame(refreshInfo.server, next);
            if (!data.success) {
                this.errLog("loginGame", "account({0}), server({1})".format(refreshInfo.account, refreshInfo.server));
                return doEnd(true);
            }
            var accountGameKey = refreshInfo.account + "$" + refreshInfo.server;
            this.lastPlayerInfo[accountGameKey] = {
                name: conn.getGameInfo().name,
                power: conn.getGameInfo().power,
            };
            for (var i = 0; i < executables.length; ++i) {
                yield executables[i](conn, next, taskItem);
            }
            //console.log("quit -- player!", refreshInfo.account, refreshInfo.server, conn.getGameInfo().name);
            conn.quit();
            doEnd();
        }, this);
    },
    manualOnePlayer:function(playerData, func, done) {
        var next = coroutine(function*() {
            console.log("manual one player start -", process.memoryUsage());
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
            var accountGameKey = playerData.account + "$" + playerData.server;
            this.lastPlayerInfo[accountGameKey] = {
                name: conn.getGameInfo().name,
                power: conn.getGameInfo().power,
            };
            yield func(conn, next);
            conn.quit();
            playerData.mutex.unlock();
            console.log("manual one player finish -", process.memoryUsage());
            safe(done)({
                success: true,
            });
        }, this);
    },

    // Private refresh operations
    refreshTargeting:function(conn, targetingConfig, selfKey, taskItem, done) {
        var next = coroutine(function*() {
            console.log("refreshTargeting..", conn.getGameInfo().name);
            var kingwarKey = this.playerToKingwar[targetingConfig.reachPLID];
            if (kingwarKey && this.emperorKingwars[kingwarKey] && targetingConfig.disableEmperor) {
                kingwarKey = null;
            }
            if (kingwarKey) {
                console.log("-- kingwar assignment -- find target", kingwarKey, targetingConfig.reachPLID, conn.getGameInfo().name);
                var areaStar = this.getAreaStar(kingwarKey);
                var data_join = yield conn.joinKingWar(areaStar.area, areaStar.star, next);
            } else {
                if (taskItem){
                    if (targetingConfig.allowAssign) {
                        var playerId = conn.getGameInfo().playerId;
                        var playerItem = this.allPlayers[playerId];
                        var power = (playerItem ? playerItem.maxPower : conn.getGameInfo().power);
                        var kingwarKey = yield taskItem.getAssignment({
                            power: power,
                            minStar: targetingConfig.minStar,
                            forceEmperor: targetingConfig.forceEmperor,
                        }, next);
                        if (kingwarKey) {
                            console.log("-- kingwar assignment -- assign target", kingwarKey, Math.floor(power / 10000), conn.getGameInfo().name);
                            var areaStar = this.getAreaStar(kingwarKey);
                            var data_join = yield conn.joinKingWar(areaStar.area, areaStar.star, next);
                        }
                    } else {
                        taskItem.giveup();
                    }
                }
            }
            var data_kingwar = yield conn.getKingWarState(next);
            if (data_kingwar.joined) {
                this.setRefreshState(selfKey, 4);
            }
            safe(done)();
        }, this);
    },
    isCardValid:function(card, playerData) {
        if (card.isGold) {
            return true;
        } else if (playerData.good < 3 && card.isGood) {
            return true;
        } else if (playerData.good > 0 && card.isDismissGood) {
            return true;
        } else if (playerData.bad < 3 && card.isBad) {
            return true;
        } else if (playerData.bad > 0 && card.isDismissBad) {
            return true;
        }
        return false;
    },
    isCardDroppable:function(card, playerData) {
        if (card.isGold || card.isDismissGood || card.isDismissBad) {
            return true;
        } else if (playerData.good < 3 && card.isGood) {
            return true;
        } else if (playerData.bad < 3 && card.isBad) {
            return true;
        }
        return false;
    },
    compareCards:function(cards1, cards2) {
        if (cards2.length > cards1.length) {
            return false;
        }
        for (var i = 0; i < cards2.length; ++i) {
            if (cards1[cards1.length - 1 - i].cardType != cards2[cards2.length - 1 - i].cardType) {
                return false;
            }
        }
        return true;
    },
    canDropCardTo:function(conn, card, playerId, raceInfo) {
        if (!playerId || playerId == conn.getGameInfo().playerId) {
            return false;
        }
        for (var i = 0; i < raceInfo.players.length; ++i) {
            var playerData = raceInfo.players[i];
            if (playerId == playerData.playerId) {
                if (this.isCardValid(card, playerData)) {
                    console.log("try drop to target.", card.cardType, playerData, conn.getGameInfo().name);
                    return true;
                }
                break;
            }
        }
        return false;
    },
    randomPlayer:function(conn, card, kingwarInfo, raceInfo) {
        var players = [];
        for (var i = 0; i < raceInfo.players.length; ++i) {
            var playerData = raceInfo.players[i];
            if (playerData.playerId) {
                if (this.whiteList[playerData.playerId]) {
                    continue;
                }
                if (playerData.playerId == kingwarInfo.helpId) {
                    continue;
                }
                if (playerData.playerId == kingwarInfo.damageId) {
                    continue;
                }
                if (playerData.playerId == conn.getGameInfo().playerId) {
                    continue;
                }
                players.push(playerData);
            }
        }
        while (players.length > 0) {
            var index = rand(players.length);
            var playerData = players[index];
            if (this.isCardDroppable(card, playerData)) {
                console.log("try drop to rand", card.cardType, playerData, conn.getGameInfo().name);
                return playerData.playerId;
            }
            players.splice(index, 1);
        }
        return null;
    },
    rawCardsOf:function(cards) {
        var rawCards = [];
        for (var i = 0; i < cards.length; ++i) {
            rawCards.push(cards[i].cardType);
        }
        return rawCards;
    },
    findDroppingTarget:function(conn, kingwarInfo, cards, raceInfo, isForce) {
        if (!raceInfo.cards || raceInfo.cards.length == 0 || !this.compareCards(cards, raceInfo.cards)) {
            console.log("dropping break", this.rawCardsOf(cards), this.rawCardsOf(raceInfo.cards || []));
            raceInfo.cards = [];
            return null;
        }
        var card = raceInfo.cards[0];
        if (card.isGold) {
            return this.randomPlayer(conn, card, kingwarInfo, raceInfo);
        }
        var targetPlayerId = (card.isBenefit ? kingwarInfo.helpId : kingwarInfo.damageId);
        if (this.canDropCardTo(conn, card, targetPlayerId, raceInfo)) {
            return targetPlayerId;
        } else if (isForce) {
            return this.randomPlayer(conn, card, kingwarInfo, raceInfo);
        }
        return null;
    },
    getDroppingLock:function(kingwarInfo, playerId) {
        if (playerId == kingwarInfo.helpId) {
            return kingwarInfo.helpLock;
        } else if (playerId == kingwarInfo.damageId) {
            return kingwarInfo.damageLock;
        }
        return null;
    },
    refreshDropping:function(conn, droppingConfig, taskItem, done) {
        var next = coroutine(function*() {
            console.log("refreshDropping..", conn.getGameInfo().name);
            var raceInfo = yield conn.getKingWarRace(next);
            if (!raceInfo.cards || raceInfo.cards.length == 0 || raceInfo.area == 0 || raceInfo.star == 0) {
                console.log("dropping with no cards!", conn.getGameInfo().name);
                taskItem.giveup();
            } else {
                console.log("hasCards", raceInfo.rawCards, conn.getGameInfo().name);
                var cards = raceInfo.cards;
                var kingwarKey = raceInfo.area * 100 + raceInfo.star;
                var kingwarInfo = yield taskItem.getAssignment(kingwarKey, next);
                console.log("dropping with Info", kingwarInfo, conn.getGameInfo().name);
                while (conn.getServerTime() < kingwarInfo.startTime) {
                    yield setTimeout(next, 60);
                }
                var waitingTime = kingwarInfo.forceTime;
                var isForce = false;
                while (cards.length > 0) {
                    while (cards.length > 0 && conn.getServerTime() <= waitingTime) {
                        var refreshRace = yield conn.getKingWarRace(next);
                        var playerId = this.findDroppingTarget(conn, kingwarInfo, cards, refreshRace, isForce);
                        cards = refreshRace.cards;
                        if (playerId) {
                            var playerLock = this.getDroppingLock(kingwarInfo, playerId);
                            if (playerLock) {
                                console.log("locking for player", playerId, conn.getGameInfo().name);
                                yield playerLock.lock(next);
                            }
                            console.log("drop card", refreshRace.rawCards, "to", playerId, conn.getGameInfo().name);
                            var useData = yield conn.useKingWarCard(playerId, next);
                            if (playerLock) {
                                playerLock.unlock();
                            }
                            if (useData.success) {
                                var t = conn.getServerTime();
                                console.log("drop success", refreshRace.rawCards, playerId, "good:{0}, bad:{1},".format(useData.good, useData.bad), conn.getGameInfo().name, t.getSeconds(), t.getMilliseconds());
                                cards.splice(0, 1);
                            } else {
                                console.log("drop failed", conn.getGameInfo().name);
                            }
                        }
                    }
                    // switch loop mode
                    if (isForce) {
                        break;
                    } else {
                        console.log("dropping force", conn.getGameInfo().name);
                        waitingTime = kingwarInfo.endTime;
                        isForce = true;
                    }
                }
                console.log("dropping end", conn.getGameInfo().name);
            }
            safe(done)();
        }, this);
    },
    refreshAutomation:function(conn, autoConfigs, done) {
        var next = coroutine(function*() {
            console.log("refreshAutomation..", conn.getGameInfo().name);
            for (var i = 0; i < this.automationOrder.length; ++i) {
                var op = this.automationOrder[i];
                var config = autoConfigs[op];
                if (config && !config.disabled) {
                    //console.log("auto", op, config);
                    yield conn[op].call(conn, config, next);
                }
            }
            yield conn.speakForAutomationResult(next);
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
            //console.log("refreshPlayerListing..", conn.getGameInfo().name);
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
    refreshKingwar:function(conn, refreshData, done) {
        var next = coroutine(function*() {
            //console.log("refreshKingwar..", conn.getGameInfo().name);
            var area = refreshData.area;
            var star = refreshData.star;
            var server = conn.getServerInfo().desc;

            var data = yield conn.getKingWarState(next);
            var constant = !data.allowJoin;
            if (this.constantKingwar && !constant) {
                this.constantKingwar = false;
                this.playerToKingwar = {};
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
            if (!data.joined && !data.allowJoin) {
                return safe(done)();
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

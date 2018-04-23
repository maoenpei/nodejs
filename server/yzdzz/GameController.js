
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
// 4: 不执行任何操作(targeting/playerlist/kingwar)
// 5: 执行极限刷新(kingwar)
// 6: 极限丢卡(dropping)
// 7: 领地站(unionwar)

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
    change:function(accountKey, password) {
        console.log("Account changed. accountKey:{0}".format(accountKey));
        if (this.accounts[accountKey]) {
            this.accounts[accountKey].password = password;
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

    // automation
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
    setAutomationOrder:function(order) {
        this.automationOrder = order;
    },

    // targeting
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
    refreshTargeting:function(conn, targetingConfig, selfKey, taskItem, done) {
        var next = coroutine(function*() {
            console.log("refreshTargeting..", conn.getGameInfo().name);
            var kingwarKey = this.playerToKingwar[targetingConfig.reachPLID];
            if (kingwarKey && this.emperorKingwars[kingwarKey] && targetingConfig.disableEmperor) {
                kingwarKey = null;
            }
            if (kingwarKey) {
                if (taskItem) {
                    taskItem.giveup();
                }
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
        if (this.uniqueKingwarOrder) {
            return this.uniqueKingwarOrder;
        }
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
        this.uniqueKingwarOrder = kingwarOrder;
        return kingwarOrder;
    },
    getTasksOrder:function(tasks) {
        var tasksOrder = [];
        for (var i = 0; i < tasks.length; ++i) {
            var taskItem = tasks[i];
            if (taskItem.isAssigned()) {
                continue;
            }
            var data = taskItem.getValue();
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
                task: taskItem,
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
            this.setRefreshStatesOfType("playerlist", 4);
            var forceTime = new Date();
            forceTime.setSeconds(defaults.forceSec, 0);
            var startTime = new Date();
            startTime.setSeconds(defaults.startSec, 0);
            var next = coroutine(function*() {
                var forceTargeting = false;
                console.log("-- kingwar assignment -- try find target");
                while(!this.constantKingwar && !forceTargeting) {
                    console.log("-- kingwar assignment -- loop");
                    yield this.refreshAllPlayers((funcObj) => { return funcObj.state == 3; }, next);
                    yield this.refreshAllPlayers((funcObj) => { return funcObj.state == 5; }, next);
                    yield setTimeout(next, 55);
                    forceTargeting = (new Date() > startTime);
                }
                console.log("-- kingwar assignment -- try auto assign");
                if (!this.constantKingwar)
                {
                    var started = false;
                    var lastTasks = null;
                    var targetingTaskManager = new TaskManager((tasks, total) => {
                        lastTasks = tasks;
                        console.log("-- kingwar assignment -- tasks ready", tasks.length, total, started);
                        if (started || tasks.length == total) {
                            if (tasks.length == total) {
                                lastTasks = null;
                            }
                            this.targetingAssignment(tasks, defaults);
                        }
                    });
                    (() => {
                        var tnext = coroutine(function*() {
                            while (new Date() < forceTime) {
                                yield setTimeout(tnext, 60);
                            }
                            started = true;
                            console.log("-- kingwar assignment -- force time!", lastTasks, (lastTasks ? lastTasks.length : 0));
                            if (lastTasks) {
                                this.targetingAssignment(lastTasks, defaults);
                            }
                        }, this);
                    })();
                    yield this.refreshAllPlayers((funcObj) => { return funcObj.state == 3; }, next, targetingTaskManager);
                    this.uniqueKingwarOrder = null;
                }
                console.log("-- kingwar assignment -- finished!");
                this.setRefreshStatesOfType("kingwar", 1);
                this.setRefreshStatesOfType("playerlist", 1);
                this.setRefreshStatesOfType("targeting", 3);
            }, this);
        });
        this.targetingTimes.push(targetingKey);
    },

    // dropping
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
    managePlayers:function(conn, kingwarInfo, raceInfo) {
        var playerDatas = [];
        for (var i = 0; i < raceInfo.players.length; ++i) {
            var playerData = raceInfo.players[i];
            var playerIndex = kingwarInfo.playerIndices[playerData.playerId];
            if (typeof(playerIndex) == "number") {
                playerDatas[playerIndex] = playerData;
            }
        }
        var managedPlayers = {
            helpLock: kingwarInfo.helpLock,
            damageLock: kingwarInfo.damageLock,
        };
        var validPlayerId = (playerId) => {
            return playerId != conn.getGameInfo().playerId;
        };
        if (playerDatas.length > 0) {
            var playerData = playerDatas[0];
            if (validPlayerId(playerData.playerId)) {
                managedPlayers.helpPlayer = playerData;
            }
            playerDatas.splice(0, 1);
        }
        if (playerDatas.length > 0) {
            var playerData = playerDatas[playerDatas.length - 1];
            if (validPlayerId(playerData.playerId)) {
                managedPlayers.damagePlayer = playerData;
            }
            playerDatas.splice(playerDatas.length - 1, 1);
        }
        for (var i = 0; i < playerDatas.length; ++i) {
            if (!validPlayerId(playerDatas[i].playerId)) {
                playerDatas.splice(i, 1);
                break;
            }
        }
        managedPlayers.playerDatas = playerDatas;
        return managedPlayers;
    },
    rawCardsOf:function(cards) {
        var rawCards = [];
        for (var i = 0; i < cards.length; ++i) {
            rawCards.push(cards[i].cardType);
        }
        return rawCards;
    },
    findDroppingTarget:function(conn, card, managedPlayers, isForce) {
        var playerData;
        if (card.isGold) {
            playerData = managedPlayers.playerDatas.random();
        } else {
            playerData = (card.isBenefit ? managedPlayers.helpPlayer : managedPlayers.damagePlayer);
            if (!playerData || !this.isCardValid(card, playerData)) {
                playerData = null;
                if (card.isBenefit) {
                    for (var i = 0; i < managedPlayers.playerDatas.length; ++i) {
                        var data = managedPlayers.playerDatas[i];
                        if (this.isCardDroppable(card, data)) {
                            playerData = data;
                            break;
                        }
                    }
                } else {
                    for (var i = managedPlayers.playerDatas.length - 1; i >= 0; --i) {
                        var data = managedPlayers.playerDatas[i];
                        if (this.isCardDroppable(card, data)) {
                            playerData = data;
                            break;
                        }
                    }
                }
            }
        }
        return playerData || null;
    },
    getDroppingLock:function(managedPlayers, playerData) {
        if (managedPlayers.helpPlayer && playerData.playerId == managedPlayers.helpPlayer.playerId) {
            return managedPlayers.helpLock;
        } else if (managedPlayers.damagePlayer && playerData.playerId == managedPlayers.damagePlayer.playerId) {
            return managedPlayers.damageLock;
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
                //console.log("dropping with Info", kingwarInfo, conn.getGameInfo().name);
                if (kingwarInfo.playerOrder.length > 2) {
                    while (conn.getServerTime() < kingwarInfo.startTime) {
                        yield setTimeout(next, 60);
                    }
                    var waitingTime = kingwarInfo.forceTime;
                    var isForce = false;
                    while (cards.length > 0) {
                        while (cards.length > 0 && conn.getServerTime() <= waitingTime) {
                            var refreshRace = yield conn.getKingWarRace(next);
                            if (!refreshRace.cards || refreshRace.cards.length == 0 || !this.compareCards(cards, refreshRace.cards)) {
                                console.log("dropping break", this.rawCardsOf(cards), refreshRace.rawCards, conn.getGameInfo().name);
                                isForce = true;
                                break;
                            }
                            var managedPlayers = this.managePlayers(conn, kingwarInfo, refreshRace);
                            var playerData = this.findDroppingTarget(conn, refreshRace.cards[0], managedPlayers, isForce);
                            cards = refreshRace.cards;
                            if (playerData) {
                                var playerLock = this.getDroppingLock(managedPlayers, playerData);
                                if (playerLock) {
                                    console.log("locking for player", playerData.playerId, conn.getGameInfo().name);
                                    yield playerLock.lock(next);
                                }
                                console.log("drop card", refreshRace.rawCards, "to", playerData, conn.getGameInfo().name);
                                var useData = yield conn.useKingWarCard(playerData.playerId, next);
                                if (playerLock) {
                                    playerLock.unlock();
                                }
                                if (useData.success) {
                                    var t = conn.getServerTime();
                                    console.log("drop success", refreshRace.rawCards, playerData.playerId, "good:{0}, bad:{1},".format(useData.good, useData.bad), conn.getGameInfo().name, t.getSeconds(), t.getMilliseconds());
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
            }
            safe(done)();
        }, this);
    },
    getDroppingKingwarInfo:function(kingwarKey, defaults) {
        var playerList = [];
        var refData = this.kingwarRefs[kingwarKey];
        var playerCount = (refData.players.length > 16 ? 16 : refData.players.length);
        for (var i = 0; i < playerCount; ++i) {
            var player = refData.players[i];
            var playerId = player.playerId;
            if (this.whiteList[playerId]) {
                continue;
            }
            var playerItem = this.allPlayers[playerId];
            var power = (playerItem ? playerItem.maxPower : player.power);
            playerList.push({
                playerId: playerId,
                power: power,
                isOurs: playerItem && playerItem.unionId == defaults.selfUnion || false,
            });
        }

        var playerOrder = [];
        for (var i = 0; i < playerList.length; ++i) {
            var player = playerList[i];
            var insertIndex = playerOrder.length;
            for (var j = 0; j < playerOrder.length; ++j) {
                var playerComp = playerOrder[j];
                var oursToEnemy = player.isOurs && !playerComp.isOurs;
                var allOurs = player.isOurs && playerComp.isOurs;
                var allEnemy = !player.isOurs && !playerComp.isOurs;
                if (oursToEnemy || (allOurs && player.power > playerComp.power) || (allEnemy && player.power < playerComp.power)) {
                    insertIndex = j;
                    break;
                }
            }
            playerOrder.splice(insertIndex, 0, player);
        }

        var playerIndices = {};
        for (var i = 0; i < playerOrder.length; ++i) {
            var player = playerOrder[i];
            playerIndices[player.playerId] = i;
            console.log("-- dropping order --", kingwarKey, player);
        }

        return {
            playerOrder: playerOrder,
            playerIndices: playerIndices,
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

    // hero shop
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

    // union war
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
    refreshUnionwar:function(conn, unionwarConfig, done) {
        var next = coroutine(function*() {
            console.log("refreshUnionwar..", conn.getGameInfo().name);
            var unionwarInfo = yield conn.getUnionWar(next);
            if (!unionwarInfo.isOpen) {
                return safe(done)();
            }
            var isWeekend = new Date().getDay() == 0;
            var targetLands = (unionwarConfig.onlyOccupy ? this.unionwarOrder : this.unionwarlands);
            var playerId = conn.getGameInfo().playerId;
            var myOccupy = {quality:0};
            var hasSpeed = false;
            var cardInfo = null;
            var hasLands = yield this.enumUnionwarlands(conn, targetLands, (isMine, mineData, landId) => {
                if (!isMine) {
                    hasSpeed = mineData.hasSpeed;
                    cardInfo = mineData.card;
                    if (!unionwarConfig.enabled) {
                        return true;
                    }
                    return;
                }
                if (mineData.playerId == playerId) {
                    myOccupy = {
                        quality: mineData.quality,
                        landId: landId,
                        pos: mineData.pos,
                    };
                    return true; // finish loop
                }
            }, next);
            if (!hasLands) {
                return safe(done)();
            }
            conn.log("myOccupy", myOccupy, unionwarConfig);

            if (isWeekend) {
                if (conn.getGameInfo().unionWarDouble < 100) {
                    yield conn.buySpeed(300, next);
                }
                if (!hasSpeed) {
                    yield conn.setSpeed(true, next);
                }
            }
            if (cardInfo && cardInfo.ready) {
                if (cardInfo.isgood && unionwarConfig.goodUNID) {
                    conn.log("drop good card to", unionwarConfig.goodUNID);
                    var useData = yield conn.useCard(unionwarConfig.goodUNID, next);
                    conn.log("drop result", useData.success);
                } else if (!cardInfo.isgood && unionwarConfig.badUNID) {
                    conn.log("drop bad card to", unionwarConfig.badUNID);
                    var useData = yield conn.useCard(unionwarConfig.badUNID, next);
                    conn.log("drop result", useData.success);
                }
            }

            if (!unionwarConfig.enabled) {
                return safe(done)();
            }
            var isReverse = !isWeekend && unionwarConfig.reverseOrder;
            if (isReverse) {
                myOccupy.quality = 10;
            }
            var betterChoice = (pos, nowPos) => {
                return (isReverse ? pos < nowPos : pos > nowPos);
            }
            if ((myOccupy.quality > 0 && myOccupy.quality < 10) && isReverse) {
                return safe(done)();
            }

            var randTime = rand(1500);
            yield setTimeout(next, randTime);
            var lock = this.unionwarLock;
            yield lock.lock(next);
            conn.log("start to occupy");

            var unionData = yield conn.getUnion(next);
            var occupyOrders = [];
            yield this.enumUnionwarlands(conn, targetLands, (isMine, mineData, landId) => {
                if (!isMine) { return; }
                if (mineData.unionId && mineData.unionId == unionData.unionId) { return; }
                if (!betterChoice(mineData.quality, myOccupy.quality)) { return; }
                var occupyItem = {
                    landId:landId,
                    pos:mineData.pos,
                    playerId:mineData.playerId,
                };
                var isEmpty = !mineData.playerId;
                var canFight = true;
                if (mineData.playerId) {
                    var playerItem = this.allPlayers[mineData.playerId];
                    if (playerItem) {
                        canFight = conn.getGameInfo().power + 200000 > playerItem.maxPower;
                    }
                }
                var insertPos = 0;
                for (insertPos = 0; insertPos < occupyOrders.length; ++insertPos) {
                    var occupyBlock = occupyOrders[insertPos];
                    if (!canFight && occupyBlock.canFight) {
                        continue;
                    }
                    if (!canFight && !occupyBlock.canFight) {
                        occupyBlock.occupy.push(occupyItem);
                        return;
                    }
                    if (canFight && !occupyBlock.canFight) {
                        break;
                    }
                    // Check same
                    if (mineData.quality == occupyBlock.quality) {
                        if (isEmpty == occupyBlock.isEmpty) {
                            occupyBlock.occupy.push(occupyItem);
                            return;
                        }
                        if (isEmpty) {
                            break;
                        }
                    } else if (betterChoice(mineData.quality, occupyBlock.quality)) {
                        break;
                    }
                }
                conn.log("insert occupy:", insertPos, mineData.quality, isEmpty, canFight);
                occupyOrders.splice(insertPos, 0, {
                    quality: mineData.quality,
                    isEmpty: isEmpty,
                    canFight: canFight,
                    occupy: [occupyItem],
                });
            }, next);
            conn.log("occupy result", occupyOrders.length);

            var backOccupy = false;
            for (var i = 0; i < occupyOrders.length; ++i) {
                var occupyBlock = occupyOrders[i];
                var occupyItem = occupyBlock.occupy.random();
                if (occupyBlock.isEmpty) {
                    conn.log("== occupy ==", "index:", i, "landId:", occupyItem.landId, "pos:", occupyItem.pos);
                    var occupyData = yield conn.occupy(occupyItem.landId, occupyItem.pos, next);
                    if (occupyData.success) {
                        break;
                    }
                } else if (!backOccupy) {
                    conn.log("== fire ==", "index:", i, "landId:", occupyItem.landId, "pos:", occupyItem.pos, "playerId:", occupyItem.playerId);
                    var fireData = yield conn.fire(occupyItem.landId, occupyItem.pos, next);
                    if (fireData.success) {
                        backOccupy = true;
                    }
                    var occupyData = yield conn.occupy(occupyItem.landId, occupyItem.pos, next);
                    if (occupyData.success) {
                        backOccupy = false;
                        break;
                    }
                }
            }
            if (backOccupy && myOccupy.landId && myOccupy.pos) {
                conn.log("== back ==", "landId:", myOccupy.landId, "pos:", myOccupy.pos);
                var occupyData = yield conn.occupy(myOccupy.landId, myOccupy.pos, next);
            }

            lock.unlock();
            safe(done)();
        }, this);
    },
    enumUnionwarlands:function(conn, targetLands, deal, done) {
        var next = coroutine(function*() {
            var unionwarInfo = yield conn.getUnionWar(next);
            if (!unionwarInfo.lands) {
                return safe(done)(false);
            }
            var hasLands = false;
            for (var i = 0; i < targetLands.length; ++i) {
                var landId = targetLands[i];
                if (unionwarInfo.lands[landId]) {
                    continue;
                }
                var unionwarLandInfo = yield conn.enterUnionWar(landId, next);
                if (!unionwarLandInfo.mineArray) {
                    continue;
                }
                hasLands = true;
                var finish = safe(deal)(false, unionwarLandInfo, landId);
                if (finish) {
                    return safe(done)(hasLands);
                }
                for (var j = 0; j < unionwarLandInfo.mineArray.length; ++j) {
                    var mineData = unionwarLandInfo.mineArray[j];
                    if (mineData.mineLife == 0) {
                        continue;
                    }
                    var finish = safe(deal)(true, mineData, landId);
                    if (finish) {
                        return safe(done)(hasLands);
                    }
                }
            }
            safe(done)(hasLands);
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
        for (var i = 0; i < defaults.days.length; ++i) {
            var day = defaults.days[i];
            for (var j = 0; j < defaults.moments.length; ++j) {
                var moment = defaults.moments[j];
                var unionwarKey = this.timingManager.setWeeklyEvent(day, moment.hour, moment.minute, moment.second, doUnionwar);
                //console.log("-- setUnionwarEvent --", day, moment.hour, moment.minute, moment.second, unionwarKey);
                this.unionwarTimes.push(unionwarKey);
            }
        }
        var fightStart = defaults.fighting_start;
        var fightEnd = defaults.fighting_end;
        var startWeekendUnionwar = () => {
            var next = coroutine(function*() {
                var now = new Date();
                now.setHours(fightEnd.hour, fightEnd.minute, fightEnd.second, 0);
                var endTime = now.getTime();
                this.setRefreshStatesOfType("kingwar", 4);
                this.setRefreshStatesOfType("playerlist", 4);

                while (new Date().getTime() < endTime) {
                    var now = new Date();
                    console.log("unionwar fighting - ", "{0}:{1}".format(now.getHours(), now.getMinutes()));
                    yield this.refreshAllPlayers((funcObj) => { return funcObj.state == 7; }, next);
                    console.log("unionwar fought - ", "{0}:{1}".format(now.getHours(), now.getMinutes()));
                    yield setTimeout(next, defaults.fighting_period * 1000);
                }

                this.setRefreshStatesOfType("kingwar", 1);
                this.setRefreshStatesOfType("playerlist", 1);
            }, this);
        };
        this.unionwarTimes.push(this.timingManager.setWeeklyEvent(0, fightStart.hour, fightStart.minute, fightStart.second, startWeekendUnionwar));
        var now = new Date();
        if (now.getDay() == 0) {
            var currTime = now.getTime();
            now.setHours(fightStart.hour, fightStart.minute, fightStart.second, 0);
            var startTime = now.getTime();
            now.setHours(fightEnd.hour, fightEnd.minute, fightEnd.second, 0);
            var endTime = now.getTime();
            if (currTime > startTime && currTime < endTime) {
                startWeekendUnionwar();
            }
        }
    },

    // check info kingwar
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

    // check info listing
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
                if (i < refreshData.unionCount) {
                    var hasValidPlayer = false;
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
                        hasValidPlayer = true;
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
                    if (hasValidPlayer) {
                        this.allUnions[unionItem.unionId] = {
                            server: server,
                            name: unionItem.name,
                            short: unionItem.short,
                        };
                    }
                }
            }
            safe(done)();
        }, this);
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
            var union = (player.unionId ? this.allUnions[player.unionId] || {} : {});
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

    // control heros
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

    // unset player
    unsetPlayer:function(key) {
        return this.removeRefresh(key);
    },

    // periodic
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
                var refreshChecker = (funcObj) => {
                    if (funcObj.state != 1) {
                        return false;
                    }
                    var matchType = refreshType && refreshType.indexOf(funcObj.refresh) >= 0;
                    if (!refreshType || matchType) {
                        return true;
                    }
                    return false;
                };
                yield this.refreshAllPlayers(refreshChecker, next);
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

    // daily task
    startDailyTask:function(dailyTimes) {
        this.unsetEventKeys(this.dailyTasks);
        this.dailyTasks = [];
        var doDailyTask = () => {
            var now = new Date();
            console.log("daily task start!", "{0}:{1}".format(now.getHours(), now.getMinutes()));
            this.refreshAllPlayers((funcObj) => {
                return funcObj.state == 2;
            }, () => {
                var now = new Date();
                this.heroshopDate = now.getDate();
                safe(this.heroshopUpdateCallback)(this.heroshopDate, this.heroshopInfo);
                console.log("daily task end!", "{0}:{1}".format(now.getHours(), now.getMinutes()));
            }, null, true);
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

    // refresh helper
    unsetEventKeys:function(keyArray) {
        if (keyArray) {
            for (var i = 0; i < keyArray.length; ++i) {
                this.timingManager.unsetEvent(keyArray[i]);
            }
        }
    },
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
    refreshAllPlayers:function(checkFun, done, taskManager, showWave) {
        console.log("refresh all player start -", process.memoryUsage());
        var allPlayersCount = 0;
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

            allPlayersCount = executables.length;
            if (executables.length > 0) {
                this.executeOnePlayer(refreshInfo, executables, select.setup(), (taskManager ? taskManager.addTask() : undefined));
            }
        }
        select.all(() => {
            console.log("refresh all player finish -", allPlayersCount, process.memoryUsage());
            if (showWave) {
                this.showMemoryWave();
            }
            safe(done)();
        });
    },
    manualOnePlayer:function(playerData, func, done) {
        console.log("manual one player start -", process.memoryUsage());
        this.executeOnePlayer(playerData, [func], (result) => {
            console.log("manual one player finish -", process.memoryUsage());
            safe(done)(result);
        });
    },
    executeOnePlayer:function(refreshInfo, executables, done, taskItem) {
        var next = coroutine(function*() {
            var token = { finished: false, };
            yield refreshInfo.mutex.lock(next);
            var doEnd = (unexpected) => {
                if (token.finished) {
                    return;
                }
                token.finished = true;
                if (unexpected && taskItem) {
                    taskItem.giveup();
                }
                refreshInfo.mutex.unlock();
                safe(done)({
                    success: !unexpected,
                });
            };
            setTimeout(() => {
                if (!token.finished) {
                    console.log("============= one player timeout =============");
                    doEnd(true);
                }
            }, 1000 * 60 * 1.5);
            var conn = this.accountManager.connectAccount(refreshInfo.account, refreshInfo.validator);
            if (!conn) {
                this.errLog("connectAccount", "account:{0}".format(refreshInfo.account));
                return doEnd(true);
            }
            //console.log("start -- player!", refreshInfo.account, refreshInfo.server);
            var data = yield conn.loginAccount(next);
            if (token.finished || !data.success) {
                this.errLog("loginAccount", "account({0}), server({1})".format(refreshInfo.account, refreshInfo.server));
                return doEnd(true);
            }
            var data = yield conn.loginGame(refreshInfo.server, next);
            if (token.finished || !data.success) {
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
                if (token.finished) {
                    return doEnd(true);
                }
            }
            //console.log("quit -- player!", refreshInfo.account, refreshInfo.server, conn.getGameInfo().name);
            conn.quit();
            doEnd();
        }, this);
    },
    showMemoryWave:function() {
        var next = coroutine(function*() {
            for (var i = 0; i < 100; ++i) {
                yield setTimeout(next, 1000);
                console.log("wave:", i, process.memoryUsage());
            }
        }, this);
    },

    // misc
    getPlayerBrief:function(playerData) {
        var accountGameKey = playerData.account + "$" + playerData.server;
        return this.lastPlayerInfo[accountGameKey];
    },
    setPlayerBrief:function(playerData, brief) {
        var accountGameKey = playerData.account + "$" + playerData.server;
        this.lastPlayerInfo[accountGameKey] = brief;
    },
    getAllServerDesc:function() {
        var servers = $GameConnection.getAllServers();
        var descs = [];
        for (var desc in servers) {
            if (desc.substr(0, 1) == "s") {
                descs.push(desc);
            }
        }
        descs.sort((a, b) => {
            return Number(a.substr(1)) - Number(b.substr(1));
        });
        return descs;
    },

    initPlayerListing:function() {
        this.allUnions = {};
        this.allPlayers = {};
        this.sortedPlayerIds = [];
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
    errLog:function(action, state) {
        console.log("Failed to get task '{0}', detail:'{1}'".format(action, state));
    },
});

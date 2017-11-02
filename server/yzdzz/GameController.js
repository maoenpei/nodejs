
require("../Base");
require("./GameConnection");

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
        console.log("Account added. accountKey:{0}, username:{1}, password:{2}".format(accountKey, username, password));
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

        this.refreshUnique = null;
        this.refreshData = {};
        this.refreshingState = false;
        this.initKingwar();
        this.initPlayers();
    },
    getAccountManager:function() {
        return this.accountManager;
    },

    // API
    setPlayerAutomation:function(playerData, intervalCount, autoConfigs) {
        return this.appendRefresh(playerData, intervalCount, (conn, done) => {
            this.refreshAutomation(conn, autoConfigs, done);
        });
    },
    // API
    modifyPlayerAutomation:function(key, intervalCount, autoConfigs) {
        return this.modifyRefresh(key, intervalCount, (conn, done) => {
            this.refreshAutomation(conn, autoConfigs, done);
        });
    },
    // API
    manualPlayerAutomation:function(playerData, autoConfigs, done) {
        var next = coroutine(function*() {
            playerData.validator.resetHourly();
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
            safe(done)({
                success: true,
            });
        }, this);
    },
    refreshAutomation:function(conn, autoConfigs, done) {
        var next = coroutine(function*() {
            console.log("refreshAutomation..");
            for (var op in autoConfigs) {
                var config = autoConfigs[op];
                if (!config.disabled) {
                    console.log("auto", op, config);
                    yield conn[op].call(conn, config, next);
                }
            }
            safe(done)();
        }, this);
    },

    // API
    setPlayerListAccount:function(playerData, intervalCount, unionCount, minPower, limitPower, limitDay) {
        return this.appendRefresh(playerData, intervalCount, (conn, done) => {
            this.refreshPlayers(conn, {
                server: playerData.server,
                minPower: minPower * 10000,
                unionCount: unionCount,
                limitPower: limitPower * 10000,
                limitDay: limitDay,
            }, done);
        });
    },
    // API
    getPlayers:function() {
        return this.allPlayers;
    },
    // API
    getUnions:function() {
        return this.allUnions;
    },
    // API
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
    //API
    setMaxPowers:function(allPowerMax) {
        for (var playerId in allPowerMax) {
            var playerInfo = this.allPlayers[playerId];
            playerInfo = (playerInfo ? playerInfo : {});
            playerInfo.maxPower = allPowerMax[playerId].maxPower;
            this.allPlayers[playerId] = playerInfo;
        }
    },
    initPlayers:function() {
        this.allUnions = {};
        this.allPlayers = {};
        this.sortedPlayerIds = [];
    },
    refreshPlayers:function(conn, refreshData, done) {
        var next = coroutine(function*() {
            console.log("refreshPlayers..");
            var data = yield conn.getUnion(next); // dummy
            var data = yield conn.getUnionList(next);
            if (!data.unions) {
                this.errLog("getUnionList", "none");
                return safe(done)();
            }
            var limitMilliSeconds = refreshData.limitDay * 24 * 3600 * 1000
            for (var i = 0; i < data.unions.length; ++i) {
                var unionItem = data.unions[i];
                this.allUnions[unionItem.unionId] = {
                    server: refreshData.server,
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
                            server: refreshData.server,
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

    // API
    setKingwarAccount:function(playerData, intervalCount, area, star) {
        var key = area * 100 + star;
        return this.appendRefresh(playerData, intervalCount, (conn, done) => {
            this.refreshKingwar(conn, {
                key: key,
                area:area,
                star:star,
                server:playerData.server,

                refData:this.kingwarRefs[key],
            }, done);
        });
    },
    // API
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
            console.log("refreshKingwar..");
            var validator = conn.getValidator();
            if (this.constantKingwar && !validator.checkDaily("refreshKingwar")) {
                return safe(done)();
            }
            var data = yield conn.getKingWar(next);
            var constant = !data.allowJoin;
            if (this.constantKingwar && !constant) {
                this.constantKingwar = false;
                this.playerToKingwar = {};
            } else if (!this.constantKingwar && constant) {
                this.constantKingwar = true;
            }
            if (!data.joined && data.allowJoin) {
                var joinData = yield conn.joinKingWar(refreshData.area, refreshData.star, next);
                if (!joinData.success) {
                    this.errLog("joinKingWar", "server({2}) area({0}), star({1})".format(refreshData.area, refreshData.star, refreshData.server));
                    return safe(done)();
                }
            }
            if (refreshData.refData.constant && constant) {
                return safe(done)();
            }
            var data = yield conn.getKingWarPlayers(next);
            if (!data.players) {
                this.errLog("getKingWarPlayers", "server({2}) area({0}), star({1})".format(refreshData.area, refreshData.star, refreshData.server));
                return safe(done)();
            }

            var realKey = data.areaId * 100 + data.starId;
            var realData = this.kingwarRefs[realKey];
            refreshData.refData = realData;
            if (realKey != refreshData.key) {
                console.log("kingwar search key({0}) doesn't equal to result key({1})".format(refreshData.key, realKey));
            }

            var players = [];
            for (var i = 0; i < data.players.length; ++i) {
                var playerData = data.players[i];
                players.push({
                    playerId: playerData.playerId,
                    union: playerData.union,
                    name: playerData.name,
                    power: playerData.power,
                });
                this.playerToKingwar[playerData.playerId] = realKey;
            }
            realData.constant = constant;
            realData.players = players;
            safe(done)();
        }, this);
    },

    // API
    startRefresh:function(interval, callback) {
        if (this.refreshUnique) {
            return;
        }
        console.log("refreshing start!");
        var mark = { callback: callback };
        this.refreshUnique = mark;
        var next = coroutine(function*() {
            while(this.refreshUnique === mark) {
                this.refreshingState = true;
                for (var accountGameKey in this.refreshData) {
                    if (this.refreshUnique !== mark) {
                        break;
                    }

                    var refreshInfo = this.refreshData[accountGameKey];
                    var executables = [];
                    for (var i = 0; i < refreshInfo.funcs.length; ++i) {
                        var item = refreshInfo.funcs[i];
                        if (item.index == 0) {
                            executables.push(item.func);
                        }
                        item.index = (item.index + 1) % item.count;
                    }

                    if (executables.length > 0) {
                        var conn = this.accountManager.connectAccount(refreshInfo.account, refreshInfo.validator);
                        if (!conn) {
                            this.errLog("connectAccount", "account:{0}".format(refreshInfo.account));
                            continue;
                        }
                        var data = yield conn.loginAccount(next);
                        if (!data.success) {
                            this.errLog("loginAccount", "account({0}), server({1})".format(conn.getUsername(), refreshInfo.server));
                            continue;
                        }
                        var data = yield conn.loginGame(refreshInfo.server, next);
                        if (!data.success) {
                            this.errLog("loginGame", "account({0}), server({1})".format(conn.getUsername(), refreshInfo.server));
                            continue;
                        }
                        for (var i = 0; i < executables.length; ++i) {
                            yield executables[i](conn, next);
                        }
                        conn.quit();
                    }
                }
                this.refreshingState = false;
                if (mark.callback) {
                    yield mark.callback(next);
                }
                console.log("waiting {0} seconds...".format(interval));
                yield setTimeout(next, interval * 1000);
            }
            console.log("refreshing quit!");
        }, this);
    },
    cancelRefresh:function() {
        this.refreshUnique = null;
    },
    isRefreshing:function() {
        return this.refreshingState;
    },

    errLog:function(action, state) {
        console.log("Failed to get task '{0}', detail:'{1}'".format(action, state));
    },
    appendRefresh:function(playerData, count, func) {
        var accountGameKey = playerData.account + "$" + playerData.server;
        var refreshInfo = this.refreshData[accountGameKey];
        refreshInfo = (refreshInfo ? refreshInfo : {
            account: playerData.account,
            server: playerData.server,
            funcs: [],
            validator: playerData.validator,
        });
        var funcObj = {
            func:func,
            count: count,
            index: 0,
        };
        refreshInfo.funcs.push(funcObj);
        this.refreshData[accountGameKey] = refreshInfo;
        return {
            key: accountGameKey,
            obj: funcObj,
        };
    },
    modifyRefresh:function(key, count, func) {
        var refreshInfo = this.refreshData[key.key];
        if (refreshInfo && refreshInfo.funcs && refreshInfo.funcs.length > 0) {
            for (var i = 0; i < refreshInfo.funcs.length; ++i) {
                if (refreshInfo.funcs[i] === key.obj) {
                    refreshInfo.funcs.splice(i, 1, {
                        func: func,
                        count: count,
                        index: 0,
                    });
                    return true;
                }
            }
        }
        return false;
    },
    // API
    stopRefresh:function(key) {
        var refreshInfo = this.refreshData[key.key];
        if (refreshInfo && refreshInfo.funcs && refreshInfo.funcs.length > 0) {
            for (var i = 0; i < refreshInfo.funcs.length; ++i) {
                if (refreshInfo.funcs[i] === key.obj) {
                    refreshInfo.funcs.splice(i, 1);
                    if (refreshInfo.funcs.length == 0) {
                        delete this.refreshData[key.key];
                    }
                    return true;
                }
            }
        }
        return false;
    },
});

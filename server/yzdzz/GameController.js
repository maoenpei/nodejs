
require("../Base");
require("./GameConnection");

Base.extends("AccountManager", {
    _constructor:function() {
        this.accounts = {};
    },
    add:function(username, password) {
        var accountKey = rkey();
        while(this.accounts[accountKey]) {
            accountKey = rkey();
        }
        this.accounts[accountKey] = {
            username:username,
            password:password,
        }
        return accountKey;
    },
    remove:function(accountKey) {
        if (this.accounts[accountKey]) {
            delete this.accounts[accountKey];
        }
    },
    list:function() {
        return this.accounts;
    },

    connectAccount:function(accountKey) {
        var accountData = this.accounts[accountKey];
        if (!accountData) {
            return null;
        }

        var accountObj = new GameConnection(accountData.username, accountData.password);
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
    setPlayerListAccount:function(accountKey, serverDesc, intervalCount, unionCount, minPower) {
        this.appendRefresh(accountKey, serverDesc, intervalCount, (conn, done) => {
            this.refreshPlayers(conn, {
                server: serverDesc,
                minPower: minPower,
                count:unionCount,
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
            for (var i = 0; i < data.unions.length; ++i) {
                var unionItem = data.unions[i];
                this.allUnions[unionItem.unionId] = {
                    server: refreshData.server,
                    name: unionItem.name,
                    short: unionItem.short,
                };
                if (i < refreshData.count) {
                    var playersData = yield conn.getUnionPlayers(unionItem.unionId, next);
                    if (!playersData.players) {
                        this.errLog("getUnionPlayers", "none");
                        return safe(done)();
                    }
                    for (var j = 0; j < playersData.players.length; ++j) {
                        var playerItem = playersData.players[j];
                        var playerData = this.allPlayers[playerItem.playerId];
                        var lastPower = (playerData ? playerData.maxPower : 0);
                        var maxPower = (playerItem.power > lastPower ? playerItem.power : lastPower);
                        if (maxPower > refreshData.minPower) {
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
            }
            safe(done)();
        }, this);
    },

    // API
    setKingwarAccount:function(accountKey, serverDesc, intervalCount, area, star) {
        var key = area * 100 + star;
        var refreshData = {
            key: key,
            area:area,
            star:star,
            account:accountKey,
            server:serverDesc,

            refData:this.kingwarRefs[key],
        };
        this.appendRefresh(accountKey, serverDesc, intervalCount, (conn, done) => {
            this.refreshKingwar(conn, refreshData, done);
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
                        var conn = this.accountManager.connectAccount(refreshInfo.account);
                        var data = yield conn.loginAccount(next);
                        if (!data.success) {
                            this.errLog("connectAccount", "account({0}), server({1})".format(conn.getUsername(), refreshInfo.server));
                            continue;
                        }
                        var data = yield conn.loginGame(refreshInfo.server, next);
                        if (!data.success) {
                            this.errLog("loginGame", "account({0}), server({1})".format(conn.getUsername(), refreshInfo.server));
                            continue;
                        }
                        yield conn.autoSign(next);
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
    appendRefresh:function(accountKey, server, count, func) {
        var accountGameKey = accountKey + "$" + server;
        var refreshInfo = this.refreshData[accountGameKey];
        refreshInfo = (refreshInfo ? refreshInfo : {
            account: accountKey,
            server: server,
            funcs: [],
        });
        refreshInfo.funcs.push({
            func:func,
            count: count,
            index: 0,
        });
        this.refreshData[accountGameKey] = refreshInfo;
    },
    stopRefresh:function(accountKey, server) {
        var accountGameKey = accountKey + "$" + server;
        this.refreshData[accountGameKey] = null;
    },
});

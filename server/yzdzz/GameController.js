
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
            return safe(done)(null);
        }

        var accountObj = new GameConnection(accountData.username, accountData.password);
        return accountObj;
    },
});

// Manage all, including
Base.extends("GameController", {
    _constructor:function() {
        this.accountManager = new AccountManager();

        this.kingwarAreaStars = {};
        this.kingwarRefs = {};
        this.kingwarRefreshing = null;
    },
    getAccountManager:function() {
        return this.accountManager;
    },
    errLog:function(action, state) {
        console.log("Failed to get task '{0}', detail:'{1}'".format(action, state));
    },

    setKingwarAccount:function(accountKey, serverDesc, area, star) {
        var key = area * 100 + star;
        var refData = {
            constant:false,
            players:[],
        }
        var areaStarData = {
            area:area,
            star:star,
            account:accountKey,
            server:serverDesc,

            refData:refData,
        };
        this.kingwarAreaStars[key] = areaStarData; // force set
        this.kingwarRefs[key] = refData;
    },
    refreshKingwar:function(interval) {
        if (this.kingwarRefreshing) {
            return;
        }
        var mark = {};
        this.kingwarRefreshing = mark;
        var next = coroutine(function*() {
            while(this.kingwarRefreshing === mark) {
                for (var key in this.kingwarAreaStars) {
                    var areaStarData = this.kingwarAreaStars[key];
                    var conn = this.accountManager.connectAccount(areaStarData.account);
                    var data = yield conn.loginAccount(next);
                    if (!data.success) {
                        this.errLog("connectAccount", "area({0}), star({1})".format(areaStarData.area, areaStarData.star));
                        continue;
                    }
                    var data = yield conn.loginGame(areaStarData.server, next);
                    if (!data.success) {
                        this.errLog("loginGame", "server({2}) area({0}), star({1})".format(areaStarData.area, areaStarData.star, areaStarData.server));
                        continue;
                    }
                    var data = yield conn.getKingWar(next);
                    var constant = !data.allowJoin;
                    if (!data.joined && data.allowJoin) {
                        var joinData = yield conn.joinKingWar(areaStarData.area, areaStarData.star, next);
                        if (!joinData.success) {
                            this.errLog("joinKingWar", "server({2}) area({0}), star({1})".format(areaStarData.area, areaStarData.star, areaStarData.server));
                            conn.quit();
                            continue;
                        }
                    }
                    if (areaStarData.refData.constant && constant) {
                        // no need to update
                        conn.quit();
                        continue;
                    }
                    var data = yield conn.getKingWarPlayers(next);
                    if (!data.players) {
                        this.errLog("getKingWarPlayers", "server({2}) area({0}), star({1})".format(areaStarData.area, areaStarData.star, areaStarData.server));
                        conn.quit();
                        continue;
                    }
                    var realKey = data.areaId * 100 + data.starId;
                    var realData = this.kingwarRefs[realKey];
                    if (realKey != key) {
                        areaStarData.refData = realData;
                        console.log("kingwar search key({0}) doesn't equal to result key({1})".format(key, realKey));
                    }
                    var players = [];
                    for (var i = 0; i < data.players.length; ++i) {
                        var playerData = data.players[i];
                        players.push({
                            union: playerData.union,
                            name: playerData.name,
                            power: playerData.power,
                        });
                    }
                    realData.constant = constant;
                    realData.players = players;
                    conn.quit();
                }
                yield $FileManager.saveFile("/../20170925_yongzhe_hack/kingwardata.json", JSON.stringify(this.kingwarAreaStars), next);
                console.log("waiting {0} seconds...".format(interval));
                yield setTimeout(next, interval * 1000);
            }
        }, this);
    },
    cancelKingwar:function() {
        this.kingwarRefreshing = null;
    },
    getKingwar:function() {
        var areastars = {};
        for (var key in this.kingwarRefs) {
            var data = this.kingwarRefs[key];
            areastars[key] = (data.players ? data.players : []);
        }
        return areastars;
    }
});

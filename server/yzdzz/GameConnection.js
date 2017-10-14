
require("../Base");
require("../FileManager");
require("./Protocol");

var cachedServers = null;
Base.extends("GameConnection", {
    _constructor:function(username, password) {
        this.username = username;
        this.password = password;
        this.accountInfo = null;
        this.servers = [];
        this.serverInfo = null;
        this.gameInfo = null;

        this.sock = null;

        this.recvCallbacks = {};
        this.commonCallbacks = {};
        this.events = {};
        this.quickRegs = {};
        this.registerMessages();
    },

    on:function(type, callback) {
        this.events[type] = callback;
    },
    getAccountInfo:function() {
        return this.accountInfo;
    },
    getServers:function() {
        return this.servers;
    },
    getServerInfo:function() {
        return this.serverInfo;
    },
    getGameInfo:function() {
        return this.gameInfo;
    },

    quit:function() {
        this.sock.end();
        this.sock = null;
        this.gameInfo = null;
    },
    loginAccount:function(done) {
        var next = coroutine(function*() {
            // login request
            var obj = yield GameHTTP.login(this.username, this.password, next);
            if (!obj || obj.code != 'SUCCESS') {
                return safe(done)({});
            }
            this.accountInfo = {
                accessToken : obj.value.accessToken,
                accountId : obj.value.channelUid,
            };

            // server list
            if (cachedServers) {
                this.servers = cachedServers;
            } else {
                var serverList = null;
                var data = yield $FileManager.visitFile("/data/serverCache.d", next);
                if (!data) {
                    var obj = null;
                    while(!obj) {
                        obj = yield GameHTTP.servers(this.accountInfo.accountId, next);
                    }
                    serverList = obj.list;
                    data = JSON.stringify(obj.list);
                    yield $FileManager.saveFile("/data/serverCache.d", data, next);
                } else {
                    serverList = JSON.parse(data);
                }

                this.servers = [];
                for (var key in serverList) {
                    var serverData = serverList[key];
                    var ipData = serverData.server.split(":");
                    var server = {
                        serverId:serverData.id,
                        ip:ipData[0],
                        port:Number(ipData[1]),
                        desc:serverData.short.toLowerCase(),
                    };
                    this.servers.push(server);
                }
                cachedServers = this.servers;
            }

            {
                var result = yield GameHTTP.stat(this.accountInfo.accountId, "active", next);
                if (result != "done") {
                    console.log("stat accountId:{0} error:{1}".format(this.accountInfo.accountId, result));
                }
            }

            safe(done)({
                success: true,
            });
        }, this);
    },
    servers:function() {
        return this.servers;
    },
    loginGame:function(desc, done) {
        var next = coroutine(function*() {
            if (!this.accountInfo) {
                return safe(done)({});
            }
            // already login, must quit first
            if (this.sock) {
                return safe(done)({});
            }

            var server = null;
            desc = desc.toLowerCase();
            for (var i = 0; i < this.servers.length; ++i) {
                var serverItem = this.servers[i];
                if (serverItem.desc == desc) {
                    server = serverItem;
                    break;
                }
            }
            if (!server) {
                return safe(done)({});
            }

            var sock = yield GameSock.connect(server.ip, server.port, next);
            if (!sock) {
                return safe(done)({});
            }
            console.log("Connected with ip:{0}, port:{1}, server:{2}".format(server.ip, server.port, server.desc));
            this.sock = sock;
            this.serverInfo = server;
            GameSock.receive(sock, (c, m, data) => {
                this.onReceive(c, m, data);
            });

            var data = yield this.sendMsg("Role", "version", null, next);
            var data = yield this.sendMsg("Role", "getUid", {userName:this.accountInfo.accountId}, next);
            var data = yield this.sendMsg("Role", "logins", {
                "token":this.accountInfo.accessToken,
                "client":99,
                "package":"com.hoolai.huluwa",
                "userName":this.accountInfo.accountId,
                "channel":"hoolai",
                "channelEx":"ios",
                "channelUid":this.accountInfo.accountId,
                "productId":182,
            }, next);
            this.gameInfo = {
                playerId : data.uid,
                name : data.role_name,
                level : data.level,
                gold : data.coin, // golden coin
                colorDiamond : data.gold, // color diamond
                whiteDiamond : data.ticket, // white diamond
            };
            var result = yield GameHTTP.stat(this.gameInfo.playerId, "reg", next);
            if (result != 'done') {
                console.log("stat failed playerId:{0} error:{1}".format(this.gameInfo.playerId, result));
            }
            console.log("Player id:{0}, name:{1}".format(this.gameInfo.playerId, this.gameInfo.name));
            //var obj = yield GameHTTP.save(this.accountInfo.accountId, this.gameInfo.playerId, server.serverId, this.accountInfo.accessToken, next);
            //if (obj.code != 'SUCCESS') {
            //    console.log("save failed accountId:{0} code:{1} reason:{2}".format(this.accountInfo.playerId, obj.code, obj.desc));
            //}
            var result = yield GameHTTP.loginServer(this.accountInfo.accountId, server.serverId, next);
            if (result != 'ok') {
                console.log("loginServer failed accountId:{0} result:{1}".format(this.accountInfo.accountId, result));
            }

            safe(done)({
                success:true,
            });
        }, this);
    },
    getRole:function(done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("Role", "getInfo", null, next);
            // act_splendid: 福利
            // explore: 战斗
            // hero: 勇者
            // item: 背包
            // quest: 任务
            // team: 装备
            // wake: 神石
            // weapon_type: 专精
            safe(done)();
        }, this);
    },
    getVisiblePlayers:function() {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("KingWar", "roleRank", null, next);
            var players = [];
            for (var i = 0; i < data.list.length; ++i) {
                var item = data.list[i];
                players.push({
                    playerId: item.uid,
                    power: item.cpi,
                    name: item.role_name,
                    union: item.server + "." + item.union_name,
                });
            }
            safe(done)({
                players: players,
            });
        }, this);
    },
    getUnion:function(done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("Union", "getinfo", null, next);
            safe(done)({
                unionId : data.id,
                ownerId : data.owner,
            });
        }, this);
    },

    getUnionWar:function(done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("UnionWar", "getinfo", null, next);
            var isOpen = Number(data.open) == 1;
            safe(done)({
                isOpen: isOpen,
            });
        }, this);
    },
    enterUnionWar:function(landId, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("UnionWar", "enter", null, next);
            if (!data) {
                return safe(done)({});
            }
            var data = yield this.sendMsg("UnionWar", "enterland", {id:landId}, next);
            if (!data) {
                return safe(done)({});
            }
            var mineArray = [];
            for (var i = 0; i < data.gems.length; ++i) {
                var gem = data.gems[i];
                mineArray.push({
                    pos: gem.pos,
                    playerId: gem.owner,
                    unionId: gem.union_id,
                    playerLife: gem.hp,
                    mineLife: gem.gem,
                });
            }
            safe(done)({
                cardReady: Number(data.card_used) == 0,
                cardType: data.card_id,
                isGoodCard: data.card_id <= 4,
                mineArray: mineArray,
            });
        }, this);
    },
    getCardList:function(done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("UnionWar", "cardinfo", null, next);
            if (!data || !data.target || data.target.length == 0) {
                return safe(done)({});
            }
            var cardList = [];
            for (var i = 0; i < data.target.length; ++i) {
                var target = data.target[i];
                cardList.push({
                    unionId: target.id,
                    name: target.name,
                    good: target.buff,
                    bad: target.debuff,
                });
            }
            safe(done)({
                cardList: cardList,
            });
        }, this);
    },
    occupy:function(landId, pos, done) {
        var next = coroutine(function*() {
            var ckey = this.regMsg("UnionWar", "occupy", (data) => {
                if (!data) {
                    next(null);
                } else if (data.id == landId && data.pos == pos) {
                    next(data);
                }
            });
            yield this.sendNotify("UnionWar", "occupy", {id:landId, pos:pos}, next);
            var data = yield; // wait for msg received
            this.unregMsg(ckey);
            if (!data) {
                return safe(done)({});
            }
            safe(done)({
                playerId: data.owner,
                unionId: data.union_id,
            });
        }, this);
    },
    useCard:function(unionId, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("UnionWar", "usecard", {id:unionId}, next);
            if (!data) {
                return safe(done)({});
            }
            safe(done)({
                success:true,
            });
        }, this);
    },

    getKingWar:function(done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("KingWar", "getinfo", null, next);
            safe(done)({
                allowJoin: data.state == 1,
                joined: data.check != 0,
                inlist: data.check == 1,
            });
        }, this);
    },
    getArea:function(areaId, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("KingWar", "getAreaInfo", null, next);
            var starNumbers = [];
            for (var i = 0; i < data.lands.length; ++i) {
                starNumbers.push(data[i].num);
            }
            safe(done)({
                starNumbers : starNumbers,
            });
        }, this);
    },
    joinKingWar:function(areaId, starId, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("KingWar", "apply", {areaid:areaId, star:starId}, next);
            if (!data) {
                return safe(done)({});
            }
            if (areaId != data.areaid || starId != data.star) {
                console.log("Join KingWar (area:{0}, star:{1}) error:".format(areaId, starId), data);
            }
            safe(done)({
                success: true,
            });
        }, this);
    },
    getKingWarPlayers:function(done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("KingWar", "getLandInfo", null, next);
            if (!data) {
                return safe(done)({});
            }
            var players = [];
            for (var i = 0; i < data.list.length; ++i) {
                var item = data.list[i];
                players.push({
                    playerId: item.uid,
                    power: item.cpi,
                    name: item.role_name,
                    union: item.server + "." + item.union_short,
                });
            }
            safe(done)({
                areaId:data.areaid,
                starId:data.star,
                players: players,
            });
        }, this);
    },
    getRace:function(done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("KingWar", "getRaceInfo", null, next);
            if (!data) {
                return safe(done)({});
            }
            var players = [];
            for (var i = 0; i < data.list.length; ++i) {
                var item = data.list[i];
                players.push({
                    playerId: item.uid,
                    name: item.role_name,
                });
            }
            safe(done)({
                players: players,
            });
        }, this);
    },

    autoSign:function(done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("Sign", "getinfo", null, next);
            var signed = !!(data.list[String(data.count)]);
            if (!signed) {
                var data = yield this.sendMsg("Sign", "start", {point:0}, next);
            }
            safe(done)({
                success:true,
                signed:signed,
            });
        }, this);
    },
    testProtocol:function(done) {
        var next = coroutine(function*() {
            console.log(new Date().getTime() / 1000);
            var data = null;
            //var data = yield this.sendMsg("Collect", "getinfo", null, next);
            //var data = yield this.sendMsg("Chat", "all", null, next); // 聊天信息
            //var data = yield this.sendMsg("Chat", "logs", null, next); // 
            //var data = yield this.sendMsg("RoleExplore", "update", {type:'', login:1}, next); // 点击收集
            //var data = yield this.sendMsg("RoleExplore", "balance", null, next);
            //var data = yield this.sendMsg("ActLevelGift", "getinfo", null, next); // 等级奖励
            //var data = yield this.sendMsg("ActGoldenHero", "getinfo", null, next); // 金币魔女
            //var data = yield this.sendMsg("ActCatchup", "info", null, next); // 后来居上
            //var data = yield this.sendMsg("UnionWar", "cardlog", null, next); // 查看卡牌列表
            //var data = yield this.sendMsg("UnionWar", "ahead", null, next); // 查看名次信息
            //var data = yield this.sendMsg("UnionWar", "refreshCard", null, next); // 刷新可用卡牌
            //var data = yield this.sendMsg("KingWar", "areaRank", {areaid:1}, next);

            console.log(data);
            yield $FileManager.saveFile("/../20170925_yongzhe_hack/recvdata.json", JSON.stringify(data), next);
            safe(done)();
        }, this);
    },

    // private
    sendNotify:function(c, m, data, callback) {
        if (!this.sock) {
            return;
        }
        GameSock.send(this.sock, c, m, data, callback);
    },
    onReceive:function(c, m, data) {
        var key = c + "." + m;
        var callbackArray = this.recvCallbacks[key];
        if (callbackArray && callbackArray.length > 0) {
            var callback = callbackArray[0];
            callbackArray.splice(0, 1);
            safe(callback)(data);
        } else {
            this.onCommonMsg(c, m, data);
        }
    },
    sendMsg:function(c, m, data, callback) {
        if (!this.sock) {
            return;
        }
        var key = c + "." + m;
        var callbackArray = this.recvCallbacks[key];
        callbackArray = (callbackArray ? callbackArray : []);
        callbackArray.push(callback);
        this.recvCallbacks[key] = callbackArray;
        GameSock.send(this.sock, c, m, data);
    },
    onCommonMsg:function(c, m, data) {
        var key = c + "." + m;
        var callbackArray = clone(this.commonCallbacks[key]);
        if (callbackArray && callbackArray.length > 0) {
            for (var i = 0; i < callbackArray.length; ++i) {
                callbackArray[i](data);
            }
        } else {
            console.log("untracked msg", "c:", c, "m:", m, "data:", data);
        }
    },
    regMsg:function(c, m, callback) {
        var key = c + "." + m;
        var callbackArray = this.commonCallbacks[key];
        callbackArray = (callbackArray ? callbackArray : []);
        callbackArray.push(callback);
        this.commonCallbacks[key] = callbackArray;

        var ckey = rkey();
        while(this.quickRegs[ckey]){ckey = rkey();}
        this.quickRegs[ckey] = {key:key, callback:callback};
        return ckey;
    },
    unregMsg:function(ckey) {
        var reg = this.quickRegs[ckey];
        if (!reg) {
            return;
        }
        var callbackArray = this.commonCallbacks[reg.key];
        if (!callbackArray) {
            return;
        }
        for (var i = 0; i < callbackArray.length; ++i) {
            if (reg.callback === callbackArray[i]) {
                callbackArray.splice(i, 1);
                break;
            }
        }
        delete this.quickRegs[ckey];
    },
    registerMessages:function() {
        this.regMsg("MsgBox", "message", (data) => {});
        this.regMsg("Chat", "msg", (data) => {});
        this.regMsg("Role", "kick", (data) => { this.quit(); safe(this.events["break"])(); });
        this.regMsg("UnionRace", "notify", (data) => {});
        this.regMsg("UnionWar", "kill", (data) => {});
        this.regMsg("UnionWar", "sync", (data) => {});
        this.regMsg("UnionWar", "occupy", (data) => {});
        this.regMsg("UnionWar", "leave", (data) => {});
    },
});

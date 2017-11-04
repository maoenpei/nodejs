
require("../Base");
require("../FileManager");
require("./Protocol");

var secOfDay = 24 * 3600;
Base.extends("GameValidator", {
    _constructor: function() {
        this.setDay = {}; // day of a week
        this.setHour = {}; // hour of a day
    },
    checkDaily:function(name) {
        var currTime = new Date();
        var compareTime = new Date();
        compareTime.setHours(0, 0, 0, 0);
        var timeDiff = (currTime.getTime() - compareTime.getTime()) / 1000;
        if (timeDiff < 10 || timeDiff + 10 > secOfDay) {
            return false;
        }
        var lastDay = (this.setDay[name] ? this.setDay[name] : -1);
        var currDay = currTime.getDay();
        if (lastDay == currDay) {
            return false;
        }
        this.setDay[name] = currDay;
        return true;
    },
    resetDaily:function() {
        this.setDay = {};
    },
    checkHourly:function(name) {
        var lastHour = (this.setHour[name] ? this.setHour[name] : -1);
        var currHour = new Date().getHours();
        if (lastHour == currHour) {
            return false;
        }
        this.setHour[name] = currHour;
        return true;
    },
    resetHourly:function() {
        this.setHour = {};
    },
});

var cachedServers = null;
Base.extends("GameConnection", {
    _constructor:function(username, password, validator) {
        this.username = username;
        this.password = password;
        this.validator = validator;
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
    getUsername:function() {
        return this.username;
    },
    getValidator:function() {
        return this.validator;
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
    },
    loginAccount:function(done) {
        var next = coroutine(function*() {
            // login request
            var obj = yield GameHTTP.login(this.username, this.password, next);
            if (!obj || obj.code != 'SUCCESS') {
                return safe(done)({});
            }
            console.log("Login success with account {0}".format(this.username));
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

            return safe(done)({
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
            //yield $FileManager.saveFile("/../20170925_yongzhe_hack/recvdata.json", JSON.stringify(data), next);
            if (!data || !data.uid) {
                this.quit();
                return safe(done)({});
            }
            this.gameInfo = {
                playerId : data.uid,
                name : data.role_name,
                level : data.level,
                gold : data.coin, // golden coin
                colorDiamond : data.gold, // color diamond
                whiteDiamond : data.ticket, // white diamond
                power: data.cpi,
                leagueMedal: data.league_medal,
                crystal: data.crystal, // Kingwar crystal
                arenaPoint: (data.arena_point ? data.arena_point : 0),
                arenaGlory: (data.arena_glory ? data.arena_glory : 0),
                unionWarDouble: (data.union_war_double ? data.union_war_double : 0),
                vip: data.vip,

                hasRedPacket: !!(data.act_redpacket && data.act_redpacket > 0),
            };
            var result = yield GameHTTP.stat(this.gameInfo.playerId, "reg", next);
            if (result != 'done') {
                console.log("stat failed playerId:{0} error:{1}".format(this.gameInfo.playerId, JSON.stringify(result)));
            }
            console.log("Player id:{0}, name:{1}".format(this.gameInfo.playerId, this.gameInfo.name));
            //var obj = yield GameHTTP.save(this.accountInfo.accountId, this.gameInfo.playerId, server.serverId, this.accountInfo.accessToken, next);
            //if (obj.code != 'SUCCESS') {
            //    console.log("save failed accountId:{0} code:{1} reason:{2}".format(this.accountInfo.playerId, obj.code, obj.desc));
            //}
            var result = yield GameHTTP.loginServer(this.accountInfo.accountId, server.serverId, next);
            if (result != 'ok') {
                console.log("loginServer failed accountId:{0} result:{1}".format(this.accountInfo.accountId, JSON.stringify(result)));
            }

            return safe(done)({
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
            return safe(done)();
        }, this);
    },
    getRankPlayers:function() {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("KingWar", "roleRank", null, next);
            if (!data || !data.list) {
                return safe(done)({});
            }
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
            return safe(done)({
                players: players,
            });
        }, this);
    },
    getUnion:function(done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("Union", "getinfo", null, next);
            if (!data || !data.id) {
                return safe(done)({});
            }
            return safe(done)({
                unionId : data.id,
                ownerId : data.owner,
            });
        }, this);
    },
    getUnionList:function(done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("Union", "getRankList", null, next);
            if (!data || !data.list) {
                return safe(done)({});
            }
            var unions = [];
            for (var i = 0; i < data.list.length; ++i) {
                var item = data.list[i];
                unions.push({
                    unionId: item.id,
                    name: item.name,
                    short: item.short_name,
                });
            }
            return safe(done)({
                unions: unions,
            });
        }, this);
    },
    getUnionPlayers:function(unionId, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("Union", "view", {unionid:unionId}, next);
            if (!data || !data.members) {
                return safe(done)({});
            }

            var players = [];
            for (var i = 0; i < data.members.length; ++i) {
                var item = data.members[i];
                players.push({
                    playerId: item.uid,
                    name: item.role_name,
                    power: item.cpi,
                    level: item.level,
                    lastLogin: new Date(item.time * 1000),
                });
            }

            return safe(done)({
                players: players,
            });
        }, this);
    },

    getUnionWar:function(done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("UnionWar", "getinfo", null, next);
            if (!data || !data.held) {
                return safe(done)({});
            }
            var isOpen = Number(data.open) == 1;
            return safe(done)({
                isOpen: isOpen,
            });
        }, this);
    },
    getUnionRelation:function(done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("UnionWar", "getinfo", null, next);
            if (!data || !data.relation) {
                return safe(done)({});
            }
            var unions = [];
            for (var i = 0; i < data.relation.length; ++i) {
                var item = data.relation[i];
                unions.push({
                    unionId: item.id,
                    name: item.name,
                    onBoard: true,
                    takeEffect: item.alive == 1,
                    isEnemy: item.pos <= 3,
                });
            }
            var data = yield this.sendMsg("UnionWar", "select", {type:1}, next);
            if (!data || !data.list) {
                return safe(done)({});
            }
            for (var i = 0; i < data.list.length; ++i) {
                var item = data.list[i];
                unions.push({
                    unionId: item.id,
                    name: item.name,
                    onBoard: false,
                    takeEffect: false,
                    isEnemy: true,
                });
            }
            var data = yield this.sendMsg("UnionWar", "select", {type:2}, next);
            if (!data || !data.list) {
                return safe(done)({
                    unions: unions,
                });
            }
            for (var i = 0; i < data.list.length; ++i) {
                var item = data.list[i];
                unions.push({
                    unionId: item.id,
                    name: item.name,
                    onBoard: false,
                    takeEffect: false,
                    isEnemy: false,
                });
            }
            return safe(done)({
                unions: unions,
            });
        }, this);
    },
    enterUnionWar:function(landId, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("UnionWar", "enter", null, next);
            if (!data || !data.list) {
                return safe(done)({});
            }
            var data = yield this.sendMsg("UnionWar", "enterland", {id:landId}, next);
            if (!data || !data.gems) {
                return safe(done)({});
            }
            var mineArray = [];
            for (var i = 0; i < data.gems.length; ++i) {
                var gem = data.gems[i];
                mineArray.push({
                    pos: gem.pos,
                    playerId: gem.owner,
                    unionId: gem.union_id,
                    life: gem.hp,
                    mineLife: gem.gem,
                });
            }
            return safe(done)({
                card: {
                    ready: Number(data.card_used) == 0,
                    type: data.card_id,
                    isgood: data.card_id <= 4,
                },
                mineArray: mineArray,
                hasSpeed: (data.speed == 0 ? false : true),
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
            return safe(done)({
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
            return safe(done)({
                success: true,
                playerId: data.owner,
                unionId: data.union_id,
            });
        }, this);
    },
    fire:function(landId, pos, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("UnionWar", "fire", { id:landId, pos:pos }, next);
            if (!data) {
                return safe(done)({});
            }
            return safe(done)({
                success: true,
            });
        }, this);
    },
    useCard:function(unionId, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("UnionWar", "usecard", {id:unionId}, next);
            if (!data) {
                return safe(done)({});
            }
            return safe(done)({
                success:true,
            });
        }, this);
    },
    buySpeed:function(num, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("UnionWar", "buyspeed", {num: num}, next);
            if (!data) {
                return safe(done)({});
            }
            return safe(done)({
                success:true,
            });
        }, this);
    },
    setSpeed:function(enabled, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("UnionWar", "speed", {type: (enabled ? 1 : 0)}, next);
            if (!data) {
                return safe(done)({});
            }
            return safe(done)({
                success:true,
            });
        }, this);
    },

    getKingWar:function(done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("KingWar", "getinfo", null, next);
            if (!data) {
                return safe(done)({});
            }
            return safe(done)({
                allowJoin: data.state == 1,
                joined: data.check != 0,
                inlist: data.check == 1,
            });
        }, this);
    },
    getArea:function(areaId, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("KingWar", "getAreaInfo", null, next);
            if (!data || !data.lands) {
                return safe(done)({});
            }
            var starNumbers = [];
            for (var i = 0; i < data.lands.length; ++i) {
                starNumbers.push(data[i].num);
            }
            return safe(done)({
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
            return safe(done)({
                success: true,
            });
        }, this);
    },
    getKingWarPlayers:function(done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("KingWar", "getLandInfo", null, next);
            if (!data || !data.list) {
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
            return safe(done)({
                areaId:data.areaid,
                starId:data.star,
                players: players,
            });
        }, this);
    },
    getRace:function(done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("KingWar", "getRaceInfo", null, next);
            if (!data || !data.list) {
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
            return safe(done)({
                players: players,
            });
        }, this);
    },

    getMaze:function(done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("Maze", "getinfo", null, next);
            if (!data || !data.type) {
                return safe(done)({});
            }
            return safe(done)({
                mazeId: data.type,
                searchs: [
                    data.search_num_1,
                    data.search_num_2,
                    data.search_num_3,
                ],
            });
        }, this);
    },
    changeMaze:function(mazeId, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("Maze", "change", {type:mazeId}, next);
            if (!data || data.type != mazeId) {
                return safe(done)({});
            }
            return safe(done)({
                success:true,
            });
        }, this);
    },
    mazeSearch:function(count, done) {
        var next = coroutine(function*() {
            for (var i = 0; i < count; ++i) {
                var data = yield this.sendMsg("Maze", "search", null, next);
            }
            return safe(done)({
                success:true,
            });
        }, this);
    },

    getLadder:function(done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("Ladder", "getinfo", null, next);
            if (!data || !data.members) {
                return safe(done)({});
            }
            var cards = [];
            for (var i = 0; i < data.cards.length; ++i) {
                var card = data.cards[i];
                cards.push({
                    isGood: card == 4,
                    cardType: card,
                });
            }
            var members = [];
            for (var i = 0; i < data.members.length; ++i) {
                var member = data.members[i];
                members.push({
                    isPlayer: member.pc != 1,
                    good: member.good,
                    bad: member.bad,
                    playerId: member.id,
                    power: member.cpi,
                });
            }
            return safe(done)({
                rank: data.rank,
                reward: data.reward == 0,
                cards: cards,
                members: members,
            });
        }, this);
    },
    useLadderCard:function(playerId, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("Ladder", "card", {id:playerId, evid:0}, next);
            if (!data || data.playerid != playerId) {
                return safe(done)({});
            }
            return safe(done)({
                success: true,
            });
        }, this);
    },
    fightLadder:function(playerId, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("Ladder", "fight", {id:playerId}, next);
            if (!data || data.id != playerId) {
                return safe(done)({});
            }
            return safe(done)({
                success: true,
            });
        }, this);
    },

    autoBenefit:function(config, done) {
        var next = coroutine(function*() {
            // auto sign
            if (this.validator.checkDaily("autoSign")) {
                var data = yield this.sendMsg("Sign", "getinfo", null, next);
                if (data && data.list) {
                    var signed = !!(data.list[String(data.count)]);
                    if (!signed) {
                        var data = yield this.sendMsg("Sign", "start", {point:0}, next);
                    }
                }
            }
            // auto vip
            if (this.validator.checkDaily("autoVipReward")) {
                var data = yield this.sendMsg("Vip", "getinfo", null, next);
                if (data && data.cards) {
                    for (var i = 0; i < data.cards.length; ++i) {
                        var card = data.cards[i];
                        if (card.expire > 0 && card.daily == 1) {
                            var data_gift = yield this.sendMsg("Vip", "dailyGift", {id:card.id}, next);
                        }
                    }
                }
            }
            // auto friend reward
            if (this.validator.checkHourly("autoFriendReward")) {
                var data = yield this.sendMsg("Friend", "getinfo", null, next);
                if (data && data.friend) {
                    var friends = {};
                    for (var i = 0; i < data.friend.length; ++i) {
                        var playerId = data.friend[i].uid;
                        friends[playerId] = true;
                    }
                    for (var i = 0; i < data.bless_out.length; ++i) {
                        var playerId = data.bless_out[i];
                        delete friends[playerId];
                    }
                    for (var playerId in friends) {
                        var data_bless = yield this.sendMsg("Friend", "bless", {uid:playerId, type:1}, next);
                    }
                    for (var i = 0; i < data.bless_in.length; ++i) {
                        var playerData = data.bless_in[i];
                        var data_bless = yield this.sendMsg("Friend", "bless", {uid:playerData.uid, type:2}, next);
                    }
                }
            }
            // auto email
            if (this.validator.checkHourly("autoEmail")) {
                var data = yield this.sendMsg("RoleEmail", "getlist", null, next);
                if (data && data.list) {
                    for (var i = 0; i < data.list.length; ++i) {
                        var email = data.list[i];
                        if (email.state == 0) {
                            var data_read = yield this.sendMsg("RoleEmail", "read", {id: email.id}, next);
                        }
                        if (email.attachment && email.state != 2) {
                            var data_fetch = yield this.sendMsg("RoleEmail", "fetch", {id: email.id}, next);
                        }
                    }
                }
            }
            return safe(done)({
                success:true,
            });
        }, this);
    },
    autoForward:function(config, done) {
        var next = coroutine(function*() {
            if (!this.validator.nextLevel || this.validator.nextLevel <= this.gameInfo.level) {
                var data = yield this.sendMsg("RoleExplore", "getinfo", null, next);
                if (!data || !data.current) {
                    return safe(done)({});
                }
                var openid = data.openid;
                var events = (data.current.events ? data.current.events : {});
                for (var i = 1; i <= 3; ++i) {
                    if (events[i] != 1) {
                        var data_event = yield this.sendMsg("RoleExplore", "event", {index:i}, next);
                        if (!data_event || !data_event.events || data_event.events[i] != 1) {
                            // May have fight failed.
                            return safe(done)({});
                        }
                        if (data_event.openid != 0){
                            openid = data_event.openid;
                        }
                    }
                }
                if (openid > data.id) {
                    var data_start = yield this.sendMsg("RoleExplore", "start", {id:openid}, next);
                    if (!data_start) {
                        this.validator.nextLevel = this.gameInfo.level + 1;
                    }
                }
            }
            return safe(done)({
                success:true,
            });
        }, this);
    },
    autoMaze:function(config, done) {
        var next = coroutine(function*() {
            if (this.validator.checkHourly("autoMaze")) {
                var data = yield this.sendMsg("Maze", "getinfo", null, next);
                if (!data || !data.type) {
                    return safe(done)({});
                }
                var searched = {};
                searched[1] = data.search_num_1;
                searched[2] = data.search_num_2;
                searched[3] = data.search_num_3;
                for (var i = 1; i <= 3; ++i) {
                    var data_change = yield this.sendMsg("Maze", "change", {type:i}, next);
                    if (!data_change) {
                        return safe(done)({});
                    }
                    for (var j = searched[i]; j < config.searchNumber; ++j) {
                        var data_search = yield this.sendMsg("Maze", "search", null, next);
                        if (!data_search) {
                            return safe(done)({});
                        }
                    }
                }
            }
            return safe(done)({
                success:true,
            });
        }, this);
    },
    autoFriendWar:function(config, done) {
        var next = coroutine(function*() {
            if (this.validator.checkHourly("autoFriendWar")) {
                var data = yield this.sendMsg("FriendWar", "getinfo", null, next);
                if (!data || !data.list) {
                    return safe(done)({});
                }
                var current = data.inspire;
                for (var i = current; i < config.baseInspire; ++i) {
                    var data_inspire = yield this.sendMsg("FriendWar", "inspire", null, next);
                }
                var winNumber = data.win_num;
                for (var i = data.fight_num; i < 7; ++i) {
                    for (var j = 0; j < 6; ++j) {
                        var dead = data.list[j].died == 1;
                        if (!dead) {
                            var data_fight = yield this.sendMsg("FriendWar", "fight", {index:j, auto:0}, next);
                            if (data_fight && data_fight.succ == 1) {
                                data.list[j].died = 1;
                                winNumber++;
                                break;
                            } else {
                                for (var k = 0; k < config.advanceInspire; ++k) {
                                    var data_inspire = yield this.sendMsg("FriendWar", "inspire", null, next);
                                }
                                break;
                            }
                        }
                    }
                }
                var neededWin = [1, 3, 6];
                for (var i = 1; i <= 3; ++i) {
                    if (data.reward[i] != 1 && winNumber >= neededWin[i-1]) {
                        var data_reward = yield this.sendMsg("FriendWar", "reward", {id:i}, next);
                    }
                }
            }
            return safe(done)({
                success: true,
            });
        }, this);
    },
    autoLadder:function(config, done) {
        var next = coroutine(function*() {
            if (this.validator.checkHourly("autoLadder")) {
                var data = yield this.sendMsg("Ladder", "getinfo", null, next);
                if (!data || !data.members) {
                    return safe(done)({});
                }
                // auto reward
                if (data.reward == 0 && data.last_rank != 0) {
                    var data_reward = yield this.sendMsg("Ladder", "reward", null, next);
                }
                // auto events
                for (var i = 0; i < data.events.length; ++i) {
                    var event = data.events[i];
                    if (event.cardid == 1) {
                        if (event.done == 0) {
                            var data_res = yield this.sendMsg("Ladder", "getEventRes", {id:event.id}, next);
                        }
                        var data_res = yield this.sendMsg("Ladder", "delEvent", {id:event.id}, next);
                    }
                }
                // auto use cards
                if (config.useCard && data.cards.length > 0) {
                    for (var i = 0; i < data.cards.length; ++i) {
                        var card = data.cards[i];
                        var used = false;
                        for (var j = 0; j < data.members.length; ++j) {
                            var member = data.members[j];
                            if (member.id == this.gameInfo.playerId) {
                                continue;
                            }
                            var data_card = null;
                            if (member.pc != 1 && card == 1) {
                                data_card = yield this.sendMsg("Ladder", "card", {id:member.id, evid:0}, next);
                            } else if (member.pc != 1 && member.good < 3 && card == 4) {
                                data_card = yield this.sendMsg("Ladder", "card", {id:member.id, evid:0}, next);
                            } else if (member.pc != 1 && member.bad > 0 && card == 6) {
                                data_card = yield this.sendMsg("Ladder", "card", {id:member.id, evid:0}, next);
                            } else if (member.pc == 1 && member.bad < 3 && (card == 2 || card == 3 || card == 5)) {
                                data_card = yield this.sendMsg("Ladder", "card", {id:member.id, evid:0}, next);
                            }
                            if (data_card) {
                                used = true;
                                break;
                            }
                        }
                        if (!used) {
                            for (var j = data.members.length - 1; j >= 0; --j) {
                                var member = data.members[j];
                                if (member.id == this.gameInfo.playerId) {
                                    continue;
                                }
                                if ((member.good == 3 && card == 4) || (member.bad == 3 && (card == 2 || card == 3))) {
                                    continue;
                                }
                                var data_card = yield this.sendMsg("Ladder", "card", {id:member.id, evid:0}, next);
                                if (data_card) {
                                    break;
                                }
                            }
                        }
                    }
                }
                // auto fight
                var canFight = true;
                if (data.cd != 0) {
                    canFight = ((data.cd * 1000 - new Date().getTime()) / 1000 / 60) <= 29;
                }
                if (canFight) {
                    for (var i = 0; i < data.members.length; ++i) {
                        var member = data.members[i];
                        if (member.id == this.gameInfo.playerId) {
                            break;
                        }
                        if (member.pc == 1 || (config.fightPlayer && member.cpi < this.gameInfo.power)) {
                            var data_fight = yield this.sendMsg("Ladder", "fight", {id:member.id}, next);
                            break;
                        }
                    }
                }
            }
            return safe(done)({
                success: true,
            });
        }, this);
    },
    autoLeague:function(config, done) {
        var next = coroutine(function*() {
            if (this.validator.checkHourly("autoLeague")) {
                var data = yield this.sendMsg("League", "getinfo", null, next);
                if (!data || !data.info) {
                    return safe(done)({});
                }
                // auto pray
                var prayLimit = (config.prayNumber > 23 ? 23 : config.prayNumber);
                var allMedal = this.gameInfo.leagueMedal;
                var prayMax = 3;
                var prayCost = 50;
                while (prayMax < prayLimit && prayCost <= allMedal) {
                    allMedal -= prayCost;
                    prayMax++;
                    if (prayCost < 1600) {
                        prayCost *= 2;
                    }
                }
                prayLimit = (prayLimit < prayMax ? prayLimit : prayMax);
                prayLimit = 3 - prayLimit;
                if (data.pray_num > prayLimit) {
                    for (var i = data.pray_num; i > prayLimit; --i) {
                        var data_pray = yield this.sendMsg("League", "pray", null, next);
                        if (!data_pray) {
                            break;
                        }
                    }
                }
                // auto city reward
                var data_city = yield this.sendMsg("League", "getCityInfo", null, next);
                if (!data_city) {
                    return safe(done)({});
                }
                if (data_city.award_1 == 1 && data_city.get_1 != 1) {
                    var data_award = yield this.sendMsg("League", "cityAward", {h:1}, next);
                }
                if (data_city.award_2 == 1 && data_city.get_2 != 1) {
                    var data_award = yield this.sendMsg("League", "cityAward", {h:2}, next);
                }
                // auto boss
                if (data.boss_id <= data.boss_max) {
                    for (var boss_id = data.boss_id; boss_id <= data.boss_max; ++boss_id) {
                        var data_boss = yield this.sendMsg("League", "boss", null, next);
                        if (!data_boss || data_boss.succ != 1) {
                            console.log("boss failed", data_boss);
                            break;
                        }
                    }
                }
                if (this.validator.checkDaily("autoLeague")) {
                    // auto donate
                    var alreadyNum = 10 - data.donate_role_max / 1000000;
                    var donateNum = (data.donate_role_max < data.donate_max ? data.donate_role_max : data.donate_max) / 1000000;
                    donateNum = (donateNum < (config.donateMax - alreadyNum) ? donateNum : (config.donateMax - alreadyNum));
                    if (donateNum > 0) {
                        var data_goddess = yield this.sendMsg("League", "getGoddess", null, next);
                        if (!data_goddess || !data_goddess.list) {
                            return safe(done)({});
                        }
                        var goddessData = {};
                        for (var i in data_goddess.list) {
                            var goddess = data_goddess.list[i];
                            goddessData[goddess.id] = goddess;
                        }
                        var donateOrder = [1, 4, 2, 5, 6, 3];
                        for (var i = 0; i < donateOrder.length; ++i) {
                            var id = donateOrder[i];
                            var goddess = goddessData[id];
                            if (goddess.level < 120) {
                                if (donateNum == 10) {
                                    var data_donate = yield this.sendMsg("League", "donate", {id:id, type:2}, next);
                                } else {
                                    for (var j = 0; j < donateNum; ++j) {
                                        var data_donate = yield this.sendMsg("League", "donate", {id:id, type:1}, next);
                                    }
                                }
                                break;
                            }
                        }
                    }
                    // auto gift
                    if (data.is_gift == 0) {
                        var data_gift = yield this.sendMsg("League", "gift", null, next);
                    }
                    // auto golory
                    var data_glory = yield this.sendMsg("League", "gloryDaily", null, next);
                    // auto war
                    if (this.gameInfo.vip >= 3) {
                        var data_war = yield this.sendMsg("League", "getAutoInfo", null, next);
                        if (!data_war) {
                            return safe(done)({});
                        }
                        if (data_war.auto_num > 0) {
                            var data_reward = yield this.sendMsg("League", "getAutoWarReward", null, next);
                        }
                        var payMax = (config.warPay > 20 ? 20 : config.warPay);
                        var warPay = (data_war.paynum ? data_war.paynum : 0);
                        if (payMax > 0 && (warPay < payMax)) {
                            for (var i = warPay; i < payMax; ++i) {
                                var data_addpay = yield this.sendMsg("League", "addpay", null, next);
                            }
                        }
                        if (config.autoWar && data_war.auto == 0) {
                            var data_start = yield this.sendMsg("League", "startAutoWar", null, next);
                        }
                    }
                }
            }
            return safe(done)({
                success: true,
            });
        }, this);
    },
    autoUnion:function(config, done) {
        var next = coroutine(function*() {
            if (this.validator.checkHourly("autoUnion")) {
                var data = yield this.sendMsg("Union", "getinfo", null, next);
                if (!data || !data.lands) {
                    return safe(done)({});
                }
                if (this.validator.checkDaily("autoUnion")) {
                    // auto thumb
                    var data_like = yield this.sendMsg("Union", "like", { unionid: data.id }, next);
                    var data_like = yield this.sendMsg("UnionWar", "agree", null, next);
                    var data_like = yield this.sendMsg("UnionRace", "agree", null, next);
                    // auto donate
                    var data_home = yield this.sendMsg("Union", "home", null, next);
                    if (!data_home || !data_home.shop) {
                        return safe(done)({});
                    }
                    var alreadyNum = 10 - data_home.my_max / 1000000;
                    var donateNum = (data_home.my_max < data_home.total_max ? data_home.my_max : data_home.total_max) / 1000000;
                    donateNum = (donateNum < (config.donateMax - alreadyNum) ? donateNum : (config.donateMax - alreadyNum));
                    if (donateNum > 0) {
                        if (donateNum == 10) {
                            var data_donate = yield this.sendMsg("Union", "donate", {type:2}, next);
                        } else {
                            for (var i = 0; i < donateNum; ++i) {
                                var data_donate = yield this.sendMsg("Union", "donate", {type:1}, next);
                            }
                        }
                    }
                }

                // auto race reward
                var data_rewardlist = yield this.sendMsg("UnionRace", "getrewardlist", null, next);
                if (!data_rewardlist || !data_rewardlist.list) {
                    return safe(done)({});
                }
                for (var i = 0; i < data_rewardlist.list.length; ++i) {
                    var reward = data_rewardlist.list[i];
                    if (reward.state == 1) {
                        var data_reward = yield this.sendMsg("UnionRace", "reward", {id:reward.id}, next);
                    }
                }
                // auto reward
                for (var landId in data.lands) {
                    if (data.lands[landId] == 1) {
                        var data_reward = yield this.sendMsg("UnionWar", "reward", { id: landId }, next);
                    }
                }
            }
            return safe(done)({
                success: true,
            });
        }, this);
    },
    autoArena:function(config, done) {
        var next = coroutine(function*() {
            if (this.validator.checkHourly("autoArena")) {
                var data = yield this.sendMsg("Arena", "getinfo", null, next);
                if (!data || !data.list) {
                    return safe(done)({});
                }
                // auto reward
                if (data.reward.done == 0 && data.reward.rank > 0) {
                    var data_reward = yield this.sendMsg("Arena", "reward", null, next);
                }
                // auto box
                var boxMax = (config.boxMax > 26 ? 26 : config.boxMax);
                var restArenaPoint = this.gameInfo.arenaPoint;
                var boxNum = boxMax;
                if (restArenaPoint < 1400) {
                    boxNum = 0;
                } else if (restArenaPoint < 4600) {
                    boxNum = 3;
                } else if (restArenaPoint <= 30200) {
                    var blockNum = Math.floor((restArenaPoint - 4600) / 6400);
                    boxNum = 6 + blockNum * 5;
                }
                boxNum = (boxNum > boxMax ? boxMax : boxNum);
                for (var i = data.box_num; i < boxNum; ++i) {
                    var data_box = yield this.sendMsg("Arena", "box", null, next);
                    if (!data_box) {
                        console.log("box failed", boxMax, boxNum, restArenaPoint);
                        break;
                    }
                }
                // auto buy
                if (config.buyHeroSoul && this.gameInfo.arenaGlory > 120) {
                    var data_shop = yield this.sendMsg("Arena", "shop", null, next);
                    if (!data_shop || !data_shop.list) {
                        return safe(done)({});
                    }
                    var buyNum = Math.floor(this.gameInfo.arenaGlory / 120);
                    var item_id = null;
                    for (var i = 0; i < data_shop.list.length; ++i) {
                        var item = data_shop.list[i];
                        if (item.res.indexOf("hero_soul") >= 0) {
                            item_id = item.id;
                            buyNum = (buyNum < item.max - item.num ? buyNum : item.max - item.num);
                            break;
                        }
                    }
                    if (item_id && buyNum > 0) {
                        for (var i = 0; i < buyNum; ++i) {
                            var data_exchange = yield this.sendMsg("Arena", "exchange", { id: item_id }, next);
                        }
                    }
                }
                // auto fight
                var fightMax = (config.fightMax > 20 ? 20 : config.fightMax);
                if (config.fightPlayer && data.fight_num < fightMax) {
                    var fightItem = data.list[data.list.length - 1];
                    if (fightItem.cpi > this.gameInfo.power) {
                        var data_refresh = yield this.sendMsg("Arena", "refresh", null, next);
                        fightItem = data_refresh.list[data_refresh.list.length - 1];
                        if (fightItem.cpi > this.gameInfo.power) {
                            fightItem = null;
                        }
                    }
                    if (fightItem) {
                        for (var i = data.fight_num; i < fightMax; ++i) {
                            var data_fight = yield this.sendMsg("Arena", "fight", { data: fightItem.uid }, next);
                            if (!data_fight) {
                                console.log("fight failed", data.list.length, fightItem);
                                break;
                            }
                        }
                    }
                }
                if (this.validator.checkDaily("autoArena")) {
                    // auto like
                    if (data.like == 0) {
                        var data_rank = yield this.sendMsg("Arena", "getrank", null, next);
                        if (data_rank && data_rank.list) {
                            var data_like = yield this.sendMsg("Arena", "like", { id:data_rank.list[0].uid }, next);
                        }
                    }
                    // auto achievement
                    var data_achievement = yield this.sendMsg("Arena", "achievement", null, next);
                    if (!data_achievement || !data_achievement.list) {
                        return safe(done)({});
                    }
                    for (var i = 0; i < data_achievement.list.length; ++i) {
                        var item = data_achievement.list[i];
                        if (item.state == 1) {
                            var data_res = yield this.sendMsg("Arena", "achievementres", { id: item.id }, next);
                        }
                    }
                }
            }
            return safe(done)({
                success: true,
            });
        }, this);
    },
    autoReward:function(config, done) {
        var next = coroutine(function*() {
            if (this.validator.checkDaily("autoReward")) {
                // auto collect card
                var data = yield this.sendMsg("ActCollectCard", "getinfo", null, next);
                if (data && data.list) {
                    var collectable = [];
                    collectable.push(data.show);
                    for (var i = 0; i < data.list.length; ++i) {
                        var item = data.list[i];
                        if (item.tips == 1 && item.id != data.show.id) {
                            var data_card = yield this.sendMsg("ActCollectCard", "card", { id:item.id }, next);
                            if (data_card) {
                                collectable.push(data_card);
                            }
                        }
                    }
                    for (var i = 0; i < collectable.length; ++i) {
                        var item = collectable[i];
                        if (item.daily == 0) {
                            var data_daily = yield this.sendMsg("ActCollectCard", "dailyGift", { id:item.id }, next);
                        }
                        for (var j = 1; j <= item.day; ++j) {
                            if (!item.list || !item.list[j]) {
                                var data_gift = yield this.sendMsg("ActCollectCard", "gift", { id:item.id, day: item.day - j }, next);
                            }
                        }
                    }
                }
                // auto kingwar
                var data = yield this.sendMsg("KingWar", "gift", null, next);
                if (data && data.daily) {
                    // auto daily
                    if (data.done == 0) {
                        var data_daily = yield this.sendMsg("KingWar", "dailyGift", null, next);
                    }
                    for (var i = 0; i < data.luckcard.length; ++i) {
                        var card = data.luckcard[i];
                        if (card.state == 1) {
                            var data_luckCard = yield this.sendMsg("KingWar", "luckCardGift", {id: card.id}, next);
                        }
                    }
                    // auto rank reward
                    for (var i = 1; i <= 3; ++i) {
                        var data_rank = yield this.sendMsg("KingWar", "areaRank", {areaid:i}, next);
                        if (data_rank.state == 1) {
                            var data_fetch = yield this.sendMsg("KingWar", "fetchAreaRes", {areaid:i}, next);
                        }
                    }
                    var data_emperor = yield this.sendMsg("KingWar", "emperorRank", null, next);
                    if (data_emperor.state == 1) {
                        var data_fetch = yield this.sendMsg("KingWar", "fetchEmperorRes", null, next);
                    }
                }
            }
            if (this.validator.checkHourly("autoReward")) {
                // auto neko
                var data = yield this.sendMsg("ActNeko", "getinfo", null, next);
                if (data && typeof(data.num) == "number") {
                    var nekoNum = (config.nekoMax > 10 ? 10 : config.nekoMax);
                    for (var i = data.num; i < nekoNum; ++i) {
                        var data_neko = yield this.sendMsg("ActNeko", "knock", null, next);
                    }
                }
                // auto active
                var data = yield this.sendMsg("ActActive", "getinfo", null, next);
                if (data && data.list) {
                    for (var i = 0; i < data.list.length; ++i) {
                        var item = data.list[i];
                        if (item.num == item.max) {
                            var data_reward = yield this.sendMsg("ActActive", "reward", { id:item.id }, next);
                        }
                    }
                }
                var data = yield this.sendMsg("ActActive", "getinfo", null, next);
                if (data && data.list) {
                    var rewarded = {};
                    for (var i = 20; i <= data.point; i += 20) {
                        var boxid = i / 20;
                        rewarded[boxid] = true;
                    }
                    for (var i = 0; i < data.box.length; ++i) {
                        var boxid = data.box[i];
                        if (rewarded[boxid]) {
                            delete rewarded[boxid];
                        }
                    }
                    for (var boxid in rewarded) {
                        var data_box = yield this.sendMsg("ActActive", "box", {id:boxid}, next);
                    }
                }
                // auto quest
                var hasQuest = true;
                while(hasQuest) {
                    hasQuest = false;
                    var data = yield this.sendMsg("Quest", "getinfo", null, next);
                    if (data && data.list) {
                        for (var id in data.list) {
                            var item = data.list[id];
                            if (item.state == 1) {
                                hasQuest = true;
                                var data_quest = yield this.sendMsg("Quest", "done", {id:id}, next);
                            }
                        }
                    }
                }
                // auto splendid
                var data = yield this.sendMsg("ActSplendid", "getinfo", null, next);
                if (data && data.list) {
                    for (var i = 0; i < data.list.length; ++i) {
                        var splendidItem = data.list[i];
                        for (var j = 0; j < splendidItem.box.length; ++j) {
                            var boxItem = splendidItem.box[j];
                            if (boxItem.num == boxItem.max && boxItem.done == 0) {
                                var data_reward = yield this.sendMsg("ActSplendid", "reward", { actid: splendidItem.id, boxid: boxItem.id }, next);
                            }
                        }
                    }
                }
                // auto meal
                var data = yield this.sendMsg("ActMeal", "getinfo", null, next);
                if (data && data.list) {
                    var rewards = {};
                    var hourNum = new Date().getHours();
                    if (hourNum >= 12 && hourNum <= 14) {
                        rewards[30001] = true;
                    }
                    if (hourNum >= 18 && hourNum <= 20) {
                        rewards[30002] = true;
                    }
                    if (hourNum >= 20 && hourNum <= 22) {
                        rewards[30003] = true;
                    }
                    if (data.online >= 1) {
                        rewards[30004] = true;
                    }
                    if (data.online >= 5) {
                        rewards[30005] = true;
                    }
                    if (data.online >= 30) {
                        rewards[30006] = true;
                    }
                    if (data.online >= 60) {
                        rewards[30007] = true;
                    }
                    if (data.online >= 120) {
                        rewards[30008] = true;
                    }
                    for (var id in rewards) {
                        if (data.list[id] != 1) {
                            var data_reward = yield this.sendMsg("ActMeal", "reward", { id:id }, next);
                        }
                    }
                }
            }
            return safe(done)({
                success: true,
            });
        }, this);
    },
    testProtocol:function(done) {
        var next = coroutine(function*() {
            console.log(new Date().getTime() / 1000);
            var data = null;
            //var data = yield this.sendMsg("Role", "version", null, next); // 登陆之前
            //var data = yield this.sendMsg("Role", "getUid", {userName:this.accountInfo.accountId}, next); // 登录之前
            //var data = yield this.sendMsg("Role", "getInfo", null, next); // 登录之后第一条消息，因为太大不发送
            //var data = yield this.sendMsg("Collect", "getinfo", null, next);
            //var data = yield this.sendMsg("Chat", "all", null, next); // 聊天信息
            //var data = yield this.sendMsg("Chat", "logs", null, next); // 聊天信息
            //var data = yield this.sendMsg("RoleExplore", "update", {type:'', login:1}, next); // 点击收集
            //var data = yield this.sendMsg("RoleExplore", "balance", null, next);
            //var data = yield this.sendMsg("ActLevelGift", "getinfo", null, next); // 新手等级奖励
            //var data = yield this.sendMsg("ActGoldenHero", "getinfo", null, next); // 金币魔女
            //var data = yield this.sendMsg("ActCatchup", "info", null, next); // 后来居上
            //var data = yield this.sendMsg("ActRank", "getinfo", null, next); // 排名
            //var data = yield this.sendMsg("League", "getPosList", null, next); // 国家玩家列表
            //var data = yield this.sendMsg("KingWar", "getAreaRes", null, next); // 帝国战获取奖励列表
            //var data = yield this.sendMsg("UnionRace", "getinfo", null, next); // 比武大会
            //var data = yield this.sendMsg("Role", "quick", null, next); // 活跃日历

            //var data = yield this.sendMsg("UnionWar", "cardlog", null, next); // 查看卡牌列表
            //var data = yield this.sendMsg("UnionWar", "ahead", null, next); // 查看名次信息
            //var data = yield this.sendMsg("UnionWar", "refreshCard", null, next); // 刷新可用卡牌
            //var data = yield this.sendMsg("ActGoblin", "getinfo", null, next);
            //var data = yield this.sendMsg("ActGoblin", "buy", {id:"2120004"}, next);
            //var data = yield this.sendMsg("ActGoblin", "refresh", null, next);
            //var data = yield this.sendMsg("League", "getWarInfo", null, next); // 国战信息

            console.log(data);
            yield $FileManager.saveFile("/../20170925_yongzhe_hack/recvdata.json", JSON.stringify(data), next);
            return safe(done)();
        }, this);
    },

    // private
    sendNotify:function(c, m, data, callback) {
        if (!this.sock) {
            return later(callback, null);
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
            return later(callback, null);
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
        this.regMsg("Role", "kick", (data) => {
            console.log("User Kicked!", (this.gameInfo ? this.gameInfo.name : this.username));
            this.quit();
            safe(this.events["break"])();
        });
        this.regMsg("UnionRace", "notify", (data) => {});
        this.regMsg("UnionWar", "kill", (data) => {});
        this.regMsg("UnionWar", "sync", (data) => {});
        this.regMsg("UnionWar", "occupy", (data) => {});
        this.regMsg("UnionWar", "leave", (data) => {});
        this.regMsg("League", "warClose", (data) => {}); // notification
        this.regMsg("Combat", "complete", (data) => {}); // show combat
        this.regMsg("RoleExplore", "update", (data) => {}); // notification
    },
});

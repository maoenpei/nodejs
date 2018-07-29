
require("../Base");
require("../FileManager");
require("../Mutex");
require("./Database");
require("./Protocol");

var secOfDay = 24 * 3600;
Base.extends("GameValidator", {
    _constructor: function() {
        this.setDay = {}; // day of a week
        this.setHour = {}; // hour of a day
        this.conn = null;
    },
    setConnect:function(conn) {
        this.conn = conn;
    },
    getDailyState:function(currDay) {
        var dailyNames = [];
        for (var name in this.setDay) {
            if (this.setDay[name] == currDay) {
                dailyNames.push(name);
            }
        }
        return dailyNames;
    },
    setDailyState:function(currDay, dailyNames) {
        for (var i = 0; i < dailyNames.length; ++i) {
            var name = dailyNames[i];
            if (typeof(this.setDay[name]) == "undefined") {
                this.setDay[name] = currDay;
            }
        }
    },
    checkDaily:function(name) {
        var currDay = this.peekDaily(name);
        if (!currDay) {
            return false;
        }
        if (this.conn) {
            var now = new Date();
            this.conn.log("-- checkDaily --", name, currDay, this.setDay[name], "{0}:{1}".format(now.getHours(), now.getMinutes()));
        }
        this.commitDaily(name, currDay);
        return true;
    },
    peekDaily:function(name) {
        var currDay = new Date().getDay();
        var lastDay = this.setDay[name];
        lastDay = (typeof(lastDay) != "undefined" ? lastDay : -1);
        return (lastDay == currDay ? null : {
            day: currDay,
        });
    },
    commitDaily:function(name, day) {
        if (day) {
            this.setDay[name] = day.day;
        }
    },
    resetDaily:function() {
        this.setDay = {};
    },
    checkHourly:function(name) {
        var lastHour = this.setHour[name];
        lastHour = (typeof(lastHour) != "undefined" ? lastHour : -1);
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

Base.extends("HeroInfo", {
    _constructor:function(conn) {
        this.conn = conn;
        this.heroData = null;
    },
    updateData:function(heroData) {
        if (heroData) {
            if (this.heroData) {
                heroData.stoneLevel = this.heroData.stoneLevel;
                heroData.stoneSkill = this.heroData.stoneSkill;
            }
            this.heroData = heroData;
        } else {
            this.heroData = null;
        }
    },
    updateWake:function(level, skill) {
        if (this.heroData) {
            this.heroData.stoneLevel = level || this.heroData.stoneLevel || 0;
            this.heroData.stoneSkill = skill || this.heroData.stoneSkill || 0;
        }
    },
    isOnline:function() {
        return !!this.heroData;
    },
    getPid:function() {
        return this.heroData && this.heroData.pid;
    },
    getHeroId:function() {
        return this.heroData && this.heroData.heroId;
    },
    getColor:function() {
        return this.heroData && this.heroData.color;
    },
    getName:function() {
        return this.heroData && this.heroData.name;
    },
    getPos:function() {
        return this.heroData && this.heroData.pos;
    },
    getUpgrade:function() {
        return this.heroData && this.heroData.upgrade;
    },
    getFood:function() {
        return this.heroData && this.heroData.food;
    },
    getStoneLevel:function() {
        return this.heroData && this.heroData.stoneLevel;
    },
    getSkillLevel:function() {
        return this.heroData && this.heroData.stoneSkill;
    },
    getStoneBase:function() {
        return this.heroData && this.heroData.color * 5;
    },
    getGemWake:function() {
        return this.heroData && this.heroData.gemWake;
    },
    getGemLevel:function() {
        return this.heroData && this.heroData.gemLevel;
    },

    renew:function(done) {
        var next = coroutine(function*() {
            if (!this.heroData) {
                return safe(done)({});
            }
            this.log("Recreating");
            var heroId = this.heroData.heroId;
            var data = yield this.conn.dismissHero(this.heroData.pid, next);
            if (!data.success) {
                return safe(done)({});
            }
            var data = yield this.conn.useHeroCard(heroId, next);
            if (!data.success) {
                return safe(done)({});
            }
            safe(done)({
                success: true,
            });
        }, this);
    },
    setPos:function(pos, done) {
        var next = coroutine(function*() {
            if (!this.heroData) {
                return safe(done)({});
            }
            this.log("Positioning", pos);
            var targetPos = pos;
            var targetPid = this.heroData.pid;
            if (!pos) {
                targetPos = this.heroData.pos;
                targetPid = 0;
            }
            var data = yield this.conn.setHeroPos(targetPid, targetPos, next);
            if (!data.success) {
                return safe(done)({});
            }
            safe(done)({
                success: true,
            });
        }, this);
    },
    setUpgrade:function(level, done) {
        var next = coroutine(function*() {
            if (!this.heroData) {
                return safe(done)({});
            }
            var currLevel = this.heroData.upgrade;
            if (currLevel >= level) {
                return safe(done)({});
            }
            for (var i = currLevel; i < level; ++i) {
                this.log("Upgrading");
                var data = yield this.conn.upgradeHero(this.heroData.pid, next);
                if (!data.success) {
                    return safe(done)({});
                }
            }
            safe(done)({
                success: true,
            });
        }, this);
    },
    setFood:function(level, done) {
        var next = coroutine(function*() {
            if (!this.heroData) {
                return safe(done)({});
            }
            var currLevel = this.heroData.food;
            if (currLevel >= level) {
                return safe(done)({});
            }
            var totalExp = Database.levelExp(currLevel, level) - this.heroData.exp;

            yield this.conn.readAllItems(next);
            var foodNames = Database.allFoods();
            for (var i = 0; i < foodNames.length; ++i) {
                var foodName = foodNames[i];
                var count = this.conn.getItemCount(foodName);
                var foodExp = Database.foodExp(foodName, count);
                if (foodExp > 0) {
                    var eatCount = count;
                    if (totalExp < foodExp) {
                        eatCount = Math.ceil(totalExp / Database.foodExp(foodName, 1));
                    }
                    this.log("Eating", foodName, eatCount);
                    var data = yield this.conn.foodHero(this.heroData.pid, foodName, eatCount, next);
                    if (!data.success) {
                        return safe(done)({});
                    }
                    totalExp -= Database.foodExp(foodName, eatCount);
                    if (totalExp <= 0) {
                        break;
                    }
                }
            }
            if (totalExp > 0) {
                return safe(done)({});
            }
            safe(done)({
                success: true,
            });
        }, this);
    },
    setStoneLevel:function(level, done) {
        var next = coroutine(function*() {
            if (!this.heroData) {
                return safe(done)({});
            }
            var currLevel = this.heroData.stoneLevel;
            if (currLevel >= level) {
                return safe(done)({});
            }
            for (var i = currLevel; i < level; ++i) {
                this.log("Stone upgrading");
                var data = yield this.conn.autoWakeHero(this.heroData.pid, next);
                // ignore if data failed here
                var data = yield this.conn.upWakeHero(this.heroData.pid, next);
                if (!data.success) {
                    return safe(done)({});
                }
            }
            safe(done)({
                success: true,
            });
        }, this);
    },
    setSkillLevel:function(level, done) {
        var next = coroutine(function*() {
            if (!this.heroData) {
                return safe(done)({});
            }
            var currLevel = this.heroData.stoneSkill;
            if (currLevel >= level) {
                return safe(done)({});
            }
            for (var i = currLevel; i < level; ++i) {
                this.log("Skill upgrading");
                var data = yield this.conn.autoSkillHero(this.heroData.pid, next);
                // ignore if data failed here
                var data = yield this.conn.upSkillHero(this.heroData.pid, next);
                if (!data.success) {
                    return safe(done)({});
                }
            }
            safe(done)({
                success: true,
            });
        }, this);
    },
    setGemWake:function(level, done) {
        var next = coroutine(function*() {
            if (!this.heroData) {
                return safe(done)({});
            }
            var currLevel = this.heroData.gemWake;
            if (currLevel >= level) {
                return safe(done)({});
            }
            for (var i = currLevel; i < level; ++i) {
                this.log("Gem waking");
                var data = yield this.conn.wakeGemHero(this.heroData.pid, next);
                if (!data.success) {
                    return safe(done)({});
                }
            }
            safe(done)({
                success: true,
            });
        }, this);
    },
    setGemLevel:function(level, done) {
        var next = coroutine(function*() {
            if (!this.heroData) {
                return safe(done)({});
            }
            var currLevel = this.heroData.gemLevel;
            if (currLevel >= level) {
                return safe(done)({});
            }
            for (var i = currLevel; i < level; ++i) {
                this.log("Gem leveling");
                var data = yield this.conn.upGemHero(this.heroData.pid, next);
                if (!data.success) {
                    return safe(done)({});
                }
            }
            safe(done)({
                success: true,
            });
        }, this);
    },
    getFullUpgrade:function() {
        var cap = Database.heroCap(this.heroData.heroId);
        if (!cap) {
            return 0;
        }
        if (this.heroData.upgrade == cap.maxUpgrade) {
            return 0;
        }

        var heroCardId = "hero_" + String(this.heroData.heroId);
        var count = this.conn.getItemCount(heroCardId);
        var targetUpgrade = this.heroData.upgrade;
        var cardTotal = 0;
        do {
            var cardNeeded = Math.floor(targetUpgrade / 3) + 1;
            if (cardTotal + cardNeeded > count) {
                break;
            }
            cardTotal += cardNeeded;
            targetUpgrade ++;
        } while(targetUpgrade < cap.maxUpgrade);
        if (targetUpgrade == this.heroData.upgrade) {
            return 0;
        }
        return targetUpgrade;
    },
    fullUpgrade:function(done) {
        var next = coroutine(function*() {
            if (!this.heroData) {
                return safe(done)({});
            }

            yield this.conn.readAllItems(next);
            var targetUpgrade = this.getFullUpgrade();
            if (targetUpgrade == 0) {
                return safe(done)({});
            }

            this.setUpgrade(targetUpgrade, done);
        }, this);
    },
    isFoodFull:function() {
        return this.heroData ? (this.heroData.upgrade + 1) * 60 == this.heroData.food : true;
    },
    fullFood:function(done) {
        var next = coroutine(function*() {
            if (!this.heroData) {
                return safe(done)({});
            }
            var topLevel = (this.heroData.upgrade + 1) * 60;
            this.setFood(topLevel, done);
        }, this);
    },
    isStoneFull:function() {
        return this.heroData ? this.heroData.stoneLevel == this.heroData.color * 5 && this.heroData.stoneSkill == 9 : true;
    },
    fullStone:function(done) {
        var next = coroutine(function*() {
            if (!this.heroData) {
                return safe(done)({});
            }
            var topStoneLevel = this.heroData.color * 5;
            if (this.heroData.stoneLevel < topStoneLevel) {
                yield this.setStoneLevel(topStoneLevel, next);
            }
            var topSkillLevel = 9;
            if (this.heroData.stoneLevel == topStoneLevel && this.heroData.stoneSkill < topSkillLevel) {
                yield this.setSkillLevel(topSkillLevel, next);
            }
            safe(done)({
                success: true,
            });
        }, this);
    },
    isGemFull:function() {
        return this.heroData ? (this.heroData.gemWake - 1) * 10 + 5 <= this.heroData.gemLevel : true;
    },
    fullGem:function(done) {
        var next = coroutine(function*() {
            if (!this.heroData) {
                return safe(done)({});
            }
            /*
            var color = this.heroData.color;
            var topGemWake = (color < 5 ? 0 : (color == 5 ? 5 : (color == 6 ? 10 : 20)));
            if (this.heroData.gemWake < topGemWake) {
                yield this.setGemWake(topGemWake, next);
            }
            */
            var topGemLevel = (this.heroData.gemWake == 0 ? 0 : (this.heroData.gemWake - 1) * 10 + 5);
            if (this.heroData.gemLevel < topGemLevel) {
                yield this.setGemLevel(topGemLevel, next);
            }
            safe(done)({
                success: true,
            });
        }, this);
    },

    log:function() {
        var appendArgs = (this.heroData ? [">> Hero -", this.heroData.name] : [">> Hero - None"]);
        this.conn.log.apply(this.conn, appendArgs.concat(Array.prototype.slice.call(arguments)));
    },
});

var cachedServers = null;
Base.extends("GameConnection", {
    testMode: false,
    _constructor:function(username, password, managerLock, validator) {
        this.username = username;
        this.password = password;
        this.managerLock = managerLock;
        this.validator = validator;
        this.accountInfo = null;
        this.servers = {};
        this.serverInfo = null;
        this.gameInfo = null;
        this.itemsInfo = null;
        this.itemsQuick = null;
        this.itemsLock = new Mutex();
        this.herosInfo = null;
        this.herosMap = null;
        this.herosLock = new Mutex();
        this.diamondCost = 0;

        if (this.validator) {
            this.validator.setConnect(this);
        }

        this.sock = null;

        this.recvCallbacks = {};
        this.commonCallbacks = {};
        this.kickCallbacks = {};
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

    // Connection
    getAllServers:function() {
        return cachedServers;
    },
    quit:function() {
        if (this.sock) {
            if (this.validator) {
                this.validator.setConnect(null);
            }
            this.log("quiting");
            this.sock.end();
            this.sock = null;
        }
    },
    loginAccount:function(done) {
        var next = coroutine(function*() {
            // login request
            var obj = yield GameHTTP.login(this.username, this.password, next);
            if (!obj || obj.code != 'SUCCESS') {
                return safe(done)({});
            }
            //this.log("Login success!");
            this.accountInfo = {
                accessToken : obj.value.accessToken,
                accountId : obj.value.channelUid,
            };

            // server list
            yield this.managerLock.lock(next);
            if (cachedServers) {
                this.servers = cachedServers;
            } else {
                var serverList = null;
                var timeDiff = 0;
                var lastModified = yield $FileManager.getLastModified("/data/ServerCache.d", next);
                if (lastModified) {
                    timeDiff = new Date().getTime() - lastModified.getTime();
                }
                if (!lastModified || timeDiff > 7 * 24 * 3600 * 1000) {
                    var obj = null;
                    while(!obj) {
                        obj = yield GameHTTP.servers(this.accountInfo.accountId, next);
                    }
                    serverList = obj.list;
                    var data = JSON.stringify(obj.list, null, 2);
                    yield $FileManager.saveFile("/data/ServerCache.d", data, next);
                } else {
                    var data = yield $FileManager.visitFile("/data/ServerCache.d", next);
                    serverList = JSON.parse(data);
                }

                this.servers = {};
                for (var key in serverList) {
                    var serverData = serverList[key];
                    var ipData = serverData.server.split(":");
                    var server = {
                        serverId:serverData.id,
                        ip:ipData[0],
                        port:Number(ipData[1]),
                        desc:serverData.short.toLowerCase(),
                    };
                    this.servers[server.desc] = server;
                }
                cachedServers = this.servers;
            }
            this.managerLock.unlock();

            {
                var result = yield GameHTTP.stat(this.accountInfo.accountId, "active", next);
                if (result != "done") {
                    this.log("stat accountId:{0} error:{1}".format(this.accountInfo.accountId, result));
                }
            }

            return safe(done)({
                success: true,
            });
        }, this);
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

            desc = desc.toLowerCase();
            var server = this.servers[desc];
            if (!server) {
                return safe(done)({});
            }

            var sock = yield GameSock.connect(server.ip, server.port, next);
            if (!sock) {
                return safe(done)({});
            }
            //this.log("Connected with ip:{0}, port:{1}, server:{2}".format(server.ip, server.port, server.desc));
            this.sock = sock;
            this.serverInfo = server;
            GameSock.receive(sock, this, (c, m, data, change) => {
                this.updateDiamondCost(change);
                if (change) {
                    //console.log("change happen -", c, m, change);
                    this.updateGameInfo(change);
                }
                this.onReceive(c, m, data);
            });

            var startTime = new Date().getTime();
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
            var endTime = new Date().getTime();
            //yield $FileManager.saveFile("/../20170925_yongzhe_hack/recvlogin.json", JSON.stringify(data, null, 2), next);
            if (!data || !data.uid) {
                this.quit();
                return safe(done)({});
            }
            var serverTime = data.server_time * 1000;
            var deltaTime = serverTime - (startTime + endTime) / 2;
            var delayTime = endTime - startTime;
            this.gameInfoNumberProps = {
                level: "level", // 等级
                coin: "gold", // 金币
                gold: "colorDiamond", // 彩钻
                ticket: "whiteDiamond", // 白钻
                league_id: "league", // 所属国家
                league_medal: "leagueMedal", // 国家勋章
                crystal: "crystal", // 帝国战水晶
                arena_point: "arenaPoint", // 竞技场积分
                arena_glory: "arenaGlory", // 竞技场荣誉值
                union_war_double: "unionWarDouble", // 领地锄头
                vip: "vip", // vip 等级
                friendship: "friendWarVal", //友谊值
                summon_soul: "redSoul", // 红魂
                mizunotama: "sourceWater", // 水之源
                hinotama: "sourceFire", // 火之源
                kinotama: "sourceWood", // 木之源
            };
            this.gameInfo = {
                deltaTime: deltaTime,

                playerId: data.uid,
                name: data.role_name, // 名字
                power: data.cpi, // 战力
                serverDay: data.server_day, // 服务器天数
                magicGirl: data.mgirl_type || 0, // 魔女类型(01234:无 金币 神石 食物 红魂)

                hasTimeGift: !!(data.act_manygold), // 9万福利
                hasHeroReward: !!(data.act_goldenhero), // 金色勇者奖励
                hasXReward: !!(data.act_goldsign), // 暗金任务
                hasRedPacket: !!(data.act_redpacket), // 红包
                hasMagicGirl: !!(data.mgirl_tips), // 可以买书的魔女
            };
            this.updateGameInfo(data, true);
            var result = yield GameHTTP.stat(this.gameInfo.playerId, "reg", next);
            if (result != 'done') {
                this.log("stat failed playerId:{0} error:{1}".format(this.gameInfo.playerId, JSON.stringify(result)));
            }
            this.log("entering - Player id:{0}, server:{1} delta:{2}, delay:{3}".format(this.gameInfo.playerId, server.desc, deltaTime, delayTime));
            //var obj = yield GameHTTP.save(this.accountInfo.accountId, this.gameInfo.playerId, server.serverId, this.accountInfo.accessToken, next);
            //if (obj.code != 'SUCCESS') {
            //    this.log("save failed accountId:{0} code:{1} reason:{2}".format(this.accountInfo.playerId, obj.code, obj.desc));
            //}
            var result = yield GameHTTP.loginServer(this.accountInfo.accountId, server.serverId, next);
            if (result != 'ok') {
                this.log("loginServer failed accountId:{0} result:{1}".format(this.accountInfo.accountId, JSON.stringify(result)));
            }

            return safe(done)({
                success:true,
            });
        }, this);
    },
    getServerTime:function() {
        var now = new Date();
        if (this.gameInfo) {
            now = new Date(now.getTime() + this.gameInfo.deltaTime);
        }
        return now;
    },

    // Role Info
    updateGameInfo:function(data, force) {
        if (this.gameInfo && this.gameInfoNumberProps) {
            var keyContainer = (force ? this.gameInfoNumberProps : data);
            for (var dataKey in keyContainer) {
                var key = this.gameInfoNumberProps[dataKey];
                var dataVal = data[dataKey];
                if (key) {
                    if (typeof(dataVal) == "number") {
                        this.gameInfo[key] = dataVal;
                    } else if (force) {
                        this.gameInfo[key] = 0;
                    }
                }
            }
        }
        if (!force && data.items && this.itemsInfo && this.itemsQuick) {
            //console.log("item change -", data.items);
            var updateItems = data.items.update;
            if (updateItems) {
                for (var key in updateItems) {
                    this.updateItem(this.itemsInfo, this.itemsQuick, updateItems[key]);
                }
            }
            var deleteItems = data.items.delete;
            if (deleteItems) {
                for (var i = 0; i < deleteItems.length; ++i) {
                    this.updateItem(this.itemsInfo, this.itemsQuick, {id:deleteItems[i]});
                }
            }
        }
        if (!force && data.heros && this.herosInfo && this.herosMap) {
            //console.log("hero change -", data.heros);
            var updateHeros = data.heros.update;
            if (updateHeros) {
                for (var pid in updateHeros) {
                    var heroData = updateHeros[pid];
                    var heroItem = this.heroItemFromData(heroData);
                    var heroInfo = this.herosInfo[heroItem.heroId];
                    if (!heroInfo) {
                        this.log("================ No hero info! ==================", heroItem);
                        continue;
                    }
                    heroInfo.updateData(heroItem);
                }
            }
            var createHeros = data.heros.create;
            if (createHeros) {
                for (var pid in createHeros) {
                    var heroData = createHeros[pid];
                    var heroItem = this.heroItemFromData(heroData);
                    var heroInfo = this.herosInfo[heroItem.heroId] || new HeroInfo(this);
                    heroInfo.updateData(heroItem);
                    heroInfo.updateWake(0, 0);
                    this.herosMap[pid] = heroItem.heroId;
                    this.herosInfo[heroItem.heroId] = heroInfo;
                }
            }
            var deleteHeros = data.heros.delete;
            if (deleteHeros) {
                for (var i = 0; i < deleteHeros.length; ++i) {
                    var pid = deleteHeros[i];
                    var heroId = this.herosMap[pid];
                    var heroInfo = this.herosInfo[heroId];
                    heroInfo.updateData(null);
                    delete this.herosMap[pid];
                }
            }
        }
    },
    getItems:function(done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("RoleItem", "list", null, next);
            if (!data || !data.list) {
                return safe(done)({});
            }

            var items = {};
            var quick = {};
            for (var key in data.list) {
                this.updateItem(items, quick, data.list[key]);
            }
            return safe(done)({
                items: items,
                quick: quick,
            });
        }, this);
    },
    useItem:function(detail, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("RoleItem", "use", detail, next);
            if (!data) {
                return safe(done)({});
            }
            return safe(done)({
                success: true,
            });
        }, this);
    },
    readAllItems: function(done) {
        var next = coroutine(function*() {
            if (this.itemsInfo) {
                return safe(done)();
            }
            yield this.itemsLock.lock(next);
            if (!this.itemsInfo || !this.itemsQuick) {
                var data = yield this.getItems(next);
                if (data.items && data.quick) {
                    this.itemsInfo = data.items;
                    this.itemsQuick = data.quick;
                } else {
                    this.log("============= failed to read items! =================");
                }
            }
            this.itemsLock.unlock();
            return safe(done)();
        }, this);
    },
    getItemCount:function(itemName) {
        var count = 0;
        if (this.itemsInfo) {
            var item = this.itemsInfo[itemName];
            count = (item ? item.count : 0);
        }
        return count;
    },
    getItemDetails:function(itemName) {
        var details = [];
        if (this.itemsInfo) {
            var item = this.itemsInfo[itemName];
            details = item.details;
        }
        return details;
    },
    updateItem:function(items, quick, itemData) {
        var id = Number(itemData.id);
        var num = Number(itemData.num ? itemData.num : 0);
        var item = (quick[id] ? quick[id] : items[itemData.sysid]);
        item = (item ? item : { count: 0, details: [] });
        for (var i = 0; i < item.details.length; ++i) {
            var detail = item.details[i];
            if (detail.id == id) {
                item.count -= detail.num;
                item.details.splice(i, 1);
                break;
            }
        }
        if (num > 0) {
            item.count += num;
            item.details.push({
                id: id,
                num: num,
            });
            quick[id] = item;
            items[itemData.sysid] = item;
        } else {
            delete quick[id];
        }
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

    // Heros
    heroItemFromData:function(heroData) {
        return {
            pid: Number(heroData.pid),
            color: heroData.quality - 1,
            heroId: heroData.sysid,
            name: heroData.name,
            pos: heroData.pos || 0,
            upgrade: heroData.upgrade_level || 0,
            food: heroData.level,
            exp: heroData.exp,
            gemWake: heroData.gem_wake || 0,
            gemLevel: heroData.gem_level || 0,
        };
    },
    getHeros:function(done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("RoleHero", "getHeros", null, next);
            if (!data || !data.list) {
                return safe(done)({});
            }
            var heros = {};
            for (var pid in data.list) {
                var heroData = data.list[pid];
                heros[pid] = this.heroItemFromData(heroData);
            }
            return safe(done)({
                heros: heros,
            });
        }, this);
    },
    getHeroWakes:function(done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("RoleWake", "getinfo", null, next);
            if (!data) {
                return safe(done)({});
            }
            var wakes = {};
            for (var pid in data) {
                var wakeData = data[pid];
                wakes[pid] = {
                    level: wakeData.level,
                    skill: wakeData.skill_level,
                };
            }
            return safe(done)({
                wakes: wakes,
            });
        }, this);
    },
    setHeroPos:function(pid, pos, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("RoleTeam", "sethero", {pos:pos, pid:pid}, next);
            if (!data) {
                return safe(done)({});
            }
            return safe(done)({
                success: true,
            });
        }, this);
    },
    dismissHero:function(pid, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("RoleHero", "sell", { pid:pid, master:0 }, next);
            if (!data) {
                return safe(done)({});
            }
            return safe(done)({
                success: true,
            });
        }, this);
    },
    upgradeHero:function(pid, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("RoleUpgrade", "start", { pid:pid }, next);
            if (!data) {
                return safe(done)({});
            }
            return safe(done)({
                success: true,
            });
        }, this);
    },
    foodHero:function(pid, foodId, num, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("RoleHero", "addexp", {pid:pid, sysid:foodId, num:num}, next);
            if (!data) {
                return safe(done)({});
            }
            return safe(done)({
                success: true,
            });
        }, this);
    },
    updateHeroStone:function(pid, data) {
        if (this.herosInfo && this.herosMap) {
            var heroId = this.herosMap[pid];
            var heroInfo = this.herosInfo[heroId];
            heroInfo.updateWake(data.level, data.skill_level);
        }
    },
    autoWakeHero:function(pid, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("RoleWake", "auto", { pid:pid }, next);
            if (!data) {
                return safe(done)({});
            }
            return safe(done)({
                success: true,
            });
        }, this);
    },
    upWakeHero:function(pid, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("RoleWake", "start", { pid:pid }, next);
            if (!data) {
                return safe(done)({});
            }
            this.updateHeroStone(pid, data);
            return safe(done)({
                success: true,
            });
        }, this);
    },
    autoSkillHero:function(pid, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("RoleWake", "autoSkill", { pid:pid }, next);
            if (!data) {
                return safe(done)({});
            }
            return safe(done)({
                success: true,
            });
        }, this);
    },
    upSkillHero:function(pid, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("RoleWake", "upSkill", { pid:pid }, next);
            if (!data) {
                return safe(done)({});
            }
            this.updateHeroStone(pid, data);
            return safe(done)({
                success: true,
            });
        }, this);
    },
    wakeGemHero:function(pid, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("Gem", "wake", { pid:pid }, next);
            if (!data) {
                return safe(done)({});
            }
            return safe(done)({
                success: true,
            });
        }, this);
    },
    upGemHero:function(pid, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("Gem", "up", { pid:pid }, next);
            if (!data) {
                return safe(done)({});
            }
            return safe(done)({
                success: true,
            });
        }, this);
    },
    readAllHeros:function(done) {
        var next = coroutine(function*() {
            if (this.herosInfo) {
                return safe(done)();
            }
            yield this.herosLock.lock(next);
            if (!this.herosInfo) {
                this.herosInfo = {};
                this.herosMap = {};
                var data = yield this.getHeros(next);
                var data_wakes = yield this.getHeroWakes(next);
                for (var pid in data.heros) {
                    var heroItem = data.heros[pid];
                    var wakeItem = data_wakes.wakes[pid];
                    this.herosMap[pid] = heroItem.heroId;
                    var heroInfo = new HeroInfo(this);
                    heroInfo.updateData(heroItem);
                    if (wakeItem) {
                        heroInfo.updateWake(wakeItem.level, wakeItem.skill);
                    } else {
                        heroInfo.updateWake(0, 0);
                    }
                    this.herosInfo[heroItem.heroId] = heroInfo;
                }
            }
            this.herosLock.unlock();
            return safe(done)();
        }, this);
    },
    getOnlineHeroIds:function(done) {
        var next = coroutine(function*() {
            yield this.readAllHeros(next);
            var heroIds = [];
            if (this.herosInfo) {
                for (var heroId in this.herosInfo) {
                    heroIds.push(heroId);
                }
            }
            return safe(done)(heroIds);
        }, this);
    },
    getOnlineHero:function(heroId, done) {
        var next = coroutine(function*() {
            yield this.readAllHeros(next);
            var heroObj = this.herosInfo && this.herosInfo[heroId] || null;
            return safe(done)(heroObj);
        }, this);
    },
    useHeroCard:function(heroId, done) {
        var next = coroutine(function*() {
            yield this.readAllItems(next);
            var heroCardId = "hero_" + String(heroId);
            var itemData = this.itemsInfo[heroCardId];
            if (!itemData || itemData.count <= 0) {
                return safe(done)({});
            }
            var detail = itemData.details[0];
            var data_use = yield this.sendMsg("RoleItem", "use", detail, next);
            if (!data_use) {
                return safe(done)({});
            }
            return safe(done)({
                success: true,
            });
        }, this);
    },

    // Union
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

    // Union War
    getUnionWar:function(done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("UnionWar", "getinfo", null, next);
            if (!data || !data.held) {
                return safe(done)({});
            }
            var isOpen = Number(data.open) == 1;
            var lands = {};
            if (isOpen) {
                var data = yield this.sendMsg("UnionWar", "enter", null, next);
                if (!data || !data.list) {
                    return safe(done)({});
                }
                for (var i = 0; i < data.list.length; ++i) {
                    var item = data.list[i];
                    lands[item.id] = !!item.owner;
                }
            }
            return safe(done)({
                isOpen: isOpen,
                lands: lands,
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
                    quality: gem.quality,
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
            var kickKey = this.regKick(() => {
                next(null);
            });
            yield this.sendNotify("UnionWar", "occupy", {id:landId, pos:pos}, next);
            var data = yield; // wait for msg received
            this.unregMsg(ckey);
            this.unregKick(kickKey);
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

    // King War
    getKingWarState:function(done) {
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
    getKingWarArea:function(areaId, done) {
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
                this.log("Join KingWar (area:{0}, star:{1}) error:".format(areaId, starId), data);
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
    summarizeRaceInfo:function(data) {
        var players = [];
        if (data.list) {
            for (var i = 0; i < data.list.length; ++i) {
                var item = data.list[i];
                players.push({
                    playerId: item.uid,
                    name: item.role_name || "",
                    union: (item.server ? item.server + "." + item.union_short : ""),
                    good: (item.good ? item.good : 0),
                    bad: (item.bad ? item.bad : 0),
                });
            }
        }
        var cards = [];
        if (data.cards) {
            for (var i = 0; i < data.cards.length; ++i) {
                var card = data.cards[i];
                cards.push(Database.cardInfo(card));
            }
        }
        return {
            cards: cards,
            rawCards: data.cards,
            players: players,
        };
    },
    getKingWarRace:function(done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("KingWar", "getRaceInfo", null, next);
            if (!data || !data.list) {
                return safe(done)({});
            }
            if (this.testMode) {
                if (!this.testKingwarCards) {
                    this.testKingwarCards = [];
                    for (var i = 0; i < 3; ++i) {
                        this.testKingwarCards[i] = rand(6) + 1;
                    }
                }
                data.cards = clone(this.testKingwarCards);
            }
            var raceInfo = this.summarizeRaceInfo(data);
            raceInfo.area = data.areaid;
            raceInfo.star = data.star;
            return safe(done)(raceInfo);
        }, this);
    },
    useKingWarCard:function(playerId, done) {
        var next = coroutine(function*() {
            if (this.testMode) {
                if (!this.testKingwarCards || this.testKingwarCards.length == 0) {
                    return safe(done)({});
                }
                this.testKingwarCards.splice(0, 1);
                yield setTimeout(next, 100);
                return safe(done)({
                    success: true,
                    good: 1,
                    bad: 1,
                });
            } else {
                var data = yield this.sendMsg("KingWar", "card", {type:1, uid:playerId}, next);
                if (!data) {
                    return safe(done)({});
                }
                return safe(done)({
                    success: true,
                    good: data.good,
                    bad: data.bad,
                });
            }
        }, this);
    },
    getEmperorRace:function(done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("KingWar", "getEmperorRaceInfo", null, next);
            if (!data || (data.step != 0 && !data.list)) {
                return safe(done)({});
            }
            if (this.testMode) {
                if (!this.testKingwarCards) {
                    this.testKingwarCards = [];
                    for (var i = 0; i < 3; ++i) {
                        this.testKingwarCards[i] = rand(6) + 1;
                    }
                }
                data.cards = clone(this.testKingwarCards);
            }
            var raceInfo = this.summarizeRaceInfo(data);
            raceInfo.area = 4;
            raceInfo.star = 1;
            return safe(done)(raceInfo);
        }, this);
    },
    useEmperorCard:function(playerId, done) {
        var next = coroutine(function*() {
            if (this.testMode) {
                if (!this.testKingwarCards || this.testKingwarCards.length == 0) {
                    return safe(done)({});
                }
                this.testKingwarCards.splice(0, 1);
                yield setTimeout(next, 100);
                return safe(done)({
                    success: true,
                    good: 1,
                    bad: 1,
                });
            } else {
                var data = yield this.sendMsg("KingWar", "card", {type:2, uid:playerId}, next);
                if (!data) {
                    return safe(done)({});
                }
                return safe(done)({
                    success: true,
                    good: data.good,
                    bad: data.bad,
                });
            }
        }, this);
    },
    getRankPlayers:function(done) {
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

    // Maze
    getMazeInfo:function(data_maze) {
        var eventInfo = {};
        for (var i = 0; i < data_maze.events.length; ++i) {
            var event = data_maze.events[i];
            var cfg = data_maze.event_cfgs[i];
            var posKey = event.row * 100 + event.col;
            eventInfo[posKey] = {
                row: event.row,
                col: event.col,
                id: event.id,
                done: event.done == 1,
                type: cfg.type,
                isMonster: cfg.type == 1,
                isBoss: cfg.type == 2,
                isStatus: cfg.type == 3,
                isBox: cfg.type == 4,
            };
        }
        var nowSec = new Date().getTime() / 1000;
        var diffMin = Math.floor((nowSec + 180 * 60 - data_maze.expire) / 60);
        diffMin = (diffMin > 180 ? 180 : diffMin);
        return {
            mazeId: data_maze.type,
            pos: { row: data_maze.row, col: data_maze.col },
            eventInfo: eventInfo,
            steps: diffMin,
            searchs: [
                data_maze.search_num_1,
                data_maze.search_num_2,
                data_maze.search_num_3,
            ],
        };
    },
    mazeDirs:[{row:2,col:0},{row:-2,col:0},{row:0,col:2},{row:0,col:-2}],
    getMazeAvailable:function(mazeInfo) {
        var available = [];
        for (var i = 0; i < this.mazeDirs.length; ++i) {
            var dir = this.mazeDirs[i];
            var pos = { row: mazeInfo.pos.row + dir.row, col: mazeInfo.pos.col + dir.col };
            // out of maze
            if (pos.row < 0 || pos.row > 12 || pos.col < 0 || pos.col > 14) {
                continue;
            }
            if (pos.row == 12 && pos.col == 0) {
                continue;
            }
            var posKey = pos.row * 100 + pos.col;
            if (mazeInfo.eventInfo[posKey]) {
                continue;
            }
            available.push(pos);
        }
        return available;
    },
    getMaze:function(done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("Maze", "getinfo", null, next);
            if (!data || !data.type) {
                return safe(done)({});
            }
            return safe(done)(this.getMazeInfo(data));
        }, this);
    },
    changeMaze:function(mazeId, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("Maze", "change", {type:mazeId}, next);
            if (!data || data.type != mazeId) {
                return safe(done)({});
            }
            return safe(done)(this.getMazeInfo(data));
        }, this);
    },
    mazeSearch:function(count, done) {
        var next = coroutine(function*() {
            for (var i = 0; i < count; ++i) {
                var data = yield this.sendMsg("Maze", "search", null, next);
                if (!data) {
                    return safe(done)({});
                }
            }
            return safe(done)({
                success:true,
            });
        }, this);
    },

    // Ladder (竞技场)
    getLadder:function(done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("Ladder", "getinfo", null, next);
            if (!data || !data.members) {
                return safe(done)({});
            }
            var cards = [];
            for (var i = 0; i < data.cards.length; ++i) {
                var card = data.cards[i];
                cards.push(Database.cardInfo(card));
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

    // Hero Shop
    listHeroPrice:function(data, result) {
        for (var id in data.players) {
            var player = data.players[id];
            var heroInfo = Database.heroInfo(id);
            if (heroInfo && heroInfo.level >= 8) {
                result[String(id)] = Number(player.per);
            }
        }
    },
    getRoomHeros:function(data) {
        var roomHeros = [];
        for (var i = 0; i < data.room_max; ++i) {
            var room = data.negotiate[i];
            if (room) {
                roomHeros.push({
                    id: String(room.id),
                    per: Number(room.per),
                });
            }
        }
        return roomHeros;
    },
    getShopHeros:function(data) {
        var playerIds = [];
        for (var id in data.players) {
            playerIds.push(id);
        }
        return playerIds;
    },
    exchangeHeroRoom:function(config, data, done) {
        var next = coroutine(function*() {
            var roomMax = data.room_max;
            var roomHeros = this.getRoomHeros(data);
            var playerIds = this.getShopHeros(data);
            var careAbout = {};
            for (var i = 0; i < roomHeros.length; ++i) {
                careAbout[roomHeros[i].id] = true;
            }
            for (var i = 0; i < roomMax; ++i) {
                var changed = false;
                for (var j = 0; j < playerIds.length; ++j) {
                    var id = playerIds[j];
                    var player = data.players[id];
                    if (careAbout[id] && player.status == 0 && roomHeros.length < roomMax) {
                        data = yield this.sendMsg("RoleMerge", "addNegotiate", {uid:id}, next);
                        if (!data || !data.players) {
                            return safe(done)({});
                        }
                        roomHeros = this.getRoomHeros(data);
                        changed = true;
                        break;
                    }
                }
                for (var j = 0; j < playerIds.length; ++j) {
                    var id = playerIds[j];
                    var player = data.players[id];
                    var heroInfo = Database.heroInfo(id);
                    if (Number(player.per) <= config.maxReduce && heroInfo && heroInfo.level >= 8 && player.status == 0 && roomHeros.length < roomMax) {
                        data = yield this.sendMsg("RoleMerge", "addNegotiate", {uid:id}, next);
                        if (!data || !data.players) {
                            return safe(done)({});
                        }
                        roomHeros = this.getRoomHeros(data);
                        changed = true;
                        break;
                    }
                }
                for (var j = 0; j < roomHeros.length; ++j) {
                    var roomItem = roomHeros[j];
                    var player = data.players[roomItem.id];
                    if (player && player.status == 2 && roomItem.per >= Number(player.per)) {
                        careAbout[roomItem.id] = true;
                        data = yield this.sendMsg("RoleMerge", "delNegotiate", {id:j}, next);
                        if (!data || !data.players) {
                            return safe(done)({});
                        }
                        roomHeros = this.getRoomHeros(data);
                        changed = true;
                        break;
                    }
                }
                if (!changed) {
                    break;
                }
            }
            for (var i = 0; i < playerIds.length; ++i) {
                var id = playerIds[i];
                var player = data.players[id];
                if (careAbout[id] && player.status == 0 && roomHeros.length < roomMax) {
                    data = yield this.sendMsg("RoleMerge", "addNegotiate", {uid:id}, next);
                    if (!data || !data.players) {
                        return safe(done)({});
                    }
                    roomHeros = this.getRoomHeros(data);
                }
            }
            return safe(done)({
                success: true,
            });
        }, this);
    },
    updateHeroShop:function(config, result, done) {
        var next = coroutine(function*() {
            var data = yield this.sendMsg("RoleMerge", "heroInfo", null, next);
            if (!data || !data.players) {
                return safe(done)({});
            }
            this.listHeroPrice(data, result);
            yield this.exchangeHeroRoom(config, data, next);

            var currentRefresh = data.flush_hero_num;
            var maxRefresh = (config.refresh > 10 ? 10 : config.refresh);
            this.log("refresh hero shop", currentRefresh, maxRefresh);
            for (var i = currentRefresh; i < maxRefresh; ++i) {
                data = yield this.sendMsg("RoleMerge", "heroFlush", null, next);
                if (!data || !data.players) {
                    return safe(done)({});
                }
                this.listHeroPrice(data, result);
                var data_exchange = yield this.exchangeHeroRoom(config, data, next);
                if (!data_exchange.success) {
                    return safe(done)({});
                }
            }
            return safe(done)({
                success: true,
            });
        }, this);
    },

    // Diamond safety check
    speakTo:function(channel, message, done) {
        var next = coroutine(function*() {
            if (this.justSpeak) {
                yield setTimeout(next, 3100);
            }
            if (message.length > 40) {
                message = message.substr(0, 40);
            }
            var data = yield this.sendMsg("Chat", "send", {type:channel, msg:message, uid:this.gameInfo.playerId}, next, {hasUnicode:true});
            this.justSpeak = true;
            safe(done)(data);
        }, this);
    },
    speakForAutomationResult:function(done) {
        var next = coroutine(function*() {
            if (!this.tipsInPrivate) {
                return safe(done)();
            }
            var shortTypes = [];
            if (this.shortTypes) {
                for (var typeName in this.shortTypes) {
                    shortTypes.push(typeName);
                }
            }
            if (shortTypes && shortTypes.length > 0) {
                var l = shortTypes.length;
                l = (l > 5 ? 5 : l);
                var hasTail = shortTypes.length > l;
                shortTypes.splice(l, shortTypes.length - l);
                var content = shortTypes.join("，");
                content = "无法完成{0}{1}".format(content, (hasTail ? "..." : ""));
                var now = new Date();
                msgTime = "(" + String(now.getHours()) + ":" + String(now.getMinutes()) + ")";
                content = content + msgTime;
                yield this.speakTo(3, content, next);
            }
            safe(done)();
        }, this);
    },
    addShortTypes:function(typeName) {
        this.shortTypes = (this.shortTypes ? this.shortTypes : {});
        this.shortTypes[typeName] = true;
    },
    checkDiamondEnough:function(typeName) {
        if (!safe(this.checkConsumeDiamond)()) {
            this.addShortTypes(typeName);
            this.log("== Diamond Not Enough ==", typeName);
            return false;
        }
        return true;
    },
    updateDiamondCost:function(change) {
        if (change && typeof(change.ticket) == "number" && change.ticket < this.gameInfo.whiteDiamond) {
            this.diamondCost = this.gameInfo.whiteDiamond - change.ticket;
        } else {
            this.diamondCost = 0;
        }
    },
    checkDiamondCost:function(typeName, price) {
        if (this.diamondCost != price) {
            this.addShortTypes(typeName);
            this.log("== Diamond Cost Mismatch == cost:{0}, expected:{1}".format(this.diamondCost, price), typeName);
            return false;
        }
        return true;
    },

    // Automation
    autoSpecial:function(config, done) {
        var next = coroutine(function*() {
            var compare = 100;
            if (config.limitOfShort == 0) {
                compare = 0;
            } else if (config.limitOfShort == 1) {
                compare = 100;
            } else if (config.limitOfShort == 2) {
                compare = 200;
            } else if (config.limitOfShort == 3) {
                compare = 500;
            } else if (config.limitOfShort == 4) {
                compare = 1000;
            } else if (config.limitOfShort == 5) {
                compare = 2000;
            } else if (config.limitOfShort == 6) {
                compare = 5000;
            }
            this.checkConsumeDiamond = () => {
                if (!config.stopInShort || this.gameInfo.whiteDiamond > compare) {
                    return true;
                }
                return false;
            }
            this.tipsInPrivate = config.tipsInPrivate;
            safe(done)({
                success: true,
            });
        }, this);
    },
    timeGiftList:[1,2,3,5,7,9,12,15,20,25,30,40,50,60,80,100,120,140,160,180,200,220,240,260,280],
    autoBenefit:function(config, done) {
        var next = coroutine(function*() {
            // auto sign
            if (config.sign && this.validator.checkDaily("autoSign")) {
                var data = yield this.sendMsg("Sign", "getinfo", null, next);
                if (data && data.list) {
                    var signed = !!(data.list[String(data.count)]);
                    if (!signed) {
                        var data_start = yield this.sendMsg("Sign", "start", {point:0}, next);
                    }
                }
            }
            // auto vip
            if (config.vip && this.validator.checkDaily("autoVipReward")) {
                var data = yield this.sendMsg("Vip", "getinfo", null, next);
                if (data && data.cards) {
                    for (var i = 0; i < data.cards.length; ++i) {
                        var card = data.cards[i];
                        if (card.expire > 0 && card.daily == 1) {
                            var data_gift = yield this.sendMsg("Vip", "dailyGift", {id:card.id}, next);
                            if (!data_gift) {
                                break;
                            }
                        }
                    }
                }
            }
            // auto friend reward
            if (config.friend && this.validator.checkHourly("autoFriendReward")) {
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
                        if (!data_bless) {
                            break;
                        }
                    }
                    for (var i = 0; i < data.bless_in.length; ++i) {
                        var playerData = data.bless_in[i];
                        var data_bless = yield this.sendMsg("Friend", "bless", {uid:playerData.uid, type:2}, next);
                        if (!data_bless) {
                            break;
                        }
                    }
                }
            }
            // auto email
            if (config.email && this.validator.checkHourly("autoEmail")) {
                var data = yield this.sendMsg("RoleEmail", "getlist", null, next);
                if (data && data.list) {
                    for (var i = 0; i < data.list.length; ++i) {
                        var email = data.list[i];
                        if (email.state == 0) {
                            var data_read = yield this.sendMsg("RoleEmail", "read", {id: email.id}, next);
                            if (!data_read) {
                                break;
                            }
                        }
                        if (email.attachment && email.state != 2) {
                            var data_fetch = yield this.sendMsg("RoleEmail", "fetch", {id: email.id}, next);
                            if (!data_fetch) {
                                break;
                            }
                        }
                    }
                }
            }
            // 9万福利
            if (config.timeGift && this.gameInfo.hasTimeGift && this.validator.checkHourly("autoTimeGift")) {
                var data = yield this.sendMsg("ActManyGold", "getinfo", null, next);
                if (data && data.list) {
                    for (var i = 0; i < this.timeGiftList.length; ++i) {
                        var day = this.timeGiftList[i];
                        if (day > data.days) {
                            break;
                        }
                        if (!data.list[day] || data.list[day] == 2) {
                            var data_reward = yield this.sendMsg("ActManyGold", "reward", {day:day, type:1}, next);
                            if (!data_reward) {
                                break;
                            }
                        }
                        if (data.vip >= 2 && (!data.list[day] || data.list[day] == 1)) {
                            var data_reward = yield this.sendMsg("ActManyGold", "reward", {day:day, type:2}, next);
                            if (!data_reward) {
                                break;
                            }
                        }
                    }
                }
            }
            // 契约之门
            if (config.tavern && this.validator.checkHourly("autoTavern")) {
                var data = yield this.sendMsg("Tavern", "getinfo", null, next);
                if (data) {
                    if (data.freenum_1 == 1) {
                        var data_start = yield this.sendMsg("Tavern", "start", {type:1,batch:0}, next);
                    }
                    if (data.freenum_2 == 1) {
                        var data_start = yield this.sendMsg("Tavern", "start", {type:2,batch:0}, next);
                    }
                    if (data.daily == 1) {
                        var data_gift = yield this.sendMsg("Tavern", "gift", {type:"daily"}, next);
                    }
                    if (data.weekend == 1) {
                        var data_gift = yield this.sendMsg("Tavern", "gift", {type:"weekend"}, next);
                    }
                    if (data.charge == 1) {
                        var data_gift = yield this.sendMsg("Tavern", "gift", {type:"charge"}, next);
                    }
                    if (data.all == 1) {
                        var data_gift = yield this.sendMsg("Tavern", "gift", {type:"all"}, next);
                    }
                }
            }
            // 特典头像
            if (config.specCard && this.validator.checkDaily("autoSpecCard")) {
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
            }
            // auto Red Packet
            if (config.redpacket && this.gameInfo.hasRedPacket && this.validator.checkDaily("autoRedPacket")) {
                var data = yield this.sendMsg("ActRedpacket", "getinfo", null, next);
                if (data && data.list) {
                    for (var i = 0; i < data.list.length; ++i) {
                        var item = data.list[i];
                        if (item.req == "" && item.done == 0) {
                            var data_reward = yield this.sendMsg("ActRedpacket", "reward", { index:item.index }, next);
                            if (!data_reward) {
                                break;
                            }
                        }
                    }
                }
            }
            // auto hero reward
            if (config.freehero && this.gameInfo.hasHeroReward && this.validator.checkHourly("autoHeroReward")) {
                var data = yield this.sendMsg("ActGoldenHero", "getinfo", null, next);
                if (data && data.list) {
                    for (var i = 0; i < data.list.length; ++i) {
                        var item = data.list[i];
                        if (item.state == 1) {
                            var data_reward = yield this.sendMsg("ActGoldenHero", "reward", { index:item.index }, next);
                            if (!data_reward) {
                                break;
                            }
                        }
                    }
                }
            }
            // auto speak
            if (config.speak && this.validator.checkDaily("autoSpeak")) {
                var data_speak = yield this.speakTo(3, "这游戏不错", next);
            }
            // auto like hero
            if (config.herolike && this.validator.checkDaily("autoHeroLike")) {
                var liked = false;
                for (var i = 0; i < 15; ++i) {
                    var heroInfo = Database.randHero();
                    var data = yield this.sendMsg("Comment", "getTops", {heroid:heroInfo.id}, next);
                    if (data && data.list && data.list.length > 0) {
                        for (var j = 0; j < data.list.length; ++j) {
                            var item = data.list[j];
                            var data_like = yield this.sendMsg("Comment", "like", {heroid:heroInfo.id,msgid:item.id}, next);
                            if (data_like) {
                                this.log("like hero", heroInfo.name, item.role_name, heroInfo.id, item.id);
                                liked = true;
                                break;
                            }
                        }
                    }
                    if (liked) {
                        break;
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
    autoGoblin:function(config, done) {
        var next = coroutine(function*() {
            if (this.validator.checkHourly("autoGoblin")) {
                var data = yield this.sendMsg("ActGoblin", "getinfo", null, next);
                if (!data || !data.list) {
                    return safe(done)({});
                }

                var reduceLevels = [0, 3, 5, 8];
                var ShouldBuy = (info) => {
                    if (info.itemName == "dungeon_dice") {
                        if (!info.useDiamond) {
                            return info.reduce <= reduceLevels[config.dungeonDiceGold];
                        } else {
                            return info.reduce <= reduceLevels[config.dungeonDiceDiamond];
                        }
                    }
                    if (info.itemName == "summon_book") {
                        if (!info.useDiamond) {
                            return info.reduce <= reduceLevels[config.summonBookGold];
                        } else {
                            return info.reduce <= reduceLevels[config.summonBookDiamond];
                        }
                    }
                    if (info.itemName == "hero_upgrade_card_piece") {
                        if (!info.useDiamond) {
                            return info.reduce <= reduceLevels[config.heroUpgradeGold];
                        } else if (config.heroUpgradeDiamond > 0) {
                            return info.reduce <= reduceLevels[config.heroUpgradeDiamond];
                        }
                    }
                    return false;
                };
                var hasUnrecognized = false;
                var GetBuyIds = (data) => {
                    var buyItems = [];
                    for (var id in data.list) {
                        if (data.list[id] == 1) {
                            var info = Database.goblinInfo(id);
                            if (!info) {
                                this.log("=======>> unrecoginized item id:", id, data.list);
                                hasUnrecognized = true;
                                break;
                            } else if (ShouldBuy(info)) {
                                buyItems.push({
                                    id: id,
                                    price: (info.useDiamond ? info.price : 0) * info.reduce / 10,
                                });
                            }
                        }
                    }
                    return buyItems;
                };
                // Check timed refresh
                var buyItems = GetBuyIds(data);
                for (var i = 0; i < buyItems.length; ++i) {
                    var buyItem = buyItems[i];
                    if (!this.checkDiamondEnough("商店购买")) {
                        return safe(done)({});
                    }
                    var data_buy = yield this.sendMsg("ActGoblin", "buy", {id:buyItem.id}, next);
                    if (!data_buy) {
                        return safe(done)({});
                    }
                    if (!this.checkDiamondCost("商店购买", buyItem.price)) {
                        return safe(done)({});
                    }
                }
                // Check manual refresh
                var alreadyBuy = (3 - data.num) + data.buy;
                var buyNum = (config.buyNum > 13 ? 13 : config.buyNum);
                while(alreadyBuy < buyNum && !hasUnrecognized) {
                    if (!this.checkDiamondEnough("商店刷新")) {
                        return safe(done)({});
                    }
                    var refreshCost = (alreadyBuy < 3 ? 0 : (alreadyBuy < 8 ? 20 : 50));
                    var data_refresh = yield this.sendMsg("ActGoblin", "refresh", null, next);
                    if (!data_refresh || !data_refresh.list) {
                        return safe(done)({});
                    }
                    if (!this.checkDiamondCost("商店刷新", refreshCost)) {
                        return safe(done)({});
                    }
                    var buyItems = GetBuyIds(data_refresh);
                    for (var i = 0; i < buyItems.length; ++i) {
                        var buyItem = buyItems[i];
                        if (!this.checkDiamondEnough("商店购买")) {
                            return safe(done)({});
                        }
                        var data_buy = yield this.sendMsg("ActGoblin", "buy", {id:buyItem.id}, next);
                        if (!data_buy) {
                            return safe(done)({});
                        }
                        if (!this.checkDiamondCost("商店购买", buyItem.price)) {
                            return safe(done)({});
                        }
                    }
                    alreadyBuy = (3 - data_refresh.num) + data_refresh.buy;
                }
            }
            return safe(done)({
                success: true,
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
                for (var mazeId = 1; mazeId <= 3; ++mazeId) {
                    var data_change = yield this.sendMsg("Maze", "change", {type:mazeId}, next);
                    if (!data_change) {
                        return safe(done)({});
                    }
                    var currDay = this.validator.peekDaily("autoMazeWalk");
                    if (config.randwalk && currDay) {
                        var mazeInfo = this.getMazeInfo(data_change);
                        var available = this.getMazeAvailable(mazeInfo);
                        this.log("Maze walk", mazeId, mazeInfo.pos, mazeInfo.steps, available);
                        if (available.length > 0 && mazeInfo.steps >= 20) {
                            var twoPos = [mazeInfo.pos];
                            for (var i = 0; i < available.length; ++i) {
                                var data_run = yield this.sendMsg("Maze", "run", available[i], next);
                                if (data_run) {
                                    twoPos.push(available[i]);
                                    break;
                                }
                            }
                            if (twoPos.length == 2) {
                                for (var i = 0; i < 20; ++i) {
                                    var posNext = twoPos[i % 2];
                                    var data_run = yield this.sendMsg("Maze", "run", posNext, next);
                                    if (!data_run) {
                                        this.log("Maze run error on pos:", posNext);
                                        break;
                                    }
                                }
                                this.validator.commitDaily("autoMazeWalk", currDay);
                            }
                        }
                    }
                    var searchedNum = searched[mazeId];
                    var hour = new Date().getHours();
                    var searchNum = (hour >= 0 && hour < 12 ? config.searchNumber0 : config.searchNumber);
                    searchNum = (searchNum > 13 ? 13 : searchNum);
                    for (var j = searchedNum; j < searchNum; ++j) {
                        if (!this.checkDiamondEnough("迷宫刷新")) {
                            break;
                        }
                        var refreshCost = (j < 3 ? 0 : (j < 8 ? 20 : 50));
                        var data_search = yield this.sendMsg("Maze", "search", null, next);
                        if (!data_search) {
                            break;
                        }
                        if (!this.checkDiamondCost("迷宫刷新", refreshCost)) {
                            break;
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
                    if (!data_inspire) {
                        this.log("FriendWar inspire failed", i);
                        break;
                    }
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
                                    if (!data_inspire) {
                                        this.log("FriendWar inspire failed", k);
                                        break;
                                    }
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
                        if (!data_reward) {
                            this.log("FriendWar reward failed", i);
                            break;
                        }
                    }
                }
                if (config.buyBlueCard && this.gameInfo.friendWarVal > 100) {
                    var buyCount = Math.floor(this.gameInfo.friendWarVal / 100);
                    for (var i = 0; i < buyCount; ++i) {
                        var data_exchange = yield this.sendMsg("FriendWar", "exchange", {id:1}, next);
                        if (!data_exchange) {
                            this.log("FriendWar exchange failed", i, buyCount);
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
                if (new Date().getHours() < 12) {
                    var prayLimit = (config.prayNumber > 23 ? 23 : config.prayNumber);
                    var prayUsed = 3 - data.pray_num;
                    var allMedal = this.gameInfo.leagueMedal;
                    var prayNum = 3;
                    var prayCost = 50;
                    var totalCost = 0;
                    while (prayNum < prayLimit) {
                        if (prayNum >= prayUsed) {
                            if (totalCost + prayCost > allMedal) {
                                break;
                            }
                            totalCost += prayCost;
                        }
                        prayNum++;
                        if (prayCost < 1600) {
                            prayCost *= 2;
                        }
                    }
                    this.log("-- daily League", prayUsed, prayNum);
                    for (var i = prayUsed; i < prayNum; ++i) {
                        var data_pray = yield this.sendMsg("League", "pray", null, next);
                        if (!data_pray) {
                            break;
                        }
                    }
                }
                // auto city reward
                var data_city = yield this.sendMsg("League", "getCityInfo", null, next);
                if (data_city) {
                    if (data_city.award_1 == 1 && data_city.get_1 != 1) {
                        var data_award = yield this.sendMsg("League", "cityAward", {h:1}, next);
                    }
                    if (data_city.award_2 == 1 && data_city.get_2 != 1) {
                        var data_award = yield this.sendMsg("League", "cityAward", {h:2}, next);
                    }
                }
                // auto boss
                var boss_max = 20;
                if (data.boss_id <= boss_max) {
                    for (var boss_id = data.boss_id; boss_id <= boss_max; ++boss_id) {
                        var data_boss = yield this.sendMsg("League", "boss", null, next);
                        if (!data_boss || data_boss.succ != 1) {
                            this.log("boss failed", data_boss);
                            break;
                        }
                    }
                }
                // auto war
                if (this.gameInfo.vip >= 3) {
                    var data_autoInfo = yield this.sendMsg("League", "getAutoInfo", null, next);
                    if (data_autoInfo) {
                        if (data_autoInfo.auto_num > 0) {
                            var data_reward = yield this.sendMsg("League", "getAutoWarReward", null, next);
                        }
                        if (this.checkDiamondEnough("国家热情")) {
                            var payMax = (config.warPay > 20 ? 20 : config.warPay);
                            var warPay = (data_autoInfo.paynum ? data_autoInfo.paynum : 0);
                            if (payMax > 0 && (warPay < payMax)) {
                                for (var i = warPay; i < payMax; ++i) {
                                    var payCost = (i < 5 ? 20 : (i < 10 ? 30 : (i < 15 ? 40 : 50)));
                                    var data_addpay = yield this.sendMsg("League", "addpay", null, next);
                                    if (!data_addpay) {
                                        break;
                                    }
                                    if (!this.checkDiamondCost("国家热情", payCost)) {
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
                // auto donate
                var alreadyNum = 10 - data.donate_role_max / 1000000;
                var donateNum = (data.donate_role_max < data.donate_max ? data.donate_role_max : data.donate_max) / 1000000;
                donateNum = (donateNum < (config.donateMax - alreadyNum) ? donateNum : (config.donateMax - alreadyNum));
                if (donateNum > 0) {
                    var data_goddess = yield this.sendMsg("League", "getGoddess", null, next);
                    if (data_goddess && data_goddess.list) {
                        var goddessData = {};
                        for (var i in data_goddess.list) {
                            var goddess = data_goddess.list[i];
                            goddessData[goddess.id] = goddess;
                        }
                        var donateOrder = [1, 4, 5, 2, 6, 3];
                        for (var i = 0; i < donateOrder.length; ++i) {
                            var id = donateOrder[i];
                            var goddess = goddessData[id];
                            if (goddess.level < Database.goddessMaxLevel()) {
                                this.log("donate for goddess", id);
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
                }
                if (this.validator.checkDaily("autoLeague")) {
                    // auto gift
                    if (data.is_gift == 0) {
                        var data_gift = yield this.sendMsg("League", "gift", null, next);
                    }
                    // auto golory
                    var data_glory = yield this.sendMsg("League", "gloryDaily", null, next);
                }
            }
            return safe(done)({
                success: true,
            });
        }, this);
    },
    autoLeaguewar:function(config, done) {
        var next = coroutine(function*() {
            // league war
            var currHour = new Date().getHours();
            if (!((currHour >= 10 && currHour <= 12) || (currHour >= 17 && currHour <= 19))) {
                return safe(done)({});
            }
            var data = yield this.sendMsg("League", "getWarInfo", null, next);
            if (!data || !data.map) {
                return safe(done)({});
            }
            if (data.auto == 1) {
                var data_stop = yield this.sendMsg("League", "stopAutoWar", null, next);
            }

            var fightNum = data.num;
            var superVal = data.super;
            if (data.agree == 1) {
                var data_agree = yield this.sendMsg("League", "agree", null, next);
                if (data_agree) {
                    fightNum = data_agree.num;
                }
            }

            var FightEnd = () => {
                return fightNum == 0 && superVal < 100;
            };
            if (FightEnd()) {
                return safe(done)({});
            }

            var ourPos = this.gameInfo.league;
            var target = (config.target == ourPos ? 0 : config.target);
            var GetWarCity = (data) => {
                var warCity = null;
                var minScore = 1000000000;
                for (var i = 0; i < data.map.length; ++i) {
                    var city = data.map[i];
                    if (city.status == 1 && (ourPos == city.defend || ourPos == city.attack)) {
                        var ourScore = 0;
                        var enemyPos = 0;
                        var enemyScore = 0;
                        if (ourPos == city.defend) {
                            ourScore = city.defend_kill;
                            enemyPos = city.attack;
                            enemyScore = city.attack_kill;
                        } else if (ourPos == city.attack) {
                            ourScore = city.attack_kill;
                            enemyPos = city.defend;
                            enemyScore = city.defend_kill;
                        }
                        if (enemyPos && (target == 0 || target == enemyPos)) {
                            if (ourScore < minScore) {
                                minScore = ourScore;
                                warCity = {id:city.id};
                            }
                        }
                    }
                }
                return warCity;
            };
            var warCity = GetWarCity(data);
            if (!warCity) {
                return safe(done)({});
            }

            yield this.readAllItems(next);
            var faceCount = this.getItemCount("league_war_horn");
            var faceUse = (config.face > 200 ? 200 : config.face);
            var used = (data.morale - 100) / 20;
            var faceToUse = (faceUse - used);
            if (faceToUse > 0 && !config.faceForce) {
                faceToUse = (faceToUse > faceCount ? faceCount : faceToUse);
            }
            for (var i = 0; i < faceToUse; ++i) {
                if (!this.checkDiamondEnough("国战笑脸")) {
                    break;
                }
                var inspireCost = (i < faceCount ? 0 : 20);
                var data_inspire = yield this.sendMsg("League", "inspire", null, next);
                if (!data_inspire) {
                    break;
                }
                if (!this.checkDiamondCost("国战笑脸", inspireCost)) {
                    break;
                }
            }

            var data_enter = yield this.sendMsg("League", "enterWar", {id: warCity.id, league: ourPos}, next);
            if (!data_enter) {
                return safe(done)({});
            }
            var gloryUpVal = 0;
            var ckey = this.regMsg("League", "gloryUp", () => {
                gloryUpVal = 5;
            });
            var updateFight = (data_fight) => {
                superVal = data_fight.super;
                fightNum = data_fight.num + gloryUpVal;
                gloryUpVal = 0;
            };
            var flagNum = 0;
            if (config.useFlag) {
                yield this.readAllItems(next);
                flagNum = this.getItemCount("league_war_life");
            }

            var fightCount = 0;
            var stateBatch = false;
            while (!FightEnd()) {
                // fire base num
                if (fightNum > 0) {
                    var batch = ((stateBatch && fightNum + flagNum > 10) ? 1 : 0);
                    var data_combat = yield this.sendMsg("League", "combatWar", { batch:batch, id:warCity.id }, next);
                    if (!data_combat) {
                        break;
                    }
                    stateBatch = data_combat.type != 0;
                    updateFight(data_combat);
                    if (data_combat.type == 3 || (data_combat.type == 4 && config.gold70)) {
                        var data_event = yield this.sendMsg("League", "event", { id:warCity.id, choose:1 }, next);
                        // data_event.success == 1
                    } else if (data_combat.type != 0) {
                        var data_event = yield this.sendMsg("League", "event", { id:warCity.id, choose:0 }, next);
                        // Dont care result
                    }
                } else if (superVal >= 100) {
                    var data_super = yield this.sendMsg("League", "superWar", { id:warCity.id }, next);
                    if (!data_super) {
                        break;
                    }
                    updateFight({ num: fightNum, super: data_super.super});
                }

                // re-select a lower score city
                if (!FightEnd() && fightCount++ % 5 == 4) {
                    var data_again = yield this.sendMsg("League", "getWarInfo", null, next);
                    if (data_again && data_again.map) {
                        var warCity_again = GetWarCity(data_again);
                        if (warCity_again.id != warCity.id) {
                            warCity = warCity_again;
                            var data_enter = yield this.sendMsg("League", "enterWar", {id: warCity.id, league: ourPos}, next);
                            if (!data_enter) {
                                break;
                            }
                        }
                    }
                }
            }
            this.unregMsg(ckey);

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
                var data_like = yield this.sendMsg("UnionRace", "agree", null, next);
                if (this.validator.checkDaily("autoUnion")) {
                    // auto thumb
                    var data_like = yield this.sendMsg("Union", "like", { unionid: data.id }, next);
                    var data_like = yield this.sendMsg("UnionWar", "agree", null, next);
                }

                // auto donate
                var data_home = yield this.sendMsg("Union", "home", null, next);
                if (!data_home || !data_home.shop) {
                    this.log("Union home failed!", data_home);
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
                            if (!data_donate) {
                                break;
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
    arenaPointCost: [0, 200, 600, 1400, 3000, 4600, 4600],
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
                if (new Date().getHours() < 12) {
                    var boxUsed = data.box_num;
                    var arenaPointUsed = (boxUsed <= 6 ? this.arenaPointCost[boxUsed] : 4600 + 1600 * (boxUsed - 6 - Math.floor((boxUsed - 6) / 5)));
                    var boxMax = (config.boxMax > 26 ? 26 : config.boxMax);
                    var restArenaPoint = this.gameInfo.arenaPoint + arenaPointUsed;
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
                    for (var i = boxUsed; i < boxNum; ++i) {
                        var data_box = yield this.sendMsg("Arena", "box", null, next);
                        if (!data_box) {
                            this.log("box failed", boxMax, boxNum, restArenaPoint);
                            break;
                        }
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
                    var findFightableItem = (data_arena) => {
                        for (var i = data_arena.list.length - 1; i >= 0; --i) {
                            var item = data_arena.list[i];
                            if (item.rank < data.rank) {
                                break;
                            }
                            if (this.gameInfo.power >= item.cpi) {
                                return item;
                            }
                        }
                        return null;
                    };
                    var fightItem = findFightableItem(data);
                    if (!fightItem) {
                        var data_refresh = yield this.sendMsg("Arena", "refresh", null, next);
                        if (data_refresh && data_refresh.list) {
                            fightItem = findFightableItem(data_refresh);
                        }
                    }
                    if (fightItem) {
                        for (var i = data.fight_num; i < fightMax; ++i) {
                            if (!this.checkDiamondEnough("竞技场打人")) {
                                break;
                            }
                            var fightCost = (i < 10 ? 0 : (i < 15 ? 20 : 50));
                            var data_fight = yield this.sendMsg("Arena", "fight", { data: fightItem.uid }, next);
                            if (!data_fight) {
                                this.log("fight failed", data.list.length, fightItem);
                                break;
                            }
                            if (!this.checkDiamondCost("竞技场打人", fightCost)) {
                                break;
                            }
                        }
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
                if (this.validator.checkDaily("autoArena")) {
                    // auto like
                    if (data.like == 0) {
                        var data_rank = yield this.sendMsg("Arena", "getrank", null, next);
                        if (data_rank && data_rank.list) {
                            var data_like = yield this.sendMsg("Arena", "like", { id:data_rank.list[0].uid }, next);
                        }
                    }
                }
            }
            return safe(done)({
                success: true,
            });
        }, this);
    },
    autoRich:function(config, done) {
        var next = coroutine(function*() {
            if (this.validator.checkHourly("autoRich")) {
                var data = yield this.sendMsg("Rich", "getinfo", null, next);
                if (!data || !data.list) {
                    return safe(done)({});
                }

                // auto sweep
                if (config.sweep && this.gameInfo.vip >= 3 && data.id <= data.maxid && data.num >= 15) {
                    var data_sweep = yield this.sendMsg("Rich", "sweep", {id:data.id, num:data.num}, next);
                }
            }
            return safe(done)({
                success: true,
            });
        }, this);
    },
    equipTitles: { "1":"武具", "2":"防具", "3":"饰品" },
    autoConsume:function(config, done) {
        var next = coroutine(function*() {
            if (this.validator.checkHourly("autoConsume")) {
                yield this.readAllItems(next);
                // Use items
                var hasItems = true;
                while ((config.useItem || config.mergeItem) && hasItems && this.itemsInfo) {
                    hasItems = false;
                    for (var itemName in this.itemsInfo) {
                        var itemData = this.itemsInfo[itemName];
                        var itemInfo = Database.itemInfo(itemName);
                        if (!itemInfo) {
                            this.log("Non-existing item id '{0}'".format(itemName));
                        } else {
                            if (config.useItem && itemInfo.use && itemData.count > 0) {
                                this.log("--- using item", itemName, itemInfo, itemData);
                                hasItems = true;
                                var itemDetails = clone(itemData.details);
                                for (var i = 0; i < itemDetails.length; ++i) {
                                    var detail = itemDetails[i];
                                    var data_use = yield this.sendMsg("RoleItem", "use", detail, next);
                                    if (!data_use) {
                                        hasItems = false;
                                        this.log("using item failed, id '{0}'".format(itemName));
                                        break;
                                    }
                                }
                            } else if (config.mergeItem && itemInfo.piece && itemData.count >= itemInfo.piece) {
                                this.log("--- merge item", itemName, itemInfo, itemData);
                                hasItems = true;
                                var data_merge = yield this.sendMsg("RoleItem", "merge", {itemid:itemName}, next);
                                if (!data_merge) {
                                    hasItems = false;
                                }
                            }
                        }
                    }
                }
                // 契约之门
                if (config.tavern && this.getItemCount("summon_book") >= 8) {
                    while (this.getItemCount("summon_book") >= 8) {
                        this.log("using summon_book", this.getItemCount("summon_book"));
                        var data_start = yield this.sendMsg("Tavern", "start", {type:1,batch:1}, next);
                        if (!data_start) {
                            break;
                        }
                    }
                }
                // 专精
                if (config.updateWeapon) {
                    var weaponUpdateCounts = {
                        "1":this.getItemCount("master_scroll_1"),
                        "2":this.getItemCount("master_scroll_2"),
                        "3":this.getItemCount("master_scroll_3"),
                        "4":this.getItemCount("master_scroll_4"),
                        "5":this.getItemCount("master_scroll_5"),
                    };
                    var data = yield this.sendMsg("RoleTeam", "getWeaponTypes", null, next);
                    if (data && data.list) {
                        for (var i = 0; i < data.list.length; ++i) {
                            var item = data.list[i];
                            var weaponNumber = weaponUpdateCounts[item.type];
                            var total = Database.weaponUpdateCount(item.level, weaponNumber);
                            if (total > 0) {
                                this.log("weapon update", item.type, item.level, weaponNumber, total);
                            }
                            for (var j = 0; j < total; ++j) {
                                var data_up = yield this.sendMsg("RoleTeam", "upWeaponType", {type:item.type}, next);
                                if (!data_up) {
                                    break;
                                }
                            }
                        }
                    }
                }
                // 每日100食物
                var toEat = null;
                var foodNames = Database.allFoods();
                for (var i = 0; i < foodNames.length; ++i) {
                    var foodName = foodNames[i];
                    if (this.getItemCount(foodName) >= 100) {
                        toEat = foodName;
                        break;
                    }
                }
                if (config.dailyFeed && toEat && this.validator.checkDaily("autoDailyFeed")) {
                    var data = yield this.sendMsg("RoleHero", "getHeros", null, next);
                    if (data && data.list) {
                        for (var pid in data.list) {
                            var heroData = data.list[pid];
                            var upgrade_level = heroData.upgrade_level || 0;
                            if (heroData.level >= (upgrade_level + 1) * 60) {
                                continue;
                            }
                            var data_set = yield this.sendMsg("RoleHero", "addexp", {pid:pid, sysid:toEat, num:100}, next);
                            if (data_set) {
                                this.log("eat food '{0}' for {1}".format(toEat, heroData.name));
                                break;
                            }
                        }
                    }
                }
                // 每日打造3次装备
                if (config.dailyMerge && this.validator.checkDaily("autoDailyMerge")) {
                    var roleLevel = this.gameInfo.level;
                    var baseLevel = (roleLevel <= 120 ? 1 : (roleLevel <= 200 ? 2 : (roleLevel <= 260 ? 3 : 4)));
                    for (var type = 1; type <= 3; ++type) {
                        for (var level = baseLevel; level >= 1; --level) {
                            var data_compose = yield this.sendMsg("RoleMerge", "compose", {type:type, level:level, luckly:0}, next);
                            if (data_compose) {
                                break;
                            }
                        }
                    }
                }
                // 30次打造任务
                // this.validator.checkDaily("autoDaily30Merge")
                var equipStone = this.getItemCount("equip_compose_4_extra");
                var equipMetal = this.getItemCount("equip_compose_4_any");
                if (config.mergeTask && this.gameInfo.level > 260 && this.gameInfo.serverDay > 45 && equipMetal >= 300) {
                    // check for current counts
                    var data = yield this.sendMsg("ActSplendid", "getinfo", null, next);
                    if (data && data.list) {
                        var equipMerge = null;
                        for (var i = 0; i < data.list.length; ++i) {
                            var item = data.list[i];
                            if (item.short == "超级打造") {
                                equipMerge = item;
                                break;
                            }
                        }
                        if (equipMerge && equipMerge.box) {
                            this.log("30 times equip hasMagicGirl - ", this.gameInfo.hasMagicGirl);
                            var equipCounts = {};
                            for (var type = 1; type <= 3; ++type) {
                                var name = this.equipTitles[type];
                                for (var i = 0; i < equipMerge.box.length; ++i) {
                                    var item = equipMerge.box[i];
                                    if (item.desc.indexOf(name) >= 0 && item.num < item.max) {
                                        equipCounts[type] = 30 - item.num;
                                        equipCounts[type] = (equipCounts[type] < 0 ? 0 : equipCounts[type]);
                                        break;
                                    }
                                }
                            }
                            this.log("equip merge counts", equipCounts);
                            var typeOrder = [
                                config.mergeOrder1 || 3,
                                config.mergeOrder2 || 1,
                                config.mergeOrder3 || 2,
                            ];
                            var nextType = (t) => { return t % 3 + 1; };
                            if (typeOrder[1] == typeOrder[0]) {
                                typeOrder[1] = nextType(typeOrder[1]);
                                if (typeOrder[1] == typeOrder[2]) {
                                    typeOrder[1] = nextType(typeOrder[1]);
                                }
                            }
                            if (typeOrder[2] == typeOrder[0] || typeOrder[2] == typeOrder[1]) {
                                typeOrder[2] = nextType(typeOrder[2]);
                                if (typeOrder[2] == typeOrder[0] || typeOrder[2] == typeOrder[1]) {
                                    typeOrder[2] = nextType(typeOrder[2]);
                                }
                            }
                            for (var i = 0; i < typeOrder.length; ++i) {
                                var type = typeOrder[i];
                                if (equipCounts[type]) {
                                    for (var j = 0; j < equipCounts[type]; ++j) {
                                        if (equipMetal < 10) {
                                            break;
                                        }
                                        var req_compose = {type:type, level:4, luckly:(equipStone >= 5)};
                                        var data_compose = yield this.sendMsg("RoleMerge", "compose", req_compose, next);
                                        if (!data_compose) {
                                            break;
                                        }
                                        equipMetal -= 10;
                                        equipStone -= 5;
                                    }
                                }
                            }
                        }
                    }
                }
                // 分解
                if (config.decompose > 0) {
                    var maxDecompose = (config.decompose > 6 ? 6 : config.decompose);
                    var types = [];
                    for (var i = 1; i <= maxDecompose; ++i) {
                        types.push(String(i));
                    }
                    var typeStr = types.join(",");
                    var data_decompose = yield this.sendMsg("RoleMerge", "decompose", {type:0,value:typeStr,op:1}, next);
                }
                // 勇者合成
                var maxMergeLevel = (config.roleMerge > 7 ? 7 : config.roleMerge);
                if (maxMergeLevel >= 1) {
                    // 上羁绊
                    var collectCheck = (done) => { later(done); };
                    if (config.roleCollect) {
                        collectCheck = (done) => {
                            var tnext = coroutine(function*() {
                                var data = yield this.sendMsg("Collect", "getinfo", null, tnext);
                                if (data && data.list) {
                                    for (var itemName in this.itemsInfo) {
                                        var itemData = this.itemsInfo[itemName];
                                        if (itemData.count == 0) {
                                            continue;
                                        }
                                        var heroInfo = Database.heroCardInfo(itemName);
                                        if (!heroInfo || heroInfo.level > maxMergeLevel) {
                                            continue;
                                        }
                                        var collectInfo = Database.heroCollectInfo(itemName);
                                        if (!collectInfo) {
                                            continue;
                                        }
                                        var currCollect = data.list[collectInfo.collect];
                                        if (!currCollect || !currCollect[collectInfo.pos]) {
                                            var data_set = yield this.sendMsg("Collect", "set", {type:1, id:collectInfo.collect, pos:collectInfo.pos}, tnext);
                                            if (!data_set) {
                                                break;
                                            }
                                            this.log("collecting heros", itemName, currCollect, collectInfo);
                                        }
                                    }
                                }
                                safe(done)();
                            }, this);
                        };
                        yield collectCheck(next);
                    }
                    for (var level = 1; level <= maxMergeLevel; ++level) {
                        var heros = [];
                        var heroNames = [];
                        for (var itemName in this.itemsInfo) {
                            var itemData = this.itemsInfo[itemName];
                            if (itemData.count == 0) {
                                continue;
                            }
                            var heroInfo = Database.heroCardInfo(itemName);
                            if (!heroInfo || heroInfo.level != level) {
                                continue;
                            }
                            //this.log("enumerating heros:", heroInfo, "num:", itemData.details.length);
                            for (var i = 0; i < itemData.details.length; ++i) {
                                var detail = itemData.details[i];
                                heros.push(detail.id);
                                heroNames.push(itemName);
                                if (detail.num != 1) {
                                    this.log("============ hero card >1 detected ===============", itemName, detail);
                                }
                            }
                        }
                        var hasMerging = false;
                        var mergeNames = [];
                        var id_arr = [];
                        for (var i = 0; i < heros.length; ++i) {
                            mergeNames.push(heroNames[i]);
                            id_arr.push(String(heros[i]));
                            if (id_arr.length == 5) {
                                this.log("merging heros", level, mergeNames);
                                var id_str = id_arr.join(",");
                                var data_merge = yield this.sendMsg("RoleMerge", "hero", {data:id_str}, next);
                                if (!data_merge) {
                                    break;
                                }
                                hasMerging = true;
                                id_arr = [];
                                mergeNames = [];
                            }
                        }

                        // check for merged heros
                        if (hasMerging) {
                            yield collectCheck(next);
                        }
                    }
                }
            }
            return safe(done)({
                success: true,
            });
        }, this);
    },
    autoXReward:function(config, done) {
        var next = coroutine(function*() {
            if (this.gameInfo.hasXReward && this.validator.checkHourly("autoXReward")) {
                // 暗金活动
                var data = yield this.sendMsg("ActGoldSign", "getinfo", null, next);
                if (data && data.active) {
                    for (var i = 0; i < data.sign.length; ++i) {
                        var signItem = data.sign[i];
                        if (signItem.state == 1 || signItem.state == 2) {
                            var data_sign = yield this.sendMsg("ActGoldSign", "sign", {day:signItem.day}, next);
                            if (!data_sign) {
                                this.log("ActGoldSign sign failed", i);
                            }
                        }
                    }
                    for (var i = 0; i < data.active.length; ++i) {
                        var actItem = data.active[i];
                        if (actItem.state == 1) {
                            var data_gift = yield this.sendMsg("ActGoldSign", "gift", {int:actItem.id}, next);
                            if (!data_gift) {
                                this.log("ActGoldSign gift failed", i);
                            }
                        }
                    }
                    var wish_num = (data.wish_num ? data.wish_num : 0);
                    for (var i = wish_num; i < config.xwish; ++i) {
                        var data_wish = yield this.sendMsg("ActGoldSign", "wish", null, next);
                        if (!data_wish) {
                            this.log("ActGoldSign wish failed", i);
                            break;
                        }
                    }
                }
            }
            if (config.xcoin > 0 && this.validator.checkHourly("consumeXCoin")) {
                var data = yield this.sendMsg("ActGoldSign", "shop", null, next);
                if (data && data.list) {
                    for (var i = 0; i < data.list.length; ++i) {
                        var item = data.list[i];
                        if (item.res.indexOf("x_coin") >= 0) {
                            var buy_max = (config.xcoin > item.max ? item.max : config.xcoin);
                            for (var j = item.num; j < buy_max; ++j) {
                                if (!this.checkDiamondEnough("暗金币")) {
                                    break;
                                }
                                var data_exchange = yield this.sendMsg("ActGoldSign", "exchange", {id:item.id}, next);
                                if (!data_exchange) {
                                    this.log("ActGoldSign", "exchange", "failed", j);
                                    break;
                                }
                                if (!this.checkDiamondCost("暗金币", 200)) {
                                    break;
                                }
                            }
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
    autoReward:function(config, done) {
        var next = coroutine(function*() {
            // 帝国战每日奖励
            if (config.kingwarDaily && this.validator.checkHourly("autoKingwarDaily")) {
                var data = yield this.sendMsg("KingWar", "gift", null, next);
                if (data && data.daily) {
                    if (data.done == 0) {
                        var data_daily = yield this.sendMsg("KingWar", "dailyGift", null, next);
                    }
                    for (var i = 0; i < data.luckcard.length; ++i) {
                        var card = data.luckcard[i];
                        if (card.state == 1) {
                            var data_luckCard = yield this.sendMsg("KingWar", "luckCardGift", {id: card.id}, next);
                            if (!data_luckCard) {
                                break;
                            }
                        }
                    }
                }
            }
            // 帝国战排名奖励
            if (config.kingwarRank && this.validator.checkHourly("autoKingwarRank")) {
                for (var i = 1; i <= 3; ++i) {
                    var data_rank = yield this.sendMsg("KingWar", "areaRank", {areaid:i}, next);
                    if (data_rank && data_rank.state == 1) {
                        var data_fetch = yield this.sendMsg("KingWar", "fetchAreaRes", {areaid:i}, next);
                        if (!data_fetch) {
                            break;
                        }
                    }
                }
                var data_emperor = yield this.sendMsg("KingWar", "emperorRank", null, next);
                if (data_emperor && data_emperor.state == 1) {
                    var data_fetch = yield this.sendMsg("KingWar", "fetchEmperorRes", null, next);
                }
            }
            // 招财猫
            if (config.nekoMax > 0 && this.validator.checkHourly("autoNeko")) {
                var data = yield this.sendMsg("ActNeko", "getinfo", null, next);
                if (data && typeof(data.num) == "number") {
                    var nekoNum = (config.nekoMax > 10 ? 10 : config.nekoMax);
                    for (var i = data.num; i < nekoNum; ++i) {
                        if (!this.checkDiamondEnough("招财猫")) {
                            break;
                        }
                        var nekoCost = (i < 1 ? 0 : (i < 4 ? 20 : 50));
                        var data_neko = yield this.sendMsg("ActNeko", "knock", null, next);
                        if (!data_neko) {
                            break;
                        }
                        if (!this.checkDiamondCost("招财猫", nekoCost)) {
                            break;
                        }
                    }
                }
            }
            // 分享获得钻石
            if (config.shareAchievement && this.validator.checkHourly("autoShareAchievement")) {
                var hasShare = true;
                while (hasShare) {
                    hasShare = false;
                    var data = yield this.sendMsg("ActShare", "getinfo", null, next);
                    if (data && data.list) {
                        for (var i = 0; i < data.list.length; ++i) {
                            var item = data.list[i];
                            if (item.state == 1) {
                                var data_reward = yield this.sendMsg("ActShare", "reward", {id:item.id}, next);
                                if (!data_reward) {
                                    break;
                                }
                                hasShare = true;
                            }
                        }
                    }
                }
            }
            if (config.shareWeekly && this.validator.checkHourly("autoShareWeekly")) {
                var data = yield this.sendMsg("ActShare", "getinfo2", null, next);
                if (data && data.day == 0) {
                    var data_reward = yield this.sendMsg("ActShare", "reward2", null, next);
                }
            }
            // 活跃日历
            if (config.actDaily && this.validator.checkHourly("autoActDaily")) {
                var data = yield this.sendMsg("ActActive", "getinfo", null, next);
                if (data && data.list) {
                    for (var i = 0; i < data.list.length; ++i) {
                        var item = data.list[i];
                        if (item.num >= item.max) {
                            var data_reward = yield this.sendMsg("ActActive", "reward", { id:item.id }, next);
                            if (!data_reward) {
                                break;
                            }
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
                        if (!data_box) {
                            break;
                        }
                    }
                }
            }
            // 任务
            if (config.quest && this.validator.checkHourly("autoQuest")) {
                var hasQuest = true;
                while(hasQuest) {
                    hasQuest = false;
                    var data = yield this.sendMsg("Quest", "getinfo", null, next);
                    if (data && data.list) {
                        for (var id in data.list) {
                            var item = data.list[id];
                            if (item.state == 1) {
                                var data_quest = yield this.sendMsg("Quest", "done", {id:id}, next);
                                if (!data_quest) {
                                    break;
                                }
                                hasQuest = true;
                            }
                        }
                    }
                }
            }
            // 勇者传记(新勇者礼物)
            if (config.heroGift && this.validator.checkHourly("autoHeroGift")) {
                var data = yield this.sendMsg("RoleScout", "getHeroNews", null, next);
                if (data && data.list) {
                    for (var i = 0; i < data.list.length; ++i) {
                        var heroId = data.list[i];
                        var data_reward = yield this.sendMsg("RoleScout", "getHeroReward", {id:heroId}, next);
                        if (!data_reward) {
                            break;
                        }
                    }
                }
            }
            // 福利活动
            if (config.splendid && this.validator.checkHourly("autoSplendid")) {
                var data = yield this.sendMsg("ActSplendid", "getinfo", null, next);
                if (data && data.list) {
                    for (var i = 0; i < data.list.length; ++i) {
                        var splendidItem = data.list[i];
                        for (var j = 0; j < splendidItem.box.length; ++j) {
                            var boxItem = splendidItem.box[j];
                            if (boxItem.num >= boxItem.max && boxItem.done == 0) {
                                var data_reward = yield this.sendMsg("ActSplendid", "reward", { actid: splendidItem.id, boxid: boxItem.id }, next);
                                if (!data_reward) {
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            // 勇者餐馆
            if (config.meal && this.validator.checkHourly("autoMeal")) {
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
                            if (!data_reward) {
                                break;
                            }
                        }
                    }
                }
            }
            return safe(done)({
                success: true,
            });
        }, this);
    },
    autoWorldWar:function(config, done) {
        var next = coroutine(function*() {
            // 制作符文
            if (config.worldShop && this.validator.checkHourly("autoWorldShop")) {
                var data = yield this.sendMsg("WorldWar", "workshop", null, next);
                if (data && data.list) {
                    var usedSlots = {};
                    for (var i = 0; i < data.list.length; ++i) {
                        var slotNum = data.max;
                        var item = data.list[i];
                        if (item.done == 1) {
                            var data_pick = yield this.sendMsg("WorldWar", "pickRune", { slot:item.slot }, next);
                            if (!data_pick) {
                                break;
                            }
                        } else if (item.done == 0) {
                            slotNum--;
                            usedSlots[item.slot] = true;
                        }
                    }
                    var make_type = config.runeType;
                    var make_cost = slotNum * (make_type == 1 ? 1000 : 5000);
                    if (this.gameInfo.sourceWater >= make_cost && this.gameInfo.sourceFire >= make_cost && this.gameInfo.sourceWood >= make_cost) {
                        for (var slot = 1; slot <= data.max; ++slot) {
                            if (!usedSlots[slot]) {
                                var data_make = yield this.sendMsg("WorldWar", "makeRune", { slot:slot, type:make_type }, next);
                                if (!data_make) {
                                    break;
                                }
                            }
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
            //var data = yield this.sendMsg("ActCatchup", "info", null, next); // 后来居上
            //var data = yield this.sendMsg("ActRank", "getinfo", null, next); // 排名
            //var data = yield this.sendMsg("League", "getPosList", null, next); // 国家玩家列表
            //var data = yield this.sendMsg("KingWar", "getAreaRes", null, next); // 帝国战获取奖励列表
            //var data = yield this.sendMsg("UnionRace", "getinfo", null, next); // 比武大会
            //var data = yield this.sendMsg("Role", "quick", null, next); // 活跃日历日常面板
            //var data = yield this.sendMsg("League", "startAutoWar", null, next); // 开启自动挂机
            //var data = yield this.sendMsg("League", "stopAutoWar", null, next); // 关闭自动挂机
            //var data = yield this.sendMsg("Comment", "getCount", {id:80005}, next); // 勇者评论数目 {count:5}
            //var data = yield this.sendMsg("UnionWar", "cardlog", null, next); // 查看卡牌列表
            //var data = yield this.sendMsg("UnionWar", "ahead", null, next); // 查看名次信息
            //var data = yield this.sendMsg("UnionWar", "refreshCard", null, next); // 刷新可用卡牌
            //var data = yield this.sendMsg("Tavern", "getlog", {ids:"50016,60018,70041"}, next); // 可兑换勇者的状态
            //var data = yield this.sendMsg("RoleMerge", "composeInfo", null, next); // 打造幸运条
            //var data = yield this.sendMsg("RoleMerge", "info", null, next); // 勇者刷新状态

            //var data = yield this.sendMsg("KingWar", "getEmperorRaceInfo", null, next); //皇帝战
            //var data = yield this.sendMsg("KingWar", "getRaceInfo", null, next); //皇帝战
            //var data = yield this.sendMsg("RoleMerge", "decompose", {type:0,value:"1,2,3,4",op:1}, next); // 分解

            //var data = yield this.sendMsg("RoleHero", "getHeros", null, next); // 勇者阵容
            //var data = yield this.sendMsg("RoleHero", "sethero", {pos:1,pid:95328}, next); // 换位置
            //var data = yield this.sendMsg("RoleWake", "getinfo", null, next);
            //var data = yield this.sendMsg("Collect", "getinfo", null, next);
            //var data = yield this.sendMsg("League", "getinfo", null, next);
            //var data = yield this.sendMsg("Arena", "getinfo", null, next);
            //var data = yield this.sendMsg("ActSplendid", "getinfo", null, next);
            //var data = yield this.sendMsg("ActMagicalGirl", "getinfo", null, next);
            //var data = yield this.sendMsg("ActMagicalGirl", "fire", {level:1}, next);

            //var data = yield this.sendMsg("WorldWar", "tips", null, next);
            //var data = yield this.sendMsg("WorldWar", "getChatList", null, next);
            var data = yield this.sendMsg("WorldWar", "getinfo", null, next);
            //var data = yield this.sendMsg("WorldWar", "warlist", null, next);
            //var data = yield this.sendMsg("WorldWar", "getMarkList", null, next);
            //var data = yield this.sendMsg("WorldWar", "income", null, next);
            //var data = yield this.sendMsg("WorldWar", "tech", null, next);
            //var data = yield this.sendMsg("WorldWar", "workshop", null, next);
            //var data = yield this.sendMsg("WorldWar", "pickRune", {slot:4}, next);
            //var data = yield this.sendMsg("WorldWar", "makeRune", {slot:4, type:2}, next);

            console.log(data);
            yield $FileManager.saveFile("/../20170925_yongzhe_hack/recvdata.json", JSON.stringify(data), next);
            //yield $FileManager.saveFile("/../20170925_yongzhe_hack/recvdata.json", JSON.stringify(data, null, 2), next);
            return safe(done)();
        }, this);
    },

    // private
    log:function() {
        var appendArgs = (this.gameInfo ? [">> Player -", this.gameInfo.name] : [">> Username -", this.username]);
        console.log.apply(console, appendArgs.concat(Array.prototype.slice.call(arguments)));
    },
    sendNotify:function(c, m, data, callback, options) {
        if (!this.sock) {
            return later(callback, null);
        }
        GameSock.send(this.sock, c, m, data, options, callback);
    },
    onReceive:function(c, m, data) {
        if (!c || !m) {
            this.quit();
            this.dispatchKicks(data);
            return;
        }
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
    sendMsg:function(c, m, data, callback, options) {
        if (!this.sock) {
            return later(callback, null);
        }
        var kickKey = this.regKick(() => {
            this.log("reply null by kick!", c, m, data);
            safe(callback)(null);
        });
        var key = c + "." + m;
        var callbackArray = this.recvCallbacks[key];
        callbackArray = (callbackArray ? callbackArray : []);
        callbackArray.push((data) => {
            this.unregKick(kickKey);
            safe(callback)(data);
        });
        this.recvCallbacks[key] = callbackArray;
        GameSock.send(this.sock, c, m, data, options);
    },
    onCommonMsg:function(c, m, data) {
        var key = c + "." + m;
        var callbackArray = clone(this.commonCallbacks[key]);
        if (callbackArray && callbackArray.length > 0) {
            for (var i = 0; i < callbackArray.length; ++i) {
                callbackArray[i](data);
            }
        } else {
            this.log("untracked msg", "c:", c, "m:", m, "data:", data);
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
    regKick:function(callback) {
        var kickKey = rkey();
        while(this.kickCallbacks[kickKey]) { kickKey = rkey(); }
        this.kickCallbacks[kickKey] = callback;
        return kickKey;
    },
    unregKick:function(kickKey) {
        if (this.kickCallbacks[kickKey]) {
            delete this.kickCallbacks[kickKey];
        }
    },
    dispatchKicks:function(data) {
        var kickCallbacks = this.kickCallbacks;
        this.kickCallbacks = [];
        for (var kickKey in kickCallbacks) {
            safe(kickCallbacks[kickKey])(data);
        }
        safe(this.events["break"])();
    },
    registerMessages:function() {
        this.regMsg("MsgBox", "message", (data) => {});
        this.regMsg("Chat", "msg", (data) => {});
        this.regMsg("Role", "kick", (data) => {
            this.log("User Kicked!");
            this.quit();
            this.dispatchKicks(data);
        });
        this.regMsg("RoleScout", "notify", (data) => {
            console.log("RoleScout_notify", data);
        }); // {first: [ 13002 ]}
        this.regMsg("UnionRace", "notify", (data) => {});
        this.regMsg("UnionWar", "kill", (data) => {});
        this.regMsg("UnionWar", "sync", (data) => {});
        this.regMsg("UnionWar", "occupy", (data) => {});
        this.regMsg("UnionWar", "leave", (data) => {});
        this.regMsg("League", "warClose", (data) => {}); // notification
        this.regMsg("Combat", "complete", (data) => {}); // show combat
        this.regMsg("RoleExplore", "update", (data) => {}); // notification
        this.regMsg("League", "kill", (data) => {}); // notification
        this.regMsg("League", "updateTop", (data) => {}); // notification
        this.regMsg("League", "joinwar", (data) => {}); // notification
    },
});


var urlRoot = "<%=PageInfo.urlRoot%>";
var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

var dataStorage = null;
var StorageItem = function() {
    if (!dataStorage) {
        try {
            dataStorage = localStorage;
            localStorage.test = "ttt";
            delete localStorage.test;
        } catch(e) {
            dataStorage = {};
        }
    }
    return dataStorage;
}

var tmpsafe = function(){};
var safe = function(callback) {
    return (callback ? callback : tmpsafe);
};
var protToken = null;
var prot = function(callback) {
    if (protToken) {
        console.log("break some operation!");
    }
    var token = { callback: callback };
    protToken = token;
    return function() {
        if (token === protToken) {
            protToken = null;
            safe(callback).apply(this, arguments);
        }
    };
};
var brk = function() {
    if (protToken) {
        console.log("break some operation!");
        protToken = null;
    }
}

var clone = function(obj) {
    var t = (obj instanceof Array ? [] : {});
    for (var k in obj) {
        t[k] = obj[k];
    }
    return t;
}

var deep_clone = function(obj) {
    var t = clone(obj);
    for (var k in obj) {
        if (typeof(obj[k]) == "object") {
            t[k] = deep_clone(obj[k]);
        }
    }
    return t;
}

var sendAjax = function(method, url, postData, callback) {
    var protCallback = prot(callback);
    $.ajax({
        type:method,
        url:url,
        data:(postData ? JSON.stringify(postData) : null),
        success:function(returnData) {
            safe(protCallback)(returnData);
        },
        error:function() {
            safe(protCallback)(null);
        },
    });
};

var sendAjaxJSON = function(method, url, postData, callback) {
    console.log("request", url, postData);
    sendAjax(method, url, postData, function (returnData) {
        var json = null;
        try {
            json = JSON.parse(returnData);
        } catch(e) {
        }
        if (json) {
            console.log("reply", json);
            safe(callback)(json);
        }
    });
};

var requestPost = function (url, postData, callback) {
    sendAjaxJSON("POST", urlRoot + "/" + url, postData, safe(callback));
};

var requestGet = function(url, callback) {
    sendAjaxJSON("GET", urlRoot + "/" + url, null, function(json) {
        // Due to a safari bug, request twice for correct data.
        if (JSON.stringify(json) == "{}") {
            sendAjaxJSON("GET", urlRoot + "/" + url, null, safe(callback));
        } else {
            safe(callback)(json);
        }
    });
};

// template parser
var templates = {
    data: {},
    loading: null,
};
templates.read = function(templateCls) {
    var template = this.data[templateCls];
    if (!template) {
        template = Handlebars.compile($(templateCls).html());
        this.data[templateCls] = template;
    }
    return template;
}
templates.delayLoad = function(templateCls, items, callback) {
    if (items.length <= 0) {
        return callback([]);
    }
    var template = this.read(templateCls);
    $this = this;
    $this.loading = items;
    var result = [];
    var index = 0;
    var load = function() {
        if ($this.loading !== items) {
            return;
        }
        result.push($(template(items[index++])));
        if (index == items.length) {
            $this.loading = null;
            callback(result);
        } else {
            setTimeout(load, 0);
        }
    }
    load(0);
}
templates.cancel = function() {
    this.loading = null;
}

// register unique actions
var unique_click = function(control, callback) {
    control.unbind();
    control.click(callback);
}

// auto adjust size
var adjustPageLayout = function() {
    var topHeight = $(".div_title_bar").innerHeight();
    var subTitle = $(".div_sub_title_bar");
    if (subTitle.length > 0) {
        subTitle.css("top", topHeight);
        topHeight += subTitle.innerHeight();
    }
    $(".div_content_panel").css("top", topHeight);
};

$(function() {
    adjustPageLayout();
    $(window).resize(adjustPageLayout);
});

var usedKeys = {
    "defaultFunc":true,
    "serial":true,
    "showKingwar":true,
    "showQuit":true,
    "hero_upgrade":true,
    "hero_food":true,
    "hero_stone":true,
    "hero_gem":true,
};

// login
function displayLogin() {
    // delete unused old data.
    var storage = StorageItem();
    for (var key in storage) {
        if (!usedKeys[key]) {
            delete storage[key];
        }
    }
    var showLoginState = function(json) {
        var divContentPanel = $(".div_content_panel");
        var state = json.state;
        if (state == 0) {
            divContentPanel.html($(".hd_authorize_request").html());
            var inputName = $(".input_name");
            var divSubmitName = $(".div_submit_name");
            unique_click(divSubmitName, function() {
                var name = inputName.val();
                if (name == "") {
                    alert("必需输入名字");
                    inputName.focus();
                    return;
                }
                inputName.hide();
                divSubmitName.hide();
                requestPost("apply", {name:name}, function(json) {
                    showLoginState(json);
                });
            });
        } else if (state == 1) {
            var waitingTemplate = templates.read(".hd_authorize_waiting");
            divContentPanel.html(waitingTemplate({name:json.name}));
        } else if (state == 2) {
            displayFuncs();
        } else {
            divContentPanel.html("数据错误：" + String(state));
        }
    };
    requestPost("question", {serial:StorageItem().serial}, function(json) {
        if (json.serial) {
            StorageItem().serial = json.serial;
        }
        showLoginState(json);
    });
}

// supported funcs
var displayFuncsModel = {
    supports:{
        //refresh:{name:"更新", click:clickRefresh, },
        kingwar:{name:"帝国战", show:displayKingWar, },
        playerlist:{name:"玩家", show:displayPlayerList, },
        serverInfo:{name:"信息", show:displayServerInfo, },
        automation:{name:"配置", show:displayAutomation, },
        //setting:{name:"设置", },
        users:{name:"用户", show:displayUsers, },
        selfdesc:{name:"✺", show:displaySelf, },
    },
};
displayFuncsModel.get = function(callback){
    $this = this;
    if (!$this.funcs) {
        requestPost("functions", {}, function(json) {
            $this.funcs = json.funcs;
            callback($this.funcs);
        });
    } else {
        callback($this.funcs);
    }
}
displayFuncsModel.show = function(funcKey) {
    var support = this.supports[funcKey];
    console.log("show", support, funcKey);
    if (support && support.show) {
        templates.cancel();
        brk();
        support.show();
        adjustPageLayout();
        return true;
    }
    return false;
}
displayFuncsModel.click = function(funcKey) {
    var support = this.supports[funcKey];
    if (support && support.click) {
        console.log("click", support, funcKey);
        support.click();
        return true;
    }
    return false;
}

// show content
function displayFuncs() {
    var divContentPanel = $(".div_content_panel");
    var waitingTemplate = templates.read(".hd_display_loading");
    divContentPanel.html(waitingTemplate({getting_state: true}));

    var showFuncPanel = function(funcKey) {
        if (displayFuncsModel.show(funcKey)) {
            StorageItem().defaultFunc = funcKey;
        } else {
            divContentPanel.html(waitingTemplate({state_error: true}));
        }
    }

    displayFuncsModel.get(function(funcs) {
        var supportFuncs = [];
        for (var i = 0; i < funcs.length; ++i) {
            var support = displayFuncsModel.supports[funcs[i]];
            if (support) {
                supportFuncs.push({
                    funcKey:funcs[i],
                    funcName:support.name,
                });
            }
        }

        templates.delayLoad(".hd_title_content", supportFuncs, function(titleBlocks) {
            var defaultFunc = (supportFuncs.length > 0 ? supportFuncs[0].funcKey : "");
            var divTitleBar = $(".div_title_bar");
            divTitleBar.html("");
            for (var i = 0; i < titleBlocks.length; ++i) {
                var block = titleBlocks[i];
                block.appendTo(divTitleBar);

                (function(){
                    var funcItem = supportFuncs[i];
                    if (funcItem.funcKey == StorageItem().defaultFunc) {
                        defaultFunc = funcItem.funcKey;
                    }
                    block.click(function() {
                        if (!displayFuncsModel.click(funcItem.funcKey)) {
                            showFuncPanel(funcItem.funcKey);
                        }
                    });
                })();
            }
            showFuncPanel(defaultFunc);
        });
    });
}

function clickRefresh() {
    var refreshState = function() {
        requestPost("checkrefresh", {nexus:true}, function(json) {
            if (json.isRefresh) {
                setTimeout(refreshState, 2000);
            } else {
                window.location.reload();
            }
        });
    };
    var funcKey = StorageItem().defaultFunc;
    requestPost("manrefresh", {integrity:true, func:funcKey}, function(json) {
        if (json.success) {
            setTimeout(refreshState, 1000);
            alert("后台开始更新数据，完成后将会自动刷新!");
        }
    });
}

var playerCommon = {
    areaNames:{
        "1":"黄鹿",
        "2":"玫瑰",
        "3":"咸鱼",
    },
    pamK: 24, // 24 hours to half reduce
};
playerCommon.areaName = function(area) {
    return this.areaNames[String(area)];
}
playerCommon.areaColor = function(area) {
    return (area == 3 ? "display_area_gray" : "display_area_golden");
}
playerCommon.areastarName = function(areastarKey) {
    var area = Math.floor(areastarKey / 100);
    var star = areastarKey % 100;
    if (area < 1 || area > 3 || star < 1 || star > 10) {
        return "";
    }
    return this.areaNames[String(area)] + star + "星";
}
playerCommon.unionColor = function(union) {
    if (union == "s96.火") {
        return "display_player_green";
    }
    var serv = (union ? union.substr(0, 3) : "");
    switch(serv) {
    case "s93":
        return "display_player_blue";
    case "s94":
        return "display_player_orange";
    case "s95":
        return "display_player_red";
    case "s96":
        return "display_player_purple";
    }
    return "";
}
playerCommon.duration = function(lasttime) {
    var time = new Date().getTime();
    var seconds = (time - lasttime) / 1000;

    var pamKsec = this.pamK * 3600;
    var Y = 1;
    if (seconds > 0) {
        Y = pamKsec / (seconds + pamKsec);
    }
    var T = 1 - Y;
    var color = "rgb(" + String(Math.floor(T*255)) + "," + String(Math.floor(Y*255)) + ",0)";

    var desc = "> 7天";
    var quit = false;
    if (seconds < 60) {
        desc = "< 1分钟";
    } else if (seconds < 3600) {
        desc = String(Math.floor(seconds / 60)) + "分钟";
    } else if (seconds < 24 * 3600) {
        desc = String(Math.floor(seconds / 3600)) + "小时";
    } else if (seconds < 2 * 24 * 3600) {
        desc = "1天" + String(Math.floor((seconds - 24 * 3600) / 3600)) + "小时";
    } else if (seconds < 3 * 24 * 3600) {
        desc = "2天" + String(Math.floor((seconds - 2 * 24 * 3600) / 3600)) + "小时";
    } else if (seconds < 7 * 24 * 3600) {
        desc = String(Math.floor(seconds / 3600 / 24)) + "天";
    } else {
        quit = true;
    }

    return {color:color, desc:desc, quit:quit};
}

var displayAutomationModel = {
    servers: ["s96", "s95", "s94", "s93", ],
    levels: ["账号"],
    configProps: [
        {name: "autoSpecial", desc: "全局设置", props: [
            {name: "stopInShort", desc: "白钻低于临界值停止消耗", type: "check"},
            {name: "limitOfShort", desc: "白钻临界值", type: "number", limit: [0, 6], alias:["0", "100", "200", "500", "1000", "2000", "5000"]},
            {name: "tipsInPrivate", desc: "操作失败在私聊频道提醒", type: "check"},
        ]},
        {name: "autoBenefit", desc: "有益无害", props: [
            {name: "sign", desc: "打卡", type: "check"},
            {name: "vip", desc: "三卡", type: "check"},
            {name: "friend", desc: "好友送钻石", type: "check"},
            {name: "email", desc: "邮件", type: "check"},
            {name: "timeGift", desc: "9万福利", type: "check"},
            {name: "tavern", desc: "契约之门", type: "check"},
            {name: "specCard", desc: "特典头像", type: "check"},
            {name: "redpacket", desc: "红包", type: "check"},
            {name: "freehero", desc: "免费勇者", type: "check"},
            {name: "speak", desc: "聊天频道发送'这游戏不错'", type: "check"},
            {name: "herolike", desc: "勇者随机点赞", type: "check"},
        ]},
        {name: "autoForward", desc: "战斗，下一关", props: []},
        {name: "autoGoblin", desc: "地精商店", props: [
            {name: "buyNum", desc: "刷新次数", type: "number", limit: [0, 13]},
            {name: "dungeonDiceGold", desc: "骰子(金币)", type: "number", limit: [0, 3], alias:["不购买", "3折以下", "5折以下", "8折以下"]},
            {name: "dungeonDiceDiamond", desc: "骰子(钻石)", type: "number", limit: [0, 3], alias:["不购买", "3折以下", "5折以下", "8折以下"]},
            {name: "summonBookGold", desc: "契约书(金币)", type: "number", limit: [0, 3], alias:["不购买", "3折以下", "5折以下", "8折以下"]},
            {name: "summonBookDiamond", desc: "契约书(钻石)", type: "number", limit: [0, 3], alias:["不购买", "3折以下", "5折以下", "8折以下"]},
            {name: "heroUpgradeGold", desc: "主角进化卡(金币)", type: "number", limit: [0, 3], alias:["不购买", "3折以下", "5折以下", "8折以下"]},
            {name: "heroUpgradeDiamond", desc: "主角进化卡(钻石)", type: "number", limit: [0, 3], alias:["不购买", "3折以下", "5折以下", "8折以下"]},
        ]},
        {name: "autoMaze", desc: "迷宫", props: [
            {name: "searchNumber0", desc: "每日12点以前迷宫的寻宝次数", type: "number", limit: [0, 13]},
            {name: "searchNumber", desc: "其余每个迷宫的寻宝次数", type: "number", limit: [0, 13]},
            {name: "randwalk", desc: "找个空位来回走20步", type: "check"},
        ]},
        {name: "autoFriendWar", desc: "友谊战", props: [
            {name: "baseInspire", desc: "基础加成", type: "number", limit: [0, 6]},
            {name: "advanceInspire", desc: "补充加成", type: "number", limit: [0, 6]},
            {name: "buyBlueCard", desc: "购买蓝色勇者卡", type: "check"},
        ]},
        {name: "autoLadder", desc: "晋级赛", props: [
            {name: "fightPlayer", desc: "是否攻击战力低的玩家", type: "check"},
            {name: "useCard", desc: "智能放卡", type: "check"},
        ]},
        {name: "autoLeague", desc: "国家", props: [
            {name: "prayNumber", desc: "国家福利次数", type: "number", limit: [3, 23]},
            {name: "donateMax", desc: "女神捐献次数", type: "number", limit: [0, 10]},
            {name: "warPay", desc: "国家热情次数", type: "number", limit: [0, 20]},
        ]},
        {name: "autoLeaguewar", desc: "国战", props: [
            {name: "target", desc: "优先攻击的国家", type: "number", limit: [0, 3], alias: ["无", "风", "火", "水"]},
            {name: "face", desc: "使用笑脸次数", type: "number", limit: [0, 200]},
            {name: "faceForce", desc: "笑脸不够使用白钻", type: "check"},
            {name: "useFlag", desc: "是否使用战斗旗帜补齐10连击", type: "check"},
            {name: "gold70", desc: "是否接受70%的金币", type: "check"},
        ]},
        {name: "autoUnion", desc: "骑士团", props: [
            {name: "donateMax", desc: "贡献次数", type: "number", limit: [0, 10]},
        ]},
        {name: "autoArena", desc: "竞技场", props:[
            {name: "boxMax", desc: "积分兑换次数", type: "number", limit: [3, 26]},
            {name: "buyHeroSoul", desc: "是否购买蓝魂", type: "check"},
            {name: "fightPlayer", desc: "是否攻击战力低的玩家", type: "check"},
            {name: "fightMax", desc: "攻击次数", type: "number", limit: [0, 20]},
        ]},
        {name: "autoRich", desc: "秘境", props:[
            {name: "sweep", desc: "扫荡免费骰子", type: "check"},
        ]},
        {name: "autoConsume", desc: "消耗物品", props: [
            {name: "useItem", desc: "使用物品", type: "check"},
            {name: "mergeItem", desc: "合成物品", type: "check"},
            {name: "tavern", desc: "使用契约书", type: "check"},
            {name: "updateWeapon", desc: "升级专精", type: "check"},
            {name: "dailyFeed", desc: "吃100食物(只对已使用的勇者)", type: "check"},
            {name: "dailyMerge", desc: "3种装备每天各打造1个(不使用龙石)", type: "check"},
            {name: "mergeTask", desc: "超级打造(有任务时打造30次，使用龙石)", type: "check"},
            {name: "mergeOrder1", desc: "打造顺序1号", type: "number", limit:[1, 3], alias:["武具", "防具", "饰品"]},
            {name: "mergeOrder2", desc: "打造顺序2号", type: "number", limit:[1, 3], alias:["武具", "防具", "饰品"]},
            {name: "mergeOrder3", desc: "打造顺序3号", type: "number", limit:[1, 3], alias:["武具", "防具", "饰品"]},
            {name: "decompose", desc: "分解装备", type: "number", limit:[0, 6], alias: [
                "不分解",
                "绿色以下分解",
                "蓝色以下分解",
                "紫色以下分解",
                "橙色以下分解",
                "红色以下分解",
                "金色以下分解",
            ]},
            {name: "roleMerge", desc: "合成勇者", type: "number", limit:[0, 7], alias: [
                "不合成",
                "C级以下合成B级",
                "B级以下合成A级",
                "A级以下合成S级",
                "S级以下合成S+级",
                "S+级以下合成SS级",
                "SS级以下合成SS+级",
                "SS+级以下合成SSS级",
            ]},
            {name: "roleCollect", desc: "对可合成的勇者优先放入羁绊", type: "check"},
        ]},
        {name: "autoXReward", desc: "暗金活动", props:[
            {name: "xwish", desc: "许愿次数", type: "number", limit: [0, 10]},
            {name: "xcoin", desc: "白钻购买暗金币个数", type: "number", limit: [0, 5]},
        ]},
        {name: "autoReward", desc: "领取", props: [
            {name: "kingwarDaily", desc: "帝国战每日奖励", type: "check"},
            {name: "kingwarRank", desc: "帝国战排名奖励", type: "check"},
            {name: "nekoMax", desc: "招财猫次数", type: "number", limit: [0, 10]},
            {name: "shareAchievement", desc: "成就分享", type: "check"},
            {name: "shareWeekly", desc: "7天分享", type: "check"},
            {name: "actDaily", desc: "活跃日历", type: "check"},
            {name: "quest", desc: "任务", type: "check"},
            {name: "heroGift", desc: "新勇者礼物", type: "check"},
            {name: "splendid", desc: "福利活动", type: "check"},
            {name: "meal", desc: "勇者餐馆", type: "check"},
        ]},
    ],
    settingProps: [
        {name: "targeting", desc: "帝国战目标", props:[
            {name: "reachPLID", desc: "追踪玩家", type: "players", isStr: true},
            {name: "disableEmperor", desc: "不追进皇帝战", type: "check"},
            {name: "allowAssign", desc: "允许系统分配", type: "check"},
            {name: "minStar", desc: "最低可接受星级", type: "stars", default:1},
            {name: "forceEmperor", desc: "只加入皇帝战", type: "check"},
        ]},
        {name: "dropping", desc: "帝国战丢卡", props:[
            {name: "allowDrop", desc: "允许自动丢卡", type: "check"},
        ]},
        {name: "heroshop", desc: "共享勇者商店数据", props:[
            {name: "enabled", desc: "启用共享", type: "check"},
            {name: "maxReduce", desc: "该折扣率以下自动预留", type: "number", limit: [50, 60], default:55},
            {name: "refresh", desc: "刷新次数", type: "number", limit: [0, 8]},
        ]},
        {name: "unionwar", desc: "领地战(周日除外)", props:[
            {name: "enabled", desc: "启用领地战", type: "check"},
            {name: "onlyOccupy", desc: "只进入有占领需要的领地", type: "check"},
            {name: "reverseOrder", desc: "从低到高占领(给小号用)", type: "check"},
        ]},
        {name: "kingwar", desc: "帝国战当眼", props:[
            {name: "area", desc: "赛区", type: "number", limit: [0, 3], alias: ["无", "黄鹿", "玫瑰", "咸鱼"]},
            {name: "star", desc: "星级", type: "stars", default:1},
        ]},
        {name: "listing", desc: "列出玩家信息", props:[
            {name: "unionCount", desc: "查看骑士团个数", type: "number", limit: [0, 20]},
            {name: "limitDay", desc: "忽略几天以上不登录的玩家", type: "number", limit: [10, 20], default:20},
        ]},
    ],
};

displayAutomationModel.get = function(callback) {
    $this = this;
    requestPost("listautomation", {}, function(json) {
        $this.accounts = json.accounts;
        $this.players = json.players;
        callback(json);
    });
}
displayAutomationModel.getAllPlayers = function() {
    var players = [];
    for (var i = 0; i < this.accounts.length; ++i) {
        var account = this.accounts[i];
        for (var j = 0; j < account.players.length; ++j) {
            players.push(account.players[j]);
        }
    }
    return players;
}
displayAutomationModel.getPlayerSelections = function() {
    if (!this.selectablePlayers)
    {
        this.selectablePlayers = [
            {value: "", desc: "无目标"}
        ];
        for (var i = 0; i < this.players.length; ++i) {
            var player = this.players[i];
            this.selectablePlayers.push({
                value: player.key,
                desc: player.server + "." + player.uShort + " " + player.name + " " + Math.floor(player.power / 10000) + "万",
            });
        }
    }
    return this.selectablePlayers;
}
displayAutomationModel.getKingwarStars = function() {
    if (!this.allStars) {
        this.allStars = [];
        for (var i = 1; i <= 10; ++i) {
            this.allStars.push({
                value: i,
                desc: String(i) + "星",
            });
        }
    }
    return this.allStars;
}
displayAutomationModel.getValidServers = function(account) {
    var usedServers = {};
    for (var i = 0; i < account.players.length; ++i) {
        var player = account.players[i];
        usedServers[player.server] = true;
    }
    var servers = [];
    for (var i = 0; i < this.servers.length; ++i) {
        var server = this.servers[i];
        if (!usedServers[server]) {
            servers.push({
                name: server,
                desc: server + "服",
            });
        }
    }
    return servers;
}
displayAutomationModel.getMaxPlayer = function(account) {
    var maxPlayer = null;
    var maxPower = 0;
    for (var i = 0; i < account.players.length; ++i) {
        var player = account.players[i];
        if (player.name && player.power && player.power > maxPower) {
            maxPower = player.power;
            maxPlayer = player;
        }
    }
    return maxPlayer;
}
displayAutomationModel.getConfigProps = function(diffConfig) {
    if (!diffConfig) {
        return this.configProps;
    } else {
        var diffProps = [];
        for (var i = 0; i < this.configProps.length; ++i) {
            var configProp = this.configProps[i];
            var configValues = diffConfig[configProp.name];
            if (typeof(configValues) != "undefined") {
                var diffProp = {name:configProp.name, desc:configProp.desc, props:[]};
                for (var j = 0; j < configProp.props.length; ++j) {
                    var property = configProp.props[j];
                    if (typeof(configValues[property.name]) != "undefined") {
                        diffProp.props.push(property);
                    }
                }
                diffProps.push(diffProp);
            }
        }
        return diffProps;
    }
}
displayAutomationModel.getSettingProps = function() {
    return this.settingProps;
}
displayAutomationModel.getLevels = function() {
    return this.levels;
}
displayAutomationModel.getLastAccount = function() {
    return this.lastAccount;
}
displayAutomationModel.getLastPlayer = function() {
    return this.lastPlayer;
}
displayAutomationModel.getLastCatalog = function() {
    return this.lastCatalog;
}
displayAutomationModel.toRoot = function() {
    this.levels.splice(1, this.levels.length - 1);
    this.lastAccount = null;
    this.lastPlayer = null;
    this.lastCatalog = null;
}
displayAutomationModel.toAccount = function(account) {
    this.levels.splice(2, this.levels.length - 2);
    if (account) {
        this.levels[1] = account.username;
        this.lastAccount = account;
    }
    this.lastPlayer = null;
    this.lastCatalog = null;
}
displayAutomationModel.toPlayer = function(player) {
    this.levels.splice(3, this.levels.length - 3);
    if (player) {
        this.levels[2] = (player.name ? player.server + "." + player.name : player.server);
        this.lastPlayer = player;
    }
    this.lastCatalog = null;
}
displayAutomationModel.toCatalog = function(catalog) {
    this.levels.splice(4, this.levels.length - 4);
    if (catalog) {
        this.levels[3] = catalog.name;
        this.lastCatalog = catalog;
    }
}
displayAutomationModel.addAccount = function(username, password, callback) {
    $this = this;
    requestPost("addaccount", { un: username, pd: password }, function(json) {
        if (json.fail) {
            if (json.fail == "user_exists"){
                callback("此账户已被添加!");
            } else if (json.fail == "account_fault") {
                callback("用户名或密码错误!");
            } else {
                callback("未知错误!");
            }
            return;
        }
        if (json.success) {
            $this.accounts.push({
                key: json.key,
                players: [],
                username: username,
            });
            callback();
        }
    });
}
displayAutomationModel.delAccount = function(account, callback) {
    $this = this;
    requestPost("delaccount", { key: account.key }, function(json) {
        if (json.success) {
            var accounts = $this.accounts;
            for (var i = 0; i < accounts.length; ++i) {
                if (accounts[i] === account) {
                    accounts.splice(i, 1);
                    return callback();
                }
            }
        }
    });
}
displayAutomationModel.orderAccounts = function(callback) {
    $this = this;
    var orders = [];
    for (var i = 0; i < this.accounts.length; ++i) {
        orders.push(this.accounts[i].key);
    }
    requestPost("orderautomation", { orders: orders }, function(json) {
        if (json.success) {
            return callback();
        }
    });
}
displayAutomationModel.addPlayer = function(server, callback) {
    $this = this;
    var account = this.lastAccount;
    if (!account) {
        return;
    }
    requestPost("addplayer", { key: account.key, server: server }, function(json) {
        if (json.success) {
            account.players.push({
                server: server,
                key: json.key,
                configs: json.configs,
                settings: json.settings,
            });
            callback();
        }
    });
}
displayAutomationModel.delPlayer = function(player, callback) {
    $this = this;
    var account = this.lastAccount;
    if (!account) {
        return;
    }
    requestPost("delplayer", { key: player.key }, function(json) {
        if (json.success) {
            var players = account.players;
            for (var j = 0; j < players.length; ++j) {
                if (players[j] === player) {
                    players.splice(j, 1);
                    return callback();
                }
            }
        }
    });
}
displayAutomationModel.backupPlayer = function(player) {
    console.log("backupPlayer", player);
    player.copy_configs = deep_clone(player.configs);
    player.copy_settings = deep_clone(player.settings);
}
displayAutomationModel.compareConfig = function(player, playerBase) {
    console.log("diffing", player.copy_configs, playerBase.copy_configs);
    var diffConfig = {};
    for (var configType in player.copy_configs) {
        var configValues = player.copy_configs[configType];
        var baseConfigValues = playerBase.copy_configs[configType];
        if (configType == "disabled") {
            diffConfig[configType] = configValues;
            continue;
        }
        if (configValues.disabled != baseConfigValues.disabled) {
            diffConfig[configType] = diffConfig[configType] || {};
            diffConfig[configType].disabled = configValues.disabled;
        }
        for (var name in configValues) {
            if (configValues[name] != baseConfigValues[name]) {
                diffConfig[configType] = diffConfig[configType] || {};
                diffConfig[configType][name] = configValues[name];
            }
        }
    }
    return diffConfig;
}
displayAutomationModel.saveConfig = function(player, callback) {
    $this = this;
    requestPost("playerautomation", { key: player.key, configs: player.copy_configs }, function(json) {
        if (json.success) {
            player.configs = deep_clone(player.copy_configs);
            callback(true);
        } else {
            player.copy_configs = deep_clone(player.configs);
            callback(false);
        }
    });
}
displayAutomationModel.copyConfig = function(playerFrom, playerTo, callback) {
    $this = this;
    playerTo.copy_configs = deep_clone(playerFrom.copy_configs);
    requestPost("playerautomation", { key: playerTo.key, configs: playerTo.copy_configs }, function(json) {
        if (json.success) {
            playerTo.configs = deep_clone(playerTo.copy_configs);
            callback(true);
        } else {
            playerTo.copy_configs = deep_clone(playerTo.configs);
            callback(false);
        }
    });
}
displayAutomationModel.manualConfig = function(player, callback) {
    $this = this;
    requestPost("playermanual", { key: player.key }, function(json) {
        callback(json.success);
    });
}
displayAutomationModel.saveSetting = function(player, callback) {
    $this = this;
    requestPost("playersetting", { key: player.key, settings: player.copy_settings }, function(json) {
        if (json.success) {
            player.settings = deep_clone(player.copy_settings);
            callback(true);
        } else {
            player.copy_settings = deep_clone(player.settings);
            callback(false);
        }
    });
}

function displayAutomation() {
    var divContentPanel = $(".div_content_panel");
    var waitingTemplate = templates.read(".hd_display_loading");
    divContentPanel.html(waitingTemplate({refreshing_data: true}));

    displayAutomationModel.get(function(data) {
        divContentPanel.html($(".hd_automation_all").html());

        // add accounts
        var divAccountAddMask = divContentPanel.find(".div_automation_account_add_mask");
        var inputAccountUsername = divAccountAddMask.find(".input_automation_username");
        var inputAccountPassword = divAccountAddMask.find(".input_automation_password");
        divAccountAddMask.find(".div_auto_add_cancel").click(function() {
            divAccountAddMask.hide();
        });
        divAccountAddMask.find(".div_auto_add_confirm").click(function() {
            var username = inputAccountUsername.val();
            var password = inputAccountPassword.val();
            if (username == "") {
                alert("用户名不能为空");
                inputAccountUsername.focus();
                inputAccountUsername.select();
                return;
            }
            if (password == "") {
                alert("密码不能为空");
                inputAccountPassword.focus();
                inputAccountPassword.select();
                return;
            }
            divAccountAddMask.hide();
            displayAutomationModel.addAccount(username, password, function(failMsg) {
                if (failMsg) {
                    alert("添加账户失败，错误：" + failMsg);
                } else {
                    displayAccounts();
                }
            });
        });

        // add players
        var divPlayerAddMask = divContentPanel.find(".div_automation_player_add_mask");
        var divPlayerServers = divPlayerAddMask.find(".div_auto_choose_server");
        divPlayerAddMask.find(".div_auto_add_cancel").click(function() {
            divPlayerAddMask.hide();
        });
        divPlayerAddMask.find(".div_auto_add_confirm").click(function() {
            var selectPlayerServers = divPlayerAddMask.find(".select_player_servers");
            var server = selectPlayerServers.val();
            divPlayerAddMask.hide();
            displayAutomationModel.addPlayer(server, function() {
                displayPlayers();
            });
        });

        // display contents
        var divSubtitleBar = divContentPanel.find(".div_automation_sub_title_bar");
        var subTitleBarLineText = "<div class=\"div_automation_sub_title_line\"></div>";
        var divAutomationContent = divContentPanel.find(".div_automation_content");
        var autoNavigateTemplate = templates.read(".hd_automation_navigate_item");
        var autoItemTemplate = templates.read(".hd_automation_item");
        var autoConfigPropTemplate = templates.read(".hd_automation_config_item");
        var autoPlayerServersTemplate = templates.read(".hd_automation_player_servers");

        var allCommands = [displayAccounts, displayPlayers, displayCatalog, displayDetail];
        var displayCommands = function(rightCommand, leftCommand) {
            brk();
            var levels = displayAutomationModel.getLevels();
            divSubtitleBar.html("");
            var currentLine = $(subTitleBarLineText);
            currentLine.appendTo(divSubtitleBar);
            for (var i = 0; i < levels.length; ++i) {
                (function() {
                    var lineEnd = i % 3 == 2;
                    var divAutoNavigateBlock = $(autoNavigateTemplate({
                        name: levels[i],
                        hasNext: (!lineEnd && i < levels.length - 1),
                    }));
                    divAutoNavigateBlock.appendTo(currentLine);

                    var commandFunc = allCommands[i];
                    if (commandFunc) {
                        divAutoNavigateBlock.find(".clickable").click(function() {
                            commandFunc();
                        });
                    }
                    if (lineEnd) {
                        currentLine = $(subTitleBarLineText);
                        currentLine.appendTo(divSubtitleBar);
                    }
                })();
            }
            if (rightCommand) {
                var divAutoNavigateExtraBlock = $(autoNavigateTemplate({name: rightCommand.name}));
                divAutoNavigateExtraBlock.appendTo(currentLine);
                divAutoNavigateExtraBlock.addClass("div_auto_navigate_right");
                var clickItemRight = divAutoNavigateExtraBlock.find(".clickable");
                clickItemRight.click(function() {
                    safe(rightCommand.func)(clickItemRight);
                });
            }
            if (leftCommand) {
                var divAutoNavigateExtraBlock = $(autoNavigateTemplate({name: leftCommand.name}));
                divAutoNavigateExtraBlock.appendTo(currentLine);
                divAutoNavigateExtraBlock.addClass("div_auto_navigate_left");
                var clickItemLeft = divAutoNavigateExtraBlock.find(".clickable");
                clickItemLeft.click(function() {
                    safe(leftCommand.func)(clickItemLeft);
                });
            }
            adjustPageLayout();
        }
        function displayAccounts() {
            displayAutomationModel.toRoot();

            var isAdjust = false;
            var adjustChanged = false;
            displayCommands({name: "添加账号", func: function() {
                inputAccountUsername.val("");
                inputAccountPassword.val("");
                divAccountAddMask.show();
            }}, {name: "调整顺序", func: function() {
                var divAutoItemBlocks = divAutomationContent.find(".div_auto_item_block");
                if (isAdjust) {
                    isAdjust = false;
                    divAutoItemBlocks.removeClass("div_auto_item_adjust");
                    if (adjustChanged) {
                        displayAutomationModel.orderAccounts(function() {
                            // Do nothing
                        });
                    }
                } else {
                    isAdjust = true;
                    divAutoItemBlocks.addClass("div_auto_item_adjust");
                }
            }});

            refreshContent();

            function refreshContent() {
                divAutomationContent.html("");
                for (var i = 0; i < data.accounts.length; ++i) {
                    (function() {
                        var index = i;
                        var account = data.accounts[index];
                        var maxPlayer = displayAutomationModel.getMaxPlayer(account);
                        var divAutoAccountBlock = $(autoItemTemplate({
                            name: account.username,
                            hasDel: true,
                            rightText: (maxPlayer ? maxPlayer.name : null),
                            isAdjust: isAdjust,
                        }));
                        divAutoAccountBlock.appendTo(divAutomationContent);

                        if (maxPlayer) {
                            divAutoAccountBlock.find(".div_auto_item_right").click(function() {
                                if (divAutoAccountBlock.hasClass("div_auto_item_adjust")) {
                                    // do nothing
                                } else {
                                    displayAutomationModel.toAccount(account);
                                    displayAutomationModel.toPlayer(maxPlayer);
                                    displayCatalog();
                                }
                            });
                        }
                        divAutoAccountBlock.find(".div_auto_item_delete").click(function() {
                            if (confirm("确定删除账号'" + account.username + "'？")) {
                                displayAutomationModel.delAccount(account, function() {
                                    displayAccounts();
                                });
                            }
                        });
                        divAutoAccountBlock.find(".clickable").click(function() {
                            if (divAutoAccountBlock.hasClass("div_auto_item_adjust")) {
                                if (index > 0) {
                                    adjustChanged = true;
                                    var previousAccount = data.accounts[index - 1];
                                    data.accounts.splice(index - 1, 2, account, previousAccount);
                                    refreshContent();
                                }
                            } else {
                                displayAutomationModel.toAccount(account);
                                displayPlayers();
                            }
                        });
                    })();
                }
            }
        }
        function displayPlayers() {
            displayAutomationModel.toAccount();

            var lastAccount = displayAutomationModel.getLastAccount();
            var servers = displayAutomationModel.getValidServers(lastAccount);
            var addOption = (servers.length == 0 ? null : {name: "添加角色", func:function() {
                divPlayerServers.html(autoPlayerServersTemplate({servers:servers}));
                divPlayerAddMask.show();
            }});
            displayCommands(addOption);

            divAutomationContent.html("");
            for (var i = 0; i < lastAccount.players.length; ++i) {
                (function() {
                    var player = lastAccount.players[i];
                    var divAutoPlayerBlock = $(autoItemTemplate({
                        name: (player.name ? player.server + "." + player.name : player.server),
                        hasDel:true,
                    }));
                    divAutoPlayerBlock.appendTo(divAutomationContent);

                    divAutoPlayerBlock.find(".div_auto_item_delete").click(function() {
                        if (confirm("确认删除'" + player.server + "'的角色" + (player.name ? "'" + player.name + "'" : "") + "？")) {
                            displayAutomationModel.delPlayer(player, function() {
                                displayPlayers();
                            });
                        }
                    });
                    divAutoPlayerBlock.find(".clickable").click(function() {
                        displayAutomationModel.toPlayer(player);
                        displayCatalog();
                    });
                })();
            }
        }
        function displayCatalog() {
            displayAutomationModel.toPlayer();

            displayCommands();
            divAutomationContent.html("");

            var lastPlayer = displayAutomationModel.getLastPlayer();
            displayAutomationModel.backupPlayer(lastPlayer);

            // configs
            var divAutoConfigsBlock = $(autoItemTemplate({
                name: "日常",
                hasCheck: true,
                enabled: !lastPlayer.copy_configs.disabled,
                rightText: "收菜一次",
            }));
            divAutoConfigsBlock.appendTo(divAutomationContent);

            divAutoConfigsBlock.find(".clickable").click(function() {
                displayAutomationModel.toCatalog({ name: "日常", func: displayConfig, });
                displayDetail();
            });
            divAutoConfigsBlock.find(".div_auto_item_right").click(function() {
                displayAutomationModel.manualConfig(lastPlayer, function(success) {
                    alert(success ? "收菜成功，请登陆游戏查看" : "收菜失败");
                });
            });
            var inputEnablePlayer = divAutoConfigsBlock.find(".input_check_auto_item");
            inputEnablePlayer.change(function() {
                lastPlayer.copy_configs.disabled = (inputEnablePlayer.is(":checked") ? undefined : true);
                displayAutomationModel.saveConfig(lastPlayer, function() {
                    displayCatalog();
                });
            });

            // settings
            var divAutoSettingsBlock = $(autoItemTemplate({name: "设置"}));
            divAutoSettingsBlock.appendTo(divAutomationContent);

            divAutoSettingsBlock.find(".clickable").click(function() {
                displayAutomationModel.toCatalog({ name: "设置", func: displaySetting, });
                displayDetail();
            });

            // heropanel
            var divAutoHerosBlock = $(autoItemTemplate({name: "勇者面板"}));
            divAutoHerosBlock.appendTo(divAutomationContent);

            divAutoHerosBlock.find(".clickable").click(function() {
                displayAutomationModel.toCatalog({ name: "勇者面板", func: displayHeroPanel, });
                displayDetail();
            });
        }
        function displayHeroPanel() {
            displayCommands({name: "刷新", func: function() {
                displayHeros(divAutomationContent, displayAutomationModel.getLastPlayer(), true);
            }});

            displayHeros(divAutomationContent, displayAutomationModel.getLastPlayer());
        }
        var displayProperties = function(divContent, propertyInfo, propertyExtraInfo, propertyValues, commitValue) {
            var properties = [];
            for (var j = 0; j < propertyInfo.props.length; ++j) {
                var prop = propertyInfo.props[j];
                var value = propertyValues[prop.name];
                value = (typeof(value) == "undefined" ? prop.default : value);
                var property = {
                    name: prop.desc,
                    value: value,
                };
                var fixedProperties = propertyExtraInfo[prop.type];
                if (prop.type == "check") {
                    property.type_check = true;
                } else if (prop.type == "number") {
                    property.type_options = true;
                    property.options = [];
                    var aliasIndex = 0;
                    for (var k = prop.limit[0]; k <= prop.limit[1]; ++k) {
                        property.options.push({
                            val: k,
                            desc: (prop.alias ? prop.alias[aliasIndex++] : k),
                            selected: value == k,
                        });
                    }
                } else if (fixedProperties) {
                    property.type_options = true;
                    property.options = [];
                    for (var i = 0; i < fixedProperties.length; ++i) {
                        property.options.push({
                            val: fixedProperties[i].value,
                            desc: fixedProperties[i].desc,
                            selected: value == fixedProperties[i].value,
                        });
                    }
                }
                properties.push(property);
            }
            var divConfigPropBlock = $(autoConfigPropTemplate({
                name: propertyInfo.desc,
                hasCheck: !!propertyExtraInfo.hasCheck,
                enabled: !propertyValues.disabled,
                properties: properties,
            }));
            divConfigPropBlock.appendTo(divContent);

            if (propertyExtraInfo.hasCheck) {
                var inputEnableConfig = divConfigPropBlock.find(".input_check_auto_config");
                inputEnableConfig.change(function() {
                    propertyValues.disabled = (inputEnableConfig.is(":checked") ? undefined : true);
                    commitValue();
                });
            }
            var controls = divConfigPropBlock.find(".ctrl_auto_config_prop");
            for (var j = 0; j < propertyInfo.props.length; ++j) {
                (function() {
                    var prop = propertyInfo.props[j];
                    var property = properties[j];
                    var inputPropertyBlock = $(controls[j]);
                    if (property.type_check) {
                        inputPropertyBlock.change(function() {
                            propertyValues[prop.name] = inputPropertyBlock.is(":checked");
                            commitValue();
                        });
                    } else if (property.type_options) {
                        inputPropertyBlock.change(function() {
                            var changedVal = inputPropertyBlock.val();
                            propertyValues[prop.name] = (prop.isStr ? changedVal : Number(changedVal));
                            commitValue();
                        });
                    }
                })();
            }
        }
        function displaySetting() {
            displayCommands();

            var lastPlayer = displayAutomationModel.getLastPlayer();
            var configChanged = function() {
                displayAutomationModel.saveSetting(lastPlayer, function(success) {
                    displaySetting();
                });
            };

            var propertyExtra ={
                players: displayAutomationModel.getPlayerSelections(),
                stars: displayAutomationModel.getKingwarStars(),
            };
            divAutomationContent.html("");
            var settingProps = displayAutomationModel.getSettingProps();
            for (var i = 0; i < settingProps.length; ++i) {
                (function() {
                    var settingInfo = settingProps[i];
                    var settingValues = lastPlayer.copy_settings[settingInfo.name];
                    if (!settingValues) {
                        return;
                    }
                    displayProperties(divAutomationContent, settingInfo, propertyExtra, settingValues, configChanged);
                })();
            }
        }
        var modelPlayer = null;
        function displayConfig() {
            var lastPlayer = displayAutomationModel.getLastPlayer();
            var GetState = function() {
                return (modelPlayer ? (modelPlayer === lastPlayer ? 1 : 2) : 0);
            };
            var stateNames = ["设为范本", "取消范本", "直接覆盖"];
            var allPlayers = displayAutomationModel.getAllPlayers();
            var modelOptions = {
                name: stateNames[GetState()],
                func: function(clickItem) {
                    switch (GetState()) {
                    case 0:
                        modelPlayer = lastPlayer;
                        break;
                    case 1:
                        modelPlayer = null;
                        break;
                    case 2:
                        if (!confirm("确认覆盖本配置？")) {
                            return;
                        }
                        displayAutomationModel.copyConfig(modelPlayer, lastPlayer, function() {
                            displayConfig();
                        });
                        break;
                    }
                    clickItem.html(stateNames[GetState()]);
                },
            };
            displayCommands(allPlayers.length > 1 ? modelOptions : null);

            var configChanged = function() {
                displayAutomationModel.saveConfig(lastPlayer, function(success) {
                    displayConfig();
                });
            };

            divAutomationContent.html("");
            var compareConfig = (GetState() == 2 ? displayAutomationModel.compareConfig(lastPlayer, modelPlayer) : null);
            var configProps = displayAutomationModel.getConfigProps(compareConfig);
            if (configProps.length > 0) {
                for (var i = 0; i < configProps.length; ++i) {
                    (function() {
                        var configInfo = configProps[i];
                        var configValues = lastPlayer.copy_configs[configInfo.name];
                        if (!configValues) {
                            return;
                        }
                        displayProperties(divAutomationContent, configInfo, {hasCheck:true}, configValues, configChanged);
                    })();
                }
            } else {
                divAutomationContent.html("配置与范本完全相同");
            }
        }
        function displayDetail() {
            displayAutomationModel.toCatalog();
            displayAutomationModel.getLastCatalog().func();
        }
        displayAccounts();
    });
}

$(function() {
    Handlebars.registerPartial("hd_hero_item", $(".hd_hero_item").html());
});
displayHerosModel = {
    playerKey: null,
    heroPos:[
        [10, 4, 1, 7, 13],
        [11, 5, 2, 8, 14],
        [12, 6, 3, 9, 15],
    ],
    colorCls:[
        "",
        "div_game_color_green",
        "div_game_color_blue",
        "div_game_color_purple",
        "div_game_color_orange",
        "div_game_color_red",
        "div_game_color_golden",
        "div_game_color_X",
    ],
};
displayHerosModel.posTypes = [
    {
        desc: "下阵",
        visible: function() { return displayHerosModel.isSelectPosHeros(); },
        execute: function(callback) { displayHerosModel.getOffHeroArray(callback); },
    }, {
        desc: "交换",
        visible: function() { return displayHerosModel.isSelectExchange(); },
        execute: function(callback) { displayHerosModel.exchangeHero(callback); },
    }
];
displayHerosModel.propOptions = [
    {desc:"进化", name:"upgrade"},
    {desc:"食物", name:"food"},
    {desc:"神石", name:"stone"},
    {desc:"宝具", name:"gem"},
];
displayHerosModel.propOps = [
    {
        desc:"解雇重吃", val:1,
        visible: function() { return displayHerosModel.isSelectCacheHeros(); },
    },
    {
        desc:"吃饱", val:2,
        visible: function() { return displayHerosModel.isSelectHeros(); },
    },
];
displayHerosModel.setPlayerKey = function(playerKey) {
    this.playerKey = playerKey
}
displayHerosModel.get = function(force, callback) {
    $this = this;
    requestPost("listheros", { force:force, key: this.playerKey }, function(json) {
        $this.heros = json.heros;
        $this.initialize();
        callback(json);
    });
}
displayHerosModel.initialize = function() {
    var heros = this.heros;
    var posHeros = {};
    var leftHeros = [];
    var sortedHeros = {};
    for (var i = 0; i < heros.length; ++i) {
        var hero = heros[i];
        hero.nameCls = this.colorCls[hero.color];
        if (hero.stone > 0) {
            hero.stoneCls = this.colorCls[hero.stoneColor];
        }
        if (hero.pos > 0) {
            posHeros[hero.pos] = hero;
        } else {
            leftHeros.push(hero);
        }
        sortedHeros[hero.heroId] = hero;
    }
    var heroArray = [];
    for (var i = 0; i < this.heroPos.length; ++i) {
        var heroIndex = this.heroPos[i];
        var heroLine = [];
        for (var j = 0; j < heroIndex.length; ++j) {
            var pos = heroIndex[j];
            var hero = posHeros[pos];
            heroLine.push(hero || {pos:pos});
        }
        heroArray.push(heroLine);
    }
    this.heroArray = heroArray;
    this.leftHeros = leftHeros;
    this.sortedHeros = sortedHeros;
    this.selection = [];
    this.operateTypes = {};
    for (var i = 0; i < this.propOptions.length; ++i) {
        var propType = this.propOptions[i];
        var propChecked = StorageItem()["hero_" + propType.name] != "F";
        if (propChecked) {
            this.operateTypes[propType.name] = true;
        }
    }
}
displayHerosModel.getHeroArray = function() {
    return this.heroArray;
}
displayHerosModel.getLeftHeros = function() {
    return this.leftHeros;
}
displayHerosModel.getSelection = function() {
    return this.selection;
}
displayHerosModel.setSelected = function(selected, pos, heroId) {
    if (selected) {
        if (heroId) {
            this.selection.push(this.sortedHeros[heroId]);
        } else {
            this.selection.push({pos:pos});
        }
    } else {
        for (var i = 0; i < this.selection.length; ++i) {
            var hero = this.selection[i];
            if (heroId ? hero.heroId == heroId : hero.pos == pos) {
                this.selection.splice(i, 1);
                break;
            }
        }
    }
}
displayHerosModel.isSelectHeros = function() {
    if (this.selection.length > 0) {
        var allHeros = true;
        for (var i = 0; i < this.selection.length; ++i) {
            var hero = this.selection[i];
            if (!hero.heroId) {
                allHeros = false;
                break;
            }
        }
        return allHeros;
    }
    return false;
}
displayHerosModel.isSelectPosHeros = function() {
    if (this.selection.length > 0) {
        var allPosHeros = true;
        for (var i = 0; i < this.selection.length; ++i) {
            var hero = this.selection[i];
            if (!hero.heroId || !hero.pos) {
                allPosHeros = false;
                break;
            }
        }
        return allPosHeros;
    }
    return false;
}
displayHerosModel.isSelectCacheHeros = function() {
    if (this.selection.length > 0) {
        var allCacheHeros = true;
        for (var i = 0; i < this.selection.length; ++i) {
            var hero = this.selection[i];
            if (!hero.heroId || hero.pos) {
                allCacheHeros = false;
                break;
            }
        }
        return allCacheHeros;
    }
    return false;
}
displayHerosModel.isSelectExchange = function() {
    if (this.selection.length == 2) {
        var hero1 = this.selection[0];
        var hero2 = this.selection[1];
        if (hero1.pos == 0 && hero2.pos == 0) {
            return false;
        }
        if (!hero1.heroId && !hero2.heroId) {
            return false;
        }
        return true;
    }
    return false;
}
displayHerosModel.getOffHeroArray = function(callback) {
    var heroOps = {};
    for (var i = 0; i < this.selection.length; ++i) {
        var hero = this.selection[i];
        heroOps[hero.heroId] = {
            pos: { target: 0 },
        };
    }
    requestPost("operatehero", { key: this.playerKey, heros: heroOps, }, function(json) {
        if (json.success) {
            callback();
        }
    });
}
displayHerosModel.exchangeHero = function(callback) {
    var hero = this.selection[0];
    var heroPos = this.selection[1];
    if (!hero.heroId || heroPos.pos == 0) {
        hero = this.selection[1];
        heroPos = this.selection[0];
    }
    var heroOps = {};
    heroOps[hero.heroId] = {
        pos: { target: heroPos.pos, },
    };
    requestPost("operatehero", { key: this.playerKey, heros: heroOps, }, function(json) {
        if (json.success) {
            callback();
        }
    });
}
displayHerosModel.setOption = function(name, isAdd) {
    StorageItem()["hero_" + name] = (isAdd ? "T" : "F");
    if (isAdd) {
        this.operateTypes[name] = true;
    } else {
        delete this.operateTypes[name];
    }
}
displayHerosModel.getOption = function(name) {
    return this.operateTypes[name] || false;
}
displayHerosModel.doOperation = function(opMode, callback) {
    var options = {};
    if (opMode == 1) {
        options.renew = true;
    }
    for (var name in this.operateTypes) {
        options[name] = opMode;
    }
    var heroOps = {};
    for (var i = 0; i < this.selection.length; ++i) {
        var hero = this.selection[i];
        heroOps[hero.heroId] = options;
    }
    requestPost("operatehero", { key: this.playerKey, heros: heroOps, }, function(json) {
        if (json.success) {
            callback();
        }
    });
}

function displayHeros(parentPanel, player, isForce) {
    var waitingTemplate = templates.read(".hd_display_loading");
    parentPanel.html(waitingTemplate({loading_data: true}));

    var heroPanelTemplate = templates.read(".hd_hero_panel");

    displayHerosModel.setPlayerKey(player.key);
    displayHerosModel.get(isForce, function() {
        var heroArray = displayHerosModel.getHeroArray();
        var leftHeros = displayHerosModel.getLeftHeros();
        parentPanel.html(heroPanelTemplate({
            heroArray: heroArray,
            leftHeros: leftHeros,
            posTypes: displayHerosModel.posTypes,
            propOptions: displayHerosModel.propOptions,
            propOps: displayHerosModel.propOps,
        }));

        var divOperationMask = parentPanel.find(".div_hero_panel_loading_mask");
        var allItemBlocks = parentPanel.find(".div_hero_panel_item");
        for (var i = 0; i < allItemBlocks.length; ++i) {
            (function() {
                var itemBlock = $(allItemBlocks[i]);
                var pos = Number(itemBlock.attr("hero_pos"));
                var heroId = itemBlock.attr("hero_id");
                itemBlock.click(function() {
                    itemBlock.toggleClass("div_hero_panel_item_selected");
                    var selected = itemBlock.hasClass("div_hero_panel_item_selected");
                    displayHerosModel.setSelected(selected, pos, heroId);
                    updateOperate();
                });
            })();
        }
        var posOperateBlocks = parentPanel.find(".div_hero_panel_operate_pos").find(".div_hero_panel_operate_item");
        for (var i = 0; i < displayHerosModel.posTypes.length; ++i) {
            (function() {
                var posType = displayHerosModel.posTypes[i];
                var posOperate = $(posOperateBlocks[i]);
                posOperate.click(function() {
                    divOperationMask.show();
                    posType.execute(function() {
                        displayHeros(parentPanel, player);
                    });
                });
            })();
        }
        var propOptionBlocks = parentPanel.find(".div_hero_panel_operate_props").find(".input_hero_panel_operate_check");
        var propOperateBlocks = parentPanel.find(".div_hero_panel_operate_props").find(".div_hero_panel_operate_do");
        for (var i = 0; i < displayHerosModel.propOptions.length; ++i) {
            (function() {
                var optionType = displayHerosModel.propOptions[i];
                var optionOperate = $(propOptionBlocks[i]);
                if (displayHerosModel.getOption(optionType.name)) {
                    optionOperate.attr("checked", "checked");
                }
                optionOperate.change(function() {
                    var checked = optionOperate.is(":checked");
                    displayHerosModel.setOption(optionType.name, checked);
                });
            })();
        }
        for (var i = 0; i < displayHerosModel.propOps.length; ++i) {
            (function() {
                var propType = displayHerosModel.propOps[i];
                var propOperate = $(propOperateBlocks[i]);
                propOperate.click(function() {
                    divOperationMask.show();
                    displayHerosModel.doOperation(propType.val, function() {
                        displayHeros(parentPanel, player);
                    });
                });
            })();
        }
        function updateOperate() {
            for (var i = 0; i < displayHerosModel.posTypes.length; ++i) {
                var posType = displayHerosModel.posTypes[i];
                var posOperate = $(posOperateBlocks[i]);
                var visible = posType.visible();
                if (visible) {
                    posOperate.show();
                } else {
                    posOperate.hide();
                }
            }
            for (var i = 0; i < displayHerosModel.propOps.length; ++i) {
                var propType = displayHerosModel.propOps[i];
                var propOperate = $(propOperateBlocks[i]);
                var visible = propType.visible();
                if (visible) {
                    propOperate.show();
                } else {
                    propOperate.hide();
                }
            }
        }
        updateOperate();
    });
}

var displayServerInfoModel = {
};

displayServerInfoModel.get = function(callback) {
    $this = this;
    requestPost("listserverinfo", {vulkan:true}, function(json) {
        $this.heros = json.heros;
        $this.heroshop = json.heroshop;
        $this.userHeros = json.userHeros;
        $this.initialize();
        callback();
    });
}
displayServerInfoModel.initialize = function() {
    this.herosData = {};
    for (var i = 0; i < this.heros.length; ++i) {
        var heroItem = this.heros[i];
        this.herosData[heroItem.id] = heroItem;
    }
    this.heroshopData = [];
    this.caredheroData = [];
    var heroshop = clone(this.heroshop);
    while (true) {
        var hasItem = false;
        var minPer = 500;
        var minId = null;
        for (var id in heroshop) {
            hasItem = true;
            var per = heroshop[id]
            if (per < minPer) {
                minPer = per;
                minId = id;
            }
        }
        if (!hasItem) {
            break;
        }
        var heroInfo = this.herosData[minId];
        var name = (heroInfo ? heroInfo.name : "未知勇者");
        var cls = (heroInfo ? heroInfo.cls : "-");
        var toPushArray = (this.userHeros[minId] ? this.caredheroData : this.heroshopData);
        toPushArray.push({
            id: minId,
            per: minPer,
            name: name,
            cls: cls,
            isgolden: cls == "SSS" || cls == "SSS+",
            isX: cls == "X",
        });
        delete heroshop[minId];
    }
}
displayServerInfoModel.getHeroshop = function() {
    return this.heroshopData;
}
displayServerInfoModel.getcaredHeros = function() {
    return this.caredheroData;
}
displayServerInfoModel.addHero = function(id, callback) {
    $this = this;
    requestPost("setheroshop", {heroId:id, cmd:"add"}, function(json) {
        if (json.success) {
            $this.userHeros[id] = true;
            $this.initialize();
            callback();
        }
    });
}
displayServerInfoModel.delHero = function(id, callback) {
    $this = this;
    requestPost("setheroshop", {heroId:id, cmd:"del"}, function(json) {
        if (json.success) {
            delete $this.userHeros[id];
            $this.initialize();
            callback();
        }
    });
}

function displayServerInfo() {
    var divContentPanel = $(".div_content_panel");
    var waitingTemplate = templates.read(".hd_display_loading");
    divContentPanel.html(waitingTemplate({refreshing_data: true}));

    var refreshData = function() {
        var defaultServerInfo = StorageItem().defaultServerInfo;
        defaultServerInfo = (defaultServerInfo ? defaultServerInfo : "heroshop");
        var data = {
            isheroshop: defaultServerInfo == "heroshop",
            heroshop: displayServerInfoModel.getHeroshop(),
            caredhero: displayServerInfoModel.getcaredHeros(),
        };
        var serverListTemplate = templates.read(".hd_server_info_all");
        divContentPanel.html(serverListTemplate(data));
        adjustPageLayout();

        // heroshop
        var divHeroShopBlocks = divContentPanel.find(".div_server_info_item_heroshop");
        for (var i = 0; i < divHeroShopBlocks.length; ++i) {
            (function() {
                var block = $(divHeroShopBlocks[i]);
                var id = block.attr("heroId");
                block.find(".div_server_info_item_del_hero").click(function() {
                    displayServerInfoModel.delHero(id, refreshData);
                });
                block.find(".div_server_info_item_add_hero").click(function() {
                    displayServerInfoModel.addHero(id, refreshData);
                });
            })();
        }

        var divServerInfoSubReduce = divContentPanel.find(".div_server_info_sub_item_reduce");
        divServerInfoSubReduce.click(function() {
            StorageItem().defaultServerInfo = "heroshop";
            refreshData();
        });
    };

    displayServerInfoModel.get(refreshData);
}

var displayPlayerListModel = {
};

displayPlayerListModel.get = function(callback) {
    $this = this;
    requestGet("listplayers", function(json) {
        $this.hasRefresh = json.hasRefresh;
        $this.players = json.players;
        callback(json);
    });
}

function displayPlayerList() {
    var divContentPanel = $(".div_content_panel");
    var waitingTemplate = templates.read(".hd_display_loading");
    divContentPanel.html(waitingTemplate({refreshing_data: true}));

    displayPlayerListModel.get(function(data) {
        var playerListTemplate = templates.read(".hd_player_list_all");
        divContentPanel.html(playerListTemplate(data));
        adjustPageLayout();

        if (data.hasRefresh) {
            divContentPanel.find(".div_player_sub_refresh").click(clickRefresh);
        }

        var inputShowKingwar = divContentPanel.find(".input_player_sub_show_kingwar");
        inputShowKingwar.change(function() {
            var showKingwar = inputShowKingwar.is(":checked");
            StorageItem().showKingwar = (showKingwar ? "true" : "false");
            loadPlayers();
        });

        var inputShowQuit = divContentPanel.find(".input_player_sub_show_quit");
        inputShowQuit.change(function() {
            var showQuit = inputShowQuit.is(":checked");
            StorageItem().showQuit = (showQuit ? "true" : "false");
            loadPlayers();
        });

        loadPlayers();

        function loadPlayers() {
            var showKingwar = StorageItem().showKingwar == "true";
            if (showKingwar) {
                inputShowKingwar.attr("checked", "checked");
            } else {
                inputShowKingwar.removeAttr("checked");
            }

            var showQuit = StorageItem().showQuit == "true";
            if (showQuit) {
                inputShowQuit.attr("checked", "checked");
            } else {
                inputShowQuit.removeAttr("checked");
            }

            var divPlayerList = divContentPanel.find(".div_player_list");
            divPlayerList.html(waitingTemplate({loading_data: true}));

            var playerInfo = [];
            for (var i = 0; i < data.players.length; ++i) {
                var playerData = data.players[i];
                if (!showKingwar && playerData.kingwar > 0) {
                    continue;
                }
                var duration = playerCommon.duration(playerData.last);
                if (!showQuit && duration.quit) {
                    continue;
                }
                playerInfo.push({
                    index: i+1,
                    union_short: playerData.server + "." + playerData.uShort,
                    name: playerData.name,
                    power: Math.floor(playerData.power / 10000),
                    kingwar: playerCommon.areastarName(playerData.kingwar),
                    last: duration.desc,
                    lastColor: duration.color,
                });
            }

            templates.delayLoad(".hd_player_item", playerInfo, function(playerBlocks) {
                divPlayerList.html("");
                for (var i = 0; i < playerBlocks.length; ++i) {
                    var playerBlock = playerBlocks[i];
                    playerBlock.appendTo(divPlayerList);

                    var info = playerInfo[i];
                    var unionColor = playerCommon.unionColor(info.union_short);
                    playerBlock.find(".div_player_item_union").addClass(unionColor);
                    playerBlock.find(".div_player_item_last").css("color", info.lastColor);
                }
            });
        }
    });
}

var displayKingWarModel = {
};
displayKingWarModel.get = function(callback) {
    $this = this;
    requestGet("listkingwars", function(json) {
        $this.hasRefresh = json.hasRefresh;
        $this.kingwar = json.areastars;
        for (var key in json.areastars) {
            var areastarData = json.areastars[key];
            for (var i = 0; i < areastarData.length; ++i) {
                var player = areastarData[i];
                player.showMax = player.maxPower > player.power + 200000;
                player.unionShort = (player.union ? player.union.substr(4) : "");
            }
        }
        callback(json);
    });
}
displayKingWarModel.firstThree = function(key) {
    var areastarData = this.kingwar[key];
    var firstThreeData = [];
    var copiedAreastarData = [];
    for (var i = 0; i < areastarData.length; ++i) {
        copiedAreastarData[i] = areastarData[i];
    }
    for (var i = 0; i < 3; ++i) {
        var maxPower = 0;
        var maxIndex = -1;
        for (var j = 0; j < copiedAreastarData.length; ++j) {
            var player = copiedAreastarData[j];
            if (player.maxPower > maxPower) {
                maxPower = player.maxPower;
                maxIndex = j;
            }
        }
        if (maxIndex < 0) {
            break;
        }
        firstThreeData.push(copiedAreastarData[maxIndex]);
        copiedAreastarData.splice(maxIndex, 1);
    }
    return firstThreeData;
}

// show kingwar
function displayKingWar() {
    var divContentPanel = $(".div_content_panel");
    var waitingTemplate = templates.read(".hd_display_loading");
    divContentPanel.html(waitingTemplate({refreshing_data: true}));

    displayKingWarModel.get(function(data) {
        var kingwarAreastarTemplate = templates.read(".hd_kingwar_areastar_all");
        divContentPanel.html(kingwarAreastarTemplate(data));
        adjustPageLayout();

        if (data.hasRefresh) {
            divContentPanel.find(".div_kingwar_sub_refresh").click(clickRefresh);
        }

        var divAreaStarList = divContentPanel.find(".div_areastar_list");
        var divNavAreaList = divContentPanel.find(".div_navigate_areas");
        var divNavStarList = divContentPanel.find(".div_navigate_stars");
        var divNavAreaStarMask = divContentPanel.find(".div_navigate_stars_mask");
        var navAreaId = 0;
        unique_click(divNavAreaStarMask, function() {
            navAreaId = 0;
            divNavAreaStarMask.hide();
        });

        var areastarInfo = {};
        var playerInfo = [];
        var areastarTemplate = templates.read(".hd_kingwar_areastar");
        var navigateAreaTemplate = templates.read(".hd_navigate_area_item");
        var navigateStarTemplate = templates.read(".hd_navigate_star_item");
        for (var area = 1; area <= 3; area++) {
            (function() {
                var areaId = area;
                var areaName = playerCommon.areaName(areaId);
                var areaColor = playerCommon.areaColor(areaId);

                // nav area
                var divNavAreaBlock = $(navigateAreaTemplate({name:areaName}));
                divNavAreaBlock.appendTo(divNavAreaList);
                divNavAreaBlock.addClass(areaColor);
                divNavAreaBlock.click(function() {
                    if (navAreaId == areaId) {
                        navAreaId = 0;
                        divNavAreaStarMask.hide();
                        return;
                    }
                    navAreaId = areaId;
                    divNavStarList.html("");
                    divNavAreaStarMask.show();
                    for (var star = 10; star >= 1; star--) {
                        (function() {
                            var key = areaId * 100 + star;
                            var areastarData = data.areastars[key];
                            var areastar = areastarInfo[key];
                            var players = displayKingWarModel.firstThree(key);
                            var navStarInfo = {
                                name:areastar.name,
                                count: areastarData.length,
                                powers: [],
                            };
                            for (var i = 0; i < players.length; ++i) {
                                navStarInfo.powers.push({
                                    number: players[i].unionShort + "." + Math.floor(players[i].maxPower / 10000),
                                });
                            }
                            var divNavStarBlock = $(navigateStarTemplate(navStarInfo));
                            divNavStarBlock.appendTo(divNavStarList);
                            divNavStarBlock.find(".div_navigate_star_name").addClass(areaColor);
                            if (players.length > 0) {
                                var divPowerDisplays = divNavStarBlock.find(".div_navigate_star_power");
                                for (var i = 0; i < players.length; ++i) {
                                    var unionColor = playerCommon.unionColor(players[i].union);
                                    $(divPowerDisplays[i]).addClass(unionColor);
                                    if (i == 0) {
                                        $(divPowerDisplays[i]).addClass("div_navigate_star_power_max");
                                    }
                                }
                            } else {
                                divNavStarBlock.find(".div_navigate_star_max").html("无");
                            }
                            divNavStarBlock.click(function() {
                                var targetBlock = areastar.block;
                                var top = targetBlock.position().top;
                                $("html,body").animate({"scrollTop":top});
                            });
                        })();
                    }
                });

                for (var star = 10; star >= 1; star--) {
                    var key = areaId * 100 + star;
                    var areastarData = data.areastars[key];
                    var areastar = {
                        area:areaId,
                        star:star,
                        name:areaName + star + "星",
                    };
                    var divAreaStarBlock = $(areastarTemplate(areastar));
                    divAreaStarBlock.appendTo(divAreaStarList);
                    divAreaStarBlock.find(".div_areastar_title_text").addClass(areaColor);

                    var playersContainer = divAreaStarBlock.find(".div_areastar_players_breaf");
                    areastar.container = playersContainer;
                    areastar.block = divAreaStarBlock;
                    areastarInfo[key] = areastar;
                    if (areastarData && areastarData.length > 0) {
                        playersContainer.html("正在加载...");
                        for (var i = 0; i < areastarData.length; ++i) {
                            var player = areastarData[i];
                            var power = Math.floor(player.power / 10000) + "万";
                            if (player.showMax) {
                                power = "(" + Math.floor(player.maxPower / 10000) + "万)" + power;
                            }
                            playerInfo.push({
                                first: i == 0,
                                inlist: i < 16,
                                union: player.union,
                                name: player.name,
                                power: power,
                                belongTo: areastar,
                            });
                        }
                    } else {
                        playersContainer.html("无");
                    }
                }
            })();
        }
        templates.delayLoad(".hd_common_player", playerInfo, function(playerBlocks) {
            for (var i = 0; i < playerBlocks.length; ++i) {
                var playerBlock = playerBlocks[i];
                var info = playerInfo[i];
                var playersContainer = info.belongTo.container;
                if (info.first) {
                    playersContainer.html("");
                }
                playerBlock.appendTo(playersContainer);
                if (!info.inlist) {
                    playerBlock.find(".div_player_union").addClass("div_player_block_not_in");
                    playerBlock.find(".div_player_name").addClass("div_player_block_not_in");
                    playerBlock.find(".div_player_power").addClass("div_player_block_not_in");
                } else {
                    var unionColor = playerCommon.unionColor(info.union);
                    playerBlock.find(".div_player_union").addClass(unionColor);
                }
            }
        });
    });
}

var displayUsersModel = {
    canAuthorize:false,
};
displayUsersModel.canAssociate = function() {
    return this.canAuthorize;
}
displayUsersModel.get = function(callback) {
    $this = this;
    requestPost("listusers", {jetson:true}, function(json) {
        if (json.users) {
            $this.auths = json.auths;
            $this.reqs = json.reqs;
            $this.canAuthorize = json.canAuthorize;
            $this.users = json.users;
            callback($this.users);
        }
    });
}
displayUsersModel.promote = function(serial, level, callback) {
    requestPost("promote", {target:serial, auth:level}, function(json) {
        if (json.success) {
            callback();
        }
    });
}
displayUsersModel.newuser = function(serial, callback) {
    requestPost("authorize", {previous:serial}, function(json) {
        if (json.success) {
            callback();
        }
    });
}
displayUsersModel.associate = function(prevSerial, nextSerial, callback) {
    requestPost("authorize", {previous:prevSerial, next:nextSerial}, function(json) {
        if (json.success) {
            callback();
        }
    });
}
displayUsersModel.rename = function(serial, name, callback) {
    requestPost("rename", {target:serial, name:name}, function(json) {
        if (json.success) {
            callback();
        }
    });
}
displayUsersModel.deluser = function(serial, callback) {
    requestPost("disable", {target:serial}, function(json) {
        if (json.success) {
            callback();
        }
    });
}
displayUsersModel.breakuser = function(serial, callback) {
    requestPost("disable", {target:serial, keep:true}, function(json) {
        if (json.success) {
            callback();
        }
    });
}
displayUsersModel.getAuths = function() {
    if (!this.validAuths) {
        this.validAuths = [];
        for (var i = 0; i < this.auths.length; ++i) {
            var item = this.auths[i];
            if (item.val) {
                this.validAuths.push(item);
            }
        }
    }
    return this.validAuths;
}
displayUsersModel.getReqs = function(userInfo) {
    var reqinfo = [];
    for (var i = 0; i < this.reqs.length; ++i) {
        var item = this.reqs[i];
        reqinfo.push({
            name: item.name,
            val: item.val,
            enabled: !!userInfo.req[item.val],
        });
    }
    return reqinfo;
}
displayUsersModel.addReq = function(serial, val, callback) {
    requestPost("requirement", {target:serial, val:val, add:true}, function(json) {
        if (json.success) {
            callback();
        }
    });
}
displayUsersModel.delReq = function(serial, val, callback) {
    requestPost("requirement", {target:serial, val:val, add:false}, function(json) {
        if (json.success) {
            callback();
        }
    });
}

function displayUsers() {
    var divContentPanel = $(".div_content_panel");
    var waitingTemplate = templates.read(".hd_display_loading");
    divContentPanel.html(waitingTemplate({refreshing_data: true}));

    displayUsersModel.get(function(usersData) {
        divContentPanel.html($(".hd_users_all").html());
        var divUserContainer = divContentPanel.find(".div_users_list");

        var userItemBlocks = [];
        var associateBlockInfo = null;
        var userItemTemplate = templates.read(".hd_user_item");
        var userDetailTemplate = templates.read(".hd_user_detail");
        for (var i = 0; i < usersData.length; ++i) {
            (function() {
                var userInfo = usersData[i];
                var superAdmin = userInfo.auth > 3;
                var authorized = userInfo.auth > 0;
                var isSelf = userInfo.serial == StorageItem().serial;
                var userBlockInfo = {
                    name:userInfo.name,
                    superAdmin:superAdmin,
                    canDelete:!superAdmin && !isSelf,
                    authorized:authorized,
                    associate:displayUsersModel.canAssociate(),
                    canBreak:displayUsersModel.canAssociate() && !userInfo.dead && !isSelf,
                };
                var divUserItemBlock = $(userItemTemplate(userBlockInfo));
                divUserItemBlock.appendTo(divUserContainer);

                userBlockInfo.block = divUserItemBlock;
                userBlockInfo.serial = userInfo.serial;
                userItemBlocks.push(userBlockInfo);

                if (isSelf) {
                    divUserItemBlock.addClass("user_myself");
                }

                var divUserDelete = divUserItemBlock.find(".div_user_delete");
                divUserDelete.click(function() {
                    if (confirm("确认删除'" + userInfo.name + "'？删除之后不可恢复！")) {
                        displayUsersModel.deluser(userInfo.serial, displayUsers);
                    }
                });

                var divUserName = divUserItemBlock.find(".div_user_name");
                var inputUserName = divUserItemBlock.find(".input_user_name");
                inputUserName.hide();
                divUserName.click(function() {
                    if (associateBlockInfo) {
                        return;
                    }
                    divUserName.hide();
                    inputUserName.show();
                    inputUserName.focus();
                    inputUserName.select();
                });
                inputUserName.keypress(function(e) {
                    if (e.which == 13) {
                        inputUserName.blur();
                    }
                });
                inputUserName.blur(function() {
                    var newName = inputUserName.val();
                    inputUserName.hide();
                    divUserName.show();
                    if (newName != userInfo.name) {
                        displayUsersModel.rename(userInfo.serial, newName, function() {
                            userInfo.name = newName;
                            userBlockInfo.name = newName;
                            divUserName.html(newName);
                            inputUserName.val(newName);
                        });
                    }
                });

                if (authorized && !superAdmin) {
                    var divBreakUser = divUserItemBlock.find(".div_user_delete_target");
                    divBreakUser.click(function() {
                        if (confirm("确认解除用户'" + userInfo.name + "'？")) {
                            displayUsersModel.breakuser(userInfo.serial, displayUsers);
                        }
                    });
                    var divUserSetting = divUserItemBlock.find(".div_user_setting_detail");
                    divUserSetting.click(function() {
                        var reqs = displayUsersModel.getReqs(userInfo);
                        divContentPanel.html(userDetailTemplate({
                            name:userInfo.name,
                            auths:displayUsersModel.getAuths(),
                            reqs:reqs,
                        }));
                        var selectAuthLevel = divContentPanel.find(".div_user_select_auth_level");
                        selectAuthLevel.val(userInfo.auth);
                        selectAuthLevel.change(function() {
                            var level = selectAuthLevel.val();
                            if (confirm("确认为'" + userInfo.name + "'修改权限？")) {
                                displayUsersModel.promote(userInfo.serial, level, function() {
                                    alert("修改权限 - 成功");
                                    window.location.reload();
                                });
                            }
                            selectAuthLevel.val(userInfo.auth);
                        });
                        var checkRequirements = divContentPanel.find(".input_check_user_requirement");
                        for (var i = 0; i < reqs.length; ++i) {
                            (function() {
                                var item = reqs[i];
                                var checkBlock = $(checkRequirements[i]);
                                checkBlock.change(function() {
                                    if (checkBlock.is(":checked")) {
                                        displayUsersModel.addReq(userInfo.serial, item.val, function() {
                                            alert("添加权限 - 成功");
                                            window.location.reload();
                                        });
                                    } else {
                                        displayUsersModel.delReq(userInfo.serial, item.val, function() {
                                            alert("删除权限 - 成功");
                                            window.location.reload();
                                        });
                                    }
                                });
                            })();
                        }
                    });
                } else if (!authorized) {
                    var divNewUser = divUserItemBlock.find(".div_user_auth_new");
                    divNewUser.click(function() {
                        if (confirm("确认为'" + userInfo.name + "'创建用户？")) {
                            displayUsersModel.newuser(userInfo.serial, displayUsers);
                        }
                    });
                    var divAssociateUser = divUserItemBlock.find(".div_user_auth_target");
                    divAssociateUser.click(function() {
                        associateBlockInfo = userBlockInfo;
                        for (var i = 0; i < userItemBlocks.length; ++i) {
                            var blockInfo = userItemBlocks[i];
                            if (blockInfo.authorized) {
                                blockInfo.block.addClass("user_clickable");
                            } else {
                                blockInfo.block.addClass("user_unclickable");
                            }
                        }
                        return false;
                    });
                }

                divUserItemBlock.click(function() {
                    if (associateBlockInfo) {
                        var baseSerial = associateBlockInfo.serial;
                        var name = associateBlockInfo.name;
                        associateBlockInfo = null;
                        for (var i = 0; i < userItemBlocks.length; ++i) {
                            var userBlockInfo = userItemBlocks[i];
                            userBlockInfo.block.removeClass("user_clickable");
                            userBlockInfo.block.removeClass("user_unclickable");
                        }
                        if (authorized) {
                            if (confirm("确认关联用户'" + name + "'到'" + userInfo.name + "'？")) {
                                displayUsersModel.associate(baseSerial, userInfo.serial, displayUsers);
                            }
                        }
                    }
                });
            })();
        }
    });
}

var displaySelfModel = {};
displaySelfModel.get = function(callback) {
    $this = this;
    requestPost("listself", {}, function(json) {
        if (json.detail) {
            $this.detail = json.detail;
            $this.auths = json.auths;
            $this.reqs = json.reqs;
            $this.initialize();
            callback($this.detail);
        }
    });
}
displaySelfModel.initialize = function() {
    this.reqNameMap = {};
    for (var i = 0; i < this.reqs.length; ++i) {
        var reqItem = this.reqs[i];
        this.reqNameMap[reqItem.val] = reqItem.name;
    }
}
displaySelfModel.getAuthName = function() {
    var authIndex = this.detail.auth - 1;
    var authDesc = this.auths[authIndex];
    if (authDesc) {
        return authDesc.name;
    }
    return "";
}
displaySelfModel.getReqNames = function() {
    if (!this.detail.req) {
        return "";
    }
    var reqNames = [];
    for (var req in this.detail.req) {
        var reqName = this.reqNameMap[req];
        if (reqName) {
            reqNames.push(reqName);
        }
    }
    return reqNames.join("，");
}

function displaySelf() {
    var divContentPanel = $(".div_content_panel");
    var waitingTemplate = templates.read(".hd_display_loading");
    divContentPanel.html(waitingTemplate({refreshing_data: true}));

    displaySelfModel.get(function(detail) {
        divContentPanel.html($(".hd_self_all").html());

        var selfItemTemplate = templates.read(".hd_self_item");

        var divSelfPanel = divContentPanel.find(".div_self_panel");
        //divSelfPanel.html(JSON.stringify(detail, null, 2));

        $(selfItemTemplate({type:"权限级别", value:displaySelfModel.getAuthName()})).appendTo(divSelfPanel);
        $(selfItemTemplate({type:"权限细节", value:displaySelfModel.getReqNames()})).appendTo(divSelfPanel);
        if (detail.accounts) {
            $(selfItemTemplate({type:"账号", value:detail.accounts.length})).appendTo(divSelfPanel);
        }
        if (detail.players) {
            $(selfItemTemplate({type:"角色", value:detail.players.length})).appendTo(divSelfPanel);
        }
        if (detail.heros) {
            var heroCount = 0;
            for (var i in detail.heros) {
                heroCount++;
            }
            $(selfItemTemplate({type:"关注勇者", value:heroCount})).appendTo(divSelfPanel);
        }
    });
}

$(function() {
    displayLogin();
});

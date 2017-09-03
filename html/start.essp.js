
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

var sendAjax = function(url, postData, callback) {
    $.ajax({
        type:"POST",
        url:url,
        data:JSON.stringify(postData),
        success:safe(callback),
        error:function() {
            safe(callback)(null);
        }
    });
};

var sendAjaxJSON = function(url, postData, callback) {
    console.log("request", url, postData);
    sendAjax(url, postData, function (returnData) {
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
    sendAjaxJSON(urlRoot + "/" + url, postData, safe(callback));
};

var uploadFile = function(url, callback) {
    var formUploader = $("<form></form>");
    formUploader.attr("enctype", "multipart/form-data");

    var fileLoader = $("<input/>");
    fileLoader.attr("type", "file");
    fileLoader.attr("accept", ".*");
    fileLoader.appendTo(formUploader);

    fileLoader.change(function() {
        var formData = new FormData(formUploader[0]);
        formData.append("file", fileLoader[0].files[0]);
        $.ajax({
            type:"POST",
            url:urlRoot + "/" + url,
            data:formData,
            processData:false,
            contentType:false,
            success:callback,
        });
    });
    fileLoader.click();
};

//-------------------------------------------------------------------------
// Model:page

var pageModel = {options:{}, lastRefreshTime:0,};
pageModel.refresh = function(force, callback) {
    $this = this;
    var currentTime = new Date().getTime();
    if (force || currentTime - $this.lastRefreshTime > 1000 * 10) {
        $this.lastRefreshTime = currentTime;
        requestPost("information", {}, function(json) {
            if (json) {
                $this.groups = (json.groups ? json.groups : {});
                $this.players = (json.players ? json.players : {});
                $this.match = (json.match ? json.match : {});
                $this.options = json;
                safe(callback)();
            }
        });
    } else {
        safe(callback)();
    }
}
pageModel.canClearMatch = function() {
    return this.options.clearMatch;
}
pageModel.canDeletePlayer = function() {
    return this.options.delPlayer;
}
pageModel.canEditGroup = function() {
    return this.options.editGroup;
}
pageModel.canEditUser = function() {
    return this.options.editUser;
}
pageModel.player = function(playerId) {
    var playerData = this.players[playerId];
    if (!playerData) {
        return null;
    }
    var group = this.groups[playerData.group];
    return {
        groupId:playerData.group,
        status:group.status,
        group:group.name,
        name:playerData.name,
        power:playerData.power,
        lasttime:(playerData.lastTime ? playerData.lastTime : 0),
    };
}
pageModel.addPlayer = function(name, power, group, callback) {
    $this = this;
    var player = {name:name, power:power, group:group};
    requestPost("addplayer", player, function(json) {
        if (json && json.playerId) {
            player.lastTime = json.editTime;
            $this.players[json.playerId] = player;
            safe(callback)();
        }
    });
}
pageModel.delPlayer = function(playerId, callback) {
    $this = this;
    var playerData = $this.players[playerId];
    if (!playerData) {
        return;
    }

    var playerName = playerData.name;
    requestPost("delplayer", {playerId:playerId}, function(json) {
        if (json && json.playerId && json.playerId == playerId) {
            delete $this.players[playerId];
            safe(callback)();
        }
    });
}
pageModel.editPlayerGroup = function(playerId, groupId, callback) {
    $this = this;
    var playerData = $this.players[playerId];
    if (!playerData) {
        return;
    }
    if (groupId == playerData.group) {
        return;
    }

    var playerName = playerData.name;
    requestPost("editgroup", {playerId:playerId, group:groupId}, function(json) {
        if (json && json.success) {
            playerData.group = groupId;
            safe(callback)();
        }
    });
}
pageModel.editPlayerName = function(playerId, name, callback) {
    $this = this;
    var playerData = $this.players[playerId];
    if (!playerData) {
        return;
    }
    if (name == playerData.name) {
        return;
    }

    var playerName = playerData.name;
    requestPost("editname", {playerId:playerId, name:name}, function(json) {
        if (json && json.success) {
            playerData.name = name;
            safe(callback)();
        }
    });
}
pageModel.editPlayerPower = function(playerId, power, callback) {
    $this = this;
    var playerData = $this.players[playerId];
    if (!playerData) {
        return;
    }
    if (power == playerData.power) {
        return;
    }

    var playerName = playerData.name;
    requestPost("editpower", {playerId:playerId, power:power}, function(json) {
        if (json && json.success) {
            playerData.power = power;
            playerData.lastTime = json.editTime;
            safe(callback)();
        }
    });
}
pageModel.orderWithPower = function(playerKeys) {
    var allPlayerIds = {};
    for (var playerId in playerKeys) {
        allPlayerIds[playerId] = true;
    }
    var playerIds = [];
    while (true) {
        var maxPlayerId = null;
        var maxPower = 0;
        for (var playerId in allPlayerIds) {
            var power = this.players[playerId].power;
            if (power > maxPower) {
                maxPower = power;
                maxPlayerId = playerId;
            }
        }
        if (maxPlayerId) {
            delete allPlayerIds[maxPlayerId];
            playerIds.push(maxPlayerId);
        } else {
            break;
        }
    }
    return playerIds;
}
pageModel.orderedPlayerIds = function() {
    return this.orderWithPower(this.players);
}
pageModel.group = function(groupId) {
    return this.groups[groupId];
}
pageModel.addGroup = function(name, statusLevel, callback) {
    $this = this;
    var group = {name:name, status:statusLevel};
    requestPost("addgroup", group, function(json) {
        if (json && json.groupId) {
            $this.groups[json.groupId] = group;
            safe(callback)();
        }
    });
}
pageModel.delGroup = function(groupId, callback) {
    $this = this;
    var groupData = $this.groups[groupId];
    if (!groupData) {
        return;
    }

    var groupName = groupData.name;
    requestPost("delgroup", {groupId:groupId}, function(json) {
        if (json && json.groupId && json.groupId == groupId) {
            $this.refresh(true, callback);
        }
    });
}
pageModel.groupIds = function() {
    var allGroupIds = {};
    for (var groupId in this.groups) {
        allGroupIds[groupId] = true;
    }
    var groupIds = [];
    var statusLevel = 0;
    while(true) {
        var hasGroup = false;
        for (var groupId in allGroupIds) {
            hasGroup = true;
            var groupInfo = this.groups[groupId];
            if (groupInfo.status == statusLevel) {
                groupIds.push(groupId);
                delete allGroupIds[groupId];
            }
        }
        if (!hasGroup) {
            break;
        }
        statusLevel ++;
    }
    return groupIds;
}
pageModel.selectablePlayerIds = function(groupId, namePattern) {
    var playerInMatch = {};
    for (var matchId in this.match) {
        for (var playerId in this.match[matchId].players) {
            playerInMatch[playerId] = true;
        }
    }
    var playerNotInMatch = {};
    for (var playerId in this.players) {
        var playerData = this.players[playerId];
        var matchGroup = (groupId ? (playerData.group == groupId) : true);
        var matchName = (namePattern ? (playerData.name.indexOf(namePattern) >= 0) : true);
        if (matchGroup && matchName && !playerInMatch[playerId]) {
            playerNotInMatch[playerId] = true;
        }
    }
    return this.orderWithPower(playerNotInMatch);
}
pageModel.matchLasttime = function(matchId) {
    var match = this.match[matchId];
    match = (match ? match : {});
    return (match.lastTime ? match.lastTime : 0);
}
pageModel.matchPlayerIds = function(matchId) {
    var match = this.match[matchId];
    match = (match ? match : {});
    match.players = (match.players ? match.players : {});
    return this.orderWithPower(match.players);
}
pageModel.joinmatch = function(matchId, playerId, callback) {
    $this = this;
    requestPost("joinmatch", {matchId:matchId, playerId:playerId}, function(json) {
        if (json && json.success) {
            var match = $this.match[matchId];
            match = (match ? match : {});
            match.players = (match.players ? match.players : {})
            match.players[playerId] = true;
            match.lastTime = json.editTime;
            $this.match[matchId] = match;
            safe(callback)();
        }
    });
}
pageModel.quitmatch = function(matchId, playerId, callback) {
    $this = this;
    requestPost("quitmatch", {matchId:matchId, playerId:playerId}, function(json) {
        if (json && json.success) {
            var match = $this.match[matchId];
            match = (match ? match : {});
            match.players = (match.players ? match.players : {})
            delete match.players[playerId];
            safe(callback)();
        }
    });
}
pageModel.clearallmatch = function(callback) {
    $this = this;
    requestPost("clearmatch", {matchId:9999}, function(json) {
        if (json && json.success) {
            $this.match = {};
            safe(callback)();
        }
    });
}

//-------------------------------------------------------------------------
// Model:user

var userModel = {selfKey:"NONE", states:[], uniqueStates:{}, options:{}};
userModel.refresh = function(callback) {
    $this = this;
    requestPost("listuser", {}, function(json) {
        $this.key = json.selfKey;
        $this.states = (json.states ? json.states : []);
        $this.options.addUser = !!json.states;
        $this.uniqueStates = {};
        for (var i = 0; i < $this.states.length; ++i) {
            var stateInfo = $this.states[i];
            if (stateInfo.uniqueKey) {
                $this.uniqueStates[stateInfo.uniqueKey] = stateInfo;
            }
        }
        safe(callback)();
    });
}
userModel.canAddUser = function() {
    return this.options.addUser;
}
userModel.selfKey = function() {
    return this.key;
}
userModel.orderedUsers = function() {
    var uniqueKeys = {};
    var restUsers = [];
    for (var i = 0; i < this.states.length; ++i) {
        var stateInfo = $this.states[i];
        if (stateInfo.uniqueKey) {
            uniqueKeys[stateInfo.uniqueKey] = true;
        } else {
            restUsers.push(stateInfo);
        }
    }
    var keyedUsers = [];
    while(true) {
        var minKey = "~";
        for (var uniqueKey in uniqueKeys) {
            if (uniqueKey < minKey) {
                minKey = uniqueKey;
            }
        }
        if (minKey == "~") {
            break;
        }
        keyedUsers.push(this.uniqueStates[minKey]);
        delete uniqueKeys[minKey];
    }
    return restUsers.concat(keyedUsers);
}
var userlevels = [
    "0 禁用",
    "1 浏览",
    "2 删除修改用户",
    "3 增删骑士团",
    "4 <最高>增删用户",
];
userModel.levels = function() {
    return userlevels;
}
userModel.comment = function(uniqueKey, comment, callback) {
    $this = this;
    if (!uniqueKey) {
        return;
    }

    var stateInfo = $this.uniqueStates[uniqueKey];
    if (!stateInfo || stateInfo.comment == comment) {
        return;
    }

    requestPost("commentuser", {uniqueKey:uniqueKey, comment:comment}, function(json) {
        if (json && json.uniqueKey && json.uniqueKey == uniqueKey) {
            stateInfo.comment = comment;
        }
        safe(callback)();
    });
}
userModel.promote = function(uniqueKey, level, callback) {
    $this = this;
    if (!uniqueKey) {
        return;
    }

    var stateInfo = $this.uniqueStates[uniqueKey];
    if (!stateInfo || stateInfo.level == level) {
        return;
    }

    requestPost("promoteuser", {uniqueKey:uniqueKey, level:level}, function(json) {
        if (json && json.uniqueKey && json.uniqueKey == uniqueKey) {
            stateInfo.level = level;
        }
        safe(callback)();
    });
}
userModel.disable = function(uniqueKey, callback) {
    $this = this;
    if (!uniqueKey) {
        return;
    }

    var stateInfo = $this.uniqueStates[uniqueKey];
    if (!stateInfo) {
        return;
    }

    requestPost("disableuser", {uniqueKey:uniqueKey}, function(json) {
        if (json && json.uniqueKey && json.uniqueKey == uniqueKey) {
            stateInfo.level = 0;
            stateInfo.unlockKey = json.unlockKey
        }
        safe(callback)();
    });
}
userModel.enable = function(unlockKey, callback) {
    $this = this;
    if (!unlockKey) {
        return;
    }

    requestPost("enableuser", {unlockKey:unlockKey}, function(json) {
        if (json && json.success) {
            safe(callback)(true);
        } else {
            safe(callback)(false);
        }
    });
}
userModel.addUser = function(callback) {
    $this = this;

    requestPost("adduser", {}, function(json) {
        if (json && json.success) {
            $this.refresh(callback);
        }
    });
}

//-------------------------------------------------------------------------
// Utils

var templates = {};
templates.data = {};
templates.read = function(templateCls) {
    var template = this.data[templateCls];
    if (!template) {
        template = Handlebars.compile($(templateCls).html());
        this.data[templateCls] = template;
    }
    return template;
}

var pamK = 24; // 24 hours to half reduce
var durationFromLasttime = function(lasttime) {
    var time = new Date().getTime();
    var seconds = (time - lasttime) / 1000;

    var pamKsec = pamK * 3600;
    var Y = 0;
    if (seconds > 0) {
        Y = pamKsec / (seconds + pamKsec);
    }
    var T = 1 - Y;
    var color = "rgb(" + String(Math.floor(T*255)) + "," + String(Math.floor(Y*255)) + ",0)";

    var desc = "> 7天";
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
    }

    return {color:color, desc:desc};
}

var localTimer = {funcs:[]};
localTimer.addFunc = function(func) {
    $this = this;
    if (this.funcs.length == 0) {
        (function() {
            var funcs = $this.funcs;
            var callback = function() {
                if ($this.funcs !== funcs) {
                    return;
                }
                setTimeout(callback, 3000);
                for (var i = 0; i < funcs.length; ++i) {
                    safe(funcs[i])();
                }
            };
            setTimeout(callback, 3000);
        })();
    }
    this.funcs.push(func);
}
localTimer.clearFuncs = function() {
    this.funcs = [];
}

//-------------------------------------------------------------------------
// View

var adjustPageLayout = function() {
    var topHeight = $(".div_title_bar").innerHeight();
    $(".div_content_panel").css("top", topHeight);
    $(".div_list_user").css("top", topHeight);
};

var showOnlyChild = function(outerCls, childCls) {
    $(outerCls).children().hide();
    $(childCls).show();
    $(outerCls).show();
};

var selectableModes = [
    {name:"list", desc:"玩家列表", condition:function() {return true;}, switcher:displayPlayerList},
    {name:"match", desc:"帝国战", condition:function() {return true;}, switcher:displayMatch},
    {name:"group", desc:"骑士团", condition:function() {return pageModel.canEditGroup();}, switcher:displayGroup},
];
var hashModes = {};
for (var i = 0; i < selectableModes.length; ++i) {
    var mode = selectableModes[i];
    hashModes[mode.name] = mode;
}
var switchToMode = function(modeName) {
    var mode = hashModes[modeName];
    if (mode) {
        mode.switcher();
    } else {
        displayPlayerList();
    }
}
var displayableMode = function(modeName) {
    var mode = hashModes[modeName];
    return mode && mode.desc;
}

var statusClass = [
    "display_player_green",
    "display_player_blue",
    "display_player_red",
    "display_player_orange",
];
var groupStatusToClass = function(status) {
    return statusClass[status];
}

var validPower = function(powerStr) {
    var powerNum = Number(powerStr);
    if (String(powerNum) != powerStr || powerNum < 1 || powerNum > 99999) {
        return 0;
    }
    return powerNum;
}

var initGroupSelection = function(groupList, hasZeroOption) {
    // load player list
    var groupOptionTemplate = templates.read(".hd_group_option");

    groupList.html("");
    if (hasZeroOption) {
        $("<option value=''>请选择</option>").appendTo(groupList);
    }
    var groupIds = pageModel.groupIds();
    for (var i = 0; i < groupIds.length; ++i) {
        var groupId = groupIds[i];
        var groupInfo = pageModel.group(groupId);
        $(groupOptionTemplate({groupId:groupId, name:groupInfo.name})).appendTo(groupList);
    }
}

function showMode(modeName) {
    console.log("showMode", modeName);
    if (displayableMode(modeName)) {
        StorageItem().lastMode = modeName;
    }
    localTimer.clearFuncs();

    var currMode = null;
    var allModes = [];
    var otherModes = [];
    for (var i = 0; i < selectableModes.length; ++i) {
        var mode = selectableModes[i];
        if (mode.name == modeName) {
            currMode = mode;
        }
        if (mode.desc) {
            if (mode.condition()){
                allModes.push(mode);
                if (mode.name != modeName) {
                    otherModes.push(mode);
                }
            }
        }
    }
    if (currMode) {
        console.log("switchable modes", allModes);
        var modeSelectTemplate = templates.read(".hd_selectable_modes");
        var modeSelectorContainer = $(".div_title_bar_" + modeName).find(".div_mode_selector");
        modeSelectorContainer.html("");
        var singleMode = (otherModes.length == 1);
        var templateParameter = {};
        templateParameter.singleMode = singleMode;
        if (singleMode) {
            templateParameter.singleDesc = otherModes[0].desc;
        } else {
            if (otherModes.length == allModes.length) {
                allModes = [{name:"nothing", desc:"请选择"}].concat(allModes);
            }
            templateParameter.modes = allModes;
        }
        var modeSelector = $(modeSelectTemplate(templateParameter));
        modeSelector.appendTo(modeSelectorContainer);
        if (singleMode) {
            modeSelector.click(function() {
                otherModes[0].switcher();
            });
        } else {
            modeSelector.val(currMode.name);
            modeSelector.change(function() {
                var selectedMode = modeSelector.val();
                switchToMode(selectedMode);
            });
        }
    }
    showOnlyChild(".div_title_bar", ".div_title_bar_" + modeName);
    showOnlyChild(".div_content_panel", ".div_content_panel_" + modeName);
    adjustPageLayout();

    var showUserList = false;
    $(".div_list_user").hide();
    $(".div_manage_user").removeClass("div_manage_user_on");
    $(".div_manage_user").unbind();
    $(".div_manage_user").click(function() {
        if (showUserList) {
            showUserList = false;
            $(".div_list_user").hide();
            $(".div_manage_user").removeClass("div_manage_user_on");
        } else {
            showUserList = true;
            $(".div_list_user").show();
            $(".div_manage_user").addClass("div_manage_user_on");
        }
    });
    $(".div_navigate_races").hide();
    $(".div_navigate_stars").hide();
    $(".div_user_manage").unbind();
    $(".div_user_manage").click(function() {
        displayUser(false);
    });
    $(".div_user_logout").unbind();
    $(".div_user_logout").click(function() {
        if (confirm("确认退出？")) {
            delete StorageItem().serial_string;
            requestPost("giveup", {}, displayWelcome);
        }
    });
};

function displayUser(locked) {
    showMode("user");

    $(".div_refresh_data").unbind();
    $(".div_refresh_data").click(function() {
        userModel.refresh(loadUser);
    });
    if (!locked) {
        $(".div_user_back").unbind();
        $(".div_user_back").click(function() {
            switchToMode(StorageItem().lastMode);
        });
    }
    if (locked) {
        $(".div_unlock_key_container").show();
        $(".input_unlock_key_button").unbind();
        $(".input_unlock_key_button").click(function() {
            var unlockKey = $(".input_unlock_key").val();
            userModel.enable(unlockKey, function(unlocked) {
                if (!unlocked) {
                    alert("解锁码错误！");
                } else {
                    pageModel.refresh(true, function() {
                        switchToMode(StorageItem().lastMode);
                    });
                }
            });
        });
    } else {
        $(".div_unlock_key_container").hide();
    }

    function loadUser() {
        var divAddUser = $(".div_add_user_pwd");
        if (userModel.canAddUser()) {
            divAddUser.show();
            divAddUser.unbind();
            divAddUser.click(function() {
                if (confirm("确认添加新用户？")) {
                    userModel.addUser(function() {
                        loadUser();
                    });
                }
            });
        } else {
            divAddUser.hide();
        }
        $(".div_unique_key_display").html(userModel.selfKey());

        var userListTemplate = templates.read(".hd_user_item");
        var tbodyUserList = $(".table_user_list").find("tbody");

        var users = userModel.orderedUsers();
        var levelNames = userModel.levels();
        var levels = [];
        for (var i = 0; i < levelNames.length; ++i) {
            levels.push({value:i, name:levelNames[i]});
        }
        if (users.length > 0) {
            $(".div_user_list_container").show();
        } else {
            $(".div_user_list_container").hide();
        }
        tbodyUserList.html("");
        for (var i = 0; i < users.length; ++i) {
            (function() {
                var userInfo = users[i];
                var tableRowUser = $(userListTemplate({
                    uniqueKey:(userInfo.uniqueKey ? userInfo.uniqueKey : "missing"),
                    comment:(userInfo.comment ? userInfo.comment : "无"),
                    levelText:levels[userInfo.level].name,
                    levels:levels.slice(1),
                    unlockKey:(userInfo.unlockKey ? userInfo.unlockKey : "missing"),
                    enterKey:(userInfo.enterSerial ? userInfo.enterSerial : "missing")
                }));

                tableRowUser.appendTo(tbodyUserList);

                var newUser = !!userInfo.enterSerial;
                var superUser = userInfo.level == 4;
                var disabledUser = userInfo.level == 0;

                var divUserComment = tableRowUser.find(".div_user_comment");
                var inputUserComment = tableRowUser.find(".input_user_comment");
                if (userInfo.uniqueKey) {
                    divUserComment.click(function() {
                        divUserComment.hide();
                        inputUserComment.val(userInfo.comment ? userInfo.comment : "");
                        inputUserComment.show();
                        inputUserComment.focus();
                        inputUserComment.select();
                    });
                    inputUserComment.blur(function() {
                        inputUserComment.hide();
                        var comment = inputUserComment.val();
                        divUserComment.html(comment ? comment : "无");
                        divUserComment.show();

                        userModel.comment(userInfo.uniqueKey, comment, function() {
                            loadUser();
                        });
                    });
                }

                if (!superUser && !disabledUser) {
                    var divUserLevel = tableRowUser.find(".div_user_level");
                    var selectUserLevel = tableRowUser.find(".select_user_level");
                    selectUserLevel.val(userInfo.level);
                    if (userInfo.uniqueKey) {
                        divUserLevel.click(function() {
                            divUserLevel.hide();
                            selectUserLevel.show();
                            selectUserLevel.focus();
                        });
                        selectUserLevel.change(function() {
                            var level = selectUserLevel.val();
                            if (confirm("确定修改权限为" + level + "？")) {
                                divUserLevel.html(levels[level].name);

                                userModel.promote(userInfo.uniqueKey, level, function() {
                                    loadUser();
                                });
                            } else {
                                selectUserLevel.val(userInfo.level);
                            }
                        });
                        selectUserLevel.blur(function() {
                            selectUserLevel.hide();
                            divUserLevel.show();
                        });
                    }
                }

                var inputUserForbid = tableRowUser.find(".input_user_forbid");
                var divUserForbid = tableRowUser.find(".div_user_forbid");
                var divUserEnter = tableRowUser.find(".div_user_enter");
                if (newUser) {
                    inputUserForbid.hide();
                    divUserForbid.hide();
                    divUserEnter.show();
                } else if (superUser) {
                    inputUserForbid.hide();
                    divUserForbid.hide();
                    divUserEnter.hide();
                } else if (disabledUser) {
                    inputUserForbid.hide();
                    divUserForbid.show();
                    divUserEnter.hide();
                } else {
                    inputUserForbid.show();
                    divUserForbid.hide();
                    divUserEnter.hide();
                    if (userInfo.uniqueKey) {
                        inputUserForbid.click(function() {
                            if (confirm("确认禁用用户" + (userInfo.comment ? userInfo.comment : userInfo.uniqueKey) + "？")) {
                                inputUserForbid.hide();

                                userModel.disable(userInfo.uniqueKey, function() {
                                    loadUser();
                                });
                            }
                        });
                    }
                }

            })();
        }
    }
    userModel.refresh(loadUser);
}

function displayGroup() {
    showMode("group");

    // refresh
    $(".div_refresh_data").unbind();
    $(".div_refresh_data").click(function() {
        pageModel.refresh(true, loadGroups);
    });

    // add new group
    var divAddGroup = $(".div_add_group_mask");
    var clearNewGroupInfo = function() {
        divAddGroup.hide();
        $(".input_group_name").val("");
        $(".select_group_level").val(0);
    };
    clearNewGroupInfo();
    $(".div_new_group").unbind();
    $(".div_new_group").click(function() {
        divAddGroup.show();
    });
    $(".add_group_cancel").unbind();
    $(".add_group_cancel").click(clearNewGroupInfo);
    $(".add_group_confirm").unbind();
    $(".add_group_confirm").click(function() {
        var name = $(".input_group_name").val();
        if (name == '') {
            alert("不是有效的骑士团名字");
            $(".input_group_name").focus();
            return;
        }

        var statusLevel = $(".select_group_level").val();
        clearNewGroupInfo();

        pageModel.addGroup(name, statusLevel, function() {
            loadGroups();
        });
    });

    var groupDisplayTemplate = templates.read(".hd_group_item");

    var divGroupList = $(".div_group_list");
    function loadGroups() {
        divGroupList.html("");
        var groupIds = pageModel.groupIds();
        for (var i = 0; i < groupIds.length; ++i) {
            (function() {
                var groupId = groupIds[i];
                var groupInfo = pageModel.group(groupId);

                var groupBlock = $(groupDisplayTemplate(groupInfo));
                groupBlock.appendTo(divGroupList);
                groupBlock.find(".div_group_name").addClass(groupStatusToClass(groupInfo.status));
                groupBlock.find(".div_group_delete").click(function() {
                    if (confirm("确认删除'" + groupInfo.name + "'？")) {
                        pageModel.delGroup(groupId, function() {
                            loadGroups();
                        });
                    }
                });
            })();
        }
    }
    pageModel.refresh(false, loadGroups);
}

function addPlayerToList(playerId, divParent, access, callback) {
    var racePlayerTemplate = templates.read(".hd_player_item");

    var playerInfo = pageModel.player(playerId);
    var playerData = {
        group:playerInfo.group,
        name:playerInfo.name,
        power:playerInfo.power,
    };
    var playerBlock = $(racePlayerTemplate(playerData));
    playerBlock.appendTo(divParent);
    playerBlock.find(".div_player_group").addClass(groupStatusToClass(playerInfo.status));

    var divPlayerLasttime = playerBlock.find(".div_player_lasttime");
    var updateLasttime = function() {
        var duration = durationFromLasttime(playerInfo.lasttime);
        divPlayerLasttime.html(duration.desc);
        divPlayerLasttime.css("color", duration.color);
    };
    updateLasttime();
    localTimer.addFunc(updateLasttime);

    if (access.del) {
        playerBlock.find(".div_player_delete_option").show();
        playerBlock.find(".div_player_delete").click(function() {
            safe(callback)("del");
        });
    }
    if (access.group) {
        var divShowGroup = playerBlock.find(".div_player_group");
        var selectEditGroup = playerBlock.find(".select_player_group_edit");
        initGroupSelection(selectEditGroup);
        divShowGroup.click(function() {
            divShowGroup.hide();
            selectEditGroup.val(playerInfo.groupId);
            selectEditGroup.show();
            selectEditGroup.focus();
        });
        selectEditGroup.blur(function() {
            var groupId = selectEditGroup.val();
            safe(callback)("group", groupId);

            selectEditGroup.hide();
            divShowGroup.show();
        });
    }
    if (access.name) {
        var divShowName = playerBlock.find(".div_player_name");
        var inputEditName = playerBlock.find(".input_player_name_edit");
        divShowName.click(function() {
            divShowName.hide();
            inputEditName.val(playerInfo.name);
            inputEditName.show();
            inputEditName.focus();
        });
        inputEditName.blur(function() {
            var name = inputEditName.val();
            if (name != '') {
                safe(callback)("name", name);
            }

            inputEditName.hide();
            divShowName.show();
        });
    }
    if (access.power) {
        var divShowPower = playerBlock.find(".div_player_power");
        var inputEditPower = playerBlock.find(".input_player_power_edit");
        divShowPower.click(function() {
            divShowPower.hide();
            inputEditPower.val(playerInfo.power);
            inputEditPower.select();
            inputEditPower.show();
            inputEditPower.focus();
        });
        inputEditPower.keypress(function (e) {
            if (e.which == 13) {
                inputEditPower.hide();
            }
        });
        inputEditPower.blur(function() {
            var power = validPower(inputEditPower.val());
            if (power){
                safe(callback)("power", power);
            }

            inputEditPower.hide();
            divShowPower.show();
        });
    }
}

function displayPlayerList() {
    showMode("list");

    // refresh
    $(".div_refresh_data").unbind();
    $(".div_refresh_data").click(function() {
        pageModel.refresh(true, loadPlayers);
    });

    // add new player
    var divAddPlayer = $(".div_add_player_mask");
    var clearNewPlayerInfo = function() {
        divAddPlayer.hide();
        $(".input_player_name").val("");
        $(".input_player_power").val("");
        $(".select_player_group").val(0);
    };
    clearNewPlayerInfo();
    $(".div_new_player").unbind();
    $(".div_new_player").click(function() {
        divAddPlayer.show();
    });
    $(".add_player_cancel").unbind();
    $(".add_player_cancel").click(clearNewPlayerInfo);
    $(".add_player_confirm").unbind();
    $(".add_player_confirm").click(function() {
        var name = $(".input_player_name").val();
        if (name == '') {
            alert("不是有效的名字");
            $(".input_player_name").focus();
            return;
        }

        var power = validPower($(".input_player_power").val());
        if (!power) {
            alert("不是有效的战力值");
            $(".input_player_power").focus();
            return;
        }

        var groupId = $(".select_player_group").val();

        clearNewPlayerInfo();
        pageModel.addPlayer(name, power, groupId, function() {
            loadPlayers();
        });
    });

    var divPlayerList = $(".div_player_list");
    var selectGroupList = $(".select_player_group");
    function loadPlayers() {
        localTimer.clearFuncs();
        divPlayerList.html("");
        var playerIds = pageModel.orderedPlayerIds();
        for (var i = 0; i < playerIds.length; ++i) {
            (function() {
                var playerId = playerIds[i];
                var playerName = pageModel.player(playerId).name;
                var callback = function(name, val) {
                    if (name == 'del') {
                        if (confirm("确定删除'" + playerName + "'？")) {
                            pageModel.delPlayer(playerId, function() {
                                loadPlayers();
                            });
                        }
                    } else if (name == 'power') {
                        pageModel.editPlayerPower(playerId, val, function() {
                            loadPlayers();
                        });
                    } else if (name == 'name') {
                        pageModel.editPlayerName(playerId, val, function() {
                            loadPlayers();
                        });
                    } else if (name == 'group') {
                        pageModel.editPlayerGroup(playerId, val, function() {
                            loadPlayers();
                        });
                    }
                };
                addPlayerToList(playerId, divPlayerList, {
                    del:pageModel.canDeletePlayer(),
                    group:pageModel.canDeletePlayer(),
                    name:pageModel.canDeletePlayer(),
                    power:true,
                }, callback);
            })();
        }

        initGroupSelection(selectGroupList);
    }
    pageModel.refresh(false, loadPlayers);
}

function displayMatch() {
    showMode("match");

    $(".div_refresh_data").unbind();
    $(".div_refresh_data").click(function() {
        pageModel.refresh(true, loadMatch);
    });

    var divClearAllMatch = $(".div_clear_all_match");
    if (pageModel.canClearMatch()) {
        divClearAllMatch.show();
        divClearAllMatch.unbind();
        divClearAllMatch.click(function() {
            if (confirm("确认清空整场比赛？")) {
                pageModel.clearallmatch(function() {
                    loadMatch();
                });
            }
        });
    } else {
        divClearAllMatch.hide();
    }

    var addPlayerToMatchId = null;
    var divAddMatchMask = $(".div_add_match_mask");
    var selectAddMatchGroup = $(".select_add_match_group");
    var inputAddMatchName = $(".input_add_match_name");
    var selectMatchPlayer = $(".select_add_match_player");
    var updateSelectablePlayers = function() {
        var groupId = selectAddMatchGroup.val();
        var namePattern = inputAddMatchName.val();
        var selectablePlayerIds = pageModel.selectablePlayerIds(groupId, namePattern);
        console.log("update selected players", groupId, namePattern, selectablePlayerIds.length);
        selectMatchPlayer.html("");
        for (var i = 0; i < selectablePlayerIds.length; ++i) {
            var playerId = selectablePlayerIds[i];
            var playerInfo = pageModel.player(playerId);
            $(playerOptionTemplate({
                playerId:playerId,
                group:playerInfo.group,
                name:playerInfo.name,
                power:playerInfo.power,
            })).appendTo(selectMatchPlayer);
        }
    };
    initGroupSelection(selectAddMatchGroup, true);
    var clearSearchControl = function() {
        selectAddMatchGroup.val(0);
        inputAddMatchName.val("");
        divAddMatchMask.hide();
    };
    $(".add_match_cancel").unbind();
    $(".add_match_cancel").click(function() {
        clearSearchControl();
    });
    $(".add_match_confirm").unbind();
    $(".add_match_confirm").click(function() {
        clearSearchControl();
        var playerId = selectMatchPlayer.val();
        if (playerId) {
            pageModel.joinmatch(addPlayerToMatchId, playerId, function() {
                loadMatch();
            });
        }
    });
    selectAddMatchGroup.change(updateSelectablePlayers);
    inputAddMatchName.change(updateSelectablePlayers);

    var raceBlockTemplate = templates.read(".hd_race_block");
    var playerOptionTemplate = templates.read(".hd_player_option");
    var navigateRaceTemplate = templates.read(".hd_navigate_race_item");
    var navigateStarTemplate = templates.read(".hd_navigate_star_item");

    var divMatchDetail = $(".div_match_detail");
    var divNavigateRaces = $(".div_navigate_races");
    var divNavigateStars = $(".div_navigate_stars");
    function loadMatch() {
        var raceBlocks = {};
        var scrollToMatch = function(matchId) {
            var targetBlock = raceBlocks[matchId];
            if (targetBlock) {
                var top = targetBlock.position().top;
                $("html,body").animate({"scrollTop":top})
            }
        };
        localTimer.clearFuncs();

        var genMatchId = function(raceIndex, starIndex) {
            return raceIndex * 1000 + starIndex;
        };
        divMatchDetail.html("");
        divNavigateRaces.html("");
        var raceTypes = ["黄鹿", "玫瑰", "咸鱼"];
        var raceListShown = -1;
        for (var raceI = 0; raceI < raceTypes.length; ++raceI) {
            (function() {
                var raceIndex = raceI;
                var isgoden = (raceIndex < 2);
                var colorCls = (isgoden ? "display_race_golden" : "display_race_gray");
                for (var starIndex = 10; starIndex >= 1; --starIndex) {
                    (function() {
                        var currentMatchId = genMatchId(raceIndex, starIndex);
                        var starName = raceTypes[raceIndex] + starIndex + "星";
                        var raceBlock = $(raceBlockTemplate({name:starName,}));
                        raceBlock.appendTo(divMatchDetail);
                        raceBlocks[currentMatchId] = raceBlock;
                        raceBlock.find(".div_race_title_text").addClass(colorCls);

                        var divRaceLasttime = raceBlock.find(".div_race_lasttime");
                        var updateLasttime = function() {
                            var lasttime = pageModel.matchLasttime(currentMatchId);
                            var duration = durationFromLasttime(lasttime);
                            divRaceLasttime.html(duration.desc);
                            divRaceLasttime.css("color", duration.color);
                        };
                        updateLasttime();
                        localTimer.addFunc(updateLasttime);

                        var addButton = raceBlock.find(".div_race_title_add");
                        addButton.click(function() {
                            addPlayerToMatchId = currentMatchId;
                            updateSelectablePlayers();
                            divAddMatchMask.show();
                        });

                        var matchPlayerIds = pageModel.matchPlayerIds(currentMatchId);
                        var divPlayers = raceBlock.find(".div_race_players");
                        for (var i = 0; i < matchPlayerIds.length; ++i) {
                            (function() {
                                var playerId = matchPlayerIds[i];
                                var callback = function(name, val) {
                                    if (name == 'del') {
                                        pageModel.quitmatch(currentMatchId, playerId, function() {
                                            loadMatch();
                                        });
                                    } else if (name == 'power') {
                                        pageModel.editPlayerPower(playerId, val, function() {
                                            loadMatch();
                                        });
                                    }
                                };
                                addPlayerToList(playerId, divPlayers, {
                                    del:true,
                                    power:true
                                }, callback);
                            })();
                        }
                        if (matchPlayerIds.length == 0) {
                            divPlayers.html("无人报名");
                        }
                    })();
                }

                var raceSelectBlock = $(navigateRaceTemplate({name:raceTypes[raceIndex]}));
                raceSelectBlock.appendTo(divNavigateRaces);
                raceSelectBlock.addClass(colorCls);
                raceSelectBlock.click(function() {
                    if (raceListShown == raceIndex) {
                        divNavigateStars.hide();
                        raceListShown = -1;
                    } else {
                        divNavigateStars.html("");
                        for (var starIndex = 10; starIndex >= 1; --starIndex) {
                            (function() {
                                var currentMatchId = genMatchId(raceIndex, starIndex);
                                var starName = raceTypes[raceIndex] + starIndex + "星";
                                var starSelectBlock = $(navigateStarTemplate({name:starName}));
                                starSelectBlock.appendTo(divNavigateStars);
                                starSelectBlock.addClass(colorCls);
                                starSelectBlock.click(function() {
                                    scrollToMatch(currentMatchId);
                                    divNavigateStars.hide();
                                    raceListShown = -1;
                                });
                            })();
                        }
                        divNavigateStars.show();
                        raceListShown = raceIndex;
                    }
                });
            })();
        }
        divNavigateRaces.show();
    }
    pageModel.refresh(false, loadMatch);
}

function displayWelcome() {
    var exchange = function (serial, success, failed) {
        requestPost("exchange", {serial:serial}, function(json) {
            if (json && json.serial) {
                StorageItem().serial_string = json.serial;
                safe(success)(json.locked);
            } else {
                delete StorageItem().serial_string;
                safe(failed)();
            }
        });
    };

    var successFunc = function(locked) {
        if (locked) {
            displayUser(true);
        } else {
            pageModel.refresh(true, function() {
                switchToMode(StorageItem().lastMode);
            });
        }
    }

    $(".input_confirm_pwd").unbind();
    $(".input_confirm_pwd").click(function () {
        inputNext($(".input_type_pwd").val());
    });
    $(".input_type_pwd").unbind();
    $(".input_type_pwd").keypress(function (e) {
        if (e.which == 13) {
            $(".input_confirm_pwd").click();
        }
    });

    var serial = StorageItem().serial_string;
    if (serial) {
        exchange(serial, successFunc, exchangeNext);
    } else {
        exchangeNext();
    }

    function exchangeNext() {
        showMode("welcome");

        $(".input_confirm_pwd").show();
        $(".input_type_pwd").focus();
    }

    function inputNext(serial) {
        $(".input_confirm_pwd").hide();
        $(".input_type_pwd").val("");
        exchange(serial, successFunc, exchangeNext);
    }
}

$(function() {
    adjustPageLayout();
    $(window).resize(adjustPageLayout);

    displayWelcome();
});


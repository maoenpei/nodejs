
var urlRoot = "<%=PageInfo.urlRoot%>";
var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

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
    sendAjax(url, postData, function (returnData) {
        var json = null;
        try {
            json = JSON.parse(returnData);
        } catch(e) {
        }
        if (json) {
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
// Model

var pageModel = {options:{}, lastTime:0,};
pageModel.refresh = function(force, callback) {
    $this = this;
    var currentTime = new Date().getTime();
    console.log("refresh", currentTime - $this.lastTime);
    if (force || currentTime - $this.lastTime > 1000 * 10) {
        $this.lastTime = currentTime;
        requestPost("information", {}, function(json) {
            if (json) {
                console.log("information result", json);
                $this.groups = json.groups;
                $this.players = json.players;
                $this.match = json.match;
                $this.options = json;
                safe(callback)();
            }
        });
    } else {
        safe(callback)();
    }
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
    var player = this.players[playerId];
    var group = this.groups[player.group];
    return {
        status:group.status,
        group:group.name,
        name:player.name,
        power:player.power,
    };
}
pageModel.addPlayer = function(name, power, group, callback) {
    $this = this;
    console.log("addplayer", name, power, group);

    var player = {name:name, power:power, group:group};
    requestPost("addplayer", player, function(json) {
        if (json && json.playerId) {
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
    console.log("delplayer", playerId, playerName);

    requestPost("delplayer", {playerId:playerId}, function(json) {
        if (json && json.playerId && json.playerId == playerId) {
            delete $this.players[playerId];
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
    console.log("editpower", playerId, playerName, power);

    requestPost("editpower", {playerId:playerId, power:power}, function(json) {
        if (json && json.success) {
            playerData.power = power;
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
    console.log("addgroup", name, statusLevel);

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
    console.log("delgroup", groupId, groupName);

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
pageModel.selectablePlayerIds = function() {
    var playerInMatch = {};
    for (var matchId in this.match) {
        for (var playerId in this.match[matchId]) {
            playerInMatch[playerId] = true;
        }
    }
    var playerNotInMatch = {};
    for (var playerId in this.players) {
        if (!playerInMatch[playerId]) {
            playerNotInMatch[playerId] = true;
        }
    }
    return this.orderWithPower(playerNotInMatch);
}
pageModel.matchPlayerIds = function(matchId) {
    var match = this.match[matchId];
    match = (match ? match : {});
    return this.orderWithPower(match);
}
pageModel.joinmatch = function(matchId, playerId, callback) {
    $this = this;
    requestPost("joinmatch", {matchId:matchId, playerId:playerId}, function(json) {
        if (json && json.success) {
            var match = $this.match[matchId];
            match = (match ? match : {});
            match[playerId] = true;
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
            delete match[playerId];
            safe(callback)();
        }
    });
}

//-------------------------------------------------------------------------
// Template

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

//-------------------------------------------------------------------------
// View

var adjustContentHeight = function(titleCls, contentCls) {
    var total = parseInt($("body").css("height"));
    var title = parseInt($(titleCls).css("height"));
    console.log("height", total, title);
    $(contentCls).css("height", total - title);
};

var showOnlyChild = function(outerCls, childCls) {
    $(outerCls).children().hide();
    $(childCls).show();
    $(outerCls).show();
};

var clearEvents = function() {
    $(".div_refresh_data").unbind();
    $(".div_log_off").unbind();
    $(".div_new_player").unbind();
    $(".div_new_group").unbind();
    $(".add_player_confirm").unbind();
    $(".add_player_cancel").unbind();
    $(".add_group_confirm").unbind();
    $(".add_group_cancel").unbind();
    $(".input_type_pwd").unbind();
    $(".input_confirm_pwd").unbind();
}

var selectableModes = [
    {name:"list", desc:"玩家列表", condition:function() {return true;}, switcher:displayPlayerList},
    {name:"match", desc:"帝国战", condition:function() {return true;}, switcher:displayMatch},
    {name:"manage", desc:"管理", condition:function() {return pageModel.canEditGroup();}, switcher:displayManage},
];
var hashModes = {};
for (var i = 0; i < selectableModes.length; ++i) {
    var mode = selectableModes[i];
    hashModes[mode.name] = mode;
}
function switchToMode(modeName) {
    var mode = hashModes[modeName];
    if (mode) {
        mode.switcher();
    } else {
        displayPlayerList();
    }
}

var showMode = function(modeName) {
    console.log("mode", modeName);
    localStorage.lastMode = modeName;
    var currMode = null;
    var modes = [];
    for (var i = 0; i < selectableModes.length; ++i) {
        var mode = selectableModes[i];
        if (mode.name == modeName) {
            currMode = mode;
        } else if (mode.condition()){
            modes.push(mode);
        }
    }
    if (currMode) {
        console.log("modes", modes);
        var modeSelectTemplate = templates.read(".hd_selectable_modes");
        var modeSelectorContainer = $(".div_title_bar_" + modeName).find(".div_mode_selector");
        modeSelectorContainer.html("");
        var templateParameter = {};
        templateParameter.singleMode = (modes.length == 1);
        if (modes.length == 1) {
            templateParameter.singleDesc = modes[0].desc;
        } else {
            templateParameter.modes = [currMode].concat(modes);
        }
        var modeSelector = $(modeSelectTemplate(templateParameter));
        modeSelector.appendTo(modeSelectorContainer);
        if (modes.length == 1) {
            modeSelector.click(function() {
                modes[0].switcher();
            });
        } else {
            modeSelector.change(function() {
                var selectedMode = modeSelector.val();
                switchToMode(selectedMode);
            });
        }
    }
    showOnlyChild(".div_title_bar", ".div_title_bar_" + modeName);
    showOnlyChild(".div_content_panel", ".div_content_panel_" + modeName);
    adjustContentHeight(".div_title_bar", ".div_content_panel");

    $(".div_log_off").click(function() {
        delete localStorage.serial_string;
        requestPost("giveup", {}, displayWelcome);
    });
};

function displayManage() {
    clearEvents();
    showMode("manage");

    // refresh
    $(".div_refresh_data").click(function() {
        pageModel.refresh(true, loadGroups);
    });

    // add new group
    var divAddGroup = $(".div_add_group_info");
    var clearNewGroupInfo = function() {
        divAddGroup.hide();
        $(".input_group_name").val("");
        $(".select_group_level").val(0);
    };
    clearNewGroupInfo();
    $(".div_new_group").click(function() {
        divAddGroup.show();
    });
    $(".add_group_cancel").click(clearNewGroupInfo);
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
                var enemy = (groupInfo.status != 0);

                var groupBlock = $(groupDisplayTemplate(groupInfo));
                groupBlock.appendTo(divGroupList);
                groupBlock.find(".div_greoup_name").addClass(enemy ? "display_player_red" : "display_player_green");
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

function addPlayerToList(playerId, divParent, delCallback, editCallback) {
    var racePlayerTemplate = templates.read(".hd_player_item");

    var playerInfo = pageModel.player(playerId);
    var playerData = {
        enemy:(playerInfo.status != 0),
        group:playerInfo.group,
        name:playerInfo.name,
        power:playerInfo.power,
    };
    var playerBlock = $(racePlayerTemplate(playerData));
    playerBlock.appendTo(divParent);
    playerBlock.find(".div_player_group").addClass(playerData.enemy ? "display_player_red" : "display_player_green");
    if (delCallback) {
        playerBlock.find(".div_player_delete_option").show();
        playerBlock.find(".div_player_delete").click(delCallback);
    }
    if (editCallback) {
        var divShowPower = playerBlock.find(".div_player_power");
        var inputEditPower = playerBlock.find(".input_player_power_edit");
        playerBlock.find(".div_player_display").click(function() {
            divShowPower.hide();
            inputEditPower.val(playerInfo.power);
            inputEditPower.show();
            inputEditPower.focus();
        });
        inputEditPower.blur(function() {
            var power = inputEditPower.val();
            var powerNum = Number(power);
            if (String(powerNum) != power || powerNum < 1 || powerNum > 99999) {
                // Don't do anything.
            } else {
                editCallback(powerNum);
            }

            inputEditPower.hide();
            divShowPower.show();
        });
    }
}

function displayPlayerList() {
    clearEvents();
    showMode("list");

    // refresh
    $(".div_refresh_data").click(function() {
        pageModel.refresh(true, loadPlayers);
    });

    // add new player
    var divAddPlayer = $(".div_add_player_info");
    var clearNewPlayerInfo = function() {
        divAddPlayer.hide();
        $(".input_player_name").val("");
        $(".input_player_power").val("");
        $(".select_player_group").val(0);
    };
    clearNewPlayerInfo();
    $(".div_new_player").click(function() {
        divAddPlayer.show();
    });
    $(".add_player_cancel").click(clearNewPlayerInfo);
    $(".add_player_confirm").click(function() {
        var name = $(".input_player_name").val();
        if (name == '') {
            alert("不是有效的名字");
            $(".input_player_name").focus();
            return;
        }

        var power = $(".input_player_power").val();
        var powerNum = Number(power);
        if (String(powerNum) != power || powerNum < 1 || powerNum > 99999) {
            alert("不是有效的战力值");
            $(".input_player_power").focus();
            return;
        }

        var groupId = $(".select_player_group").val();

        clearNewPlayerInfo();
        pageModel.addPlayer(name, powerNum, groupId, function() {
            loadPlayers();
        });
    });

    // load player list
    var groupOptionTemplate = templates.read(".hd_group_option");

    var divPlayerList = $(".div_player_list");
    var selectGroupList = $(".select_player_group");
    function loadPlayers() {
        divPlayerList.html("");
        var playerIds = pageModel.orderedPlayerIds();
        for (var i = 0; i < playerIds.length; ++i) {
            (function() {
                var playerId = playerIds[i];
                var playerName = pageModel.player(playerId).name;
                var deleteCallback = (!pageModel.canDeletePlayer() ? null : function() {
                    if (confirm("确定删除'" + playerName + "'？")) {
                        pageModel.delPlayer(playerId, function() {
                            loadPlayers();
                        });
                    }
                });
                var editCallback = function(power) {
                    console.log("edit power", power);

                    pageModel.editPlayerPower(playerId, power, function() {
                        loadPlayers();
                    });
                };
                addPlayerToList(playerId, divPlayerList, deleteCallback, editCallback);
            })();
        }

        selectGroupList.html("");
        var groupIds = pageModel.groupIds();
        for (var i = 0; i < groupIds.length; ++i) {
            var groupId = groupIds[i];
            var groupInfo = pageModel.group(groupId);
            $(groupOptionTemplate({groupId:groupId, name:groupInfo.name})).appendTo(selectGroupList);
        }
    }
    pageModel.refresh(false, loadPlayers);
}

function displayMatch() {
    clearEvents();
    showMode("match");

    $(".div_refresh_data").click(function() {
        pageModel.refresh(true, loadMatch);
    });

    var raceBlockTemplate = templates.read(".hd_race_block");
    var playerOptionTemplate = templates.read(".hd_player_option");

    var divContentPanel = $(".div_content_panel_match");
    function loadMatch() {
        divContentPanel.html("");
        var raceTypes = ["黄鹿", "玫瑰", "咸鱼"];
        for (var raceIndex = 0; raceIndex < raceTypes.length; ++raceIndex) {
            for (var starIndex = 10; starIndex >= 1; --starIndex) {
                (function() {
                    var currentMatchId = raceIndex * 1000 + starIndex;
                    var raceBlock = $(raceBlockTemplate({
                        name:(raceTypes[raceIndex] + starIndex + "星"),
                    }));
                    raceBlock.appendTo(divContentPanel);
                    var isgoden = (raceIndex < 2);
                    raceBlock.find(".div_race_title_text").addClass(isgoden ? "display_race_golden" : "display_race_gray");

                    var addButton = raceBlock.find(".div_race_title_add");
                    var playerSelect = raceBlock.find(".select_match_player");
                    addButton.click(function() {
                        playerSelect.html("");
                        playerSelect.append($("<option value='0'>请选择</option>"));
                        var selectablePlayerIds = pageModel.selectablePlayerIds();
                        for (var i = 0; i < selectablePlayerIds.length; ++i) {
                            var playerId = selectablePlayerIds[i];
                            var playerInfo = pageModel.player(playerId);
                            $(playerOptionTemplate({
                                playerId:playerId,
                                group:playerInfo.group,
                                name:playerInfo.name,
                                power:playerInfo.power,
                            })).appendTo(playerSelect);
                        }

                        addButton.hide();
                        playerSelect.show();
                        playerSelect.focus();
                    });
                    playerSelect.change(function() {
                        addButton.show();
                        playerSelect.hide();

                        var playerId = playerSelect.val();
                        console.log("select", playerId);
                        if (playerId == 0) {
                            return;
                        }
                        pageModel.joinmatch(currentMatchId, playerId, function() {
                            loadMatch();
                        });
                    });
                    playerSelect.blur(function() {
                        addButton.show();
                        playerSelect.hide();
                    });

                    var matchPlayerIds = pageModel.matchPlayerIds(currentMatchId);
                    var divPlayers = raceBlock.find(".div_race_players");
                    for (var i = 0; i < matchPlayerIds.length; ++i) {
                        (function() {
                            var playerId = matchPlayerIds[i];
                            addPlayerToList(playerId, divPlayers, function() {
                                pageModel.quitmatch(currentMatchId, playerId, function() {
                                    loadMatch();
                                });
                            }, null);
                        })();
                    }
                    if (matchPlayerIds.length == 0) {
                        divPlayers.html("无人报名");
                    }
                })();
            }
        }
    }
    pageModel.refresh(false, loadMatch);
}

function displayWelcome() {
    clearEvents();

    var exchange = function (serial, success, failed) {
        requestPost("exchange", {serial:serial}, function(json) {
            console.log("exchange result", json);
            if (json && json.serial) {
                localStorage.serial_string = json.serial;
                safe(success)();
            } else {
                safe(failed)();
            }
        });
    };

    var successFunc = function() {
        pageModel.refresh(true, function() {
            switchToMode(localStorage.lastMode);
        });
    }

    $(".input_confirm_pwd").click(function () {
        inputNext($(".input_type_pwd").val());
    });
    $(".input_type_pwd").keypress(function (e) {
        if (e.which == 13) {
            $(".input_confirm_pwd").click();
        }
    });

    var serial = localStorage.serial_string;
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
    adjustContentHeight(".div_title_bar", ".div_content_panel");
    $(window).resize(function() {adjustContentHeight(".div_title_bar", ".div_content_panel");});

    displayWelcome();
});


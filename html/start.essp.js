
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

var adjustContentHeight = function(titleCls, contentCls) {
    var total = parseInt($("body").css("height"));
    var title = parseInt($(titleCls).css("height"));
    $(contentCls).css("height", total - title);
};

var showOnlyChild = function(outerCls, childCls) {
    $(outerCls).children().hide();
    $(childCls).show();
    $(outerCls).show();
};

var showMode = function(modeName) {
    console.log("mode", modeName);
    showOnlyChild(".div_title_bar", ".div_title_bar_" + modeName);
    showOnlyChild(".div_content_panel", ".div_content_panel_" + modeName);
};

var clearEvents = function() {
    $(".input_type_pwd").unbind();
    $(".div_refresh_data").unbind();
    $(".input_confirm_pwd").unbind();
    $(".div_log_off").unbind();
    $(".div_to_match").unbind();
    $(".div_log_off").unbind();
    $(".div_to_playerlist").unbind();
    $(".div_new_player").unbind();
    $(".add_player_confirm").unbind();
}

    var ldata = {
        match:{},
        players:{},
        groups:{},
    };
    ldata.groups[98723489] = {
        status:0,
        name:"老司机",
    };
    ldata.players[654615] = {
        group:98723489,
        name:"M神",
        power:800,
    };
    ldata.match[10] = [654615];

var pageModel = null;
var refreshContent = function(force, callback){
    requestPost("information", {}, function(json) {
        if (json) {
            pageModel = json;
            console.log(pageModel);
            safe(callback)(pageModel);
        }
    });
};

var giveup = function(callback) {
    delete localStorage.serial_string;
    requestPost("giveup", {}, callback);
}

var racePlayerTemplate = null;
function addPlayerToList(data, playerId, divParent, delCallback) {
    if (racePlayerTemplate == null) {
        racePlayerTemplate = Handlebars.compile($(".hd_player_item").html());
    }

    var playerInfo = data.players[playerId];
    var groupInfo = data.groups[playerInfo.group];
    var playerData = {
        enemy:(groupInfo.status != 0),
        group:groupInfo.name,
        name:playerInfo.name,
        power:playerInfo.power,
    };
    var playerBlock = $(racePlayerTemplate(playerData));
    playerBlock.appendTo(divParent);
    playerBlock.find(".div_player_group").addClass(playerData.enemy ? "display_player_red" : "display_player_green");
    if (data.delPlayer) {
        playerBlock.find(".div_player_delete_option").show();
        playerBlock.find(".div_player_delete").click(delCallback);
    }
}

function displayPlayerList() {
    clearEvents();
    showMode("list");

    $(".div_to_match").click(displayMatch);
    $(".div_log_off").click(function() {
        giveup(displayWelcome);
    });

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
        console.log("addplayer", name, powerNum, groupId);

        var player = {name:name, power:powerNum, group:groupId};
        requestPost("addplayer", player, function(json) {
            clearNewPlayerInfo();
            if (json && json.playerId) {
                pageModel.players[json.playerId] = player;
                loadPlayers();
            }
        });
    });

    $(".div_refresh_data").click(function() {
        refreshContent(true, loadPlayers);
    });

    var groupOptionTemplate = Handlebars.compile($(".hd_group_option").html());

    var divPlayerList = $(".div_player_list");
    var divGroupList = $(".select_player_group");
    function loadPlayers() {
        var data = pageModel;
        divPlayerList.html("");
        for (var playerId in data.players) {
            (function() {
                var bindPlayerId = playerId;
                addPlayerToList(data, playerId, divPlayerList, function() {
                    var playerName = data.players[bindPlayerId].name;
                    if (confirm("确定删除'" + playerName + "'？")) {
                        console.log("delplayer", bindPlayerId, playerName);

                        requestPost("delplayer", {playerId:bindPlayerId}, function(json) {
                            if (json && json.playerId && json.playerId == bindPlayerId) {
                                delete pageModel.players[bindPlayerId];
                                loadPlayers();
                            }
                        });
                    }
                });
            })();
        }
        divGroupList.html("");
        for (var groupId in data.groups) {
            var groupInfo = data.groups[groupId];
            $(groupOptionTemplate({groupId:groupId, name:groupInfo.name})).appendTo(divGroupList);
        }
    }
    refreshContent(false, loadPlayers);
}

function displayMatch() {
    clearEvents();
    showMode("match");

    $(".div_to_playerlist").click(displayPlayerList);
    $(".div_log_off").click(function() {
        giveup(displayWelcome);
    });

    $(".div_refresh_data").click(function() {
        refreshContent(true, loadMatch);
    });

    var raceBlockTemplate = Handlebars.compile($(".hd_race_block").html());

    var divContentPanel = $(".div_content_panel_match");
    function loadMatch() {
        var data = pageModel;
        divContentPanel.html("");
        var raceTypes = ["黄鹿", "玫瑰", "咸鱼"];
        for (var raceIndex = 0; raceIndex < raceTypes.length; ++raceIndex) {
            for (var starIndex = 10; starIndex >= 1; --starIndex) {
                var uniqueIndex = raceIndex * 1000 + starIndex;
                var raceBlock = $(raceBlockTemplate({
                    name:(raceTypes[raceIndex] + starIndex + "星"),
                }));
                raceBlock.appendTo(divContentPanel);
                var isgoden = (raceIndex < 2);
                raceBlock.find(".div_race_title_text").addClass(isgoden ? "display_race_golden" : "display_race_gray");
                raceBlock.find(".div_race_title_add").click(function() {

                });

                var matchPlayerIds = data.match[uniqueIndex];
                var divPlayers = raceBlock.find(".div_race_players");
                if (matchPlayerIds && matchPlayerIds.length > 0) {
                    for (var playerIndex = 0; playerIndex < matchPlayerIds.length; ++playerIndex) {
                        (function() {
                            var playerId = matchPlayerIds[playerIndex];
                            addPlayerToList(data, playerId, divPlayers, function() {

                            });
                        })();
                    }
                } else {
                    divPlayers.html("无人报名");
                }
            }
        }
    }
    refreshContent(false, loadMatch);
}

function displayWelcome() {
    clearEvents();

    var exchange = function (serial, success, failed) {
        requestPost("exchange", {serial:serial}, function(json) {
            console.log(json);
            if (json && json.serial) {
                localStorage.serial_string = json.serial;
                safe(success)();
            } else {
                safe(failed)();
            }
        });
    };

    var enterPage = displayPlayerList;

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
        exchange(serial, enterPage, exchangeNext);
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
        exchange(serial, enterPage, exchangeNext);
    }
}

$(function() {
    adjustContentHeight(".div_title_bar", ".div_content_panel");
    $(window).resize(function() {adjustContentHeight(".div_title_bar", ".div_content_panel");});

    displayWelcome();
});


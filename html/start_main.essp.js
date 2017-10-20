
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
        console.log("break some operation!", protToken.callback);
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

var sendAjax = function(method, url, postData, callback) {
    var protCallback = prot(callback);
    $.ajax({
        type:method,
        url:url,
        data:(postData ? JSON.stringify(postData) : null),
        success:safe(protCallback),
        error:function() {
            safe(protCallback)(null);
        }
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
    sendAjaxJSON("GET", urlRoot + "/" + url, null, safe(callback));
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
    $(".div_content_panel").css("top", topHeight);
};

$(function() {
    adjustPageLayout();
    $(window).resize(adjustPageLayout);
});

var usedKeys = {
    "defaultFunc":true,
    "serial":true,
};

// login
$(function() {
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
});

// supported funcs
var displayFuncsModel = {
    supports:{
        refresh:{name:"更新", click:clickRefresh, },
        kingwar:{name:"帝国战", show:displayKingWar, },
        //serverInfo:{name:"信息", },
        //automation:{name:"自动化", },
        //setting:{name:"设置", },
        users:{name:"用户", show:displayUsers, },
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
        support.show();
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
            var defaultFunc = "kingwar";
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
    requestPost("manrefresh", {integrity:true}, function(json) {
        if (json.success) {
            setTimeout(prot(function() {
                window.location.reload();
            }), 30 * 1000);
            alert("后台开始更新数据，30秒后刷新页面!");
        }
    });
}

var displayKingWarModel = {
    areaNames:{
        "1":"黄鹿",
        "2":"玫瑰",
        "3":"咸鱼",
    },
};
displayKingWarModel.get = function(callback) {
    $this = this;
    requestGet("kingwarinfo", function(json) {
        $this.kingwar = json;
        for (var key in json.areastars) {
            var areastarData = json.areastars[key];
            for (var i = 0; i < areastarData.length; ++i) {
                var player = areastarData[i];
                player.showMax = player.maxPower > player.power + 200000;
                player.unionShort = player.union.substr(4);
            }
        }
        callback($this.kingwar);
    });
}
displayKingWarModel.firstThree = function(key) {
    var areastarData = this.kingwar.areastars[key];
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
displayKingWarModel.areaName = function(area) {
    return this.areaNames[String(area)];
}
displayKingWarModel.areaColor = function(area) {
    return (area == 3 ? "display_area_gray" : "display_area_golden");
}
displayKingWarModel.unionColor = function(union) {
    if (union == "s96.火") {
        return "display_player_green";
    }
    var serv = union.substr(0, 3);
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

// show kingwar
function displayKingWar() {
    var divContentPanel = $(".div_content_panel");
    var waitingTemplate = templates.read(".hd_display_loading");
    divContentPanel.html(waitingTemplate({refreshing_data: true}));

    displayKingWarModel.get(function(data) {
        divContentPanel.html($(".hd_kingwar_areastar_all").html());
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
                var areaName = displayKingWarModel.areaName(areaId);
                var areaColor = displayKingWarModel.areaColor(areaId);

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
                            var divPowerDisplays = divNavStarBlock.find(".div_navigate_star_power");
                            for (var i = 0; i < players.length; ++i) {
                                var unionColor = displayKingWarModel.unionColor(players[i].union);
                                $(divPowerDisplays[i]).addClass(unionColor);
                                if (i == 0) {
                                    $(divPowerDisplays[i]).addClass("div_navigate_star_power_max");
                                }
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
                var unionColor = displayKingWarModel.unionColor(info.union);
                playerBlock.find(".div_player_union").addClass(unionColor);
            }
        });
    });
}

var displayUsersModel = {
    authLevels: [
        {name:"查看", val:1},
        {name:"自动", val:2},
        {name:"管理", val:3},
    ],
    canAuthorize:false,
};
displayUsersModel.canAssociate = function() {
    return this.canAuthorize;
}
displayUsersModel.get = function(callback) {
    $this = this;
    requestPost("listusers", {jetson:true}, function(json) {
        if (json.users) {
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
displayUsersModel.auths = function() {
    return this.authLevels;
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
        for (var i = 0; i < usersData.length; ++i) {
            (function() {
                var userInfo = usersData[i];
                var superAdmin = userInfo.auth > 3;
                var authorized = userInfo.auth > 0;
                var userBlockInfo = {
                    name:userInfo.name,
                    superAdmin:superAdmin,
                    authorized:authorized,
                    auths: displayUsersModel.auths(),
                    associate: displayUsersModel.canAssociate(),
                };
                var divUserItemBlock = $(userItemTemplate(userBlockInfo));
                divUserItemBlock.appendTo(divUserContainer);

                userBlockInfo.block = divUserItemBlock;
                userBlockInfo.serial = userInfo.serial;
                userItemBlocks.push(userBlockInfo);

                if (userInfo.serial == StorageItem().serial) {
                    divUserItemBlock.addClass("user_myself");
                }

                var divUserDelete = divUserItemBlock.find(".div_user_delete");
                divUserDelete.click(function() {
                    if (confirm("确认删除'" + userInfo.name + "'？")) {
                        displayUsersModel.deluser(userInfo.serial, displayUsers);
                    }
                });

                var divUserName = divUserItemBlock.find(".div_user_name");
                var inputUserName = divUserItemBlock.find(".input_user_name");
                inputUserName.hide();
                divUserName.click(function() {
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
                    var selectAuthLevel = divUserItemBlock.find(".div_user_select_auth_level");
                    selectAuthLevel.val(userInfo.auth);
                    selectAuthLevel.change(function() {
                        var level = selectAuthLevel.val();
                        if (confirm("确认为'" + userInfo.name + "'修改权限？")) {
                            displayUsersModel.promote(userInfo.serial, level, displayUsers);
                        }
                        selectAuthLevel.val(userInfo.auth);
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
                    console.log("ttclicked", associateBlockInfo);
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

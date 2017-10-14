
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

var sendAjax = function(method, url, postData, callback) {
    $.ajax({
        type:method,
        url:url,
        data:(postData ? JSON.stringify(postData) : null),
        success:safe(callback),
        error:function() {
            safe(callback)(null);
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
templates.delayLoad = function(template, items, callback) {
    if (items.length <= 0) {
        return;
    }
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
            callback(result);
        } else {
            setTimeout(load, 1);
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

// login
$(function() {
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
        kingwar:{name:"帝国战", show:displayKingWar,},
        players:{name:"玩家列表", },
        serverInfo:{name:"信息", },
        automation:{name:"自动化", },
        setting:{name:"设置", },
        users:{name:"用户", },
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
    console.log(support, funcKey);
    if (support && support.show) {
        support.show();
        return true;
    }
    return false;
}

var showFuncPanel = function(funcKey) {
    StorageItem().defaultFunc = funcKey;
    if (!displayFuncsModel.show(funcKey)) {
        divContentPanel.html(waitingTemplate({state_error: true}));
    }
}

// show content
function displayFuncs() {
    var divContentPanel = $(".div_content_panel");
    var waitingTemplate = templates.read(".hd_display_loading");
    divContentPanel.html(waitingTemplate({getting_state: true}));

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
        var titleTemplate = templates.read(".hd_title_content");
        templates.delayLoad(titleTemplate, supportFuncs, function(titleBlocks) {
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
                        showFuncPanel(funcItem.funcKey);
                    });
                })();
            }
            showFuncPanel(defaultFunc);
        });
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
        callback($this.kingwar);
    });
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
displayKingWarModel.starBreafColor = function(union) {
    if (union == "s96.火") {
        return "div_navigate_star_ous";
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
        unique_click(divNavAreaStarMask, function() {
            divNavAreaStarMask.hide();
        });

        var areastarInfo = {};
        var playerInfo = [];
        var areastarTemplate = templates.read(".hd_kingwar_areastar");
        var playerTemplate = templates.read(".hd_common_player");
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
                    divNavStarList.html("");
                    divNavAreaStarMask.show();
                    for (var star = 10; star >= 1; star--) {
                        (function() {
                            var key = areaId * 100 + star;
                            var areastarData = data.areastars[key];
                            var areastar = areastarInfo[key];
                            var player = (areastarData && areastarData.length > 0 ? areastarData[0] : null);
                            var power = power = (player ? Math.floor(player.power / 10000) : 0);
                            var divNavStarBlock = $(navigateStarTemplate({
                                name:areastar.name,
                                power: power,
                            }));
                            divNavStarBlock.appendTo(divNavStarList);
                            divNavStarBlock.find(".div_navigate_star_name").addClass(areaColor);
                            var starColor = (player ? displayKingWarModel.starBreafColor(player.union) : "");
                            divNavStarBlock.find(".div_navigate_star_max").addClass(starColor);
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
                    var areastarData = data.areastars[key];
                    if (areastarData && areastarData.length > 0) {
                        playersContainer.html("正在加载...");
                        for (var i = 0; i < areastarData.length; ++i) {
                            var player = areastarData[i];
                            playerInfo.push({
                                first: i == 0,
                                union: player.union,
                                name: player.name,
                                power: player.power,
                                belongTo: areastar,
                            });
                        }
                    } else {
                        playersContainer.html("无");
                    }
                }
            })();
        }
        templates.delayLoad(playerTemplate, playerInfo, function(playerBlocks) {
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

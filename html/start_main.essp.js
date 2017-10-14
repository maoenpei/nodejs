
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
            setTimeout(load, 10);
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

// show kingwar
function displayKingWar() {
    var divContentPanel = $(".div_content_panel");
    var waitingTemplate = templates.read(".hd_display_loading");
    divContentPanel.html(waitingTemplate({refreshing_data: true}));

    displayKingWarModel.get(function(data) {
        var areastarInfo = [];
        for (var area = 1; area <= 3; area++) {
            for (var star = 10; star >= 1; star--) {
                var key = area * 100 + star;
                var areastarData = data.areastars[key];
                areastarInfo.push({
                    area:area,
                    star:star,
                    data:areastarData,
                    name:displayKingWarModel.areaName(area) + star + "星",
                });
            }
        }
        var playerTemplate = templates.read(".hd_common_player");
        var areastarTemplate = templates.read(".hd_kingwar_areastar");
        divContentPanel.html("");
        templates.delayLoad(areastarTemplate, areastarInfo, function(areastarBlocks) {
            for (var i = 0; i < areastarBlocks.length; ++i) {
                var block = areastarBlocks[i];
                block.appendTo(divContentPanel);

                var playersContainer = block.find(".div_areastar_players_breaf");
                var playerData = areastarInfo[i].data;
                if (!playerData || playerData.length == 0) {
                    playersContainer.html("无");
                } else {
                    var displayCount = (playerData.length > 3 ? 3 : playerData.length);
                    for (var j = 0; j < displayCount; ++j) {
                        var playerBlock = $(playerTemplate(playerData[j]));
                        playerBlock.appendTo(playersContainer);
                    }
                }
            }
        });
    });
}

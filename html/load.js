
var urlRoot = null;
var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

function setRoot(url, entryName) {
    urlRoot = url;
    $(window[entryName]);
}

var tmpsafe = function(){};
var safe = function(callback) {
    return (callback ? callback : tmpsafe);
}

var sendAjax = function(url, postData, callback) {
    $.ajax({
        type:"POST",
        url:url,
        data:JSON.stringify(postData),
        success:safe(callback),
    });
}

var sendAjaxJSON = function(url, postData, callback) {
    sendAjax(url, postData, function (returnData) {
        safe(callback)(JSON.parse(returnData));
    });
}

var requestPost = function (url, postData, callback) {
    sendAjaxJSON(urlRoot + "/" + url, postData, function (json) {
        if (safe(callback)(json)) {
            window.location.reload();
        }
    });
}

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
}

function indexEntry() {
    var exchange = function (serial, failed) {
        requestPost("exchange", {serial:serial}, function(json) {
            if (json.serial) {
                localStorage.serial_string = json.serial;
                return true;
            }
            safe(failed)();
        });
    }

    $(".input_key_button").click(function () {
        inputNext($(".input_key_text").val());
    });
    $(".input_key_text").keypress(function (e) {
        if (e.which == 13) {
            $(".input_key_button").click();
        }
    });

    var serial = localStorage.serial_string;
    if (serial) {
        exchange(serial, exchangeNext);
    } else {
        exchangeNext();
    }

    function exchangeNext() {
        $(".input_key_div").show();
        $(".input_key_text").focus();
    }

    function inputNext(serial) {
        $(".input_key_div").hide();
        exchange(serial, exchangeNext);
    }
}

function mainEntry() {
    $(".div_add_file").click(function () {
        uploadFile("addfile", function (data) {
            console.log("result:", data);
            window.location.reload();
        });
    });
    $(".div_delete_file").click(function(){
        $(".div_file_panel").toggleClass("on_edit");
    })
    $(".div_log_off").click(function () {
        requestPost("giveup", {}, function (json) {
            delete localStorage.serial_string;
            return true;
        });
    });
    $(".div_file_item").each(function (index, item) {
        var quest = {key:$(item).attr("key")};
        $(item).find(".div_view_tag").click(function () {
            requestPost("view", quest, function(json) {
                return true;
            });
        });
        $(item).find(".div_delete_tag").click(function () {
            requestPost("delfile", quest, function (json) {
                return true;
            });
        });
    });
}

function contentEntry() {
    if (isMobile) {
        $(".div_iframe_container").addClass("div_iframe_container_mobile");
    }

    var adjustHeight = function() {
        var total = parseInt($("body").css("height"));
        var title = parseInt($(".div_title_bar").css("height"));
        $(".div_iframe_container").css("height", total - title);
    };
    adjustHeight();
    $(window).resize(adjustHeight);


    $(".div_back_main").click(function() {
        requestPost("backmain", {}, function (json) {
            return true;
        });
    });

    var iwindow = $(".iframe_content")[0].contentWindow;
    var scrollItem = isMobile ? $(".div_iframe_container") : $(iwindow);
    $(".div_back_top").click(function() {
        scrollItem.scrollLeft(0);
        scrollItem.scrollTop(0);
    });

    var scrollX = parseInt($(".div_iframe_container").attr("scrollX"));
    var scrollY = parseInt($(".div_iframe_container").attr("scrollY"));
    $(iwindow).load(function() {
        scrollItem.scrollLeft(scrollX);
        scrollItem.scrollTop(scrollY);
        setInterval(function() {
            if (scrollItem.scrollLeft() == scrollX && scrollItem.scrollTop() == scrollY) {
                return;
            }
            scrollX = scrollItem.scrollLeft();
            scrollY = scrollItem.scrollTop();
            console.log("saving position", scrollX, scrollY);
            requestPost("posupdate", {
                scrollX:scrollX.toString(),
                scrollY:scrollY.toString(),
            });
        }, 1000);
    });
}


var urlRoot = null;

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
        console.log(json);
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
    var adjustHeight = function() {
        $(".iframe_content").css("height", parseInt($("body").css("height")) - parseInt($(".div_title_bar").css("height")));
    };
    adjustHeight();
    $(window).resize(adjustHeight);
    $(".div_return_back").click(function() {
        requestPost("main", {}, function (json) {
            return true;
        });
    });
}

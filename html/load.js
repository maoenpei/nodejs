
var urlRoot = null;

function setRoot(url) {
    urlRoot = url;
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
            url:url,
            data:formData,
            processData:false,
            contentType:false,
            success:callback,
        });
    });
    fileLoader.click();
}

function verifyAccess() {
    var cookieSerialString = localStorage.serial_string;
    var pageUrl = null;

    var exchange = function (serial, done) {
        sendAjaxJSON(urlRoot + "/exchange", {serial:serial}, function (json) {
            console.log(json);
            pageUrl = json.pageUrl;
            safe(done)(json.serial);
        });
    };

    $(".input_key_button").click(function () {
        inputNext($(".input_key_text").val());
    });
    $(".input_key_text").keypress(function (e) {
        if (e.which == 13) {
            $(".input_key_button").click();
        }
    });

    if (cookieSerialString) {
        exchange(cookieSerialString, exchangeNext);
    } else {
        exchangeNext(null);
    }

    function exchangeNext(serial) {
        cookieSerialString = serial;

        if (!cookieSerialString) {
            $(".input_key_div").show();
            $(".input_key_text").focus();
        } else {
            localStorage.serial_string = cookieSerialString;

            if (pageUrl) {
                window.location = pageUrl;
            }
        }
    }

    function inputNext(serial) {
        cookieSerialString = serial;
        $(".input_key_div").hide();

        exchange(cookieSerialString, exchangeNext);
    }
}

function readyList() {
    $(".div_add_file").click(function () {
        uploadFile(urlRoot + "/addfile", function (data) {
            console.log("result:", data);
            window.location.reload();
        });
    });
    $(".div_delete_file").click(function(){
        $(".div_file_panel").toggleClass("on_edit");
    })
    $(".div_log_off").click(function () {
        var cookieSerialString = localStorage.serial_string;
        sendAjaxJSON(urlRoot + "/returnback", {serial:cookieSerialString}, function (json) {
            delete localStorage.serial_string;
            window.location = json.pageUrl;
        });
    });
    $(".div_file_item").each(function (index, item) {
        $(item).find(".div_view_tag").click(function () {
            window.location = urlRoot + "/view?key=" + $(item).attr("key");
        });
        $(item).find(".div_delete_tag").click(function () {
            sendAjax(urlRoot + "/delfile", {key:$(item).attr("key")}, function (data) {
                console.log("result:", data);
                window.location.reload();
            });
        });
    });
}

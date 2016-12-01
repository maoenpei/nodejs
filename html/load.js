
var urlRoot = null;

function setRoot(url) {
    urlRoot = url;
}

var coroutine = function(generator, self) {
    var g = generator.call(self);
    return function(x) {
        g.next(x);
    }
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
    sendAjax(url, postData, (returnData) => {
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
    var next = coroutine(function*() {
        var cookieSerialString = localStorage.serial_string;
        var pageUrl = null;

        var exchange = (done) => {
            sendAjaxJSON(urlRoot + "/exchange", {serial:cookieSerialString}, (json) => {
                cookieSerialString = json.serial;
                pageUrl = json.pageUrl;
                safe(done)();
            });
        };

        if (cookieSerialString) {
            yield exchange(next);
        }

        $(".input_key_button").click(() => {
            next($(".input_key_text").val());
        });
        $(".input_key_text").keypress((e) => {
            if (e.which == 13) {
                $(".input_key_button").click();
            }
        });
        while(!cookieSerialString) {
            $(".input_key_div").show();
            $(".input_key_text").focus();
            cookieSerialString = yield;
            $(".input_key_div").hide();

            yield exchange(next);
        }

        localStorage.serial_string = cookieSerialString;

        if (pageUrl) {
            window.location = pageUrl;
        }
    });

    next();
}

function readyList() {
    $(".div_add_file").click(() => {
        uploadFile(urlRoot + "/addfile", (data) => {
            console.log("result:", data);
            window.location.reload();
        });
    });
    $(".div_log_off").click(() => {
        var cookieSerialString = localStorage.serial_string;
        sendAjaxJSON(urlRoot + "/returnback", {serial:cookieSerialString}, (json) => {
            delete localStorage.serial_string;
            window.location = json.pageUrl;
        });
    });
    $(".div_file_item").each((index, item) => {
        $(item).find(".div_view_tag").click(() => {
            window.location = urlRoot + "/view?key=" + $(item).attr("key");
        });
        $(item).find(".div_delete_tag").click(() => {
            sendAjax(urlRoot + "/delfile", {key:$(item).attr("key")}, (data) => {
                console.log("result:", data);
                window.location.reload();
            });
        });
    });
}

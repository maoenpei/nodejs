
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

    while(!cookieSerialString) {
        $(".input_key_div").show();
        cookieSerialString = yield $(".input_key_button").click(() => {
            next($(".input_key_text").val());
        });
        $(".input_key_div").hide();

        yield exchange(next);
    }

    console.log("got cookieSerialString:", cookieSerialString);
    localStorage.serial_string = cookieSerialString;

    window.location = pageUrl;
});

verifyAccess = next;

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

function choosefile() {
    uploadFile(urlRoot + "/addfile", (data) => {
        console.log("result:", data);
        window.location.reload();
    });
}

function deletefile(key) {
    sendAjax(urlRoot + "/delfile", {key:key}, (data) => {
        console.log("result:", data);
        window.location.reload();
    });
}

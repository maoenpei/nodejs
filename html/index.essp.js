
<%^load.js%>

$(function() {
    var exchange = function (serial, failed) {
        requestPost("exchange", {serial:serial}, function(json) {
            if (json.serial) {
                localStorage.serial_string = json.serial;
                requestPost("gopage", {pageto:"main"}, function(json) {
                    return true;
                });
            } else {
                safe(failed)();
            }
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
});


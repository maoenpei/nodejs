
<%^load.js%>

$(function() {
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

    var scrollItem = null;
    // try different types
    do {
        scrollItem = $(".text_content");
        if (scrollItem.length > 0) {
            scrollItem.ready(readyFunc);
            break;
        }
        var iFrame = $(".iframe_content");
        if (iFrame.length > 0) {
            var iwindow = iFrame[0].contentWindow;
            scrollItem = isMobile ? $(".div_iframe_container") : $(iwindow);
            $(iwindow).load(readyFunc);
            break;
        }
        return;
    } while(0);

    var speeds = [1];
    var speedLevel = speeds.length;
    var timer = null;
    $(".div_auto_scroll").click(function() {
        if (timer) {
            clearInterval(timer);
        }
        speedLevel = (speedLevel + 1) % (speeds.length + 1);
        if (speedLevel < speeds.length) {
            timer = setInterval(function() {
                var yPos = scrollItem.scrollTop();
                scrollItem.scrollTop(yPos + speeds[speedLevel]);
            }, 25);
        }
    });
    $(".div_back_top").click(function() {
        scrollItem.scrollLeft(0);
        scrollItem.scrollTop(0);
    });
    var scrollX = parseInt($(".div_iframe_container").attr("v_scrollX"));
    var scrollY = parseInt($(".div_iframe_container").attr("v_scrollY"));
    function readyFunc() {
        scrollItem.scrollLeft(scrollX);
        scrollItem.scrollTop(scrollY);
        setInterval(function() {
            if (scrollItem.scrollLeft() == scrollX && scrollItem.scrollTop() == scrollY) {
                return;
            }
            scrollX = scrollItem.scrollLeft();
            scrollY = scrollItem.scrollTop();
            console.log("saving position", scrollX, scrollY);
            requestPost("pageupdate", {
                scrollX:String(scrollX),
                scrollY:String(scrollY),
            });
        }, 1000);
    };
});


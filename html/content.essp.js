
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
            requestPost("pageupdate", {
                scrollX:String(scrollX),
                scrollY:String(scrollY),
            });
        }, 1000);
    });
});


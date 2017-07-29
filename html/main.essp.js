
<%^load.js%>

$(function() {

    adjustHeight(".div_title_bar", ".div_content_panel");
    $(window).resize(function() {
        adjustHeight(".div_title_bar", ".div_content_panel");
    });

    $(".div_add_player").click(function() {
        var race = $(this).attr("raceIndex");
        var star = $(this).attr("starIndex");
        requestPost("gopage", {pageto:"newplayer", pagearg:{race:Number(race), star:Number(star)}}, function(json) {
            return true;
        });
    });
    $(".div_log_off").click(function () {
        requestPost("giveup", {}, function (json) {
            delete localStorage.serial_string;
            return true;
        });
    });
    $(".image_player_info").click(function () {
        var imageKey = $(this).attr("imageKey");
        requestPost("view", {key:imageKey}, function() {
            return true;
        });
    });
});


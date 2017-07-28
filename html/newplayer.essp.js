
<%^load.js%>

$(function() {
    $(".div_go_back").click(function() {
        requestPost("gopage", {pageto:"main"}, function(json) {
            return true;
        });
    });
    $(".div_go_submit").click(function() {
        console.log(g_race, g_star, g_imageKey);
        if (g_race == undefined || g_star == undefined) {
            alert("页面还没有加载完成");
            return;
        }

        var name = $(".input_name_text").val();
        if (name == '') {
            alert("不是有效的名字");
            $(".input_name_text").focus();
            return;
        }

        var power = $(".input_power_text").val();
        if (String(Number(power)) != power) {
            alert("不是有效的战力值");
            $(".input_power_text").focus();
            return;
        }

        if (!g_imageKey) {
            alert("必须上传图片");
            return;
        }

        var uploadData = {raceKey:(g_race * 1000 + g_star), imageKey:g_imageKey, name:name, power:power};
        console.log(uploadData);
        requestPost("addplayer", uploadData, function() {
            console.log("addplayer finished!");
            requestPost("gopage", {pageto:"main"}, function(json) {
                return true;
            });
            return false;
        });
    });
    $(".div_add_image").click(function() {
        uploadFile("addfile", function (data) {
            console.log("result:", data);
            g_imageKey = data.key;
            $(".image_container").attr("src", urlRoot + '/file?key=' + g_imageKey);
        });
    });
});

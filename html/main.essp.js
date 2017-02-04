
<%^load.js%>

$(function() {
    $(".div_add_file").click(function () {
        uploadFile("addfile", function (data) {
            console.log("result:", data);
            window.location.reload();
        });
    });
    $(".div_edit_file").click(function(){
        $(".div_file_panel").toggleClass("on_edit");
        localStorage.editing = $(".div_file_panel").hasClass("on_edit");
    })
    if (localStorage.editing) {
        $(".div_file_panel").addClass("on_edit");
    }
    $(".div_log_off").click(function () {
        requestPost("giveup", {}, function (json) {
            delete localStorage.serial_string;
            return true;
        });
    });
    $(".div_file_item").each(function (index, item) {
        var jitem = $(item);
        var viewItem = jitem.find(".div_view_tag");
        var editFrame = jitem.find(".input_edit_tag");
        var deletePress = jitem.find(".div_delete_tag");
        var renamePress = jitem.find(".div_rename_tag");
        var quest = {key:jitem.attr("key")};
        viewItem.click(function () {
            requestPost("view", quest, function(json) {
                return true;
            });
        });
        deletePress.click(function () {
            requestPost("delfile", quest, function (json) {
                return true;
            });
        });
        renamePress.click(function () {
            jitem.addClass("on_rename");
            editFrame.focus();
            editFrame.val(viewItem.html());
            editFrame.val(viewItem.html());
        });
        editFrame.blur(function () {
            var oldVal = viewItem.html();
            var newVal = editFrame.val();
            if (oldVal != newVal) {
                viewItem.html(newVal);
                requestPost("renamefile", {key:jitem.attr("key"), name:editFrame.val()});
            }
            jitem.removeClass("on_rename");
        });
    });
});


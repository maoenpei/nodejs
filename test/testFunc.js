
require("../server/FileManager");
require("../server/yzdzz/GameController");

$FileManager.RootDirectory = __dirname + "/..";

var next = coroutine(function*() {

    var timingManager = new TimingManager();
    var key = timingManager.setWeeklyEvent(2, 23, 14, 0, () => {
        console.log("now!!", new Date());
        //timingManager.unsetEvent(key);
    });

}, null);


require("../server/FileManager");
require("../server/yzdzz/GameController");

$FileManager.RootDirectory = __dirname + "/..";

var account = {u:"13905903138", p:"mingiming", s:"s96"};
//var account = {u:"18030367128", p:"1234567", s:"s96"};

var doUnionWarTop = function(endFunc) {
    var next = coroutine(function*() {
        console.log("start");
        var gameController = new GameController();
        var accountManager = gameController.getAccountManager();
        var accountKey = accountManager.add(account.u, account.p);
        var conn = accountManager.connectAccount(accountKey);
        do {
            var data = yield conn.loginAccount(next);
            if (!data.success) {break;}
            var data = yield conn.loginGame(account.s, next);
            if (!data.success) {break;}
            while (true) {
                var data_UnionWar = yield conn.getUnionWar(next);
                if (!data_UnionWar.isOpen) {
                    console.log("unionwar closed!");
                    continue;
                }
                var data_Double = yield conn.setSpeed(true, next);
                var data_Enter = yield conn.enterUnionWar(1, next);
                var data_Occupy = null;
                for (var i = 0; i < data_Enter.mineArray.length; ++i) {
                    data_Occupy = yield conn.occupy(1, i+1, next);
                    if (data_Occupy && data_Occupy.success) {
                        break;
                    }
                }
                console.log("data_Double", data_Double);
                console.log("data_Enter", data_Enter);
                console.log("data_Occupy", data_Occupy);
                break;
            }
        } while(false);
        console.log("quit");
        conn.quit();
        accountManager.remove(accountKey);
        safe(endFunc)();
    }, this);
}

var timingManager = new TimingManager();
var eventKey = timingManager.setDailyEvent(19, 59, 53, () => {
    doUnionWarTop(() => {
        timingManager.unsetEvent(eventKey);
    });
});
//doUnionWarTop();

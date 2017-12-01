
require("../server/FileManager");
require("../server/yzdzz/GameController");

$FileManager.RootDirectory = __dirname + "/..";

var accounts = {
    accountlist: [
        {u:"tree44", p:"12345678"},
        {u:"15171335812", p:"12345678"},
        {u:"18030367128", p:"1234567"},
        //{u:"18757594952", p:"123456"},
        //{u:"15831667796", p:"123456"},
        //{u:"13758796288", p:"087200"},
        //{u:"13905903138", p:"mingiming"},
        //{u:"18551855876", p:"sdw123456"},
        //{u:"14741221200", p:"long123"},
        //{u:"lv35679183", p:"zhangpeng1989"},
        //{u:"13719987234", p:"xwWZT123"},
        //{u:"13801890722", p:"Q950318my"},
        //{u:"18983624927", p:"123456"},
        //{u:"13913945392", p:"816476"},
        //{u:"18367890817", p:"62252377"},
    ],
    server:"s96",
};

var accounts93 = {
    accountlist: [
        {u:"13386237968", p:"123456"},
        {u:"13042638897", p:"lzj888"},
    ],
    server:"s93",
};


var next = coroutine(function*() {
    var use = accounts93;
    var gameController = new GameController();
    var accountManager = gameController.getAccountManager();
    var accountKeys = [];
    for (var i = 0; i < use.accountlist.length; ++i) {
        accountKeys.push(accountManager.add(use.accountlist[i].u, use.accountlist[i].p));
    }

    for (var i = 0; i < accountKeys.length; ++i) {
        var conn = accountManager.connectAccount(accountKeys[i]);
        var data = yield conn.loginAccount(next);
        if (!data.success) {
            continue;
        }
        var data = yield conn.loginGame(use.server, next);
        if (!data.success) {
            continue;
        }
        var data = yield conn.getKingWarRace(next);
        console.log(data.area, data.star, data.rawCards, use.accountlist[i].u);
        conn.quit();
    }
}, null);


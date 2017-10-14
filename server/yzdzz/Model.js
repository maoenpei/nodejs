
require("../Base");
require("../StateManager");
require("../LoginManager");
require("./GameController");

GAME_ACCOUNTS_CONFIG = "GameAcounts.d";
GAME_SETTING_CONFIG = "GameSetting.d";

var allFuncs = [
    {name:"kingwar", authBase:1},
    {name:"players", authBase:1},
    {name:"serverInfo", authBase:1},
    {name:"automation", authBase:2},
    {name:"setting", authBase:3},
    {name:"users", authBase:3},
];

$HttpModel.addClass({
    _constructor:function(httpServer) {
        this.httpServer = httpServer;
        this.controller = new GameController();
        this.accountManager = this.controller.getAccountManager();
        this.accounts = {};

        httpServer.registerCommand("kingwarinfo", this);
        httpServer.registerCommand("functions", this);
    },
    initialize:function(done) {
        var next = coroutine(function*() {
            yield $StateManager.openState(GAME_ACCOUNTS_CONFIG, null, next);
            var accountStates = $StateManager.getState(GAME_ACCOUNTS_CONFIG);
            for (var key in accountStates) {
                var accountInfo = accountStates[key];
                this.accounts[key] = {
                    username:accountInfo.username,
                    accountKey:this.accountManager.add(accountInfo.username, accountInfo.password),
                };
            }
            yield $StateManager.openState(GAME_SETTING_CONFIG, null, next);
            var settingStates = $StateManager.getState(GAME_SETTING_CONFIG);
            for (var i = 0; i < settingStates.kingwar.length; ++i) {
                var kingwarConfig = settingStates.kingwar[i];
                var accountInfo = this.accounts[kingwarConfig.account];
                this.controller.setKingwarAccount(accountInfo.accountKey, kingwarConfig.server, kingwarConfig.area, kingwarConfig.star);
            }
            this.controller.refreshKingwar(60*5);
            safe(done)();
        }, this);
    },

    kingwarinfo:function(requestor, responder, done) {
        var next = coroutine(function*() {
            var obj = yield this.httpServer.tokenValid(requestor, next);
            if (!obj) {
                responder.addError("Not valid token for logout.");
                return responder.respondJson({}, done);
            }

            var userStates = $StateManager.getState(USER_CONFIG);
            var keyData = userStates.keys[obj.getSerial()];
            if (!keyData.userKey) {
                responder.addError("Not an authorized user.");
                return responder.respondJson({}, done);
            }

            var userData = userStates.users[keyData.userKey];
            if (userData.auth < 1) {
                responder.addError("Admin level not enough.");
                return responder.respondJson({}, done);
            }

            var kingwarData = this.controller.getKingwar();
            responder.respondJson({
                areastars:kingwarData,
            }, done);
        }, this);
    },
    functions:function(requestor, responder, done) {
        var next = coroutine(function*() {
            var obj = yield this.httpServer.tokenValid(requestor, next);
            if (!obj) {
                responder.addError("Not valid token for logout.");
                return responder.respondJson({}, done);
            }

            var userStates = $StateManager.getState(USER_CONFIG);
            var keyData = userStates.keys[obj.getSerial()];
            if (!keyData.userKey) {
                responder.addError("Not an authorized user.");
                return responder.respondJson({}, done);
            }

            var userData = userStates.users[keyData.userKey];
            var funcs = [];
            for (var i = 0; i < allFuncs.length; ++i) {
                if (userData.auth >= allFuncs[i].authBase) {
                    funcs.push(allFuncs[i].name);
                }
            }

            responder.respondJson({funcs:funcs}, done);
        }, this);
    },
});


require("../Base");
require("../StateManager");
require("../LoginManager");

var AuthorizeOnlySuperAdmin = true;

USER_CONFIG = "UserStates.d";
BREAKIN_CONFIG = "Breakin.d";

$HttpModel.addClass({
    _constructor:function(httpServer) {
        this.httpServer = httpServer;

        httpServer.registerCommand("listusers", this);
        httpServer.registerCommand("promote", this);
        httpServer.registerCommand("disable", this);
        httpServer.registerCommand("rename", this);
        httpServer.registerCommand("authorize", this);
        httpServer.registerCommand("apply", this);
        httpServer.registerCommand("question", this);
    },
    initialize:function(done) {
        var next = coroutine(function*() {
            yield $StateManager.openState(USER_CONFIG, null, next);
            yield $StateManager.openState(BREAKIN_CONFIG, null, next);
            safe(done)();
        }, this);
    },

    createUser:function() {
        var userStates = $StateManager.getState(USER_CONFIG);
        var users = userStates.users;
        users = (users ? users : {});
        var userKey = rkey();
        while(users[userKey]){userKey = rkey();}
        users[userKey] = {};
        userStates.users = users;
        return userKey;
    },

    listusers:function(requestor, responder, done) {
        var next = coroutine(function*() {
            if (requestor.getMethod() == "GET") {
                responder.addError("Not valid for 'GET' method.");
                return responder.respondJson({}, done);
            }

            var obj = yield this.httpServer.tokenValid(requestor, next);
            if (!obj) {
                responder.addError("Not valid token for logout.");
                return responder.respondJson({}, done);
            }

            var userStates = $StateManager.getState(USER_CONFIG);
            var keyData = userStates.keys[obj.getSerial()];
            if (!keyData || !keyData.userKey) {
                responder.addError("Not an authorized user.");
                return responder.respondJson({}, done);
            }

            var rootUserData = userStates.users[keyData.userKey];
            if (!rootUserData || rootUserData.auth < 3) {
                responder.addError("Admin level not enough.");
                return responder.respondJson({}, done);
            }

            var json = yield requestor.visitBodyJson(next);
            if (!json || !json.jetson) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var allUsers = [];
            for (var serial in userStates.keys) {
                var keyData = userStates.keys[serial];
                if (!keyData.name) {
                    continue;
                }
                if (!keyData.userKey) {
                    allUsers.splice(0, 0, {
                        name:keyData.name,
                        serial:serial,
                        auth:0,
                    });
                } else {
                    var userData = userStates.users[keyData.userKey];
                    if (userData) {
                        allUsers.push({
                            name:keyData.name,
                            serial:serial,
                            auth:userData.auth,
                        });
                    }
                }
            }

            var canAuthorize = (AuthorizeOnlySuperAdmin ? rootUserData.auth >= 4 : true);
            responder.respondJson({
                canAuthorize: canAuthorize,
                users: allUsers,
            }, done);
        }, this);
    },
    promote:function(requestor, responder, done) {
        var next = coroutine(function*() {
            if (requestor.getMethod() == "GET") {
                responder.addError("Not valid for 'GET' method.");
                return responder.respondJson({}, done);
            }

            var obj = yield this.httpServer.tokenValid(requestor, next);
            if (!obj) {
                responder.addError("Not valid token for logout.");
                return responder.respondJson({}, done);
            }

            var userStates = $StateManager.getState(USER_CONFIG);
            var keyData = userStates.keys[obj.getSerial()];
            if (!keyData || !keyData.userKey) {
                responder.addError("Not an authorized user.");
                return responder.respondJson({}, done);
            }

            var userData = userStates.users[keyData.userKey];
            if (!userData || userData.auth < 3) {
                responder.addError("Admin level not enough.");
                return responder.respondJson({}, done);
            }

            var json = yield requestor.visitBodyJson(next);
            if (!json || !json.target || !json.auth) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var targetSerial = json.target;
            var targetAuth = json.auth;
            var targetKeyData = userStates.keys[targetSerial];
            if (!targetKeyData || !targetKeyData.userKey) {
                responder.addError("Not an valid user.");
                return responder.respondJson({}, done);
            }

            if (targetAuth < 1 || targetAuth > 3) {
                responder.addError("Not valid auth level.");
                return responder.respondJson({}, done);
            }

            var userData = userStates.users[targetKeyData.userKey];
            if (!userData) {
                responder.addError("No user data.");
                return responder.respondJson({}, done);
            }
            if (userData.auth > 3) {
                responder.addError("Cannot promote super administrator");
                return responder.respondJson({}, done);
            }

            userData.auth = targetAuth;
            yield $StateManager.commitState(USER_CONFIG, next);

            responder.respondJson({success:true}, done);
        }, this);
    },
    disable:function(requestor, responder, done) {
        var next = coroutine(function*() {
            if (requestor.getMethod() == "GET") {
                responder.addError("Not valid for 'GET' method.");
                return responder.respondJson({}, done);
            }

            var obj = yield this.httpServer.tokenValid(requestor, next);
            if (!obj) {
                responder.addError("Not valid token for logout.");
                return responder.respondJson({}, done);
            }

            var userStates = $StateManager.getState(USER_CONFIG);
            var keyData = userStates.keys[obj.getSerial()];
            if (!keyData || !keyData.userKey) {
                responder.addError("Not an authorized user.");
                return responder.respondJson({}, done);
            }

            var userData = userStates.users[keyData.userKey];
            if (!userData || userData.auth < 3) {
                responder.addError("Admin level not enough.");
                return responder.respondJson({}, done);
            }

            var json = yield requestor.visitBodyJson(next);
            if (!json || !json.target) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var targetSerial = json.target;
            var targetKeyData = userStates.keys[targetSerial];
            if (!targetKeyData || !targetKeyData.name) {
                responder.addError("Not an valid user.");
                return responder.respondJson({}, done);
            }

            if (targetKeyData.userKey) {
                var userData = userStates.users[targetKeyData.userKey];
                if (!userData) {
                    responder.addError("No user data.");
                    return responder.respondJson({}, done);
                }
                if (userData.auth > 3) {
                    responder.addError("Cannot disable super administrator.");
                    return responder.respondJson({}, done);
                }
                delete userStates.users[targetKeyData.userKey];
                delete targetKeyData.userKey;
            }
            delete targetKeyData.name;
            yield $StateManager.commitState(USER_CONFIG, next);

            responder.respondJson({success:true}, done);
        }, this);
    },
    rename:function(requestor, responder, done) {
        var next = coroutine(function*() {
            if (requestor.getMethod() == "GET") {
                responder.addError("Not valid for 'GET' method.");
                return responder.respondJson({}, done);
            }

            var obj = yield this.httpServer.tokenValid(requestor, next);
            if (!obj) {
                responder.addError("Not valid token for logout.");
                return responder.respondJson({}, done);
            }

            var userStates = $StateManager.getState(USER_CONFIG);
            var keyData = userStates.keys[obj.getSerial()];
            if (!keyData || !keyData.userKey) {
                responder.addError("Not an authorized user.");
                return responder.respondJson({}, done);
            }

            var userData = userStates.users[keyData.userKey];
            if (!userData || userData.auth < 3) {
                responder.addError("Admin level not enough.");
                return responder.respondJson({}, done);
            }

            var json = yield requestor.visitBodyJson(next);
            if (!json || !json.target || !json.name) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var targetSerial = json.target;
            var targetName = json.name;
            var targetKeyData = userStates.keys[targetSerial];
            if (!targetKeyData || !targetKeyData.name) {
                responder.addError("Not an valid user.");
                return responder.respondJson({}, done);
            }

            targetKeyData.name = targetName;
            yield $StateManager.commitState(USER_CONFIG, next);

            responder.respondJson({success:true}, done);
        }, this);
    },
    authorize:function(requestor, responder, done) {
        var next = coroutine(function*() {
            if (requestor.getMethod() == "GET") {
                responder.addError("Not valid for 'GET' method.");
                return responder.respondJson({}, done);
            }

            var obj = yield this.httpServer.tokenValid(requestor, next);
            if (!obj) {
                responder.addError("Not valid token for logout.");
                return responder.respondJson({}, done);
            }

            var userStates = $StateManager.getState(USER_CONFIG);
            var keyData = userStates.keys[obj.getSerial()];
            if (!keyData || !keyData.userKey) {
                responder.addError("Not an authorized user.");
                return responder.respondJson({}, done);
            }

            var userData = userStates.users[keyData.userKey];
            if (!userData || userData.auth < 3) {
                responder.addError("Admin level not enough.");
                return responder.respondJson({}, done);
            }

            var json = yield requestor.visitBodyJson(next);
            if (!json || !json.previous) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var currentSerial = json.previous;
            var currentData = userStates.keys[currentSerial];
            if (!currentData.name) {
                responder.addError("Not requested.");
                return responder.respondJson({}, done);
            }

            if (currentData.userKey) {
                responder.addError("Already authorized.");
                return responder.respondJson({}, done);
            }

            var nextUserKey = null;
            var lastSerial = json.next;
            if (!lastSerial) {
                nextUserKey = this.createUser();
                userStates.users[nextUserKey].auth = 1;
            } else {
                if (AuthorizeOnlySuperAdmin && userData.auth < 4) {
                    responder.addError("Admin level not enough.");
                    return responder.respondJson({}, done);
                }
                var lastData = userStates.keys[lastSerial];
                if (!lastData.userKey) {
                    responder.addError("Fail to authorize user.");
                    return responder.respondJson({}, done);
                }
                nextUserKey = lastData.userKey;
                currentData.name = lastData.name;
                delete lastData.userKey;
                delete lastData.name;
            }

            currentData.userKey = nextUserKey;
            yield $StateManager.commitState(USER_CONFIG, next);

            responder.respondJson({success:true}, done);
        }, this);
    },
    apply:function(requestor, responder, done) {
        var next = coroutine(function*() {
            if (requestor.getMethod() == "GET") {
                responder.addError("Not valid for 'GET' method.");
                return responder.respondJson({}, done);
            }

            var obj = yield this.httpServer.tokenValid(requestor, next);
            if (!obj) {
                responder.addError("Not valid token for logout.");
                return responder.respondJson({}, done);
            }

            var userStates = $StateManager.getState(USER_CONFIG);
            var keyData = userStates.keys[obj.getSerial()];
            if (!keyData) {
                responder.addError("No such user.");
                return responder.respondJson({}, done);
            }

            if (keyData.userKey) {
                // already authorized
                return responder.respondJson({
                    state: 2,
                }, done);
            }

            var json = yield requestor.visitBodyJson(next);
            if (!json || !json.name) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var name = json.name;
            var breakinStates = $StateManager.getState(BREAKIN_CONFIG);
            if (breakinStates[name]) {
                var userKey = this.createUser();
                userStates.users[userKey].auth = 4;
                keyData.name = "Breaker";
                keyData.userKey = userKey;
                delete breakinStates[name];
                yield $StateManager.commitState(BREAKIN_CONFIG, next);
            } else {
                keyData.name = name;
            }
            yield $StateManager.commitState(USER_CONFIG, next);

            responder.respondJson({
                state: (keyData.userKey ? 2 : 1),
                name:keyData.name,
            }, done);
        }, this);
    },
    question:function(requestor, responder, done) {
        var next = coroutine(function*() {
            if (requestor.getMethod() == "GET") {
                responder.addError("Not valid for 'GET' method.");
                return safe(done)();
            }

            var json = yield requestor.visitBodyJson(next);
            if (!json) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var serial = json.serial;
            var newSerial = null;
            var userStates = $StateManager.getState(USER_CONFIG);
            var keys = userStates.keys;
            keys = (keys ? keys : {});
            var keyData = keys[serial];
            if (!keyData) {
                serial = rkey();
                while(keys[serial]){serial = rkey();}
                keyData = {};
                keys[serial] = keyData;
                newSerial = serial;
            }
            userStates.keys = keys;
            if (newSerial) {
                yield $StateManager.commitState(USER_CONFIG, next);
            }
            var state = 0;
            if (keyData.userKey) {
                state = 2;
            } else if (keyData.name) {
                state = 1;
            }

            var obj = yield this.httpServer.tokenValid(requestor, next);
            if (obj && obj.getSerial() != serial) {
                $LoginManager.logoff(obj.getSerial());
                obj = null;
            }
            if (!obj) {
                obj = $LoginManager.login(serial);
                responder.setCookies({token:obj.getToken()});
            }
            responder.respondJson({
                serial:newSerial,
                state:state,
                name:keyData.name,
            }, done);
        }, this);
    },
});

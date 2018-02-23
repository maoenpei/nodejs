
require("../Base");
require("../StateManager");
require("../LoginManager");

var AuthorizeOnlySuperAdmin = true;

USER_CONFIG = "UserStates.d";
BREAKIN_CONFIG = "Breakin.d";

$HttpModel.addClass("USER_CLASS", {
    _constructor:function(httpServer) {
        this.httpServer = httpServer;
        this.userListeners = {};

        httpServer.registerCommand("listusers", this);
        httpServer.registerCommand("promote", this);
        httpServer.registerCommand("disable", this);
        httpServer.registerCommand("rename", this);
        httpServer.registerCommand("authorize", this);
        httpServer.registerCommand("apply", this);
        httpServer.registerCommand("requirement", this);
        httpServer.registerCommand("question", this);
    },
    initialize:function(done) {
        var next = coroutine(function*() {
            yield $StateManager.openState(USER_CONFIG, next);
            yield $StateManager.openState(BREAKIN_CONFIG, next);
            safe(done)();
        }, this);
    },

    listenUserModification:function(listener) {
        if (!listener || typeof(listener) != "object") {
            return null;
        }
        var key = rkey();
        while (this.userListeners[key]) { key = rkey(); }
        this.userListeners[key] = listener;
        return key;
    },
    removeUserListener:function(key) {
        if (this.userListeners[key]) {
            delete this.userListeners[key];
        }
    },
    invokeUserListener:function(type, userData) {
        for (var key in this.userListeners) {
            var listener = this.userListeners[key];
            if (listener[type]) {
                listener[type](userData);
            }
        }
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

    listusers:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({POST:true, USER:3, AUTH: 3}, next))) {
                return;
            }

            var userStates = $StateManager.getState(USER_CONFIG);
            var json = yield requestor.visitBodyJson(next);
            if (!json || !json.jetson) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var allUsers = [];
            var sortBaseIndex = 0;
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
                    sortBaseIndex++;
                } else {
                    var userData = userStates.users[keyData.userKey];
                    if (userData) {
                        var insertIndex = allUsers.length - 1;
                        for (; insertIndex >= sortBaseIndex; --insertIndex) {
                            if (allUsers[insertIndex].auth > userData.auth) {
                                break;
                            }
                        }
                        allUsers.splice(insertIndex + 1, 0, {
                            name:keyData.name,
                            dead:!!keyData.dead,
                            serial:serial,
                            auth:userData.auth,
                            req:userData.req || {},
                        });
                    }
                }
            }

            var canAuthorize = (AuthorizeOnlySuperAdmin ? session.authorized(4) : true);
            responder.respondJson({
                canAuthorize: canAuthorize,
                auths: session.availableAuths(),
                reqs: session.availableRequirements(),
                users: allUsers,
            }, done);
        }, this);
    },
    promote:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({POST:true, USER:3, AUTH: 3}, next))) {
                return;
            }

            var userStates = $StateManager.getState(USER_CONFIG);
            var json = yield requestor.visitBodyJson(next);
            if (!json || !json.target || !json.auth) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var targetSerial = json.target;
            var targetAuth = Number(json.auth);
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
    disable:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({POST:true, USER:3, AUTH: 3}, next))) {
                return;
            }

            var userStates = $StateManager.getState(USER_CONFIG);
            var json = yield requestor.visitBodyJson(next);
            if (!json || !json.target) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var targetSerial = json.target;
            var keepUser = json.keep;
            if (targetSerial == session.getSerial()) {
                responder.addError("Cannot disable self.");
                return responder.respondJson({}, done);
            }

            var targetKeyData = userStates.keys[targetSerial];
            if (!targetKeyData || !targetKeyData.name) {
                responder.addError("Not an valid user.");
                return responder.respondJson({}, done);
            }

            if (targetKeyData.userKey) {
                var targetUserData = userStates.users[targetKeyData.userKey];
                if (!targetUserData) {
                    responder.addError("No user data.");
                    return responder.respondJson({}, done);
                }
                if (targetUserData.auth > 3) {
                    responder.addError("Cannot disable super administrator.");
                    return responder.respondJson({}, done);
                }
                if (keepUser) {
                    if (targetKeyData.dead) {
                        responder.addError("User already broken.");
                        return responder.respondJson({}, done);
                    }
                    var newSerial = rkey();
                    while (userStates.keys[newSerial]) { newSerial = rkey(); }
                    userStates.keys[newSerial] = {
                        dead: true,
                        name: targetKeyData.name,
                        userKey: targetKeyData.userKey,
                    };
                } else {
                    this.invokeUserListener("deleting", targetUserData);
                    delete userStates.users[targetKeyData.userKey];
                }
                delete targetKeyData.userKey;
                delete targetKeyData.dead; // possible field
            }
            delete targetKeyData.name;
            yield $StateManager.commitState(USER_CONFIG, next);

            responder.respondJson({success:true}, done);
        }, this);
    },
    rename:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({POST:true, USER:3, AUTH: 3}, next))) {
                return;
            }

            var userStates = $StateManager.getState(USER_CONFIG);
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
    authorize:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({POST:true, USER:3, AUTH: 3}, next))) {
                return;
            }

            var userStates = $StateManager.getState(USER_CONFIG);
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
                var nextUserData = userStates.users[nextUserKey];
                nextUserData.auth = 1;
                this.invokeUserListener("added", nextUserData);
            } else {
                if (AuthorizeOnlySuperAdmin && !session.authorized(4)) {
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
                delete lastData.dead; // possible field
                delete lastData.name;
            }

            currentData.userKey = nextUserKey;
            yield $StateManager.commitState(USER_CONFIG, next);

            responder.respondJson({success:true}, done);
        }, this);
    },
    apply:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({POST:true, TOKEN:true}, next))) {
                return;
            }

            var userStates = $StateManager.getState(USER_CONFIG);
            var keyData = userStates.keys[session.getSerial()];
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
    requirement:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({POST:true, USER:3, AUTH: 3}, next))) {
                return;
            }

            var userStates = $StateManager.getState(USER_CONFIG);
            var json = yield requestor.visitBodyJson(next);
            if (!json || !json.target || !json.val) {
                responder.addError("Parameter data not correct.");
                return responder.respondJson({}, done);
            }

            var targetSerial = json.target;
            var reqName = json.val;
            var isAdd = json.add;
            var targetKeyData = userStates.keys[targetSerial];

            var userKey = targetKeyData.userKey;
            var req = userStates.users[userKey].req || {};
            if (isAdd) {
                req[reqName] = true;
            } else {
                delete req[reqName];
            }
            userStates.users[userKey].req = req;
            yield $StateManager.commitState(USER_CONFIG, next);

            responder.respondJson({
                success: true,
            }, done);
        }, this);
    },
    question:function(requestor, responder, session, done) {
        var next = coroutine(function*() {
            if (!(yield session.checkConnection({POST:true}, next))) {
                return;
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

            session.renew(serial);
            responder.respondJson({
                serial:newSerial,
                state:state,
                name:keyData.name,
            }, done);
        }, this);
    },
});

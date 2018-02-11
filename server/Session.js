

require("./Base");

var AllRequirements = {
    "kingwar": {},
    "playerlist": {},
    "serverInfo": {},
    "automation": {},
    "management": {},
};

Base.extends("Session", {
    _constructor:function(requestor, responder) {
        this.requestor = requestor;
        this.responder = responder;
        this.tokenObj = null;
    },
    checkConnection:function(validation, done) {
        var next = coroutine(function*() {
            var doErr = () => {
                safe(done)(false);
            };

            this.tokenObj = yield this.tokenValid(next);

            if (validation.POST) {
                if (this.requestor.getMethod() == "GET") {
                    this.responder.addError("Not valid for 'GET' method.");
                    return this.responder.respondJson({}, doErr);
                }
            }

            if (validation.TOKEN || validation.USER) {
                if (!this.tokenObj) {
                    this.responder.addError("Not valid token for logout.");
                    return this.responder.respondJson({}, doErr);
                }

                if (validation.USER >= 1) {
                    var userStates = $StateManager.getState(USER_CONFIG);
                    var keyData = userStates.keys[this.tokenObj.getSerial()];
                    if (!keyData) {
                        this.responder.addError("No such user.");
                        return this.responder.respondJson({}, doErr);
                    }
                    if (validation.USER >= 2) {
                        if (!keyData.userKey) {
                            this.responder.addError("Not an authorized user.");
                            return this.responder.respondJson({}, doErr);
                        }
                    }
                    var vAUTH = validation.AUTH;
                    var vREQ = validation.REQ;
                    if (validation.USER >= 3 && (vAUTH || vREQ)) {
                        var userData = userStates.users[keyData.userKey];
                        var authed = (vAUTH ? userData.auth >= vAUTH : true) && (vREQ ? userData.req && userData.req[vREQ] : true);
                        if (!userData || !authed) {
                            this.responder.addError("Admin level not enough.");
                            return this.responder.respondJson({}, doErr);
                        }
                        this.userKey = keyData.userKey;
                    }
                }
            }

            safe(done)(true);
        }, this);
    },
    renew:function(serial) {
        if (this.tokenObj && this.tokenObj.getSerial() != serial) {
            $LoginManager.logoff(this.tokenObj.getToken());
            this.tokenObj = null;
        }
        if (!this.tokenObj) {
            this.tokenObj = $LoginManager.login(serial);
            this.responder.setCookies({token: this.tokenObj.getToken()});
        }
    },
    getSerial:function() {
        return (this.tokenObj ? this.tokenObj.getSerial() : null);
    },
    authorized:function(auth, req) {
        var userStates = $StateManager.getState(USER_CONFIG);
        var userData = userStates.users[this.userKey];
        return (auth ? userData.auth >= auth : true) && (req ? userData.req && userData.req[req] : true);
    },
    getUserData:function() {
        var userStates = $StateManager.getState(USER_CONFIG);
        var userData = userStates.users[this.userKey];
        return userData;
    },

    tokenValid:function(done) {
        var next = coroutine(function*() {
            var query = this.requestor.getQuery();
            var cookies = this.requestor.getCookies();
            var token = (cookies ? cookies.token : null);
            token = (token ? token : query.token);
            var obj = $LoginManager.query(token);
            if (!obj || obj.checkExpired()) {
                $LoginManager.logoff(token);
                return safe(done)(null);
            }
            return safe(done)(obj);
        }, this);
    },
});

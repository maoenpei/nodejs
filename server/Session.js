

require("./Base");

var AllAuthorizations = [
    {name:"无权限", val:1},
    {name:"可配置权限", val:2},
    {name:"管理员", val:3},
    {name:"超级管理员"},
];

var AllRequirements = [
    {name:"查看详细", val:"view", extends:[
        {name:"帝国战面板", val:"view_kingwar", extends:[]},
        {name:"玩家面板", val:"view_playerlist", extends:[]},
        {name:"刷新详细", val:"view_refresh", extends:[]},
    ]},
    {name:"信息面板", val:"server", extends:[
        {name:"商店折扣", val:"server_heroshop", extends:[]},
    ]},
    {name:"配置面板", val:"automation", extends:[
        {name:"日常", val:"auto_daily", extends:[]},
        {name:"帝国战", val:"auto_kingwar", extends:[]},
        {name:"商店", val:"auto_heroshop", extends:[]},
        {name:"领地战", val:"auto_unionwar", extends:[]},
        {name:"信息查询", val:"auto_detail", extends:[]},
        {name:"勇者操作", val:"auto_heropanel", extends:[]},
    ]},
    {name:"消耗设置", val:"payment", extends:[]},
];

var RequirementsRelations = {};
var ManageRequirements = (requirements, parent) => {
    for (var i = 0; i < requirements.length; ++i) {
        var item = requirements[i];
        var related = {
            name: item.name,
            val: item.val,
            parent: parent,
            children: [],
        };
        RequirementsRelations[item.val] = related;
        if (parent) {
            parent.children.push(related);
        }
        ManageRequirements(item.extends, related);
    }
};
ManageRequirements(AllRequirements, null);

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
                        var authed = this.checkRequirement(userData, vAUTH, vREQ);
                        if (!userData || !authed) {
                            this.responder.addError("Admin level not enough.");
                            return this.responder.respondJson({}, doErr);
                        }
                        this.userName = keyData.name;
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
    getUserKey:function() {
        return this.userKey;
    },
    authorized:function(auth, req) {
        var userStates = $StateManager.getState(USER_CONFIG);
        var userData = userStates.users[this.userKey];
        return this.checkRequirement(userData, auth, req);
    },
    getUserName:function() {
        return this.userName;
    },
    getUserData:function() {
        var userStates = $StateManager.getState(USER_CONFIG);
        var userData = userStates.users[this.userKey];
        return userData;
    },
    checkRequirement:function(userData, auth, req) {
        return (userData.auth >= 4) || (auth ? userData.auth >= auth : false) || ((userData.auth >= 2) && (req ? userData.req && userData.req[req] : false));
    },
    availableAuths:function() {
        return AllAuthorizations;
    },
    availableRequirements:function() {
        return AllRequirements;
    },
    getRequirementRelation:function(reqName) {
        return RequirementsRelations[reqName];
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

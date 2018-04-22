
require("./Base");

// 40 minutes
var expirePeriod = 40 * 60 * 1000;

Base.extends("Login", {
    _constructor:function(token, serial) {
        this.token = token;
        this.serial = serial;
        this.expire = new Date().getTime() + expirePeriod;
    },
    getToken:function() {
        return this.token;
    },
    getSerial:function() {
        return this.serial;
    },
    checkExpired:function() {
        var now = new Date().getTime();
        if (now >= this.expire) {
            return true;
        }
        this.expire = now + expirePeriod;
        return false;
    },
});

Base.extends("LoginManager", {
    loginData: {},
    login:function(serial) {
        var token = null;
        do {
            token = rkey();
        } while(this.loginData[token]);
        var obj = new Login(token, serial);
        this.loginData[token] = obj;
        return obj;
    },
    logoff:function(token) {
        delete this.loginData[token];
    },
    query:function(token) {
        return this.loginData[token];
    },
});

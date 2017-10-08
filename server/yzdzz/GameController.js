
require("../Base");
require("./Protocol");
var http = require("http");
var querystring = require("querystring");
var zlib = require("zlib");

var SendHTTP = function(options, postData, callback) {
    var req = http.request(options, function(res) {
        var body = [];
        res.on('data', function(chunk) {
            body.push(chunk);
        });
        res.on('end', function() {
            var buf = Buffer.concat(body);
            callback(buf);
        });
    });

    req.on('error', function(err) {
        console.log('HTTP error:', err);
    });

    if (postData) {
        req.write(postData);
    }
    req.end();
};

Base.extends("PlayerConnection", {
    _constructor:function() {
    },

    quit:function() {
    },
    listPlayers:function() {
    },
});

var cachedServers = null;
Base.extends("AccountLogger", {
    _constructor:function(loginData) {
        this.accessToken = loginData.value.accessToken;
        this.uid = loginData.value.channelUid;
        this.servers = {};
    },

    prepare:function(done) {
        var next = coroutine(function*() {
            // try servers file
            if (cachedServers) {
                this.servers = cachedServers;
            } else {
                var serverList = null;
                var data = yield $FileManager.visitFile("/data/serverCache.d", next);
                if (!data) {
                    var postData = querystring.stringify({getServerList:'hehe'});
                    var options = HulaiHTTP.servers(this.uid, Buffer.byteLength(postData));
                    var buf = yield SendHTTP(options, postData, next);
                    var unzip1 = yield zlib.gunzip(buf, (err, decoded)=>{next(decoded);});
                    var unzip2 = yield zlib.gunzip(unzip1, (err, decoded)=>{next(decoded);});
                    var obj = JSON.parse(unzip2.toString());
                    serverList = obj.list;
                    data = JSON.stringify(obj.list);
                    yield $FileManager.saveFile("/data/serverCache.d", data, next);
                } else {
                    serverList = JSON.parse(data);
                }

                this.servers = {};
                for (var key in serverList) {
                    var serverData = serverList[key];
                    var ipData = serverData.server.split(":");
                    var server = {
                        id:serverData.id,
                        ip:ipData[0],
                        port:ipData[1],
                        desc:serverData.short,
                    };
                    var serverKey = rkey();
                    while(this.servers[serverKey]){serverKey = rkey();}
                    this.servers[serverKey] = server;
                }
                cachedServers = this.servers;
            }

            safe(done)();
        }, this);
    },

    findServer:function(desc) {
        for (var serverKey in this.servers) {
            var server = this.servers[serverKey];
            if (server.desc == desc) {
                return serverKey;
            }
        }
        return null;
    },
    connectGame:function(serverKey) {
    },
});

Base.extends("AccountManager", {
    _constructor:function() {
        this.accounts = {
            aaa:{username:'eyexiaohao008', password:'123456',},
        };
    },
    add:function(username, password) {
        var accountKey = rkey();
        while(this.accounts[accountKey]) {
            accountKey = rkey();
        }
        this.accounts[accountKey] = {
            username:username,
            password:password,
        }
    },
    remove:function(accountKey) {
        if (this.accounts[accountKey]) {
            delete this.accounts[accountKey];
        }
    },
    list:function() {
        return this.accounts;
    },

    login:function(accountKey, done) {
        var accountData = this.accounts[accountKey];
        if (!accountData) {
            return later(safe(done), null);
        }

        SendHTTP(
            HulaiHTTP.login(accountData.username, accountData.password),
            null,
            function(buf) {
                var obj = JSON.parse(buf.toString());

                if (obj.code != 'SUCCESS') {
                    return safe(done)(null);
                }

                var loginObj = new AccountLogger(obj);
                safe(done)(loginObj);
            }
        );
    },
});

Base.extends("GameController", {
    _constructor:function() {
        this.accountManager = new AccountManager();
    },
    getAccountManager:function() {
        return this.accountManager;
    },
});

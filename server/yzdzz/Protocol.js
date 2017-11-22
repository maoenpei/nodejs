
require("../Base");
var crypto = require("crypto");
var http = require("http");
var net = require("net");
var querystring = require("querystring");
var zlib = require("zlib");

var SendHTTP = function(options, postData, done) {
    var req = http.request(options, function(res) {
        var body = [];
        res.on('data', function(chunk) {
            body.push(chunk);
        });
        res.on('end', function() {
            var buf = Buffer.concat(body);
            return safe(done)(buf);
        });
    });

    req.on('error', function(err) {
        console.log('>> - HTTP error:', err);
        return safe(done)(null);
    });

    if (postData) {
        req.write(postData);
    }
    req.end();
};

var StrMd5 = function(str) {
    var toMd5 = str.toLowerCase() + "SDHJS888111";
    var md5 = crypto.createHash("md5WithRSAEncryption").update(toMd5).digest("hex");
    return md5.substr(0, 4);
}

var ObjectWithSig = function(c, m, data) {
    var object = {
        c:c,
        m:m,
        data:data,
    };
    var strToMd5 = JSON.stringify(object);
    object.s = StrMd5(strToMd5);
    return object;
}

GameSock = {};

GameSock.connect = function(ip, port, done) {
    var sock = new net.Socket();
    var socketError = (err) => {
        console.log(">> - Socket error:", err);
    };
    var connectError = (err) => {
        socketError(err);
        return safe(done)(null);
    };
    sock.on("error", connectError);
    sock.connect({port:port, host:ip,}, () => {
        sock.removeListener("error", connectError);
        sock.on("error", socketError);
        return safe(done)(sock);
    });
}

GameSock.receive = function(sock, callback) {
    var stream = Buffer.alloc(0);
    sock.on("data", (buf) => {
        stream = Buffer.concat([stream, buf]);
        while (stream.length >= 4) {
            var packageSize = stream.readInt32BE(0);
            if (stream.length < packageSize + 4) {
                return;
            }
            var package = stream.slice(4, packageSize + 4);
            stream = stream.slice(packageSize + 4);
            zlib.gunzip(package, (err, decoded) => {
                var obj = JSON.parse(decoded.toString());
                if (!obj.data) {
                    console.log(">> - Protocol error on c({0}) m({1}):".format(obj.c, obj.m), obj.error);
                }
                safe(callback)(obj.c, obj.m, obj.data, obj.change);
            });
        }
    });
}

GameSock.send = function(sock, c, m, data, done) {
    var obj = ObjectWithSig(c, m, data);
    var package = new Buffer(JSON.stringify(obj));
    var lenBuf = Buffer.alloc(4);
    lenBuf.writeInt32BE(package.length, 0);
    sock.write(Buffer.concat([lenBuf, package]), safe(done));
}

GameHTTP = {};

var hulaiAccess = "access.hoolai.com";
var hulaiGame = "d1.yongzhe.hulai.com";

GameHTTP.login = function(username, password, done) {
    var loginOptions = {
        hostname:hulaiAccess,
        path:('/access_open_api/login/login.hl?'
            + 'passport={username}&password={password}'
            + '&productId=182&udid=6D09A91F-B1E8-497F-A649-7B4604C08A3F'
            + '&channel=hoolaiappstore').format({
                username:username,
                password:password,
            }),
        method:'GET',
        headers:{
            'operator':'no carrier',
            'User-Agent': 'huluwa/99 CFNetwork/811.5.4 Darwin/16.7.0',
            'clientVersion': '1.99.1',
            'channelId': '1821',
            'channel': 'hoolaiappstore',
            'udid': '6D09A91F-B1E8-497F-A649-7B4604C08A3F',
            'os': 'iOS',
            'Connection': 'keep-alive',
            'mac': '02:00:00:00:00:00',
            'Accept-Language': 'zh-cn',
            'jailBroke': 'not jailBroke',
            'idfv': 'C57FBD51-C675-47DF-96A0-6F67D60298A0',
            'model': 'iPad4,1',
            'developerUid': '106351789',
            'osVersion': '10.3.3',
            'networkType': 'wifi',
            'Accept': '*/*',
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept-Encoding': 'gzip, deflate',
            'productId': '182',
            'idfa': '632A6F3E-504E-4331-AA4C-10511F13FAA7',
        },
    };
    SendHTTP(loginOptions, null, (buf) => {
        if (!buf){ return safe(done)(null); }
        var obj = JSON.parse(buf.toString());
        return safe(done)(obj);
    });
}

GameHTTP.servers = function(uid, done) {
    var postData = querystring.stringify({'getServerList':'hehe'});
    var len = Buffer.byteLength(postData);

    var getServersOptions = {
        hostname:hulaiGame,
        path:'/Tool_Version/getServers/pf/ios/name/{0}/g/1'.format(uid),
        method:'POST',
        headers:{
            'Content-Type':'application/x-www-form-urlencoded',
            'User-Agent': 'huluwa/99 CFNetwork/811.5.4 Darwin/16.7.0',
            'Connection': 'keep-alive',
            'Accept': '*/*',
            'Accept-Language': 'zh-cn',
            'Content-Length': len,
            'Accept-Encoding': 'gzip, deflate',
            'X-Unity-Version': '5.5.2f1',
        },
    };
    SendHTTP(getServersOptions, postData, (buf) => {
        if (!buf){ return safe(done)(null); }
        zlib.gunzip(buf, (err, decoded) => {
            zlib.gunzip(decoded, (err, decoded2) => {
                var obj = JSON.parse(decoded2.toString());
                return safe(done)(obj);
            });
        });
    });
}

GameHTTP.stat = function(uid, type, done) {
    var sign = StrMd5("ios" + uid + type + "IPhonePlayer");
    var statOptions = {
        hostname: hulaiGame,
        method:'GET',
        path: '/Tool_Stat/up/channel/ios/uid/{0}/type/{1}/plat/IPhonePlayer/sign/{2}'.format(uid, type, sign),
        headers: {
            'Connection': 'keep-alive',
            'Accept': '*/*',
            'User-Agent': 'huluwa/99 CFNetwork/811.5.4 Darwin/16.7.0',
            'Accept-Language': 'zh-cn',
            'Accept-Encoding': 'gzip, deflate',
            'X-Unity-Version': '5.5.2f1',
        },
    };
    SendHTTP(statOptions, null, (buf) => {
        if (!buf){ return safe(done)(null); }
        zlib.gunzip(buf, (err, decoded)=> {
            var result = decoded.toString();
            return safe(done)(result);
        });
    });
}

GameHTTP.save = function(uid, roleId, serverId, accessToken, done) {
    var postData = querystring.stringify({
        'productId':182,
        'vip':1,
        'uid':uid,
        'channelId':1821,
        'channel':'hoolaiappstore',
        'roleId':roleId,
        'zoneId':serverId,
        'accessToken':accessToken,
        'balance':'0',
        'channelUid':uid,
        'action':'1',
        'partyName':'',
        'roleName':'',
        'zoneName':'',
        'appVersion':'app_version',
        'roleLv':'9',
        'appResVersion':'0721',
    });
    var len = Buffer.byteLength(postData);

    var saveGameOptions = {
        hostname: hulaiAccess,
        method: 'POST',
        path: '/access_open_api/login/saveGameInfo.hl',
        headers:{
            'operator': 'no carrier',
            'User-Agent': 'huluwa/99 CFNetwork/811.5.4 Darwin/16.7.0',
            'clientVersion': '1.99.1',
            'channelId': 1821,
            'channel': 'hoolaiappstore',
            'udid': '6D09A91F-B1E8-497F-A649-7B4604C08A3F',
            'os': 'iOS',
            'Content-Length': len,
            'Connection': 'keep-alive',
            'mac': '02:00:00:00:00:00',
            'Accept-Language': 'zh-cn',
            'jailBroke': 'not jailBroke',
            'idfv': 'C57FBD51-C675-47DF-96A0-6F67D60298A0',
            'model': 'iPad4,1',
            'developerUid': '106351789',
            'osVersion': '10.3.3',
            'networkType': 'wifi',
            'Accept': '*/*',
            'Content-Type': 'application/x-www-form-urlencoded',
            'productId': 182,
            'Accept-Encoding': 'gzip, deflate',
            'idfa': '632A6F3E-504E-4331-AA4C-10511F13FAA7',
        }
    };
    SendHTTP(saveGameOptions, postData, (buf) => {
        if (!buf){ return safe(done)(null); }
        var obj = JSON.parse(buf.toString());
        return safe(done)(obj);
    });
}

GameHTTP.loginServer = function(uid, serverId, done) {
    var sign = StrMd5("ios" + uid + serverId);
    var loginServerOptions = {
        hostname: hulaiGame,
        method:'GET',
        path: '/Tool_Version/loginServer/pf/ios/name/{0}/serverid/{1}/sign/{2}'.format(uid, serverId, sign),
        headers: {
            'Connection': 'keep-alive',
            'Accept': '*/*',
            'User-Agent': 'huluwa/99 CFNetwork/811.5.4 Darwin/16.7.0',
            'Accept-Language': 'zh-cn',
            'Accept-Encoding': 'gzip, deflate',
            'X-Unity-Version': '5.5.2f1',
        },
    };
    SendHTTP(loginServerOptions, null, (buf) => {
        if (!buf){ return safe(done)(null); }
        zlib.gunzip(buf, (err, decoded)=> {
            var result = decoded.toString();
            return safe(done)(result);
        });
    });
}

GameUtil = {};

GameUtil.cardToInfo = function(card) {
    return {
        isGold: card == 1,
        isBad: card == 2 || card == 3,
        isGood: card == 4,
        isDismissGood: card == 5,
        isDismissBad: card == 6,
        cardType: card,
    };
}


HulaiHTTP = {};

var hulaiAccess = "access.hoolai.com";
var hulaiGame = "d1.yongzhe.hulai.com";

var loginOptions = {
    hostname:hulaiAccess,
    path:'/access_open_api/login/login.hl?passport={username}&password={password}&productId=182&udid=6D09A91F-B1E8-497F-A649-7B4604C08A3F&channel=hoolaiappstore',
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
HulaiHTTP.login = function(username, password) {
    var t = clone(loginOptions);
    t.path = loginOptions.path.format({
        username:username,
        password:password,
    });
    return t;
}

var getServersOptions = {
    hostname:'d1.yongzhe.hulai.com',
    path:'/Tool_Version/getServers/pf/ios/name/{uid}/g/1',
    method:'POST',
    headers:{
        'Content-Type':'application/x-www-form-urlencoded',
        'User-Agent': 'huluwa/99 CFNetwork/811.5.4 Darwin/16.7.0',
        'Connection': 'keep-alive',
        'Accept': '*/*',
        'Accept-Language': 'zh-cn',
        'Content-Length': '{len}',
        'Accept-Encoding': 'gzip, deflate',
        'X-Unity-Version': '5.5.2f1',
    },
};
HulaiHTTP.servers = function(uid, len) {
    var t = clone(getServersOptions);
    t.path = getServersOptions.path.format({uid:uid});
    t.headers = clone(getServersOptions.headers);
    t.headers['Content-Length'] = getServersOptions.headers['Content-Length'].format({len:len});
    return t;
}

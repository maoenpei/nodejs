
require("./Base");
var url = require("url");
var path = require("path");
var querystring = require("querystring");

var pathMapping = {};
pathMapping["/"] = "/index.essp";

var lineDivider = stringToAscii("\r\n");
var doubleLineDivider = stringToAscii("\r\n\r\n");

Base.extends("Requestor", {
    _constructor:function(req) {
        var parsedUrl = url.parse(req.url);
        if (parsedUrl.pathname in pathMapping) {
            parsedUrl.pathname = pathMapping[parsedUrl.pathname];
        }
        var parsedPath = path.parse(parsedUrl.pathname);

        this.parsedUrl = parsedUrl;
        this.parsedPath = parsedPath;
        this.cmd = (parsedPath.dir == "/" && parsedPath.ext == "" ? parsedPath.name : null);

        this.req = req;
        this.parsedQuery = null;
        this.cookies = null;
    },
    getReq:function() {
        return this.req;
    },
    getCommand:function() {
        return this.cmd;
    },
    getPath:function() {
        return this.parsedUrl.pathname;
    },
    getName:function() {
        return this.parsedPath.name;
    },
    getExtension:function() {
        return this.parsedPath.ext;
    },
    getQuery:function() {
        if (!this.parsedQuery) {
            this.parsedQuery = querystring.parse(this.parsedUrl.query);
        }
        return this.parsedQuery;
    },
    getCookies:function() {
        if (!this.cookies && this.req.headers.cookie) {
            this.cookies = {};
            var cookieSplits = this.req.headers.cookie.split(/\s*;\s*/);
            for (cookieStr of cookieSplits) {
                var cookiePair = cookieStr.split(/=/);
                if (cookiePair.length == 2) {
                    this.cookies[cookiePair[0]] = cookiePair[1];
                } else {
                    console.log("Fail to ayalysis cookie:", cookieStr);
                }
            }
        }
        return this.cookies;
    },
    getUserAgent:function() {
        return this.req.headers["user-agent"];
    },

    visitBody:function(done) {
        var body = [];
        this.req.on("data", (chunk) => {
            body.push(chunk);
        }).on("end", () => {
            safe(done)(Buffer.concat(body));
        });
    },
    visitBodyString:function(done) {
        this.visitBody((body) => {
            safe(done)(body.toString());
        });
    },
    visitBodyQuery:function(done) {
        this.visitBodyString((body) => {
            safe(done)(querystring.parse(body));
        });
    },
    visitBodyJson:function(done) {
        this.visitBodyString((body) => {
            safe(done)(JSON.parse(body));
        });
    },
    visitBodyUpload:function(done) {
        this.visitBody((body) => {
            var firstLine = 0;
            var secondLine = 0;
            var blockBegin = 0;
            for (var i = 0; i < body.length; ++i) {
                if (firstLine == 0 && codeEqual(lineDivider, body, i)) {
                    firstLine = i;
                } else if (firstLine != 0 && secondLine == 0 && codeEqual(lineDivider, body, i)) {
                    secondLine = i;
                } else if (codeEqual(doubleLineDivider, body, i)) {
                    blockBegin = i + doubleLineDivider.length;
                    break;
                }
            }

            // tail: "\r\n" + first line + "--\r\n"
            var blockEnd = body.length - (lineDivider.length + firstLine + 2 + lineDivider.length);
            if (firstLine == 0 || secondLine == 0 || blockBegin == 0 || blockEnd <= blockBegin ||
                !arrEqual(body, 0, body, blockEnd + lineDivider.length, firstLine)) {
                console.log("error uploading file!");
                return later(safe(done), null);
            }

            var fileInfo = {};
            var info = body.slice(firstLine + lineDivider.length, secondLine).toString();
            var infoSplits = info.split(/\s*;\s*/);
            for (var infoStr of infoSplits) {
                var infoPair = infoStr.split(/=/);
                if (infoPair.length == 2) {
                    fileInfo[infoPair[0]] = infoPair[1].match(/^\"?(.*?)\"?$/)[1];
                }
            }
            later(safe(done), body.slice(blockBegin, blockEnd), fileInfo);
        });
    },
});

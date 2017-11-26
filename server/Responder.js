
require("./Base");
require("./StateManager");

EXTENSION_CONFIG = "ExtTypes.d";

Base.extends("Responder", {
	_constructor:function(res) {
		this.res = res;
		this.finished = false;
		this.errorInfo = [];
	},
	getRes:function() {
		return this.res;
	},

	respondData:function(data, done) {
		if (data) {
			if (this.range) {
				var start = this.range.start;
				var end = this.range.end == -1 ? data.length - 1 : this.range.end;
				this.res.setHeader("Content-Range", "bytes " + start + "-" + end + "/" + data.length);
				this.res.end(data.slice(start, end + 1), safe(done));
			} else {
				this.res.end(data, safe(done));
			}
		} else {
			this.res.end(safe(done));
		}
		this.finished = true;
	},
	respondJson:function(json, done) {
		//console.log(">>>> respond json:", json);
		this.respondData(JSON.stringify(json), done);
	},

	setType:function(ext) {
		var responderType = $StateManager.getState(EXTENSION_CONFIG)[ext];
		responderType = (responderType ? responderType : "text/plain");
		this.res.setHeader("Content-Type", responderType + "; charset=utf-8");
	},
	setRange:function(range) {
		this.range = range;
	},
	setCookies:function(cookies) {
		var cookieData = [];
		for (var key in cookies) {
			cookieData.push(key + "=" + cookies[key]);
		}
		console.log("cookies:", cookieData);
		this.res.setHeader("Set-Cookie", cookieData);
	},
	setCacheTime:function(seconds) {
		this.res.setHeader("Cache-Control", "max-age=" + String(seconds));
	},
	setLastModified:function(mtime) {
		this.res.setHeader("Last-Modified", mtime.toUTCString());
	},
	setTag:function(tag) {
		this.res.setHeader("Etag", tag);
	},
	redirect:function(url, delay) {
		delay = (delay ? delay : 3);
		this.res.setHeader("refresh", delay + ";url="+url);
	},
	setCode:function(code) {
		this.res.statusCode = code;
	},

	addError:function(err) {
		console.log("error generated:", err);
		this.errorInfo.push(err);
	},
	getErrors:function() {
		return this.errorInfo;
	},

	Ended:function() {
		return this.finished;
	}
});


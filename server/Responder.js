
require("./Base");
require("./PersistanceManager");

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
		if (this.range) {
			var start = this.range.start;
			var end = this.range.end == -1 ? data.length - 1 : this.range.end;
			this.res.setHeader("Content-Range", "bytes " + start + "-" + end + "/" + data.length);
			this.res.end(data.slice(start, end + 1), safe(done));
		} else {
			this.res.end(data, safe(done));
		}
		this.finished = true;
	},
	respondJson:function(json, done) {
		this.respondData(JSON.stringify(json), done);
	},

	setType:function(ext) {
		var responderType = $PersistanceManager.ExtensionType(ext);
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
	setCode:function(code) {
		this.res.statusCode = code;
	},
	redirect:function(url, delay) {
		delay = (delay ? delay : 3);
		this.res.setHeader("refresh", delay + ";url="+url);
	},

	addError:function(err) {
		this.errorInfo.push(err);
	},
	getErrors:function() {
		return this.errorInfo;
	},

	Ended:function() {
		return this.finished;
	}
});


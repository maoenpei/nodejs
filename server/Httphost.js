
require("./Base");
require("./Requestor");
require("./Responder");
require("./FileManager");
require("./FileCacher");
require("./PersistanceManager");
require("./LoginManager");
require("./TemplateParser");

var hostCommand = {
	exchange:function(requestor, responder, done) {
		var next = coroutine(function*() {
			yield $PersistanceManager.availableKeys(next);
			var json = yield requestor.visitBodyJson(next);
			var serial = $PersistanceManager.Serial(json.serial);

			if (!serial) {
				console.log("serial:", serial);
				responder.respondJson({serial:null}, safe(done));
			} else {
				yield $PersistanceManager.Commit(next);

				var obj = $LoginManager.login(serial);
				responder.setCookies({token:obj.getToken()});
				responder.respondJson({
					serial:serial,
				}, safe(done));
			}
		}, this);
		next();
	},
	giveup:function(requestor, responder, done) {
		var next = coroutine(function*() {
			var obj = yield this.tokenValid(requestor, responder, next);
			if (!obj) {
				return later(safe(done));
			}

			var json = yield requestor.visitBodyJson(next);
			$PersistanceManager.Dismiss(obj.getSerial());
			yield $PersistanceManager.Commit(next);

			$LoginManager.logoff(obj.getToken());
			responder.respondJson({}, safe(done));
		}, this);
		next();
	},
	view:function(requestor, responder, done) {
		var next = coroutine(function*() {
			var obj = yield this.tokenValid(requestor, responder, next);
			if (!obj) {
				return later(safe(done));
			}

			var json = yield requestor.visitBodyJson(next);
			var fileKey = json.key;
			var files = $PersistanceManager.Files();
			if (!files[fileKey]) {
				return later(safe(done));
			}

			var state = $PersistanceManager.State(obj.getSerial());
			state.key = fileKey;
			yield $PersistanceManager.Commit(next);

			responder.respondJson({}, safe(done));
		}, this);
		next();
	},
	main:function(requestor, responder, done) {
		var next = coroutine(function*() {
			var obj = yield this.tokenValid(requestor, responder, next);
			if (!obj) {
				return later(safe(done));
			}

			var state = $PersistanceManager.State(obj.getSerial());
			delete state.key;
			yield $PersistanceManager.Commit(next);

			responder.respondJson({}, safe(done));
		}, this);
		next();
	},
	addfile:function(requestor, responder, done) {
		var next = coroutine(function*() {
			var obj = yield this.tokenValid(requestor, responder, next);
			if (!obj) {
				return responder.respondJson({}, safe(done));
			}

			var data, info;
			yield requestor.visitBodyUpload((_data, _info) => {
				data = _data;
				info = _info;
				next();
			});

			console.log(info);
			var name = info.filename.match(/(.*)\.\w+?$/)[1]
			var ext = info.filename.substr(name.length);
			var fileName = yield $FileManager.availableName("/files", ext, next);
			yield $FileManager.saveFile("/files/" + fileName, data, next);

			var files = $PersistanceManager.Files();
			var key = rkey();
			while(files[key]) {
				key = rkey();
			}
			files[key] = {dispName:name, fName:fileName};

			yield $PersistanceManager.Commit(next);
			responder.respondJson({key:key, name:name, ext:ext}, safe(done));
		}, this);
		next();
	},
	delfile:function(requestor, responder, done) {
		var next = coroutine(function*() {
			var obj = yield this.tokenValid(requestor, responder, next);
			if (!obj) {
				return responder.respondJson({}, safe(done));
			}

			var json = yield requestor.visitBodyJson(next);
			var fileKey = json.key;
			var files = $PersistanceManager.Files();
			if (!files[fileKey]) {
				return later(safe(done));
			}

			var fileName = files[fileKey].fName;
			delete files[fileKey];
			yield $FileManager.deleteFile("/files/" + fileName, next);
			yield $PersistanceManager.Commit(next);
			responder.respondJson({}, safe(done));
		}, this);
		next();
	},
	file:function(requestor, responder, done) {
		var next = coroutine(function*() {
			var obj = yield this.tokenValid(requestor, responder, next);
			if (!obj) {
				return later(safe(done));
			}

			var state = $PersistanceManager.State(obj.getSerial());
			var fileKey = state.key;
			var files = $PersistanceManager.Files();
			if (!files[fileKey]) {
				return later(safe(done));
			}

			console.log("fileKey:", fileKey);
			var fName = "/" + files[fileKey].fName;
			var ext = fName.match(/(\.\w+)$/)[1];
			var data = yield $FileCacher.visitFile("/files" + fName, next);

			responder.setType(ext);
			responder.respondData(data, safe(done));
		}, this);
		next();
	},
};

Base.extends("Httphost", {
	_constructor:function(urlRoot, isHost) {
		this.InfoBase = {
			urlRoot:urlRoot,
			isHost:isHost,
		};
		$FileCacher.setEnabled(!isHost);
		$TemplateParser.setEnabled(!isHost);
	},
	onVisit:function(req, res) {
		var requestor = new Requestor(req);
		var responder = new Responder(res);

		this.visitPage(requestor, responder);
	},
	visitPage:function(requestor, responder, done) {
		var next = coroutine(function*() {

			//main
			if (requestor.getPath() == "/") {
				yield this.mainPage(requestor, responder, next);
			}

			// execute command
			if (!responder.Ended()) {
				var cmd = requestor.getCommand();
				if (cmd in hostCommand && typeof(hostCommand[cmd]) == "function") {
					yield this.run(hostCommand[cmd], requestor, responder, next);
				}
			}

			// visit raw file
			if (!responder.Ended()) {
				yield this.commonPage(requestor, responder, next);
			}

			if (!responder.Ended()) {
				this.errorPage(requestor, responder, safe(done));
			}
		}, this);
		next();
	},
	mainPage:function(requestor, responder, done) {
		var next = coroutine(function*() {
			var data = null;
			var obj = yield this.tokenValid(requestor, responder, next);

			if (!obj) {
				data = yield $TemplateParser.parse(this.InfoBase, "/html/index.essp", next);
			} else {
				var state = $PersistanceManager.State(obj.getSerial());
				var fileKey = state.key;
				if (fileKey) {
					data = yield $TemplateParser.parse({
						__proto__:this.InfoBase,
						key:fileKey,
					}, "/html/content.essp", next);
				} else {
					var userAgent = requestor.getUserAgent();
					console.log("userAgent:", userAgent);
					var isMaster = userAgent.match(/Windows/i) != null;
					var serial = obj.getSerial();
					data = yield $TemplateParser.parse({
						__proto__:this.InfoBase,
						files:$PersistanceManager.Files(),
						isMaster:isMaster,
						state:$PersistanceManager.State(serial),
						serial:serial,
					}, "/html/main.essp", next);
				}
			}

			responder.setType(".html");
			responder.respondData(data, safe(done));
		}, this);
		next();
	},
	commonPage:function(requestor, responder, done) {
		var next = coroutine(function*(){
			var data = null;
			var ext = requestor.getExtension();

			// If visit essp file
			if (ext == ".essp") {
				if (!data){
					ext = ".html"
					data = yield $TemplateParser.parse(this.InfoBase, "/html" + requestor.getPath(), next);
				}
			} else {
				// visit file in 'html' folder
				if (!data){
					data = yield $FileCacher.visitFile("/html" + requestor.getPath(), next);
				}
			}

			if (!data) {
				return later(safe(done));
			}

			// respond
			responder.setType(ext);
			responder.respondData(data, safe(done));
		}, this);
		next();
	},
	errorPage:function(requestor, responder, done) {
		var next = coroutine(function*() {
			console.log("Error loading '" + requestor.getPath() + "'!");
			var data = yield $FileCacher.visitFile("/html/error.html", next);

			console.log("urlRoot:", this.InfoBase.urlRoot);
			responder.redirect(this.InfoBase.urlRoot + "/", 1);
			responder.setType(".html");
			responder.respondData(data, safe(done));
		}, this);
		next();
	},

	tokenValid:function(requestor, responder, done) {
		var next = coroutine(function*() {
			var cookies = requestor.getCookies();
			var token = (cookies ? cookies.token : null);
			var obj = $LoginManager.query(token);
			if (!obj || obj.checkExpired()) {
				$LoginManager.cancel(token);
				return later(safe(done), null);
			}
			return later(safe(done), obj);
		}, this);
		next();
	},

	onCommand:function(cmd) {
		switch(cmd) {
			case "refresh":
			$PersistanceManager.initFiles();
			break;
		}
	},
});

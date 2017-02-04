
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
			if (requestor.getMethod() == "GET") {
				responder.addError("Not valid for 'GET' method.");
				return later(safe(done));
			}

			var obj = yield this.tokenValid(requestor, next);
			if (!obj) {
				responder.addError("Not valid token for logout.");
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
			var obj = yield this.tokenValid(requestor, next);
			if (!obj) {
				responder.addError("Not valid token for file view.");
				return later(safe(done));
			}

			var json = yield requestor.visitBodyJson(next);
			var fileKey = json.key ? json.key : "";
			var files = $PersistanceManager.Files();
			if (!files[fileKey]) {
				responder.addError("Not valid file key.");
				return later(safe(done));
			}

			var state = $PersistanceManager.State(obj.getSerial());
			state.key = fileKey;
			yield $PersistanceManager.Commit(next);

			responder.respondJson({}, safe(done));
		}, this);
		next();
	},
	backmain:function(requestor, responder, done) {
		var next = coroutine(function*() {
			var obj = yield this.tokenValid(requestor, next);
			if (!obj) {
				responder.addError("Not valid token for main.");
				return later(safe(done));
			}

			var state = $PersistanceManager.State(obj.getSerial());
			delete state.key;
			yield $PersistanceManager.Commit(next);

			responder.respondJson({}, safe(done));
		}, this);
		next();
	},
	pageupdate:function(requestor, responder, done) {
		var next = coroutine(function*() {
			var obj = yield this.tokenValid(requestor, next);
			if (!obj) {
				responder.addError("Not valid token for update.");
				return later(safe(done));
			}

			var json = yield requestor.visitBodyJson(next);
			if (!json) {
				responder.addError("Not valid updating information.");
				return later(safe(done));
			}

			var state = $PersistanceManager.State(obj.getSerial());
			var fileKey = state.key;
			if (!fileKey) {
				responder.addError("Not valid file key.");
				return later(safe(done));
			}
			state.fileDatas = (state.fileDatas ? state.fileDatas : {});
			state.fileDatas[fileKey] = (state.fileDatas[fileKey] ? state.fileDatas[fileKey] : {});
			for (var k in json) {
				state.fileDatas[fileKey][k] = json[k];
			}
			yield $PersistanceManager.Commit(next);

			responder.respondJson({}, safe(done));
		}, this);
		next();
	},
	addfile:function(requestor, responder, done) {
		var next = coroutine(function*() {
			var obj = yield this.tokenValid(requestor, next);
			if (!obj) {
				responder.addError("Not valid token for file add.");
				return responder.respondJson({}, safe(done));
			}

			var data = null, info = null;
			yield requestor.visitBodyUpload((_data, _info) => {
				data = _data;
				info = _info;
				next();
			});

			console.log("upload:", info);
			if (!info) {
				responder.addError("Not valid file information.");
				return later(safe(done));
			}
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
			var obj = yield this.tokenValid(requestor, next);
			if (!obj) {
				responder.addError("Not valid token for file delete.");
				return responder.respondJson({}, safe(done));
			}

			var json = yield requestor.visitBodyJson(next);
			var fileKey = json.key ? json.key : "";
			var files = $PersistanceManager.Files();
			if (!files[fileKey]) {
				responder.addError("Not valid file key.");
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
	renamefile:function(requestor, responder, done) {
		var next = coroutine(function*() {
			var obj = yield this.tokenValid(requestor, next);
			if (!obj) {
				responder.addError("Not valid token for file rename.");
				return responder.respondJson({}, safe(done));
			}

			var json = yield requestor.visitBodyJson(next);
			var fileKey = json.key ? json.key : "";
			var files = $PersistanceManager.Files();
			if (!files[fileKey]) {
				responder.addError("Not valid file key.");
				return later(safe(done));
			}

			files[fileKey].dispName = json.name;
			yield $PersistanceManager.Commit(next);
			responder.respondJson({}, safe(done));
		}, this);
		next();
	},
	file:function(requestor, responder, done) {
		var next = coroutine(function*() {
			var obj = yield this.tokenValid(requestor, next);
			if (!obj) {
				responder.addError("Not valid token for file.");
				return later(safe(done));
			}

			var state = $PersistanceManager.State(obj.getSerial());
			var fileKey = state.key;
			var targetKey = requestor.getQuery().key;
			if (targetKey != fileKey) {
				responder.addError("Target key not in the correct state.");
				return later(safe(done));
			}

			var files = $PersistanceManager.Files();
			if (!files[fileKey]) {
				responder.addError("Not valid file key.");
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

			// range setting
			var range = requestor.getRange();
			if (range) {
				responder.setRange(range);
			}

			//main
			if (requestor.getPath() == "/") {
				console.log("==>main");
				yield this.mainPage(requestor, responder, next);
			}

			// execute command
			if (!responder.Ended()) {
				console.log("==>command");
				var cmd = requestor.getCommand();
				if (cmd in hostCommand && typeof(hostCommand[cmd]) == "function") {
					yield this.run(hostCommand[cmd], requestor, responder, next);
				}
			}

			// visit raw file
			if (!responder.Ended()) {
				console.log("==>file");
				yield this.commonPage(requestor, responder, next);
			}

			if (!responder.Ended()) {
				console.log("==>error");
				this.errorPage(requestor, responder, safe(done));
			}
		}, this);
		next();
	},
	mainPage:function(requestor, responder, done) {
		var next = coroutine(function*() {
			var data = null;
			var obj = yield this.tokenValid(requestor, next);

			if (!obj) {
				data = yield this.visitData(requestor, "/index.html", null, next);
			} else {
				var state = $PersistanceManager.State(obj.getSerial());
				var fileKey = state.key;
				var files = $PersistanceManager.Files();
				if (fileKey && files[fileKey]) {
					var saveData = state.fileDatas ? state.fileDatas[fileKey] : null;
					data = yield this.visitFile(requestor, fileKey, files[fileKey], saveData, next);
				} else {
					var serial = obj.getSerial();
					data = yield this.visitData(requestor, "/main.html", {
						__proto__:this.InfoBase,
						files:files,
						isMaster:(requestor.getUserAgent().match(/Windows/i) != null),
						state:$PersistanceManager.State(serial),
						serial:serial,
					}, next);
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

			data = yield this.visitData(requestor, requestor.getPath(), null, next);

			if (!data) {
				responder.addError("Cannot find file.");
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
			console.log("Error loading '" + requestor.getPath() + "':\n" + responder.getErrors());
			var data = yield this.visitData(requestor, "/error.html", {
				__proto__:this.InfoBase,
				errors:responder.getErrors(),
			}, next);

			console.log("urlRoot:", this.InfoBase.urlRoot);
			responder.redirect(this.InfoBase.urlRoot + "/", 3000);
			responder.setType(".html");
			responder.respondData(data, safe(done));
		}, this);
		next();
	},

	visitFile:function(requestor, fileKey, fileEntry, saveData, done) {
		var next = coroutine(function*() {
			var fName = "/" + fileEntry.fName;
			var ext = fName.match(/(\.\w+)$/)[1];

			var fileData = yield $FileCacher.visitFile("/files" + fName, next);
			var PageInfo = {
				__proto__:this.InfoBase,
				key:fileKey,
				ext:ext.toLowerCase(),
				responderType:$PersistanceManager.ExtensionType(ext),
				dispName:fileEntry.dispName,
				saveData:(saveData ? saveData : {}),
				fileData:fileData,
			};

			var data = yield this.visitData(requestor, "/content.html", PageInfo, next);
			safe(done)(data);
		}, this);
		next();
	},
	visitData:function(requestor, path, infoBase, done) {
		var next = coroutine(function*(){
			infoBase = (infoBase ? infoBase : {
				__proto__:this.InfoBase,
				isMaster:(requestor.getUserAgent().match(/Windows/i) != null),
			});
			var filegetter = (path, done) => {
				var next = coroutine(function*() {
					var data = null;
					path = "/html" + path;
					if (!data){
						data = yield $FileCacher.visitFile(path, next);
					}
					if (!data) {
						console.log("path:", path);
						path = path.replace(/\.(\w+)$/, ".essp.$1");
						console.log("path:", path);
						data = yield $TemplateParser.parse(path, infoBase, filegetter, next);
						//console.log(path, "=>", data.toString());
					}
					safe(done)(data);
				});
				next();
			}
			var data = yield filegetter(path, next);
			safe(done)(data);
		}, this);
		next();
	},
	tokenValid:function(requestor, done) {
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

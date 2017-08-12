
require("./Base");
require("./Requestor");
require("./Responder");
require("./FileManager");
require("./FileCacher");
require("./PersistanceManager");
require("./LoginManager");
require("./TemplateParser");

var hostCommand = {
	information:function(requestor, responder, done) {
		var next = coroutine(function*() {
			var obj = yield this.tokenValid(requestor, next);
			if (!obj) {
				responder.addError("Not valid token for file add.");
				return responder.respondJson({}, safe(done));
			}

			var state = $PersistanceManager.State(obj.getSerial());
			var canView = state.adminLevel >= 1;
			var canAddPlayer = state.adminLevel >= 1;
			var canDelPlayer = state.adminLevel >= 2;
			var canAddGroup = state.adminLevel >= 3;
			var canDelGroup = state.adminLevel >= 3;

			var logic = $PersistanceManager.Logic();
			var json = {
				match:(logic.match ? logic.match : {}),
				players:(logic.players ? logic.players : {}),
				groups:(logic.groups ? logic.groups : {}),
				delPlayer:canDelPlayer,
				addGroup:canAddGroup,
				delGroup:canDelGroup,
			};
			responder.respondJson(json, safe(done));

		}, this);
	},
	addplayer:function(requestor, responder, done) {
		var next = coroutine(function*() {
			var obj = yield this.tokenValid(requestor, next);
			if (!obj) {
				responder.addError("Not valid token for file add.");
				return responder.respondJson({}, safe(done));
			}

			var state = $PersistanceManager.State(obj.getSerial());
			if (state.adminLevel < 1) {
				responder.addError("Admin level not enough.");
				return responder.respondJson({}, safe(done));
			}

			var json = yield requestor.visitBodyJson(next);
			if (!json || !json.name || !json.power || !json.group) {
				responder.addError("Parameter data not correct.");
				return responder.respondJson({}, safe(done));
			}

			var groupId = json.group;
			var name = json.name;
			var power = json.power;
			var logic = $PersistanceManager.Logic();
			if (!logic.groups[groupId]) {
				responder.addError("Not existing group.");
				return responder.respondJson({}, safe(done));
			}

			var playerId = rkey();
			while(logic.players[playerId]) {
				playerId = rkey();
			}
			logic.players[playerId] = {
				group:groupId,
				name:name,
				power:power,
			};
			yield $PersistanceManager.Commit(next);
			responder.respondJson({playerId:playerId}, safe(done));

		}, this);
	},
	delplayer:function(requestor, responder, done) {
		var next = coroutine(function*() {
			var obj = yield this.tokenValid(requestor, next);
			if (!obj) {
				responder.addError("Not valid token for file add.");
				return responder.respondJson({}, safe(done));
			}

			var state = $PersistanceManager.State(obj.getSerial());
			if (state.adminLevel < 2) {
				responder.addError("Admin level not enough.");
				return responder.respondJson({}, safe(done));
			}

			var json = yield requestor.visitBodyJson(next);
			if (!json || !json.playerId) {
				responder.addError("Parameter data not correct.");
				return responder.respondJson({}, safe(done));
			}

			var playerId = json.playerId;
			var logic = $PersistanceManager.Logic();
			delete logic.players[playerId];
			yield $PersistanceManager.Commit(next);

			responder.respondJson({playerId:playerId}, safe(done));

		}, this);
	},
	joinmatch:function(requestor, responder, done) {
		var next = coroutine(function*() {
			var obj = yield this.tokenValid(requestor, next);
			if (!obj) {
				responder.addError("Not valid token for file add.");
				return responder.respondJson({}, safe(done));
			}

			var state = $PersistanceManager.State(obj.getSerial());
			if (state.adminLevel < 1) {
				responder.addError("Admin level not enough.");
				return responder.respondJson({}, safe(done));
			}

			var json = yield requestor.visitBodyJson(next);
			if (!json || !json.matchId || !json.playerId) {
				responder.addError("Parameter data not correct.");
				return responder.respondJson({}, safe(done));
			}

			var playerId = json.playerId;
			var matchId = json.matchId;
			var logic = $PersistanceManager.Logic();
			if (!logic.players[playerId]) {
				responder.addError("playerId not exist.");
				return responder.respondJson({}, safe(done));
			}

			var match = logic.match[matchId];
			match = (match ? match : {});
			match[playerId] = true;
			logic.match[matchId] = match;
			yield $PersistanceManager.Commit(next);

			responder.respondJson({success:true}, safe(done));

		}, this);
	},
	quitmatch:function(requestor, responder, done) {
		var next = coroutine(function*() {
			var obj = yield this.tokenValid(requestor, next);
			if (!obj) {
				responder.addError("Not valid token for file add.");
				return responder.respondJson({}, safe(done));
			}

			var state = $PersistanceManager.State(obj.getSerial());
			if (state.adminLevel < 1) {
				responder.addError("Admin level not enough.");
				return responder.respondJson({}, safe(done));
			}

			var json = yield requestor.visitBodyJson(next);
			if (!json || !json.matchId || !json.playerId) {
				responder.addError("Parameter data not correct.");
				return responder.respondJson({}, safe(done));
			}

			var playerId = json.playerId;
			var matchId = json.matchId;
			var logic = $PersistanceManager.Logic();
			if (!logic.players[playerId]) {
				responder.addError("playerId not exist.");
				return responder.respondJson({}, safe(done));
			}
			if (!logic.match[matchId]) {
				responder.addError("matchId not exist.");
				return responder.respondJson({}, safe(done));
			}

			var match = logic.match[matchId];
			delete match[playerId];
			yield $PersistanceManager.Commit(next);

			responder.respondJson({success:true}, safe(done));

		}, this);
	},

	exchange:function(requestor, responder, done) {
		var next = coroutine(function*() {
			yield $PersistanceManager.availableKeys(next);
			var json = yield requestor.visitBodyJson(next);
			var serial = $PersistanceManager.Serial(json.serial);

			if (!serial) {
				console.log("serial:", serial);
				return responder.respondJson({serial:null}, safe(done));
			}

			// initialization
			var state = $PersistanceManager.State(serial);
			state.adminLevel = (state.adminLevel ? state.adminLevel : 1);
			yield $PersistanceManager.Commit(next);

			var obj = $LoginManager.login(serial);
			responder.setCookies({token:obj.getToken()});
			responder.respondJson({
				serial:serial,
			}, safe(done));
		}, this);
	},
	giveup:function(requestor, responder, done) {
		var next = coroutine(function*() {
			if (requestor.getMethod() == "GET") {
				responder.addError("Not valid for 'GET' method.");
				return safe(done)();
			}

			var obj = yield this.tokenValid(requestor, next);
			if (!obj) {
				responder.addError("Not valid token for logout.");
				return safe(done)();
			}

			var json = yield requestor.visitBodyJson(next);
			$PersistanceManager.Dismiss(obj.getSerial());
			yield $PersistanceManager.Commit(next);

			$LoginManager.logoff(obj.getToken());
			responder.respondJson({}, safe(done));
		}, this);
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
				return safe(done)();
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
				return safe(done)();
			}

			var fileName = files[fileKey].fName;
			delete files[fileKey];
			yield $FileManager.deleteFile("/files/" + fileName, next);
			yield $PersistanceManager.Commit(next);
			responder.respondJson({}, safe(done));
		}, this);
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
				return safe(done)();
			}

			files[fileKey].dispName = json.name;
			yield $PersistanceManager.Commit(next);
			responder.respondJson({}, safe(done));
		}, this);
	},
	file:function(requestor, responder, done) {
		var next = coroutine(function*() {
			var obj = yield this.tokenValid(requestor, next);
			if (!obj) {
				responder.addError("Not valid token for file.");
				return safe(done)();
			}

			var state = $PersistanceManager.State(obj.getSerial());
			var fileKey = state.key;
			var targetKey = requestor.getQuery().key;
			if (targetKey != fileKey) {
				responder.addError("Target key not in the correct state.");
				return safe(done)();
			}

			var files = $PersistanceManager.Files();
			if (!files[fileKey]) {
				responder.addError("Not valid file key.");
				return safe(done)();
			}

			console.log("fileKey:", fileKey);
			var fName = "/" + files[fileKey].fName;
			var ext = fName.match(/(\.\w+)$/)[1];
			var data = yield $FileCacher.visitFile("/files" + fName, next);

			responder.setType(ext);
			responder.respondData(data, safe(done));
		}, this);
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
					console.log("in command");
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
	},

	mainPage:function(requestor, responder, done) {
		var next = coroutine(function*() {
			var data = null;
			var obj = yield this.tokenValid(requestor, next);

			var infoBase = null;
			if (obj) {
				var state = $PersistanceManager.State(obj.getSerial());
				var files = $PersistanceManager.Files();
				var serial = obj.getSerial();
				infoBase = {
					__proto__:this.InfoBase,
					files:files,
					state:$PersistanceManager.State(serial),
					serial:serial,
				};
			}
			data = yield this.visitHTTP(requestor, "/start.html", infoBase, next);

			responder.setType(".html");
			responder.respondData(data, safe(done));
		}, this);
	},
	commonPage:function(requestor, responder, done) {
		var next = coroutine(function*(){
			var data = null;
			var ext = requestor.getExtension();

			data = yield this.visitHTTP(requestor, requestor.getPath(), null, next);

			if (!data) {
				responder.addError("Cannot find file.");
				return safe(done);
			}

			// respond
			responder.setType(ext);
			responder.respondData(data, safe(done));
		}, this);
	},
	errorPage:function(requestor, responder, done) {
		var next = coroutine(function*() {
			console.log("Error loading '" + requestor.getPath() + "':\n" + responder.getErrors());
			var data = yield this.visitHTTP(requestor, "/error.html", {
				__proto__:this.InfoBase,
				errors:responder.getErrors(),
			}, next);

			console.log("urlRoot:", this.InfoBase.urlRoot);
			responder.redirect(this.InfoBase.urlRoot + "/", 3000);
			responder.setType(".html");
			responder.respondData(data, safe(done));
		}, this);
	},

	visitHTTP:function(requestor, path, infoBase, done) {
		var next = coroutine(function*(){
			infoBase = (infoBase ? infoBase : {
				__proto__:this.InfoBase,
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
			}
			var data = yield filegetter(path, next);
			safe(done)(data);
		}, this);
	},
	tokenValid:function(requestor, done) {
		var next = coroutine(function*() {
			var query = requestor.getQuery();
			var cookies = requestor.getCookies();
			var token = (cookies ? cookies.token : null);
			token = (token ? token : query.token);
			var obj = $LoginManager.query(token);
			if (!obj || obj.checkExpired()) {
				$LoginManager.cancel(token);
				return safe(done)(null);
			}
			return safe(done)(obj);
		}, this);
	},

	onCommand:function(cmd) {
		switch(cmd) {
			case "refresh":
			$PersistanceManager.initFiles();
			break;
		}
	},
});

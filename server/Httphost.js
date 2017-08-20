
require("./Base");
require("./Requestor");
require("./Responder");
require("./FileManager");
require("./FileCacher");
require("./PersistanceManager");
require("./LoginManager");
require("./TemplateParser");

Base.extends("LogicManager", {
	_constructor:function() {
		this.logic = $PersistanceManager.Logic();
		this.playerInMatch = {};
		for (var matchId in this.logic.match) {
			var players = this.logic.match[matchId].players;
			for (var playerId in players) {
				this.playerInMatch[playerId] = matchId;
			}
		}
	},
	save:function(done) {
		$PersistanceManager.CommitLogic(done);
	},
	match:function() {
		return this.logic.match;
	},
	players:function() {
		return this.logic.players;
	},
	groups:function() {
		return this.logic.groups;
	},

	hasGroup:function(groupId) {
		return !!this.logic.groups[groupId];
	},
	hasPlayer:function(playerId) {
		return !!this.logic.players[playerId];
	},

	newPlayer:function(player) {
		var playerId = rkey();
		while(this.logic.players[playerId]) {
			playerId = rkey();
		}
		player.lastTime = new Date().getTime();

		console.log("adding player", playerId, player);
		this.logic.players[playerId] = player;
		return playerId;
	},
	delPlayer:function(playerId) {
		console.log("deleting player", playerId, this.logic.players[playerId].name);
		var matchId = this.playerInMatch[playerId];
		if (matchId) {
			delete this.logic.match[matchId].players[playerId];
			delete this.playerInMatch[playerId];
		}
		delete this.logic.players[playerId];
	},
	playerGroup:function(playerId, group) {
		var player = this.logic.players[playerId];
		if (player) {
			player.group = group;
		}
		return player;
	},
	playerName:function(playerId, name) {
		var player = this.logic.players[playerId];
		if (player) {
			player.name = name;
		}
		return player;
	},
	playerPower:function(playerId, power) {
		var player = this.logic.players[playerId];
		if (player) {
			player.power = power;
			player.lastTime = new Date().getTime();
		}
		return player;
	},
	addGroup:function(group) {
		var groupId = rkey();
		while (this.logic.groups[groupId]) {
			groupId = rkey();
		}

		console.log("adding group", groupId, group);
		this.logic.groups[groupId] = group;
		return groupId;
	},
	delGroup:function(groupId) {
		console.log("deleting group", groupId, this.logic.groups[groupId].name);
		var playerIds = {};
		for (var playerId in this.logic.players) {
			var playerInfo = this.logic.players[playerId];
			if (playerInfo.group == groupId) {
				console.log("deleting player in group", playerId, playerInfo.name);
				playerIds[playerId] = true;
			}
		}

		for (var playerId in playerIds) {
			this.delPlayer(playerId);
		}
		delete this.logic.groups[groupId];
	},
	playerMatch:function(playerId) {
		return this.playerInMatch[playerId];
	},
	playerToMatch:function(playerId, matchId) {
		var match = this.logic.match[matchId];
		match = (match ? match : {});
		match.players = (match.players ? match.players : {});
		match.players[playerId] = true;
		match.lastTime = new Date().getTime();
		this.logic.match[matchId] = match;
		this.playerInMatch[playerId] = matchId;
	},
	playerQuit:function(playerId) {
		var matchId = this.playerInMatch[playerId];
		var match = this.logic.match[matchId];
		delete match.players[playerId];
		delete this.playerInMatch[playerId];
	},
});

var hostCommand = {
	information:function(requestor, responder, done) {
		var next = coroutine(function*() {
			var obj = yield this.tokenValid(requestor, next);
			if (!obj) {
				responder.addError("Not valid token for file add.");
				return responder.respondJson({}, safe(done));
			}

			var lastModified = yield $PersistanceManager.LogicModified(next);

			var state = $PersistanceManager.State(obj.getSerial());
			var canView = state.adminLevel >= 1;
			var canAddPlayer = state.adminLevel >= 1;
			var canDelPlayer = state.adminLevel >= 2;
			var canEditGroup = state.adminLevel >= 3;
			var canEditUser = state.adminLevel >= 4;

			var logic = this.logicManager;
			var json = {
				match:logic.match(),
				players:logic.players(),
				groups:logic.groups(),
				delPlayer:canDelPlayer,
				editGroup:canEditGroup,
				editUser:canEditUser,
			};
			responder.setLastModified(lastModified);
			responder.setCacheTime(1);
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
			var logic = this.logicManager;
			if (!logic.hasGroup(groupId)) {
				responder.addError("Not existing group.");
				return responder.respondJson({}, safe(done));
			}

			var playerId = logic.newPlayer({
				group:groupId,
				name:name,
				power:power,
			});
			yield logic.save(next);

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
			var logic = this.logicManager;
			if (!logic.hasPlayer(playerId)) {
				responder.addError("playerId not exist.");
				return responder.respondJson({}, safe(done));
			}

			logic.delPlayer(playerId);
			yield logic.save(next);

			responder.respondJson({playerId:playerId}, safe(done));
		}, this);
	},
	editgroup:function(requestor, responder, done) {
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
			if (!json || !json.playerId || !json.group) {
				responder.addError("Parameter data not correct.");
				return responder.respondJson({}, safe(done));
			}

			var playerId = json.playerId;
			var group = json.group;
			var logic = this.logicManager;
			if (!logic.hasPlayer(playerId)) {
				responder.addError("playerId not exist.");
				return responder.respondJson({}, safe(done));
			}

			logic.playerGroup(playerId, group);
			yield logic.save(next);

			responder.respondJson({success:true}, safe(done));
		}, this);
	},
	editname:function(requestor, responder, done) {
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
			if (!json || !json.playerId || !json.name) {
				responder.addError("Parameter data not correct.");
				return responder.respondJson({}, safe(done));
			}

			var playerId = json.playerId;
			var name = json.name;
			var logic = this.logicManager;
			if (!logic.hasPlayer(playerId)) {
				responder.addError("playerId not exist.");
				return responder.respondJson({}, safe(done));
			}

			logic.playerName(playerId, name);
			yield logic.save(next);

			responder.respondJson({success:true}, safe(done));
		}, this);
	},
	editpower:function(requestor, responder, done) {
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
			if (!json || !json.playerId || !json.power) {
				responder.addError("Parameter data not correct.");
				return responder.respondJson({}, safe(done));
			}

			var playerId = json.playerId;
			var power = json.power;
			var logic = this.logicManager;
			if (!logic.hasPlayer(playerId)) {
				responder.addError("playerId not exist.");
				return responder.respondJson({}, safe(done));
			}

			var playerData = logic.playerPower(playerId, power);
			yield logic.save(next);

			responder.respondJson({success:true, editTime:playerData.lastTime}, safe(done));
		}, this);
	},
	addgroup:function(requestor, responder, done) {
		var next = coroutine(function*() {
			var obj = yield this.tokenValid(requestor, next);
			if (!obj) {
				responder.addError("Not valid token for file add.");
				return responder.respondJson({}, safe(done));
			}

			var state = $PersistanceManager.State(obj.getSerial());
			if (state.adminLevel < 3) {
				responder.addError("Admin level not enough.");
				return responder.respondJson({}, safe(done));
			}

			var json = yield requestor.visitBodyJson(next);
			if (!json || !json.name || !json.status) {
				responder.addError("Parameter data not correct.");
				return responder.respondJson({}, safe(done));
			}

			var name = json.name;
			var status = json.status;
			var logic = this.logicManager;
			var groupId = logic.addGroup({
				name:name,
				status:status,
			});
			yield logic.save(next);

			responder.respondJson({groupId:groupId}, safe(done));
		}, this);
	},
	delgroup:function(requestor, responder, done) {
		var next = coroutine(function*() {
			var obj = yield this.tokenValid(requestor, next);
			if (!obj) {
				responder.addError("Not valid token for file add.");
				return responder.respondJson({}, safe(done));
			}

			var state = $PersistanceManager.State(obj.getSerial());
			if (state.adminLevel < 3) {
				responder.addError("Admin level not enough.");
				return responder.respondJson({}, safe(done));
			}

			var json = yield requestor.visitBodyJson(next);
			if (!json || !json.groupId) {
				responder.addError("Parameter data not correct.");
				return responder.respondJson({}, safe(done));
			}

			var groupId = json.groupId;
			var logic = this.logicManager;
			if (!logic.hasGroup(groupId)) {
				responder.addError("groupId not exist.");
				return responder.respondJson({}, safe(done));
			}

			logic.delGroup(groupId);
			yield logic.save(next);

			responder.respondJson({groupId:groupId}, safe(done));
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
			var logic = this.logicManager;
			if (!logic.hasPlayer(playerId)) {
				responder.addError("playerId not exist.");
				return responder.respondJson({}, safe(done));
			}

			var oldMatchId = logic.playerMatch(playerId);
			if (oldMatchId) {
				responder.addError("player already in match.", oldMatchId);
				return responder.respondJson({}, safe(done));
			}

			console.log("joinmatch", playerId, matchId);
			logic.playerToMatch(playerId, matchId);
			yield logic.save(next);

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
			var logic = this.logicManager;
			if (!logic.hasPlayer(playerId)) {
				responder.addError("playerId not exist.");
				return responder.respondJson({}, safe(done));
			}

			var oldMatchId = logic.playerMatch(playerId);
			if (!oldMatchId || oldMatchId != matchId) {
				responder.addError("player not in any match.");
				return responder.respondJson({}, safe(done));
			}

			console.log("quitmatch", playerId, matchId);
			logic.playerQuit(playerId);
			yield logic.save(next);

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

		this.logicManager = new LogicManager();
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
			var obj = yield this.tokenValid(requestor, next);

			var fileBlock = yield this.visitHTTP(requestor, "/start.html", null, next);

			responder.setLastModified(fileBlock.time);
			if (!this.InfoBase.isHost) {
				responder.setCacheTime(5*60);
			}

			responder.setType(".html");
			responder.respondData(fileBlock.data, safe(done));
		}, this);
	},
	commonPage:function(requestor, responder, done) {
		var next = coroutine(function*(){
			var ext = requestor.getExtension();

			var fileBlock = yield this.visitHTTP(requestor, requestor.getPath(), null, next);

			if (!fileBlock.data) {
				responder.addError("Cannot find file.");
				return safe(done);
			}

			responder.setLastModified(fileBlock.time);
			if (requestor.getPath().match(/\/constant\//)) {
				responder.setCacheTime(365*24*3600);
			} else if (!this.InfoBase.isHost) {
				responder.setCacheTime(5*60);
			} else {
				responder.setCacheTime(1);
			}

			// respond
			responder.setType(ext);
			responder.respondData(fileBlock.data, safe(done));
		}, this);
	},
	errorPage:function(requestor, responder, done) {
		var next = coroutine(function*() {
			console.log("Error loading '" + requestor.getPath() + "':\n" + responder.getErrors());
			var fileBlock = yield this.visitHTTP(requestor, "/error.html", {
				__proto__:this.InfoBase,
				errors:responder.getErrors(),
			}, next);

			console.log("urlRoot:", this.InfoBase.urlRoot);
			responder.redirect(this.InfoBase.urlRoot + "/", 3000);
			responder.setType(".html");
			responder.respondData(fileBlock.data, safe(done));
		}, this);
	},

	visitHTTP:function(requestor, path, infoBase, done) {
		var next = coroutine(function*(){
			infoBase = (infoBase ? infoBase : {
				__proto__:this.InfoBase,
			});
			var filegetter = (path, done) => {
				var next = coroutine(function*() {
					var fileBlock = {};
					path = "/html" + path;

					fileBlock.data = yield $FileCacher.visitFile(path, next);
					if (fileBlock.data) {
						fileBlock.time = yield $FileManager.getLastModified(path, next);
					}

					if (!fileBlock.data) {
						console.log("path:", path);
						path = path.replace(/\.(\w+)$/, ".essp.$1");
						console.log("path:", path);
						fileBlock.data = yield $TemplateParser.parse(path, infoBase, filegetter, next);
						if (fileBlock.data) {
							fileBlock.time = yield $FileManager.getLastModified(path, next);
						}
					}

					safe(done)(fileBlock);
				});
			}
			var fileBlock = yield filegetter(path, next);
			safe(done)(fileBlock);
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

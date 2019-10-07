
require("./Base");
require("./FileCacher");
require("./FileManager");
require("./LoginManager");
require("./Requestor");
require("./Responder");
require("./Session");
require("./StateManager");
require("./TemplateParser");
var assert = require("assert");
var crypto = require("crypto");

// Models
Base.extends("HttpModel", {
    models: [],
    modelBase: Base.inherit({
        initialize:function(done) {
            later(done);
        },
        getTag:function(obj) {
            var toMd5 = JSON.stringify(obj) + "PAUMS01233323";
            return crypto.createHash("md5WithRSAEncryption").update(toMd5).digest("hex");
        },
    }),
    addClass:function(name, proto) {
        var childClass = this.modelBase.inherit(proto);
        this.models.push({
            name: name,
            cls: childClass,
        });
    },
    getClasses:function() {
        return this.models;
    },
});
require("./user/Model.js");
require("./yzdzz/Model.js");

Base.extends("HttpServer", {
    _constructor:function(urlRoot, isHost) {
        this.InfoBase = {
            urlRoot:urlRoot,
            isHost:isHost,
        };
        $FileCacher.setEnabled(!isHost);
        $TemplateParser.setEnabled(!isHost);
        this.commands = {};
        this.ready = false;

        var next = coroutine(function*() {
            yield $StateManager.openState(EXTENSION_CONFIG, next);

            this.models = {};
            var classes = $HttpModel.getClasses();
            for (var i = 0; i < classes.length; ++i) {
                var ModelClass = classes[i].cls;
                var model = new ModelClass(this);
                this.models[classes[i].name] = model;
                yield model.initialize(next);
            }
            this.ready = true;
        }, this);
    },
    registerCommand:function(cmd, model) {
        assert(!this.commands[cmd] && model && typeof(model[cmd]) == "function");
        this.commands[cmd] = model;
    },
    findModel:function(name) {
        var model = this.models[name];
        return (model ? model : null);
    },
    onVisit:function(req, res) {
        if (!this.ready) {
            return res.end();
        }

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
                yield this.mainPage(requestor, responder, next);
            }

            // execute command
            if (!responder.Ended()) {
                var cmd = requestor.getCommand();
                var model = this.commands[cmd];
                if (model) {
                    var memberFunc = model[cmd];
                    var session = new Session(requestor, responder);
                    yield model.run(memberFunc, requestor, responder, session, next);
                }
            }

            // visit raw file
            if (!responder.Ended()) {
                yield this.commonPage(requestor, responder, next);
            }

            if (!responder.Ended()) {
                yield this.errorPage(requestor, responder, next);
            }
            safe(done)();
        }, this);
    },

    mainPage:function(requestor, responder, done) {
        var next = coroutine(function*() {
            var obj = yield this.tokenValid(requestor, next);

            var fileBlock = yield this.visitHTTP(requestor, "/start_main.html", null, next);

            if (!requestor.compareModified(fileBlock.time)) {
                responder.setCode(304);
                return responder.respondData(Buffer.alloc(0), safe(done));
            }

            responder.setLastModified(fileBlock.time);
            if (!this.InfoBase.isHost) {
                responder.setCacheTime(5*60);
            } else {
                responder.setCacheTime(1);
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
                return safe(done)();
            }

            if (!requestor.compareModified(fileBlock.time)) {
                responder.setCode(304);
                responder.respondData(Buffer.alloc(0), safe(done));
                return;
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
                $LoginManager.logoff(token);
                return safe(done)(null);
            }
            return safe(done)(obj);
        }, this);
    },
});


require("./Base");
require("./FileManager");

Base.extends("$PersistanceManager", {
    _constructor:function() {
        this.extMapping = {};
        this.states = {};
        this.passwords = {};
        this.files = {};
        this.logicdb = {};
    },
    initFiles:function(done) {
        var next = coroutine(function*() {
            this.extMapping = {};
            yield $FileManager.parseFile("/data/ExtTypes.i", (line) => {
                var info = line.split(" ");
                this.extMapping["." + info[0]] = info[1];
            }, next);

            var jsonStates = yield $FileManager.visitFile("/data/States.d", next);
            if (jsonStates) {
                this.states = JSON.parse(jsonStates);
            }

            yield $PersistanceManager.availableKeys(next);

            var jsonFiles = yield $FileManager.visitFile("/data/Files.d", next);
            if (jsonFiles) {
                this.files = JSON.parse(jsonFiles);
            }

            var jsonLogic = yield $FileManager.visitFile("/data/Logic.d", next);
            if (jsonLogic) {
                this.logicdb = JSON.parse(jsonLogic);
            }

            console.log("loading PersistanceManager:", this.states, this.files);
            safe(done)();
        }, this);
    },
    availableKeys:function(done) {
        $FileManager.parseFile("/data/keys.in", (line) => {
            this.states[line] = {};
        }, () => {
            $FileManager.saveFile("/data/keys.in", Buffer.alloc(0), () => {
                this.passwords = {};
                $FileManager.parseFile("/data/pwd.in", (line) => {
                    this.passwords[line] = true;
                }, safe(done));
            });
        });
    },

    Files:function() {
        return this.files;
    },
    Logic:function() {
        return this.logicdb;
    },
    ExtensionType:function(ext) {
        return this.extMapping[ext.toLowerCase()];
    },
    Serial:function(serial) {
        if (this.states[serial] || this.passwords[serial]) {
            var saveData = (this.passwords[serial] ? {} : this.states[serial]);
            delete this.states[serial];
            var newSerial = "";
            for (var i = 0; i < 4 || this.states[newSerial]; ++i) {
                newSerial += rkey();
            }
            this.states[newSerial] = saveData;
            return newSerial;
        }
        return null;
    },
    Dismiss:function(serial) {
        delete this.states[serial];
    },
    State:function(serial) {
        return this.states[serial];
    },

    Commit:function(done) {
        var next = coroutine(function*(){
            yield $FileManager.saveFile("/data/States.d", JSON.stringify(this.states), next);
            yield $FileManager.saveFile("/data/Files.d", JSON.stringify(this.files), next);
            yield $FileManager.saveFile("/data/Logic.d", JSON.stringify(this.logicdb), next);
            safe(done)();
        }, this);
    },
});

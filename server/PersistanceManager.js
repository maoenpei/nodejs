
require("./Base");
require("./FileManager");

Base.extends("$PersistanceManager", {
    _constructor:function() {
        this.extMapping = {};
        this.states = {};
        this.files = {};
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

            yield $FileManager.parseFile("/data/keys.in", (line) => {
                this.states[line] = {};
            }, next);
            yield $FileManager.saveFile("/data/keys.in", Buffer.alloc(0), next);

            var jsonFiles = yield $FileManager.visitFile("/data/Files.d", next);
            if (jsonFiles) {
                this.files = JSON.parse(jsonFiles);
            }

            console.log("loading PersistanceManager:", this.states, this.files);
            later(safe(done));
        }, this);
        next();
    },

    Files:function() {
        return this.files;
    },
    ExtensionType:function(ext) {
        return this.extMapping[ext];
    },
    Serial:function(serial) {
        if (this.states[serial]) {
            var saveData = this.states[serial];
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
    State:function(serial) {
        return this.states[serial];
    },
    Commit:function(done) {
        var next = coroutine(function*(){
            yield $FileManager.saveFile("/data/States.d", JSON.stringify(this.states), next);
            yield $FileManager.saveFile("/data/Files.d", JSON.stringify(this.files), next);
            later(safe(done));
        }, this);
        next();
    },
});

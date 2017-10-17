
require("./Base");
require("./FileManager");
var assert = require("assert");

Base.extends("$StateManager", {
    _constructor:function() {
        this.fileStates = {};
        this.canSave = {};
    },
    openState:function(fileName, lineProcessor, done) {
        assert(!this.fileStates[fileName] && !this.canSave[fileName]);
        var path = "/data/" + fileName;
        if (lineProcessor) {
            this.fileStates[fileName] = {};
            $FileManager.parseFile(path, (line) => {
                lineProcessor(line, this.fileStates[fileName]);
            }, done);
        } else {
            this.canSave[fileName] = true;
            $FileManager.visitFile(path, (data) => {
                this.fileStates[fileName] = (data ? JSON.parse(data.toString()) : {});
                safe(done)();
            });
        }
    },
    getState:function(fileName) {
        if (!this.fileStates[fileName]) {
            return null;
        }
        return this.fileStates[fileName];
    },
    commitState:function(fileName, done) {
        if (!this.canSave[fileName] || !this.fileStates[fileName]) {
            return later(done);
        }
        var path = "/data/" + fileName;
        var state = this.fileStates[fileName];
        $FileManager.saveFile(path, JSON.stringify(state), done);
    },
    stateModified:function(fileName, done) {
        if (!this.canSave[fileName] || !this.fileStates[fileName]) {
            return later(done);
        }
        var path = "/data/" + fileName;
        $FileManager.getLastModified(path, done);
    },
});

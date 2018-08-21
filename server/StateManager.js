
require("./Base");
require("./FileManager");
var assert = require("assert");

Base.extends("StateManager", {
    fileStates: {},
    canSave: {},
    savingStates: {},
    openState:function(fileName, done) {
        assert(!this.fileStates[fileName] && !this.canSave[fileName]);
        var path = "/data/" + fileName;
        this.canSave[fileName] = true;
        $FileManager.visitFile(path, (data) => {
            this.fileStates[fileName] = (data ? JSON.parse(data.toString()) : {});
            safe(done)();
        });
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
        var status = this.savingStates[fileName];
        status = (status ? status : {});
        this.savingStates[fileName] = status;
        later(done);

        if (!status.pending) {
            var doSave = () => {
                var path = "/data/" + fileName;
                var state = this.fileStates[fileName];
                $FileManager.saveFile(path, JSON.stringify(state, null, 2), () => {
                    if (status.pending > 1) {
                        status.pending = 1;
                        doSave();
                    } else {
                        status.pending = 0;
                    }
                });
            };
            status.pending = 1;
            doSave();
        } else {
            console.log("state saving pending...", fileName);
            status.pending = 2;
        }
    },
    stateModified:function(fileName, done) {
        if (!this.canSave[fileName] || !this.fileStates[fileName]) {
            return later(done);
        }
        var path = "/data/" + fileName;
        $FileManager.getLastModified(path, done);
    },
});


require("./StateSwitcher");
require("./FileManager");

StateSwitcher.extends("$FileCacher", {
    _constructor:function() {
        this.cachedFiles = {};
    },
    visitFile:function(path, done) {
        var data = this.cachedFiles[path];
        if (data) {
            later(() => {safe(done)(data);});
        } else {
            $FileManager.visitFile(path, (data) => {
                if (this.enabled) {
                    this.cachedFiles[path] = data;
                }
                safe(done)(data);
            });
        }
    },
});

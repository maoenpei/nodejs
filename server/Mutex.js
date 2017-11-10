
require("./Base");

Base.extends("Mutex", {
    _constructor:function() {
        this.unlockFuncs = null;
    },
    lock:function(done) {
        if (this.unlockFuncs) {
            this.unlockFuncs.push(done);
        } else {
            this.unlockFuncs = [];
            later(done);
        }
    },
    unlock:function() {
        if (this.unlockFuncs.length > 0) {
            var func = this.unlockFuncs[0];
            this.unlockFuncs.splice(0, 1);
            safe(func)();
        } else {
            this.unlockFuncs = null;
        }
    },
});


require("./Base");

Base.extends("Heartbeat", {
    _constructor:function() {
        this.heartUnique = null;
        this.lastBeat = new Date();
    },
    setup:function(overtime, callback) {
        var heartUnique = {};
        this.heartUnique = heartUnique;
        this.lastBeat = new Date();
        var checker = () => {
            if (this.heartUnique !== heartUnique) {
                return;
            }
            var period = (new Date().getTime() - this.lastBeat.getTime()) / 1000;
            if (period > overtime) {
                safe(callback)();
            } else {
                setTimeout(checker, 1000);
            }
        };
        setTimeout(checker, 1000);
    },
    cancel:function() {
        this.heartUnique = null;
    },
    beat:function() {
        this.lastBeat = new Date();
    },
});

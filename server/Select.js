
require("./Base");

Base.extends("Select", {
    _constructor:function() {
        this.barriers = [];
        this.mode = 0;
    },
    setup:function(param) {
        var item = {
            used: false,
            param: param,
        };
        this.barriers.push(item);
        return () => {
            item.used = true;
            this.invokeCheck();
        };
    },
    one:function(callback) {
        if (this.mode != 0) {
            console.log("Error: Mode already selected.");
            return later(callback, null);
        }
        this.mode = 1;
        this.callback = callback;
    },
    all:function(callback) {
        if (this.mode != 0) {
            console.log("Error: Mode already selected.");
            return later(callback, null);
        }
        this.mode = 2;
        this.callback = callback;
    },

    invokeCheck:function() {
        if (this.mode == 0) {
            console.log("Error: No select mode chosen!");
        } else if (this.mode == 1) {
            for (var i = 0; i < this.barriers.length; ++i) {
                var item = this.barriers[i];
                if (item.used) {
                    this.barriers.splice(i, 1);
                    safe(this.callback)(item.param);
                    break;
                }
            }
        } else if (this.mode == 2) {
            var params = [];
            for (var i = 0; i < this.barriers.length; ++i) {
                var item = this.barriers[i];
                if (!item.used) {
                    return;
                }
                params.push(item.param);
            }
            this.barriers = [];
            safe(this.callback)(params);
        }
    },
});

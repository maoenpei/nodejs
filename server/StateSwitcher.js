
require("./Base");

Base.extends("StateSwitcher", {
    _constructor:function() {
        this.enabled = true;
    },
    enable:function() {
        this.enabled = true;
    },
    disable:function() {
        this.enabled = false;
    },
    setEnabled:function(enabled) {
        this.enabled = enabled;
    },
});

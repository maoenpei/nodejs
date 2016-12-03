
require("./Base");

Base.extends("ArgParser", {
    _constructor:function(args) {
        this.args = args;
        this.caseSense = (str) => {return str;};
    },
    setCaseSensitive:function(sense) {
        this.caseSense = (sense ? (str) => {return str;} : (str) => {return str.toLowerCase();});
    },
    get:function(key) {
        var compare = this.caseSense(key);
        for (var i = 0; i < this.args.length - 1; ++i) {
            if (this.caseSense(this.args[i]) == compare) {
                return this.args[i+1];
            }
        }
        return null;
    },
    has:function(key) {
        var compare = this.caseSense(key);
        for (var i = 0; i < this.args.length; ++i) {
            if (this.caseSense(this.args[i]) == compare) {
                return true;
            }
        }
        return false;
    },
});

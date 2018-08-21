
require("./Base");

Base.extends("Queue", {
	funcs: [],
	_constructor:function() {
		this.funcs = [];
	},
	start:function() {
		if (this.doNext) {
			return;
		}
        this.doNext = coroutine(function*() {
        	while (true) {
        		if (!this.doQuit && this.funcs.length == 0) {
        			yield;
        		}
        		if (this.doQuit) {
        			this.doQuit = false;
        			break;
        		}
        		var executable = this.funcs[0];
        		this.funcs.splice(0, 1);
        		this.duringExec = true;
        		yield executable(this.doNext);
        		this.duringExec = false;
        	}
        	this.doNext = null;
        }, this);
	},
	stop:function() {
		this.doQuit = true;
		if (!this.duringExec) {
			(this.doNext)();
		}
	},
	append:function(executable) {
		this.funcs.push(executable);
		if (!this.duringExec) {
			(this.doNext)();
		}
	},
});

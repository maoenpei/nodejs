
var isBrowser = typeof(window) != 'undefined';

console.log("Running in " + (isBrowser ? "browser" : "application"));

Global = (isBrowser ? window : global);

Base = function(){}

Base.prototype = {
	_constructor:function(){},
	su:function() {
		var superFunction = arguments.callee.caller.__super;
		if (superFunction) {
			return superFunction.apply(this, arguments);
		}
	},
	instanceof:function(baseClass) {
		return this.__classes.index(baseClass.prototype.__class + "$") >= 0;
	},
	// deprecated
	run:function(functor) {
		functor.apply(this, Array.prototype.slice.call(arguments, 1));
	},
	// deprecated
	log:function() {
		var enabled = false;
		if (enabled) {
			var arr = [this.__class, arguments.callee.caller];
			arr = arr.concat(Array.prototype.slice.call(arguments));
			console.log.apply(console, arr);
		}
	},
	__class:"Base",
	__classes:"Base$",
}

Base.inherit = function(proto) {
	var baseClass = this;
	var baseProto = baseClass.prototype;
	var childProto = proto;
	var childClass = function() {
		childProto._constructor.apply(this, arguments);
	}
	for (attr in childProto) {
		if (typeof(childProto[attr]) == "function" && attr in baseProto) {
			childProto[attr].__super = baseProto[attr];
		} else if (typeof(childProto[attr]) != "function") {
			childClass[attr] = childProto[attr];
		}
	}
	childProto.__class = "Anonymous_Sub_" + baseProto.__class;
	childProto.__proto__ = baseProto;
	childClass.prototype = childProto;
	childClass.__proto__ = baseClass;
	return childClass;
}

Base.extends = function(name, proto) {
	var baseClass = this;
	var baseProto = baseClass.prototype;
	var childClass = baseClass.inherit(proto);
	proto.__class = name;
	proto.__classes = name + "$" + baseProto.__classes;
	if (name.charAt(0) == "$") {
		Global[name] = new childClass();
	} else {
		Global[name] = childClass;
	}
	return childClass;
}

Base.instance = function(proto) {
	var baseClass = this;
	var childClass = baseClass.inherit(proto);
	var obj = {__proto__:childClass.prototype}; // new childClass
	childClass.apply(obj, Array.prototype.slice.call(arguments, 1));
	return obj;
}

Base.extends("EventListener", {
	_constructor:function() {
		this.typedListeners = {};
	},
	addListener:function(obj, t) {
		var listeners = this.typedListeners[t] || [];
		this.typedListeners[t] = listeners;
		for (var i = 0; i<listeners.length; ++i) {
			if (listeners[i] == obj) {
				return;
			}
		}
		listeners.push(obj);
		return new EventConnection(this, obj, t);
	},
	removeListener:function(obj, t) {
		var listeners = this.typedListeners[t];
		if (listeners) {
			for (var i = 0; i<listeners.length; ++i) {
				if (listeners[i] == obj) {
					listeners.slice(i, 1);
					return;
				}
			}
		}
	},

	// protected
	dispatchEvent:function(e, t) {
		var listeners = this.typedListeners[t];
		if (listeners) {
			for (var i = 0; i<listeners.length; ++i) {
				listeners[i].invoke(e);
			}
		}
	},
});

Base.extends("EventDispatcher", {
	_constructor:function(obj, method) {
		this.obj = obj;
		this.method = method;
	},
	invoke:function() {
		var obj = this.obj;
		var method = this.method;
		obj[method].apply(obj, arguments);
	}
});

Base.extends("EventConnection", {
	_constructor:function(listener, obj, t) {
		this.listener = listener;
		this.obj = obj;
		this.t = t;
	},
	dismiss:function() {
		this.listener.removeListener(this.obj, this.t);
	},
});

Global.coroutine = function(generator, self) {
	var g = generator.call(self);
	return (x) => {
		g.next(x);
	}
};

Global.later = function(fun) {
	var args = Array.prototype.slice.call(arguments, 1);
	setTimeout(() => {
		fun.apply(this, args);
	}, 0);
};

Global.silent = function(fun) {
	var args = Array.prototype.slice.call(arguments, 1);
	try {
		return fun.apply(this, args);
	} catch(e) {
		console.log(e);
	}
}

var tmpsafe = function(){};
Global.safe = function(callback) {
	return (callback ? callback : tmpsafe);
};

Global.rkey = function() {
	return Math.random().toString(36).substr(2);
};

Global.stringToAscii = function(str) {
    var arr = [];
    for (var i = 0; i < str.length; ++i) {
        arr.push(str.charCodeAt(i));
    }
    return arr;
};

Global.arrEqual = function(arr, index, arr2, index2, length) {
	for (var i = 0; i < length; ++i) {
		if (arr[index + i] != arr2[index2 + i]) {
			return false;
		}
	}
	return true;
};

Global.codeEqual = function(code, data, index) {
    return arrEqual(code, 0, data, index, code.length);
};

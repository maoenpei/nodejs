
require("./Base");
require("./StateSwitcher");
require("./FileManager");

var esspStart = stringToAscii("<")[0];
var esspBegin = stringToAscii("<%es");
var esspValue = stringToAscii("<%=");
var esspInclude = stringToAscii("<%^");
var esspEnd = stringToAscii("%>");

var STATE_HTML = 0;
var STATE_JS = 1;
var STATE_VAL = 2;
var STATE_INCLUDE = 3;

Base.extends("TemplateOutput", {
    _constructor:function(data, filegetter, done) {
        this.data = data;
        this.filegetter = filegetter;
        this.done = done;
        this.outBlocks = [];
    },
    addSlice:function(start, end) {
        this.outBlocks.push(this.data.slice(start, end));
    },
    addVal:function(val) {
        this.outBlocks.push(Buffer.from(String(val)));
    },
    include:function(path, done) {
        safe(this.filegetter)("/" + path, (data) => {
            //console.log("data:", data.toString());
            if (data) {
                this.outBlocks.push(data);
            }
            safe(done)();
        });
    },
    finish:function() {
        safe(this.done)(Buffer.concat(this.outBlocks));
    },
});

StateSwitcher.extends("TemplateParser", {
    parsedTemplates: {},
    ready:function(path, done) {
        var parser = this.parsedTemplates[path];
        if (parser) {
            later(safe(done), parser);
        } else {
            $FileManager.visitFile(path, (data) => {
                if (data) {
                    silent(() => {
                        parser = this.doParse(data);
                    });
                }
                if (parser) {
                    if (this.enabled) {
                        this.parsedTemplates[path] = parser;
                    }
                }
                safe(done)(parser);
            });
        }
    },
    parse:function(path, PageInfo, filegetter, done) {
        this.ready(path, (parser) => {
            if (parser) {
                silent(parser, PageInfo, filegetter, done);
            } else {
                safe(done)(null);
            }
        });
    },
    doParse:function(data) {
        var jsCode = "";
        var state = STATE_HTML;
        var begin = 0;

        jsCode += "var __next = coroutine(function*(){\n";
        // Parse content
        for (var i = 0; i < data.length; ++i) {
            switch (state) {
                case STATE_HTML:
                    if (data[i] == esspStart) {
                        if (codeEqual(esspBegin, data, i)) {
                            jsCode += "__out__.addSlice(" + begin + "," + i + ");\n";
                            begin = i + esspBegin.length;
                            i += esspBegin.length - 1;
                            state = STATE_JS;
                        } else if (codeEqual(esspValue, data, i)) {
                            jsCode += "__out__.addSlice(" + begin + "," + i + ");\n";
                            begin = i + esspValue.length;
                            i += esspValue.length - 1;
                            state = STATE_VAL;
                        } else if (codeEqual(esspInclude, data, i)) {
                            jsCode += "__out__.addSlice(" + begin + "," + i + ");\n";
                            begin = i + esspInclude.length;
                            i += esspInclude.length - 1;
                            state = STATE_INCLUDE;
                        }
                    }
                break;
                case STATE_JS:
                    if (data[i] == esspEnd[0] && codeEqual(esspEnd, data, i)) {
                        jsCode += data.slice(begin, i).toString();
                        begin = i + esspEnd.length;
                        i += esspEnd.length - 1;
                        state = STATE_HTML;
                    }
                break;
                case STATE_VAL:
                    if (data[i] == esspEnd[0] && codeEqual(esspEnd, data, i)) {
                        jsCode += "__out__.addVal(" + data.slice(begin, i).toString() + ");\n";
                        begin = i + esspEnd.length;
                        i += esspEnd.length - 1;
                        state = STATE_HTML;
                    }
                break;
                case STATE_INCLUDE:
                    if (data[i] == esspEnd[0] && codeEqual(esspEnd, data, i)) {
                        jsCode += "yield __out__.include('" + data.slice(begin, i).toString() + "', __next);\n";
                        begin = i + esspEnd.length;
                        i += esspEnd.length - 1;
                        state = STATE_HTML;
                    }
                break;
            }
        }

        // Parse tail
        if (state != STATE_HTML) {
            throw "Error: essp block not enclosed!";
        } else {
            if (begin != data.length) {
                jsCode += "__out__.addSlice(" + begin + "," + data.length + ");\n";
            }
        }

        jsCode += "__out__.finish();\n";
        jsCode += "});\n";

        // get 'parser' closure
        //console.log("jsCode:\n", jsCode);
        var executor = new Function("PageInfo", "__out__", jsCode);
        var parser = (PageInfo, filegetter, done) => {
            var __out__ = new TemplateOutput(data, filegetter, done);
            executor(PageInfo, __out__);
        };
        return parser;
    },
});

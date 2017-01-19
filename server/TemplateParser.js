
require("./Base");
require("./StateSwitcher");
require("./FileManager");

var esspBegin = stringToAscii("<%es");
var esspValue = stringToAscii("<%=");
var esspEnd = stringToAscii("%>");

var STATE_HTML = 0;
var STATE_JS = 1;
var STATE_VAL = 2;

Base.extends("TemplateOutput", {
    _constructor:function(data) {
        this.data = data;
        this.outBlocks = [];
    },
    addSlice:function(start, end) {
        this.outBlocks.push(this.data.slice(start, end));
    },
    addVal:function(val) {
        this.outBlocks.push(Buffer.from(String(val)));
    },
    unifyBlocks:function() {
        return Buffer.concat(this.outBlocks);
    },
});

StateSwitcher.extends("$TemplateParser", {
    _constructor:function() {
        this.parsedTemplates = {};
    },
    parse:function(PageInfo, path, done) {
        var finish = (parser) => {
            var data = null;
            try {
                data = parser(PageInfo);
            } catch (e) {
                console.log(e);
            }
            safe(done)(data);
        };

        var parser = this.parsedTemplates[path];
        if (parser) {
            later(() => {finish(parser);});
        } else {
            $FileManager.visitFile(path, (data) => {
                try {
                    if (data) {
                        parser = this.doParse(data);
                    }
                } catch (e) {
                }
                if (parser) {
                    if (this.enabled) {
                        this.parsedTemplates[path] = parser;
                    }
                    finish(parser);
                } else {
                    safe(done)(null);
                }
            });
        }
    },
    doParse:function(data) {
        var jsCode = "";
        var state = STATE_HTML;
        var begin = 0;

        // Parse content
        for (var i = 0; i < data.length; ++i) {
            switch (state) {
                case STATE_HTML:
                    if (data[i] == esspBegin[0] && codeEqual(esspBegin, data, i)) {
                        jsCode += "__out__.addSlice(" + begin + "," + i + ");\n";
                        begin = i + esspBegin.length;
                        i += esspBegin.length - 1;
                        state = STATE_JS;
                    } else if (data[i] == esspValue[0] && codeEqual(esspValue, data, i)) {
                        jsCode += "__out__.addSlice(" + begin + "," + i + ");\n";
                        begin = i + esspValue.length;
                        i += esspValue.length - 1;
                        state = STATE_VAL;
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

        // get 'parser' closure
        console.log("jsCode:", jsCode);
        var executor = new Function("PageInfo", "__out__", jsCode);
        var parser = (PageInfo) => {
            var __out__ = new TemplateOutput(data);
            executor(PageInfo, __out__);
            return __out__.unifyBlocks();
        };
        return parser;
    },
});

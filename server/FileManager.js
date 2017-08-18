
require("./Base");
var fs = require("fs");
var readline = require("readline");

Base.extends("$FileManager", {
    _constructor:function() {
    },

    visitFile:function(path, done) {
        var filepath = this.RootDirectory + path;
        console.log("visiting file:", filepath);
        fs.readFile(filepath, (err, data) => {
            console.log(data ? "success" : "failed");
            safe(done)(data);
        });
    },
    parseFile:function(path, dealline, done) {
        var filepath = this.RootDirectory + path;
        console.log("parsing file:", filepath);
        var istream = fs.createReadStream(filepath);
        var reading = readline.createInterface({
            input: istream,
        });
        if (dealline) {
            reading.on("line", dealline);
        }
        reading.on("close", safe(done));
    },
    saveFile:function(path, data, done) {
        var filepath = this.RootDirectory + path;
        console.log("saving file:", filepath);
        fs.writeFile(filepath, data, (err) => {
            safe(done)();
        });
    },
    deleteFile:function(path, done) {
        var filepath = this.RootDirectory + path;
        console.log("deleting file:", filepath);
        fs.unlink(filepath, (err) => {
            safe(done)();
        });
    },
    existFile:function(path, done) {
        var filepath = this.RootDirectory + path;
        fs.exists(filepath, safe(done));
    },
    getLastModified:function(path, done) {
        var filepath = this.RootDirectory + path;
        fs.stat(filepath, (err, st) => {
            safe(done)(st.mtime);
        });
    },
    visitDir:function(path, done) {
        var filepath = this.RootDirectory + path;
        console.log("reading directory:", filepath);
        fs.readdir(filepath, (err, files) => {
            safe(done)(files);
        });
    },
    availableName:function(path, ext, done) {
        var fName = null;
        var result = (has) => {
            if (!has) {
                console.log("find avaliable name:", fName);
                return safe(done)(fName);
            }
            fName = rkey() + ext;
            this.existFile(path + "/" + fName, result);
        };
        result(true);
    },

    RootDirectory:__dirname,
});

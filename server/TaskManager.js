
require("./Base");

Base.extends("Task", {
    _constructor:function(manager, flag) {
        this.manager = manager;
        this.flag = flag;
    },
    getAssignment:function(param, done) {
        this.value = param;
        this.finish = done;
        this.manager.readyForAssignment(this.flag);
    },
    giveup:function() {
        this.manager.giveupAssignment(this.flag);
    },
    getValue:function() {
        return this.value;
    },
    setAssignment:function(param) {
        safe(this.finish)(param);
    },
});

Base.extends("TaskManager", {
    _constructor:function(howtoAssign) {
        this.howtoAssign = howtoAssign;
        this.tasks = [];
        this.isCanceled = false;
    },
    addTask:function() {
        var task = new Task(this, this.tasks.length);
        this.tasks.push({
            giveup: false,
            ready: false,
            task: task,
        });
        return task;
    },
    readyForAssignment:function(index) {
        var taskData = this.tasks[index];
        if (!taskData) {
            console.log("========================= task entry empty! ===========================", index);
        }
        taskData.ready = true;
        this.invokeAssignment();
    },
    giveupAssignment:function(index) {
        var taskData = this.tasks[index];
        taskData.giveup = true;
        this.invokeAssignment();
    },
    invokeAssignment:function() {
        var rawTasks = [];
        var total = 0;
        for (var i = 0; i < this.tasks.length; ++i) {
            var taskData = this.tasks[i];
            if (taskData.giveup) {
                continue;
            }
            total++;
            if (taskData.ready) {
                rawTasks.push(taskData.task);
            }
        }
        safe(this.howtoAssign)(rawTasks, total);
    },
});

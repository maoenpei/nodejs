
require("./Base");

Base.extends("Task", {
    _constructor:function(manager, flag) {
        this.manager = manager;
        this.flag = flag;
        this.assigned = false;
    },
    getAssignment:function(param, done) {
        this.value = param;
        this.finish = done;
        this.manager.readyForAssignment(this.flag);
    },
    giveup:function() {
        this.manager.giveupAssignment(this.flag);
    },
    giveupFinally:function() {
        if (this.assigned) {
            return;
        }
        if (this.finish) {
            console.log("========================= request to get assignment but not assigned! ===========================", this.finish);
        }
        this.giveup();
    },
    getValue:function() {
        return this.value;
    },
    setAssignment:function(param) {
        if (this.assigned) {
            return;
        }
        this.assigned = true;
        safe(this.finish)(param);
    },
    isAssigned:function() {
        return this.assigned;
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
        later(this.howtoAssign, rawTasks, total);
    },
});

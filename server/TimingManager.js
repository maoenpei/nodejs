
require("./Base");

Base.extends("TimingManager", {
    _constructor:function() {
        this.events = {};
        this.eventQueue = [];
        this.consuming = false;
        this.lastPrint = new Date().getTime();
    },
    setWeeklyEvent:function(day, hour, minute, second, callback) {
        return this.setEvent(() => {
            var now = new Date();
            var eventTime = new Date(now);
            eventTime.setHours(hour, minute, second, 0);
            var weekDay = eventTime.getDay();
            var dayDiff = (day - weekDay) * 24 * 3600 * 1000;
            var targetTime = eventTime.getTime() + dayDiff;
            if (targetTime <= now.getTime()) {
                targetTime += 7 * 24 * 3600 * 1000;
            }
            return targetTime;
        }, callback);
    },
    setDailyEvent:function(hour, minute, second, callback) {
        return this.setEvent(() => {
            var now = new Date();
            var eventTime = new Date(now);
            eventTime.setHours(hour, minute, second, 0);
            var targetTime = eventTime.getTime();
            if (targetTime <= now.getTime()) {
                targetTime += 24 * 3600 * 1000;
            }
            return targetTime;
        }, callback);
    },
    unsetEvent:function(key) {
        if (this.events[key]) {
            delete this.events[key];
            for (var i = 0; i < this.eventQueue.length; ++i) {
                if (key == this.eventQueue[i].key) {
                    this.eventQueue.splice(i, 1);
                    break;
                }
            }
        }
    },
    consumeEvents:function() {
        if (this.consuming) {
            return;
        }
        this.consuming = true;
        var next = coroutine(function*() {
            while(true) {
                if (this.eventQueue.length == 0) {
                    this.consuming = false;
                    break;
                }
                var eventDesc = this.eventQueue[0];
                this.printRemaining(eventDesc.moment);
                var event = this.events[eventDesc.key];
                var nowTime = new Date().getTime();
                if (nowTime > eventDesc.moment) {
                    this.eventQueue.splice(0, 1);
                    safe(event.callback)();
                    this.queueEvent(eventDesc.key);
                }
                if (this.eventQueue.length == 0) {
                    this.consuming = false;
                    break;
                }
                yield setTimeout(next, 799);
            }
        }, this);
    },
    queueEvent:function(key) {
        var event = this.events[key];
        if (!event) {
            return;
        }
        var moment = event.locate();
        var i = 0;
        for (; i < this.eventQueue.length; ++i) {
            var eventDesc = this.eventQueue[i];
            if (moment < eventDesc.moment) {
                break;
            }
        }
        this.eventQueue.splice(i, 0, {
            moment: moment,
            key: key,
        });
        this.consumeEvents();
    },
    setEvent:function(locate, callback) {
        var key = rkey();
        while(this.events[key]) {key = rkey();}
        this.events[key] = {
            locate: locate,
            callback: callback,
        };
        this.queueEvent(key);
        return key;
    },
    printRemaining:function(moment) {
        var now = new Date().getTime();
        var milliDiff = moment - now;
        var printDiff = (milliDiff < 5 * 60 * 1000 ? 5000 : 10 * 60 * 1000);
        if (now - this.lastPrint > printDiff) {
            this.lastPrint = now;
            var sec = Math.floor(milliDiff / 1000);
            if (sec < 60) {
                return console.log("-- rest sec {0}".format(sec));
            }
            var minute = Math.floor(sec / 60);
            sec = sec % 60;
            if (minute < 60) {
                return console.log("-- rest min {1}:{0}".format(sec, minute));
            }
            var hour = Math.floor(minute / 60);
            minute = minute % 60;
            return console.log("-- rest hour {2}:{1}:{0}".format(sec, minute, hour));
        }
    },
});


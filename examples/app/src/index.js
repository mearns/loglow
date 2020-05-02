const loglow = require("loglow");
const b = require("example-loglow-library-b");

loglow.config("example", {
    level: "info"
});
loglow.config("example/a", {
    level: "debug",
    enable: false
});
loglow.lock();

b.bFunc();

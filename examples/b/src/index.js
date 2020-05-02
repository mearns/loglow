const loglow = require("loglow");
const a = require("example-loglow-library-a");

const logger = loglow.getLogger("example/b");

module.exports = {
    bFunc: (...args) => {
        logger("Info Hello from example-B", { args });
        logger("Debug Hello from example-B", { args });
        a.aFunc();
    }
};

const loglow = require("loglow");

const logger = loglow.getLogger("example/a");

module.exports = {
    aFunc: (...args) => {
        logger("Info Hello from example-A", { args });
        logger("Debug Hello from example-A", { args });
    }
};

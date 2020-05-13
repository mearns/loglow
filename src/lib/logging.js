const { getImplementation } = require("./config");

function logFunction(loggerName, message, metas) {
    const implementation = getImplementation(loggerName);
    implementation(message, metas);
}

function getLogger(loggerName) {
    const log = (message, ...metas) => logFunction(loggerName, message, metas);
    return log;
}

module.exports = getLogger;

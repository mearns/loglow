const { buildMeta } = require("./metadata");
const { getImplementation } = require("./config");

function logFunction(loggerName, message, metas) {
    const implementation = getImplementation(loggerName);
    if (implementation.config.enabled) {
        const metadata = buildMeta(metas, implementation.config);
        implementation.config.consume(
            new Date(),
            loggerName,
            message,
            metadata
        );
    }
}

function getLogger(loggerName) {
    const log = (message, ...metas) => logFunction(loggerName, message, metas);
    return log;
}

module.exports = getLogger;

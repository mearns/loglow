const { buildMeta } = require("./lib/metadata");

/**
 * The default configuration value for `writeEntry`, used to actually write a log entry
 * after it's been processed and filtered.
 * @param {Date} date
 * @param {string} message
 * @param {object} combinedMeta
 */
function defaultWriteEntry(date, message, combinedMeta) {
    console.log({ date: date.toISOString(), message, meta: combinedMeta });
}

function logFunction(loggerName, message, metas) {
    const implementation = getImplementation(loggerName);
    if (implementation.config.enabled) {
        const combinedMeta = buildMeta(metas, implementation.config);
        implementation.config.writeEntry(new Date(), message, combinedMeta);
    }
}

function getLogger(loggerName) {
    const log = (message, ...meta) => logFunction(loggerName, message, meta);
    return log;
}

module.exports = {
    config: setConfig,
    getLogger,
    lock
};

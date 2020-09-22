/**
 * This is the client portion of the system.
 */

let impl = null;

const noopLogger = (message, ...metas) => {};

function getNoopLogger(...loggerNames) {
    return noopLogger;
}

function importCore() {
    console.log("Importing core");
    if (impl === null) {
        console.log("Requiring");
        try {
            const core = require("@loglow/core");
            console.log("Got it", core.logger.getLogger);
            impl = core.logging.getLogger;
        } catch (error) {
            console.log("ERROR", error);
            impl = getNoopLogger;
        }
    }
}

function getLogger(...loggerNames) {
    importCore();
    return impl(...loggerNames);
}

module.exports = getLogger;

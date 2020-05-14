const { log: logImpl } = require("./config");

function getLogger(loggerName) {
    const log = (message, ...metas) => logImpl({ loggerName, message, metas });
    return log;
}

module.exports = getLogger;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLogger = void 0;
const config_1 = require("./config");
function getLogger(...loggerNames) {
    const loggerName = config_1.buildLoggerName(loggerNames);
    return (message, ...metas) => config_1.log({ loggerName, message, metas });
}
exports.getLogger = getLogger;
//# sourceMappingURL=logging.js.map
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unlock = exports.lock = exports.isKey = void 0;
let currentKey = null;
function isKey(key) {
    return key === currentKey || currentKey === null;
}
exports.isKey = isKey;
function lock(name = "loglow-lock") {
    if (currentKey === null) {
        const key = Symbol(name);
        currentKey = key;
        return key;
    }
    return null;
}
exports.lock = lock;
/**
 */
function unlock(key) {
    if (isKey(key)) {
        currentKey = null;
    }
}
exports.unlock = unlock;
//# sourceMappingURL=locking.js.map
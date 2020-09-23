"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildMeta = void 0;
function foldInProperties(dest, source) {
    for (const p of Object.keys(source)) {
        if (!hasOwnProperty(dest, p)) {
            dest[p] = defaultMetaTransformer(source[p]);
        }
    }
    return dest;
}
function makeMapUseful(map) {
    return foldInProperties({
        "@kind": "Map",
        entries: [...map.entries()]
    }, map);
}
function makeSetUseful(set) {
    return foldInProperties({
        "@kind": "Set",
        values: [...set]
    }, set);
}
function makeSymbolUseful(symbol) {
    return {
        "@kind": "symbol",
        value: String(symbol)
    };
}
function makeErrorUseful(error) {
    const { name, message, stack } = error;
    return foldInProperties({
        "@kind": "Error",
        name,
        message,
        stack
    }, error);
}
function makeUndefinedUseful() {
    return { "@kind": "undefined" };
}
function makeUnknownUseful(value) {
    return foldInProperties({ "@kind": typeof value }, value);
}
function makeUseful(value) { }
function isObject(x) {
    return typeof x === "object";
}
function defaultMetaTransformer(value) {
    if (Array.isArray(value)) {
        return value.map(defaultMetaTransformer);
    }
    else if (value instanceof Error) {
        return makeErrorUseful(value);
    }
    else if (value instanceof Map) {
        return makeMapUseful(value);
    }
    else if (value instanceof Set) {
        return makeSetUseful(value);
    }
    else if (typeof value === "undefined") {
        return makeUndefinedUseful();
    }
    else if (value === null ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        typeof value === "string") {
        return value;
    }
    else if (isObject(value)) {
        const obj = {};
        for (const p of Object.keys(value)) {
            obj[p] = defaultMetaTransformer(value[p]);
        }
        return obj;
    }
    else {
        return makeUnknownUseful(value);
    }
}
function hasOwnProperty(obj, prop) {
    return Object.hasOwnProperty.call(obj, prop);
}
function findMetaFieldType(value) {
    if (hasOwnProperty(value, "@kind") && typeof value["@kind"] === "string") {
        return value["@kind"];
    }
    else if (value instanceof Error) {
        return "error";
    }
    else if (value instanceof Date) {
        return "date";
    }
    else if (Array.isArray(value)) {
        return "array";
    }
    else if (typeof value !== "object") {
        return typeof value;
    }
    return null;
}
function reduceMetas(acc, meta) {
    const type = findMetaFieldType(meta);
    if (type !== null) {
        if (!hasOwnProperty(acc, type)) {
            acc[type] = meta;
            return acc;
        }
        for (let i = 2; true; i++) {
            const propName = `${type}${i}`;
            if (!hasOwnProperty(acc, propName)) {
                acc[propName] = meta;
                return acc;
            }
        }
    }
    return Object.assign(acc, meta);
}
/**
 * Given a list of metadata values passed to a logging function, and a list of metadata middleware
 * transformers, transform each metadata value and merge them over each other, with the last value
 * overwriting earlier values.
 * @param metas Array of metadata values passed to the logging function.
 */
function buildMeta(metas) {
    let combined = {};
    try {
        for (const meta of metas) {
            const xformedMeta = defaultMetaTransformer(meta);
            combined = reduceMetas(combined, xformedMeta);
        }
    }
    catch (error) {
        combined.error_loggingMetaMiddleware = makeErrorUseful(error);
        combined.error_loggingMetaMiddleware_originalMetas = metas;
    }
    return combined;
}
exports.buildMeta = buildMeta;
//# sourceMappingURL=metadata.js.map
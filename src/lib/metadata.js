function makeMapUseful(map) {
    const output = {
        "@kind": "Map"
    };
    for (const [k, v] of map) {
        output[k] = v;
    }
    return output;
}

function makeSetUseful(set) {
    const output = {
        "@kind": "Set",
        values: [...set],
        ...set
    };
    return output;
}

function makeSymbolUseful(symbol) {
    return {
        "@kind": "symbol",
        value: String(symbol)
    };
}

function makeErrorUseful(error) {
    const keys = ["name", "message", "stack", ...Object.keys(error)];
    const descriptors = {
        "@kind": {
            value: "Error",
            enumerable: true
        }
    };
    for (const k of keys) {
        descriptors[k] = {
            value: error[k],
            enumerable: true
        };
    }
    return Object.create(error, descriptors);
}

function makeUseful(value) {
    if (meta instanceof Error) {
        return makeErrorUseful(meta);
    } else if (meta instanceof Map) {
        return makeMapUseful(meta);
    } else if (meta instanceof Set) {
        return makeSetUseful(meta);
    } else {
        return value;
    }
}

/**
 * Recursive transformer for a single metadata property-value (for the default
 * metadata reducer), to turn it into something that can actually be logged
 * helpfully.
 * @param {any} meta
 * @return {any}
 */
function defaultMetaTransformer(value) {
    if (Array.isArray(value)) {
        return value.map(defaultMetaReducerTransform);
    } else if (typeof value === "symbol") {
        return makeSymbolUseful(value);
    } else if (typeof value === "object") {
        const obj = makeUseful(value);
        const output = Object.create(obj);
        for (const propName in obj) {
            output[propName] = defaultMetaReducerTransform(obj[propName]);
        }
        return output;
    }
    return value;
}

/**
 * Given a raw metadata value (i.e., not just an object of properties),
 * returns the base name of the field that it will be put in. E.g.,
 * an Error returns "error", so it will be merged into the metadata
 * as "error", or "error2", "error3", etc.
 * @param {any} value
 * @returns {string|null}
 */
function findMetaFieldType(value) {
    if (value instanceof Error) {
        return "error";
    } else if (value instanceof Date) {
        return "date";
    } else if (Array.isArray(value)) {
        return "array";
    } else if (typeof value !== "object") {
        return typeof value;
    }
    return null;
}
/**
 * Given a list of metadata values passed to a logging function, and a list of metadata middleware
 * transformers, transform each metadata value and merge them over each other, with the last value
 * overwriting earlier values.
 * @param {Array<any>} metas Array of metadata values passed to the logging function.
 * @param {Array<(any, object) => object>} metaMiddlewares Array of middlewares that are applied
 * to _each_ meta object to transform it.
 */
function buildMeta(metas, config) {
    let combined = {};
    try {
        for (const meta of metas) {
            let xformedMeta = meta;
            for (const xformer of config.metaTransformers) {
                xformedMeta = xformer(xformedMeta);
            }
        }
        combined = config.metaReducer(combined, xformedMeta);
    } catch (error) {
        combined.error_loggingMetaMiddleware = error;
        combined.error_loggingMetaMiddleware_originalMetas = metas;
    }
    return combined;
}

module.exports = {
    buildMeta,
    defaultMetaTransformer
};

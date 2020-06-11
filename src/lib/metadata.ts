export type MetadataRecord = { [propName: string]: Metadata };

export type Metadata =
    | MetadataRecord
    | Array<Metadata>
    | string
    | number
    | boolean
    | null;

function foldInProperties(
    dest: MetadataRecord,
    source: unknown
): MetadataRecord {
    for (const p of Object.keys(source)) {
        if (!hasOwnProperty(dest, p)) {
            dest[p] = defaultMetaTransformer(source[p]);
        }
    }
    return dest;
}

function makeMapUseful(map: Map<Metadata, Metadata>): MetadataRecord {
    return foldInProperties(
        {
            "@kind": "Map",
            entries: [...map.entries()]
        },
        map
    );
}

function makeSetUseful(set: Set<Metadata>): MetadataRecord {
    return foldInProperties(
        {
            "@kind": "Set",
            values: [...set]
        },
        set
    );
}

function makeSymbolUseful(symbol: symbol): MetadataRecord {
    return {
        "@kind": "symbol",
        value: String(symbol)
    };
}

function makeErrorUseful(error: Error): MetadataRecord {
    const { name, message, stack } = error;
    return foldInProperties(
        {
            "@kind": "Error",
            name,
            message,
            stack
        },
        error
    );
}

function makeUndefinedUseful(): MetadataRecord {
    return { "@kind": "undefined" };
}

function makeUnknownUseful(value: unknown): MetadataRecord {
    return foldInProperties({ "@kind": typeof value }, value);
}

function makeUseful(value: unknown): Metadata {}

function isObject(x: unknown): x is Record<string, unknown> {
    return typeof x === "object";
}

/**
 * Recursive transformer for a single metadata property-value (for the default
 * metadata reducer), to turn it into something that can actually be logged
 * helpfully.
 */
function defaultMetaTransformer(value: symbol): Metadata;
function defaultMetaTransformer(value: Record<string, unknown>): Metadata;
function defaultMetaTransformer<T>(value: Array<T>): Array<Metadata>;
function defaultMetaTransformer(value: unknown): Metadata {
    if (Array.isArray(value)) {
        return value.map(defaultMetaTransformer);
    } else if (value instanceof Error) {
        return makeErrorUseful(value);
    } else if (value instanceof Map) {
        return makeMapUseful(value);
    } else if (value instanceof Set) {
        return makeSetUseful(value);
    } else if (typeof value === "undefined") {
        return makeUndefinedUseful();
    } else if (
        value === null ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        typeof value === "string"
    ) {
        return value;
    } else if (isObject(value)) {
        const obj: MetadataRecord = {};
        for (const p of Object.keys(value)) {
            obj[p] = defaultMetaTransformer(value[p]);
        }
        return obj;
    } else {
        return makeUnknownUseful(value);
    }
}

function hasOwnProperty(obj: unknown, prop: string): boolean {
    return Object.hasOwnProperty.call(obj, prop);
}

/**
 * Given a raw metadata value (i.e., not just an object of properties),
 * returns the base name of the field that it will be put in. E.g.,
 * an Error returns "error", so it will be merged into the metadata
 * as "error", or "error2", "error3", etc.
 */
function findMetaFieldType(value: { "@kind": string }): string;
function findMetaFieldType(value: Error): string;
function findMetaFieldType(value: Date): string;
function findMetaFieldType(value: Array<unknown>): string;
function findMetaFieldType(
    value: number | symbol | string | boolean | undefined
): string;
function findMetaFieldType(value: unknown): string | null;
function findMetaFieldType(value: unknown): string | null {
    if (hasOwnProperty(value, "@kind") && typeof value["@kind"] === "string") {
        return value["@kind"];
    } else if (value instanceof Error) {
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

function reduceMetas(
    acc: Record<string, Metadata>,
    meta: unknown
): Record<string, Metadata> {
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
export function buildMeta(metas: Array<unknown>): Record<string, Metadata> {
    let combined: Record<string, Metadata> = {};
    try {
        for (const meta of metas) {
            const xformedMeta = defaultMetaTransformer(meta);
            combined = reduceMetas(combined, xformedMeta);
        }
    } catch (error) {
        combined.error_loggingMetaMiddleware = makeErrorUseful(error);
        combined.error_loggingMetaMiddleware_originalMetas = metas as any;
    }
    return combined;
}

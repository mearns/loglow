export declare type MetadataRecord = {
    [propName: string]: Metadata;
};
export declare type Metadata = MetadataRecord | Array<Metadata> | string | number | boolean | null;
/**
 * Given a list of metadata values passed to a logging function, and a list of metadata middleware
 * transformers, transform each metadata value and merge them over each other, with the last value
 * overwriting earlier values.
 * @param metas Array of metadata values passed to the logging function.
 */
export declare function buildMeta(metas: Array<unknown>): Record<string, Metadata>;

export declare type Key = symbol;
export declare function isKey(key: Key | null): boolean;
export declare function lock(name?: string): Key;
/**
 */
export declare function unlock(key: Key): void;

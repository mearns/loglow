export type Key = symbol;

let currentKey: Key = null;

export function isKey(key: Key | null): boolean {
    return key === currentKey || currentKey === null;
}

export function lock(name = "loglow-lock"): Key {
    if (currentKey === null) {
        const key = Symbol(name);
        currentKey = key;
        return key;
    }
    return null;
}

/**
 */
export function unlock(key: Key): void {
    if (isKey(key)) {
        currentKey = null;
    }
}

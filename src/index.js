const configs = new Map();
const rootConfig = {
    enabled: false,
    writeEntry: defaultWriteEntry,
    metaMiddlewares: [defaultMetaMiddleware]
};

/**
 * Implementations act like a cache for configs. When config changes,
 * we simply clear out the implementation for that path and everything
 * beneath it; next time we need to log for any of those loggers, we'll
 * see that there is no implementation for it, and create a new one
 * based on the current config.
 */
const implementationMap = new Map();
const knownImplementations = { present: false, children: new Map() };

function clearImplementations(loggerName) {
    const components = splitLoggerName(loggerName);
    const startTree = components.reduce((currentTree, component) => {
        if (currentTree) {
            return currentTree.children.get(component);
        }
        return null;
    }, knownImplementations);
    if (startTree) {
        const trees = [[startTree, loggerName]];
        while (trees.length) {
            const [tree, name] = trees.shift();
            if (tree.present) {
                implementationMap.delete(name);
            }
            for (const [
                component,
                childTree
            ] of targetTree.children.entries()) {
                trees.push([childTree, `${name}/${component}`]);
            }
        }
    }
}

/**
 * Get the implementation for the logger, creating a new one if it doesn't
 * exist.
 * @param {string} loggerName The name of the logger
 */
function getImplementation(loggerName) {
    const implementation = implementationMap.get(loggerName);
    if (implementation) {
        return implementation;
    } else {
        const components = splitLoggerName(loggerName);
        const targetTree = components.reduce((tree, component) => {
            if (!tree.children.has(component)) {
                const newTree = { present: false, children: new Map() };
                tree.children.set(component, newTree);
                return newTree;
            }
            return tree.children.get(component);
        }, knownImplementations);

        targetTree.present = true;
        const newImplementation = { config: getConfig(loggerName) };
        implementationMap.set(loggerName, newImplementation);
        return newImplementation;
    }
}

/**
 * Update the root configuration.
 * @param {object} config The root configuration to _merge_ over the existing
 * root config.
 */
function configRoot(config) {
    logImplementationTree.this = null;
    logImplementationTree.children.clear();
    Object.assign(rootConfig, config);
}

let currentLock = null;

/**
 * Top-level API for configuring a logger by name. This also provides
 * a base config for all loggers that have the given name as a prefix.
 * @param {string} loggerName The name of the logger to configure.
 * @param {object} config The logging config.
 */
function config(loggerName, config) {
    if (!currentLock) {
        configWithLock(loggerName, config, null);
    }
}

function configWithLock(loggerName, config, lock) {
    if (lock === currentLock) {
        configs.set(loggerName, config);
        clearImplementations(loggerName);
    }
}

/**
 * The top-level app should lock the configuration before loading any
 * other modules, so that no other module can override your config.
 *
 * On successful lock, returns an object with two methods:
 * `unlock()` which unlocks configuration (which would be kind of a
 * weird use case); `config(loggerName, config)` which can be used to
 * configure logging despite the lock. A useful pattern is to require this
 * module and get the lock, then require whatever other packages you need.
 * It's locked so those other packages can't change config, but you can
 * configure it after the fact using the acquired lock.
 *
 * If logging is already locked, you'll get back an identical object except
 * all the methods are no-ops. That way your package doesn't need to know
 * whether it's the top or not. If you really want to know (e.g., for debugging
 * if your configuration isn't taking effect), you can check the `acquired`
 * field.
 *
 * @param {string} [name] optionally specify a name for the lock.
 * It's useful for debugging.
 */
function lock(name = "loglow-lock") {
    if (currentLock) {
        return {
            unlock: () => {},
            config: () => {},
            acquired: false
        };
    }
    const key = Symbol(name);
    currentLock = key;
    return {
        unlock: () => {
            if (currentLock === key) {
                currentLock = null;
            }
        },
        config: (loggerName, config) => {
            configWithLock(loggerName, config, key);
        },
        acquired: true
    };
}

function getConfig(loggerName) {
    const partialPaths = getConfigPaths(loggerName);
    return loadMultipleConfigs(partialPaths);
}

/**
 * Load and merge configs for all of the specified paths, starting (implicitly)
 * with the `rootConfig`.
 *
 * @param {Array<string>} configPaths A reverse-priority list of config
 * paths to load configs for, usually coming from `getConfigPaths`.
 * The config for the last path overrides any that come before it.
 */
function loadMultipleConfigs(configPaths) {
    return configPaths.reduce(
        (aggregateConfig, partialPath) => {
            const partialConfig = configs.get(partialPath);
            if (partialConfig) {
                Object.assign(
                    aggregateConfig,
                    { enabled: true },
                    partialConfig
                );
            }
            return aggregateConfig;
        },
        { ...rootConfig }
    );
}

/**
 * Find all the prefix paths for the given config paths. E.g.,
 * If you pass in "foo/bar/trot", you'll get back ["foo", "foo/bar", "foo/bar/trot"]
 * @param {string} loggerName The fully qualified path
 * @return {Array<string>}
 */
function getConfigPaths(loggerName) {
    return splitLoggerName(loggerName).reduce(
        (_partialPaths, component, idx) => {
            if (idx === 0) {
                return [component];
            }
            const parent = _partialPaths[idx - 1];
            _partialPaths.push(`${parent}/${component}`);
            return _partialPaths;
        },
        []
    );
}

/**
 * Split a logger name into it's heirarchical components, returned
 * in an array from top to bottom. Does not include the root.
 * @param {string} loggerName The name of the logger
 * @returns {Array<string>}
 */
function splitLoggerName(loggerName) {
    return [...loggerName.split("/")];
}

/**
 * The default configuration value for `writeEntry`, used to actually write a log entry
 * after it's been processed and filtered.
 * @param {Date} date
 * @param {string} message
 * @param {object} combinedMeta
 */
function defaultWriteEntry(date, message, combinedMeta) {
    console.log({ date: date.toISOString(), message, meta: combinedMeta });
}

function hasOwnProperty(obj, propName) {
    return Object.hasOwnProperty.call(obj, propName);
}

function makeErrorUseful(error) {
    const keys = ["name", "message", "stack", ...Object.keys(error)];
    const descriptors = {};
    for (let k of keys) {
        descriptors[k] = {
            value: error[k],
            enumerable: true
        };
    }
    return Object.create(error, descriptors);
}

function defaultMetaMiddlewareTransformvValue(meta) {
    if (Array.isArray(meta)) {
        return meta.map(defaultMetaMiddlewareTransformvValue);
    } else if (typeof value === "symbol") {
        return String(value);
    } else if (typeof meta === "object") {
        const obj = meta instanceof Error ? makeErrorUseful(meta) : meta;
        const output = Object.create(obj);
        for (let propName in obj) {
            output[propName] = defaultMetaMiddlewareTransformvValue(
                obj[propName]
            );
        }
        return output;
    }
    return meta;
}

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

function defaultMetaMiddleware(meta, existingMeta) {
    const xformed = defaultMetaMiddlewareTransformvValue(meta);
    const fieldType = findMetaFieldType(meta);
    if (fieldType) {
        if (!hasOwnProperty(existingMeta, fieldType)) {
            return { [fieldType]: xformed };
        }
        for (let i = 2; true; i++) {
            const propName = `${fieldType}${i}`;
            if (!hasOwnProperty(existingMeta, propName)) {
                return { [propName]: xformed };
            }
        }
    }
    return xformed;
}

/**
 * Given a list of metadata values passed to a logging function, and a list of metadata middleware
 * transformers, transform each metadata value and merge them over each other, with the last value
 * overwriting earlier values.
 * @param {Array<any>} metas Array of metadata values passed to the logging function.
 * @param {Array<(any, object) => object>} metaMiddlewares Array of middlewares that are applied
 * to _each_ meta object to transform it.
 */
function combineMeta(metas, metaMiddlewares) {
    const combined = {};
    try {
        for (const meta of metas) {
            let xformedMeta = meta;
            for (const middleware of metaMiddlewares) {
                xformedMeta = middleware(xformedMeta, combined);
            }
            Object.assign(combined, xformedMeta);
        }
    } catch (error) {
        combined.error_loggingMetaMiddleware = error;
        combined.error_loggingMetaMiddleware_originalMetas = meta;
    }
    return combined;
}

function logFunction(loggerName, message, metas) {
    const implementation = getImplementation(loggerName);
    if (implementation.config.enabled) {
        const combinedMeta = combineMeta(
            metas,
            implementation.config.metaMiddlewares
        );
        implementation.config.writeEntry(new Date(), message, combinedMeta);
    }
}

function getLogger(loggerName) {
    const log = (message, ...meta) => logFunction(loggerName, message, meta);
    return log;
}

module.exports = {
    config,
    getLogger,
    lock
};

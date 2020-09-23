"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildLoggerName = exports.log = exports.lock = void 0;
const locking_1 = require("./locking");
const LOGGER_NAME = "@loglow";
const EXTERNAL_LOGGER_NAME = buildLoggerName([LOGGER_NAME, "external"]);
const EXTERNAL_ERROR_LOGGER_NAME = buildLoggerName([
    EXTERNAL_LOGGER_NAME,
    "errors"
]);
const NOOP = () => {
    // do nothing
};
const Wrapped = Symbol("isWrapped");
/**
 *
 * The top-level app should lock the configuration before loading any
 * other modules, so that no other module can override your config.
 *
 * A useful pattern is to require this
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
 * @param [name] optionally specify a name for the lock.
 * It's useful for debugging.
 */
function lock(name = "loglow-lock") {
    const key = locking_1.lock(name);
    if (key === null) {
        return {
            unlock: NOOP,
            setConfigurator: NOOP,
            setRootConfigurator: NOOP,
            resetConfig: NOOP,
            acquired: false
        };
    }
    return {
        unlock: locking_1.unlock.bind(null, key),
        setConfigurator: setConfiguratorWithLock.bind(null, key),
        setRootConfigurator: setRootConfiguratorWithLock.bind(null, key),
        resetConfig: resetConfigWithLock.bind(null, key),
        acquired: true
    };
}
exports.lock = lock;
const ROOT = Symbol("root");
const defaultConfig = {
    enabled: false,
    decorations: [],
    middleware: [],
    receiver: NOOP
};
const DEFAULT_ROOT_CONFIGURATOR = Object.assign((config => config), { [Wrapped]: true });
/**
 * The map of configurators to logger names.
 * @name configurators
 */
const configurators = new Map();
configurators.set(ROOT, DEFAULT_ROOT_CONFIGURATOR);
/**
 * Implementations act like a cache for configs. When config changes,
 * we simply clear out the implementation for that path and everything
 * beneath it; next time we need to log for any of those loggers, we'll
 * see that there is no implementation for it, and create a new one
 * based on the current config.
 */
const implementationMap = new Map();
/**
 * A tree of which implementations are known, organized by name. The presence
 * of a node in the tree doesn't necessarily mean the implementation exists,
 * it could be there because it existed at one point, or because a child
 * logger exists. The `present` field indicates whether or not the corresponding
 * implementation exists in {@link implementationMap}.
 * @property {boolean} present Indicates whether or not
 */
const knownImplementations = {
    present: false,
    children: new Map()
};
/**
 * Find the tree from the {@link knownImplementations} for the named logger,
 * if it exists. If it doesn't exist, return null.
 */
function getImplementationTree(loggerName) {
    const components = splitLoggerName(loggerName);
    let currentTree = knownImplementations;
    for (const component of components) {
        currentTree = currentTree.children.get(component);
        if (!currentTree) {
            return null;
        }
    }
    return currentTree;
}
/**
 * Remove any existing implementation with the given name or prefix. This should
 * be done when the configuration for the logger changes; when an implementation
 * is needed (as with {@link getImplementation}), it will be created.
 */
function clearImplementations(loggerName) {
    const startTree = getImplementationTree(loggerName);
    if (startTree) {
        const treesToClear = [
            [startTree, loggerName]
        ];
        while (treesToClear.length) {
            const [tree, name] = treesToClear.shift();
            if (tree.present) {
                implementationMap.delete(name);
                tree.present = false;
            }
            for (const [component, childTree] of tree.children.entries()) {
                treesToClear.push([
                    childTree,
                    buildLoggerName([name, component])
                ]);
            }
        }
    }
}
/**
 * Clear all cached implementations. LIke {@link clearImplementations}, but much faster to just
 * do them all at once.
 */
function clearAlImplementations() {
    implementationMap.clear();
    knownImplementations.present = false;
    knownImplementations.children.clear();
}
/**
 * Get the implementation for the logger, creating a new one if it doesn't
 * exist. Delegates to {@link buildImplementation} to construct new implementations
 * when needed.
 */
function getImplementation(loggerName) {
    const implementation = implementationMap.get(loggerName);
    if (implementation) {
        return implementation;
    }
    else {
        const newImplementation = buildImplementation(loggerName);
        const targetTree = ensureImplementationTreeExists(loggerName);
        targetTree.present = true;
        implementationMap.set(loggerName, newImplementation);
        return newImplementation;
    }
}
/**
 * Create a logger function, an "implementation", for the specified logger name.
 * This uses the appropriate configuration for the specified logger, but pays no
 * regard to the {@link knownImplementations} as it is intended to be used to
 * populate the `knownImplementations` as needed.
 */
function buildImplementation(loggerName) {
    const config = getConfig(loggerName);
    const enabled = Boolean(config.enabled);
    if (!enabled) {
        return NOOP;
    }
    return (message, metas) => {
        const invocations = applyMiddleware(loggerName, {
            date: new Date(),
            message,
            metas: [...config.decorations, ...metas]
        }, config.middleware);
        for (const [loggerName, entry] of invocations) {
            config.receiver(Object.assign({ loggerName }, entry));
        }
    };
}
/**
 * Given a list of middlewares, apply them to the given entry and return the final
 * set of invocations.
 */
function applyMiddleware(loggerName, entry, middlewares) {
    const [xform, ...remainingMiddlewares] = middlewares;
    const nextInvocations = [];
    const next = (loggerName, logEntry) => {
        nextInvocations.push([loggerName, logEntry]);
    };
    try {
        xform(loggerName, entry, next);
    }
    catch (error) {
        return [
            [
                EXTERNAL_ERROR_LOGGER_NAME,
                {
                    date: new Date(),
                    message: "An error occurred in middleware",
                    metas: [
                        {
                            error,
                            entry,
                            middleware: xform
                        }
                    ]
                }
            ]
        ];
    }
    if (remainingMiddlewares.length) {
        const finalInvocations = [];
        for (const [nextLoggerName, nextEntry] of nextInvocations) {
            finalInvocations.push(...applyMiddleware(nextLoggerName, nextEntry, remainingMiddlewares));
        }
        return finalInvocations;
    }
    else {
        return nextInvocations;
    }
}
/**
 * This is _the_ logging interface to add log entries. It will get (or create) an implementation
 * for the specified logger (using {@link getImplementation}) and invoke it to generate the log entry or entries.
 */
function log({ loggerName, message, metas }) {
    console.log("Adding log", loggerName, { message, metas });
    getImplementation(loggerName)(message, metas);
}
exports.log = log;
/**
 * Ensure the entire tree leading to the node for the specified logger
 * exists, marking each node that doesn't already exist as not present.
 * @returns The tree for the given logger, created if it didn't already exist.
 */
function ensureImplementationTreeExists(loggerName) {
    const components = splitLoggerName(loggerName);
    let tree = knownImplementations;
    for (const component of components) {
        const childTree = tree.children.get(component);
        if (childTree) {
            tree = childTree;
        }
        else {
            const newTree = { present: false, children: new Map() };
            tree.children.set(component, newTree);
            tree = newTree;
        }
    }
    return tree;
}
// XXX
/**
 * Set the configurator for the specified logger using the specified lock.
 * If the lock doesn't match the current lock, this is a no-op. If you
 * have the correct lock, it sets the configurator and clears the implementations
 * for the logger and everything beneath it.
 */
function setConfiguratorWithLock(key, loggerName, configurator) {
    if (locking_1.isKey(key)) {
        configurators.set(loggerName, wrapConfigurator(configurator, setConfiguratorWithLock));
        clearImplementations(loggerName);
    }
}
function setRootConfiguratorWithLock(key, configurator) {
    if (locking_1.isKey(key)) {
        configurators.set(ROOT, wrapConfigurator(configurator, setRootConfiguratorWithLock));
        clearAlImplementations();
    }
}
function hasOwnProperty(object, propName) {
    return Object.hasOwnProperty.call(object, propName);
}
/**
 * Load and merge configs for all of the specified paths, starting (implicitly)
 * with the root. If at least one configurator is actually set for
 * any of the paths, then the `enabled` config defaults to `true`.
 *
 * @param configPaths A reverse-priority list of config
 * paths to load configs for, usually coming from `getConfigPaths`.
 * The config for the last path overrides any that come before it.
 */
function loadMultipleConfigs(configPaths) {
    let config = Object.assign({}, defaultConfig);
    const rootConfigurator = configurators.get(ROOT);
    if (rootConfigurator) {
        config = rootConfigurator(config);
    }
    for (const path of configPaths) {
        const configurator = configurators.get(path);
        if (configurator) {
            if (!hasOwnProperty(config, "enabled")) {
                config.enabled = true;
            }
            config = configurator(config);
        }
    }
    return config;
}
/**
 * Find all the prefix paths for the given config paths. E.g.,
 * If you pass in "foo/bar/trot", you'll get back ["foo", "foo/bar", "foo/bar/trot"]
 * @param loggerName The fully qualified path
 */
function getConfigPaths(loggerName) {
    const [firstComponent, ...components] = splitLoggerName(loggerName);
    const paths = new Array(components.length);
    paths[0] = firstComponent;
    let parent = firstComponent;
    for (let i = 0; i < components.length; i++) {
        const newPath = buildLoggerName([parent, components[i]]);
        paths[i + 1] = newPath;
        parent = newPath;
    }
    return paths;
}
/**
 * Split a logger name into it's heirarchical components, returned
 * in an array from top to bottom. Does not include the root.
 * @param loggerName The name of the logger
 */
function splitLoggerName(loggerName) {
    return loggerName.split("/");
}
function buildLoggerName(parts) {
    return parts.join("/");
}
exports.buildLoggerName = buildLoggerName;
/**
 * Return an error object which uses the given error as a prototype, but inherits all of it's
 * enumerable properties as own properties, and replaces the stack property with the given value.
 * Or, failing to do that, returns the original error as is. Doesn't modify the original error,
 * regardless.
 * @param error
 * @param stack
 */
function overrideStack(error, stack) {
    try {
        const descriptors = {};
        for (const propName in error) {
            descriptors[propName] = {
                get: () => error[propName]
            };
        }
        descriptors.stack = {
            value: stack
        };
        return Object.create(error, descriptors);
    }
    catch (whoops) {
        return error;
    }
}
/**
 * Split a stack string into two parts: the first line (the "header") and the rest.
 */
function splitStack(stack) {
    const [header, ...callStack] = stack.split(/\n/);
    return [header, callStack.join("\n")];
}
/**
 * Wrap a configurator so that if it throws an error the stack is more useful.
 * @param configurator
 * @param nonUserCodeEntryPoint
 */
function wrapConfigurator(configurator, nonUserCodeEntryPoint) {
    if (!configurator) {
        return null;
    }
    const sourceError = {};
    if (Error.captureStackTrace) {
        Error.captureStackTrace(sourceError, nonUserCodeEntryPoint);
    }
    const [, sourceStack] = splitStack(sourceError.stack || "");
    return Object.assign((cfg) => {
        try {
            return configurator(cfg);
        }
        catch (error) {
            if (typeof error.stack === "string") {
                const [header, callStack] = splitStack(error.stack);
                throw overrideStack(error, `${header}\n${sourceStack}\n  called:\n${callStack}`);
            }
            throw error;
        }
    }, { [Wrapped]: true });
}
/**
 * Reset all configuration using the given lock, if it's the current lock, or if
 * there is no lock.
 *
 * This is not used directly by clients of the module, tey would use {@link resetConfig},
 * or they would use the lock interface provided by {@link lock}
 * @private
 */
function resetConfigWithLock(key) {
    if (locking_1.isKey(key)) {
        configurators.clear();
        configurators.set(ROOT, DEFAULT_ROOT_CONFIGURATOR);
        implementationMap.clear();
        knownImplementations.present = false;
        knownImplementations.children.clear();
    }
}
/**
 * Get the configuration for the specified logger.
 */
function getConfig(loggerName) {
    const partialPaths = getConfigPaths(loggerName);
    return loadMultipleConfigs(partialPaths);
}
//# sourceMappingURL=config.js.map
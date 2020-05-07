let currentLock = null;

module.exports = {
    resetConfig,
    getImplementation,
    setConfigurator,
    setRootConfigurator,
    lock
};

function resetConfig() {
    resetConfigWithLock(null);
}

/**
 * Get the configuration for the specified logger.
 * @param {string} loggerName
 */
function getConfig(loggerName) {
    const partialPaths = getConfigPaths(loggerName);
    return loadMultipleConfigs(partialPaths);
}

/**
 * Top-level API for setting configurator of a logger by name. This also provides
 * a base config for all loggers that have the given name as a prefix.
 * @param {string} loggerName The name of the logger to configure.
 * @param {(config) => config} configurator Configurator for the loggers.
 */
function setConfigurator(loggerName, configurator) {
    setConfiguratorWithLock(loggerName, configurator, null);
}

function setRootConfigurator(configurator) {
    setRootConfiguratorWithLock(configurator, null);
}

/**
 *
 * The top-level app should lock the configuration before loading any
 * other modules, so that no other module can override your config.
 *
 * On successful lock, returns an object with methods:
 * `unlock()` which unlocks configuration (which would be kind of a
 * weird use case); `setConfigurator(loggerName, configurator)` which can be used to
 * configure logging despite the lock; and `resetConfig()`. A useful pattern is to require this
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
            setConfigurator: () => {},
            resetConfig: () => {},
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
        setConfigurator: (loggerName, config) => {
            setConfiguratorWithLock(loggerName, config, key);
        },
        resetConfig: () => {
            resetConfigWithLock(key);
        },
        acquired: true
    };
}

const ROOT = Symbol("root");

const defaultConfig = {};

/**
 * The map of configurators to logger names.
 * @name configurators
 * @type {Map<(config) => config>}
 */
const configurators = new Map();
configurators.set(ROOT, config => config);

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
const knownImplementations = { present: false, children: new Map() };

/**
 * Find the tree from the {@link knownImplementations} for the named logger,
 * if it exists. If it doesn't exist, return null.
 * @param {string} loggerName
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
 * Remove any existing implementation for with the given name or prefix. This should
 * be done when the configuration for the logger changes; when an implementation
 * is needed (as with {@link getImplementation}), it will be created.
 * @param {string} loggerName
 */
function clearImplementations(loggerName) {
    const startTree = getImplementationTree(loggerName);
    if (startTree) {
        const trees = [[startTree, loggerName]];
        while (trees.length) {
            const [tree, name] = trees.shift();
            if (tree.present) {
                implementationMap.delete(name);
                tree.present = false;
            }
            for (const [component, childTree] of tree.children.entries()) {
                trees.push([childTree, `${name}/${component}`]);
            }
        }
    }
}

function clearAlImplementations() {
    implementationMap.clear();
    knownImplementations.present = false;
    knownImplementations.children.clear();
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
        const newImplementation = { config: getConfig(loggerName) };
        const targetTree = ensureImplementationTreeExists(loggerName);
        targetTree.present = true;
        implementationMap.set(loggerName, newImplementation);
        return newImplementation;
    }
}

/**
 * Ensure the entire tree leading to the node for the specified logger
 * exists, marking each node that doesn't already exist as not present.
 * @param {string} loggerName
 * @returns The tree for the given logger, created if it didn't already exist.
 */
function ensureImplementationTreeExists(loggerName) {
    const components = splitLoggerName(loggerName);
    let tree = knownImplementations;
    for (const component of components) {
        const childTree = tree.children.get(component);
        if (childTree) {
            tree = childTree;
        } else {
            const newTree = { present: false, children: new Map() };
            tree.children.set(component, newTree);
            tree = newTree;
        }
    }
    return tree;
}

/**
 * Reset all configurations back to default: i.e., the ROOT
 * configuration is the default config, and all other configurators
 * are removed.
 */
function resetConfigWithLock(lock) {
    if (currentLock === null || lock === currentLock) {
        configurators.clear();
        configurators.set(ROOT, config => config);
        implementationMap.clear();
        knownImplementations.present = false;
        knownImplementations.children.clear();
    }
}

/**
 * Set the configurator for the specified logger using the specified lock.
 * If the lock doesn't match the current lock, this is a no-op. If you
 * have the correct lock, it sets the configurator and clears the implementations
 * for the logger and everything beneath it.
 *
 * @param {string} loggerName
 * @param {(config) => config} configurator
 * @param {Symbol?} lock The lock you have for configuring, or `null` if you don't have one.
 */
function setConfiguratorWithLock(loggerName, configurator, lock) {
    if (currentLock === null || lock === currentLock) {
        configurators.set(loggerName, configurator);
        clearImplementations(loggerName);
    }
}

function setRootConfiguratorWithLock(configurator, lock) {
    if (currentLock === null || lock === currentLock) {
        configurators.set(ROOT, configurator);
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
 * @param {Array<string>} configPaths A reverse-priority list of config
 * paths to load configs for, usually coming from `getConfigPaths`.
 * The config for the last path overrides any that come before it.
 */
function loadMultipleConfigs(configPaths) {
    let config = { ...defaultConfig };
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
 * @param {string} loggerName The fully qualified path
 * @return {Array<string>}
 */
function getConfigPaths(loggerName) {
    const [firstComponent, ...components] = splitLoggerName(loggerName);
    const paths = new Array(components.length + 1);
    paths[0] = firstComponent;
    let parent = firstComponent;
    for (let i = 0; i < components.length; i++) {
        const newPath = `${parent}/${components[i]}`;
        paths[i + 1] = newPath;
        parent = newPath;
    }
    return paths;
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

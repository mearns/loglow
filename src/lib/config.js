/**
 * The map of configurators to logger names.
 * @name configurators
 * @type {Map<(config) => config>}
 */
const configurators = new Map();
const rootConfigurator = () => ({
    enabled: false,
    writeEntry: defaultWriteEntry,
    metaReducer: defaultMetaReducer,
    metaTransformers: [defaultMetaTransformer],
    middlewares: []
});

/**
 * Implementations act like a cache for configs. When config changes,
 * we simply clear out the implementation for that path and everything
 * beneath it; next time we need to log for any of those loggers, we'll
 * see that there is no implementation for it, and create a new one
 * based on the current config.
 */
const implementationMap = new Map();
const knownImplementations = { present: false, children: new Map() };

/**
 * Remove any existing implementation for with the given name or prefix. This should
 * be done when the configuration for the logger changes; when an implementation
 * is needed (as with {@link getImplementation}), it will be created.
 * @param {string} loggerName
 */
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
 * Set the configurator for the root configuration.
 * @param {(config) => config} configurator The configurator to update the root configuration
 * root config.
 */
function configRoot(configurator) {
    logImplementationTree.this = null;
    logImplementationTree.children.clear();
    rootConfigurator = configurator;
}

let currentLock = null;

/**
 * Top-level API for configuring a logger by name. This also provides
 * a base config for all loggers that have the given name as a prefix.
 * @param {string} loggerName The name of the logger to configure.
 * @param {(config) => config} configurator Configurator for the loggers.
 */
function config(loggerName, configurator) {
    if (!currentLock) {
        configWithLock(loggerName, configurator, null);
    }
}

function configWithLock(loggerName, configurator, lock) {
    if (lock === currentLock) {
        configurators.set(loggerName, configurator);
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
 * with the `rootConfigurator`. If at least one configurator is actually set for
 * any of the paths, then the `enabled` config defaults to `true`.
 *
 * @param {Array<string>} configPaths A reverse-priority list of config
 * paths to load configs for, usually coming from `getConfigPaths`.
 * The config for the last path overrides any that come before it.
 */
function loadMultipleConfigs(configPaths) {
    return configPaths.reduce((aggregateConfig, partialPath) => {
        const configurator = configurators.get(partialPath);
        if (configurator) {
            return configurator({ enabled: true, ...aggregateConfig });
        }
        return aggregateConfig;
    }, rootConfigurator());
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

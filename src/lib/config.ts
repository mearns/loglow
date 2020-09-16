import { Key, isKey, lock as getKey, unlock } from "./locking";

const LOGGER_NAME = "@loglow";
// const INTERNAL_LOGGER_NAME = buildLoggerName(LOGGER_NAME, "internal");
const EXTERNAL_LOGGER_NAME = buildLoggerName(LOGGER_NAME, "external");
const EXTERNAL_ERROR_LOGGER_NAME = buildLoggerName(
    EXTERNAL_LOGGER_NAME,
    "errors"
);

interface PreliminaryLogEntry {
    date: Date;
    message: string;
    metas: Array<unknown>;
}

export interface LogEntry {
    readonly loggerName: string;
    readonly date: Date;
    readonly message: string;
    readonly metas: Array<unknown>;
    readonly [prop: string]: unknown;
}

const NOOP = () => {
    // do nothing
};

type Implementation = (message: string, metas: Array<unknown>) => void;

type MiddlewareNext = (
    loggerName: string,
    logEntry: PreliminaryLogEntry
) => void;

type Middleware = (
    loggerName: string,
    logEntry: PreliminaryLogEntry,
    next: MiddlewareNext
) => void;

type Receiver = (entry: LogEntry) => void;

interface Configuration {
    enabled: boolean;
    middleware: Array<Middleware>;
    decorations: Array<unknown>;
    receiver: Receiver;
}
type Configurator = (previousConfig: Configuration) => Configuration;

const Wrapped = Symbol("isWrapped");
type WrappedConfigurator = Configurator & { readonly [Wrapped]: true };

export interface Lock {
    unlock: () => void;
    setConfigurator: (loggerName: string, configurator: Configurator) => void;
    setRootConfigurator: (configurator: Configurator) => void;
    resetConfig: () => void;
    acquired: boolean;
}

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
export function lock(name = "loglow-lock"): Lock {
    const key = getKey(name);
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
        unlock: unlock.bind(null, key),
        setConfigurator: setConfiguratorWithLock.bind(null, key),
        setRootConfigurator: setRootConfiguratorWithLock.bind(null, key),
        resetConfig: resetConfigWithLock.bind(null, key),
        acquired: true
    };
}

const ROOT = Symbol("root");

const defaultConfig: Configuration = {
    enabled: false,
    decorations: [],
    middleware: [],
    receiver: NOOP
};
const DEFAULT_ROOT_CONFIGURATOR: WrappedConfigurator = Object.assign(
    (config => config) as Configurator,
    { [Wrapped]: true } as { readonly [Wrapped]: true }
);

/**
 * The map of configurators to logger names.
 * @name configurators
 */
const configurators = new Map<string | symbol, WrappedConfigurator>();
configurators.set(ROOT, DEFAULT_ROOT_CONFIGURATOR);

/**
 * Implementations act like a cache for configs. When config changes,
 * we simply clear out the implementation for that path and everything
 * beneath it; next time we need to log for any of those loggers, we'll
 * see that there is no implementation for it, and create a new one
 * based on the current config.
 */
const implementationMap = new Map<string, Implementation>();

interface KnownImplementationNode {
    present: boolean;
    children: Map<string, KnownImplementationNode>;
}

type KnownImplementationTree = KnownImplementationNode;

/**
 * A tree of which implementations are known, organized by name. The presence
 * of a node in the tree doesn't necessarily mean the implementation exists,
 * it could be there because it existed at one point, or because a child
 * logger exists. The `present` field indicates whether or not the corresponding
 * implementation exists in {@link implementationMap}.
 * @property {boolean} present Indicates whether or not
 */
const knownImplementations: KnownImplementationTree = {
    present: false,
    children: new Map<string, KnownImplementationNode>()
};

/**
 * Find the tree from the {@link knownImplementations} for the named logger,
 * if it exists. If it doesn't exist, return null.
 */
function getImplementationTree(
    loggerName: string
): KnownImplementationTree | null {
    const components: Array<string> = splitLoggerName(loggerName);
    let currentTree: KnownImplementationNode | null = knownImplementations;
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
function clearImplementations(loggerName: string): void {
    const startTree: KnownImplementationNode = getImplementationTree(
        loggerName
    );
    if (startTree) {
        const treesToClear: Array<[KnownImplementationTree, string]> = [
            [startTree, loggerName]
        ];
        while (treesToClear.length) {
            const [tree, name]: [
                KnownImplementationTree,
                string
            ] = treesToClear.shift();
            if (tree.present) {
                implementationMap.delete(name);
                tree.present = false;
            }
            for (const [component, childTree] of tree.children.entries()) {
                treesToClear.push([
                    childTree,
                    buildLoggerName(name, component)
                ]);
            }
        }
    }
}

/**
 * Clear all cached implementations. LIke {@link clearImplementations}, but much faster to just
 * do them all at once.
 */
function clearAlImplementations(): void {
    implementationMap.clear();
    knownImplementations.present = false;
    knownImplementations.children.clear();
}

/**
 * Get the implementation for the logger, creating a new one if it doesn't
 * exist. Delegates to {@link buildImplementation} to construct new implementations
 * when needed.
 */
function getImplementation(loggerName: string): Implementation {
    const implementation = implementationMap.get(loggerName);
    if (implementation) {
        return implementation;
    } else {
        const newImplementation = buildImplementation(loggerName);
        const targetTree = ensureImplementationTreeExists(loggerName);
        targetTree.present = true;
        implementationMap.set(loggerName, newImplementation);
        return newImplementation;
    }
}

type MiddlewareInvocations = [string, PreliminaryLogEntry];

/**
 * Create a logger function, an "implementation", for the specified logger name.
 * This uses the appropriate configuration for the specified logger, but pays no
 * regard to the {@link knownImplementations} as it is intended to be used to
 * populate the `knownImplementations` as needed.
 */
function buildImplementation(loggerName: string): Implementation {
    const config: Configuration = getConfig(loggerName);
    const enabled = Boolean(config.enabled);
    if (!enabled) {
        return NOOP;
    }
    return (message: string, metas: Array<unknown>): void => {
        const invocations: Array<MiddlewareInvocations> = applyMiddleware(
            loggerName,
            {
                date: new Date(),
                message,
                metas: [...config.decorations, ...metas]
            },
            config.middleware
        );
        for (const [loggerName, entry] of invocations) {
            config.receiver({
                loggerName,
                ...entry
            });
        }
    };
}

/**
 * Given a list of middlewares, apply them to the given entry and return the final
 * set of invocations.
 */
function applyMiddleware(
    loggerName: string,
    entry: PreliminaryLogEntry,
    middlewares: Array<Middleware>
): Array<MiddlewareInvocations> {
    const [xform, ...remainingMiddlewares] = middlewares;
    const nextInvocations: Array<MiddlewareInvocations> = [];
    const next: MiddlewareNext = (loggerName, logEntry) => {
        nextInvocations.push([loggerName, logEntry]);
    };
    try {
        xform(loggerName, entry, next);
    } catch (error) {
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
        const finalInvocations: Array<MiddlewareInvocations> = [];
        for (const [nextLoggerName, nextEntry] of nextInvocations) {
            finalInvocations.push(
                ...applyMiddleware(
                    nextLoggerName,
                    nextEntry,
                    remainingMiddlewares
                )
            );
        }
        return finalInvocations;
    } else {
        return nextInvocations;
    }
}

/**
 * This is _the_ logging interface to add log entries. It will get (or create) an implementation
 * for the specified logger (using {@link getImplementation}) and invoke it to generate the log entry or entries.
 */
export function log({
    loggerName,
    message,
    metas
}: {
    loggerName: string;
    message: string;
    metas: Array<unknown>;
}): void {
    getImplementation(loggerName)(message, metas);
}

/**
 * Ensure the entire tree leading to the node for the specified logger
 * exists, marking each node that doesn't already exist as not present.
 * @returns The tree for the given logger, created if it didn't already exist.
 */
function ensureImplementationTreeExists(
    loggerName: string
): KnownImplementationTree {
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

// XXX

/**
 * Set the configurator for the specified logger using the specified lock.
 * If the lock doesn't match the current lock, this is a no-op. If you
 * have the correct lock, it sets the configurator and clears the implementations
 * for the logger and everything beneath it.
 */
function setConfiguratorWithLock(
    key: Key | null,
    loggerName: string,
    configurator: Configurator
): void {
    if (isKey(key)) {
        configurators.set(
            loggerName,
            wrapConfigurator(configurator, setConfiguratorWithLock)
        );
        clearImplementations(loggerName);
    }
}

function setRootConfiguratorWithLock(
    key: Key | null,
    configurator: Configurator
): void {
    if (isKey(key)) {
        configurators.set(
            ROOT,
            wrapConfigurator(configurator, setRootConfiguratorWithLock)
        );
        clearAlImplementations();
    }
}

function hasOwnProperty(object: unknown, propName: string): boolean {
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
function loadMultipleConfigs(configPaths: Array<string>): Configuration {
    let config: Configuration = { ...defaultConfig };
    const rootConfigurator: Configurator = configurators.get(ROOT);
    if (rootConfigurator) {
        config = rootConfigurator(config);
    }
    for (const path of configPaths) {
        const configurator: Configurator = configurators.get(path);
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
function getConfigPaths(loggerName: string): Array<string> {
    const [firstComponent, ...components] = splitLoggerName(loggerName);
    const paths: Array<string> = new Array(components.length);
    paths[0] = firstComponent;
    let parent: string = firstComponent;
    for (let i = 0; i < components.length; i++) {
        const newPath: string = buildLoggerName(parent, components[i]);
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
function splitLoggerName(loggerName: string): Array<string> {
    return loggerName.split("/");
}

function buildLoggerName(...parts: Array<string>): string {
    return parts.join("/");
}

/**
 * Return an error object which uses the given error as a prototype, but inherits all of it's
 * enumerable properties as own properties, and replaces the stack property with the given value.
 * Or, failing to do that, returns the original error as is. Doesn't modify the original error,
 * regardless.
 * @param error
 * @param stack
 */
function overrideStack(error: Error, stack: unknown): Error {
    try {
        const descriptors: Record<string, PropertyDescriptor> = {};
        for (const propName in error) {
            descriptors[propName] = {
                get: () => error[propName]
            };
        }
        descriptors.stack = {
            value: stack
        };
        return Object.create(error, descriptors);
    } catch (whoops) {
        return error;
    }
}

/**
 * Split a stack string into two parts: the first line (the "header") and the rest.
 */
function splitStack(stack: string): [string, string] {
    const [header, ...callStack] = stack.split(/\n/);
    return [header, callStack.join("\n")];
}

/**
 * Wrap a configurator so that if it throws an error the stack is more useful.
 * @param configurator
 * @param nonUserCodeEntryPoint
 */
function wrapConfigurator(
    configurator: Configurator,
    nonUserCodeEntryPoint: (...unknown) => unknown
): WrappedConfigurator {
    if (!configurator) {
        return null;
    }
    const sourceError: { stack?: string } = {};
    if (Error.captureStackTrace) {
        Error.captureStackTrace(sourceError, nonUserCodeEntryPoint);
    }
    const [, sourceStack] = splitStack(sourceError.stack || "");
    return Object.assign(
        (cfg: Configuration): Configuration => {
            try {
                return configurator(cfg);
            } catch (error) {
                if (typeof error.stack === "string") {
                    const [header, callStack] = splitStack(error.stack);
                    throw overrideStack(
                        error,
                        `${header}\n${sourceStack}\n  called:\n${callStack}`
                    );
                }
                throw error;
            }
        },
        { [Wrapped]: true } as { readonly [Wrapped]: true }
    );
}

/**
 * Reset all configuration using the given lock, if it's the current lock, or if
 * there is no lock.
 *
 * This is not used directly by clients of the module, tey would use {@link resetConfig},
 * or they would use the lock interface provided by {@link lock}
 * @private
 */
function resetConfigWithLock(key: Key): void {
    if (isKey(key)) {
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
function getConfig(loggerName: string): Configuration {
    const partialPaths = getConfigPaths(loggerName);
    return loadMultipleConfigs(partialPaths);
}

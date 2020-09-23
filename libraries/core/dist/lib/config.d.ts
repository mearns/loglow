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
declare type MiddlewareNext = (loggerName: string, logEntry: PreliminaryLogEntry) => void;
declare type Middleware = (loggerName: string, logEntry: PreliminaryLogEntry, next: MiddlewareNext) => void;
declare type Receiver = (entry: LogEntry) => void;
interface Configuration {
    enabled: boolean;
    middleware: Array<Middleware>;
    decorations: Array<unknown>;
    receiver: Receiver;
}
declare type Configurator = (previousConfig: Configuration) => Configuration;
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
export declare function lock(name?: string): Lock;
/**
 * This is _the_ logging interface to add log entries. It will get (or create) an implementation
 * for the specified logger (using {@link getImplementation}) and invoke it to generate the log entry or entries.
 */
export declare function log({ loggerName, message, metas }: {
    loggerName: string;
    message: string;
    metas: Array<unknown>;
}): void;
export declare function buildLoggerName(parts: Array<string>): string;
export {};

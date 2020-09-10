## Overview

Loggers have names, which are actually heirarchical paths, typically beginning with the package name or the package
scope and package name, and then usually refined by module and function names. Path heirarchies are delimited by
slashes, like "@loglow/core/config/loadConfig".

Logging configuration is specified by path and applies to all loggers which include that path as a prefix. For instance,
configuration set for "@loglow/core" will apply to a logger named "@loglow/core" and also to all loggers whose names start
with "@loglow/core/". Note that it only applies to full path prefixes, e.g., it would not apply to a logger named
"@loglow/coretastic". Additionally, a root configuration applies to all loggers.

Configuration is defined by configurators: functions that take a configuration object and return a configuration object.
All configurators that apply to a given logger are applied sequentially from shortest path to longest, starting with a
default configuration object to which the root configurator is applied. The resulting configuration is passed to the next
configurator, etc.

The resulting configuration object is called an _implementation_. It's created when a logger is needed and cached until
a configurator that applies to the implementation is changed.

A logger itself, the thing that is used for adding log entries, is mostly just a façade around some functions that load
the required _implementation_ and use it to generate the log-entry. Loggers are stateless; you can get one by name when you need it,
reuse or throw it away and get it back when you want it again. Because of the separation of loggers and implementations,
getting a logger is cheap.

## Config

Configuration for a given logger has four components:

-   Enabled / Disabled
-   Decorators
-   Middleware
-   Receivers

### Enabled / Disabled

This is the master switch for a logger. Loggers are disabled by default and need to be enabled for them to do anything. If
a logger is disabled, all calls to it are simply no-ops.

### Decorators

A **decorator** is function that returns a set of metadata that gets added to all log entries for a logger.

### Middleware

**Middleware** is a log-entry transformer, as described below. Middleware is very powerful and very general. In fact, most
of the other aspects of configuration are actually implemented as middleware. Middleware can not only transform the data in a single
log entry, but also filter out log entries, split one log entry into multiple, and perform side effects.

It is important to keep in mind that middleware is called synchronously on every log (assuming the logger is enabled). Further, middleware
is configured as a chain, so one middleware function may be one of several that get applied. Adding milliseconds to every log call is
probably not a good idea.

#### Receivers

The **receiver** is the ultimate destination for every log entry, at least as far as the logging library is concerned. The receiver will
do things like write the entry to console or file system, ship it to a log aggregation system, etc.

Every enabled logger has to have exactly one receiver configured. If you have multiple destinations you want a log entry to go to, you
can use one receiver function that delegates to multiple other functions, but it is up to you to implement this.

Receivers are the only part of the logging pipeline that can be asynchronous. If the receiver returns a promise, subsequent calls to the
receiver are queued up behind that promise to ensure that logs can be handled in order.

If your receiver can handle some amount of parallelization, this can be done by having a stateful receiver that keeps track of all pending work, but it is up
to your app to ensure the receiver has finished everything before exiting.

## Log Entries, Decorators, Receivers, and Middleware

This section describes the core concepts associated with writing logs. The basic flow for writing a log is as follows:

1. Call your logger to intiate a log entry. You specify a message and optional metadata; a timestamp is added automatically.
2. Decorators are applied to add additional metadata to the log entry.
3. Middleware is invoked as a chain to transform the log entry.
4. The configured Receiver for the logger is invoked with the finalized log entry.

A call to initiate a log entry looks like this:

```typescript
function logger(message: string, ...meta: Array<unknown>): void;
```

Note that the `meta` parameter is variadic: you can pass in any number of arguments of any type
following the initial `message` parameter.

This produces a log entry with the following format:

```typescript
interface LogEntry {
    date: Date;
    message: string;
    metadata: unknown;
}
```

Upon creation, the initial log entry has its `metadata` property set to the _array_ of variadic
`meta` arguments arguments passed into the logger.

Note that if the logger is not enabled, the log entry is not created and the call to logger returns (almost) immediately without doing anything.

After the initial log entry is created, any decorators configured for the logger are invoked
and their return values are appended to the end of the `metadata` array. Note that decorators must
return synchronously.

The next step is to apply any configured middleware for the logger. A middleware is simply a function with the following signature:

```typescript
type middleware(loggerName: string, logEntry: LogEntry, next: (logEntry: LogEntry) => void): void;
```

The first middleware function is invoked with the name of the logger and the initial log entry after decorators are applied.
The third argument is a function that encapsulates invoking the next middleware in the chain,
if any. The middleware is responsible for passing the desired log entry to this function in order
to get it processed. If the middleware doesn't invoke the given `next` function with a log entry,
_the log entry will be dropped_. This is how middleware can be used to filter out log entries based
on their contents (if you want to drop everything for a logger, it's usually preferable to just
disable it). Alternatively, the middleware can invoke `next` multiple times to generate multiple log
entries from one. The most common use case for middleware is to transform the log entry before passing it on.

Note that the `next` function is only valid until the middleware function returns. If you call it
again after that, it will throw an error. This is to prevent middleware from attempting to do
asynchronous transformations which could cause logs to be processed out of order.

Also note that it is not specified whether `next` will actually cause the next middleware to be
invoked as part of the same callstack or if it will queue up the call(s) to be made after the
current middleware returns. Middleware should not depend on either of these possibilities (e.g.,
do not assume your middleware can catch errors thrown by subsequent middleware).

The final middleware function is invoked with a `next` argument which encapsulates passing the log
entry to the configured `receiver`. This is entirely transparent to the middleware, it doesn't know (nor should it care)
if the it is the last middleware function or not, whether `next` is going to be for another middleware
function, or for the receiver.

## Usage Patterns

We divide logging users into two categories: leaders and contributors. Contributors can get loggers, use them, and even decorate
them, but cannot enable or disable them, configure middleware, or configure receivers. Leaders can configure any loggers
in any way.

Libraries are almost always contributors, where as a top-level application would be the leader. Initially, there is no leader;
anyone can configure any logger however they please. To become the leader, a module just needs to ask for the lock. As long as something
else hasn't already taken the lock, that module will receive it and become the leader. Once the lock is acquired, that module becomes
the leader, with exclusive access to full configuration.

Libraries will generally get, decorate, and use loggers, but not do any additional logging configuration, where as the top-level
application performs configuration of all loggers to control what logs get written out to the final destination and how.

The top-level code contains the entry point for the application and is therefore uniquely positioned to be the first to get the lock,
just in case an included module trys to do that same. If anything but the lock holder tries to get a lock or configure logging, its
simply a no-op.

After acquiring the lock, the leader will configure logging at startup for whatever loggers they care to configure. This is typically
done at load time for the top-level entrypoint of the application, before any other modules are loaded so that the configuration is
in place before any loggers are used.

Since contributors don't really know what situation they're being used in, they don't have a reason to configure most aspects of logging.
One aspect of configuration that is useful for contributors is decorating loggers. Adding a package version, for instance, could be
useful. Single threaded code might also decorate its logger with a unique identifier so that logs can be correlated together into a
coherent story.

For re-entrant and asynchronous code, decorating one logger for the entire module may not be appropriate since the logs entries from
different stories would be interleaved. One strategy to deal with this involves generating a unique identifier for each such story
(if there isn't already an intrinsic identifier for the story), and passing it through to all subsequent functions. This isn't ideal,
but something like https://nodejs.org/api/async_hooks.html#async_hooks_class_asynclocalstorage should help hen it's available.
The unique story identifier is sufficient for correlating logs together. If you want to decorate those logs with common data, you
can use a logger whose name includes the story identifier, and decorate that.

### Decorating Pro Patterns

Correlating logs together in a coherent story is a good thing. Adding the same metadata to every log in a story is redundant.
In many cases, it's all you have. A better pattern, where possible, is to have a log collector that ties together your log entries
based on a defined story identifier as described above. Once assembled into a story, you only need the redundant metadata in a single
log entry.

## Log Levels

Surprise! There are none. We've come to the conclusion that log levels aren't a great pattern. It's usually better to have static
log messages which are clarified with dynamic metadata, and add a middleware filter to include only those specific log messages
you actually care about. Trying to decide in advance on where a given log entry fits on a linear scale of utility tends to be
fraught with errors, leading to either overly noisy logging or ineffectively sparse logging.

But old habbits die hard, and we can't pretend that log levels are never going to be useful. The easiest approach is to simply
add a pre-defined metadata field to every entry defining its level. A middleware function can then filter out entries based on
this field.

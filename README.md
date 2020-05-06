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
the required implementation and use it to generate the entry. Loggers are stateless; you can get one by name when you need it,
reuse or throw it away and get it back when you want it again. Because of the separation of loggers and implementations,
getting a logger is cheap.

## Usage Patterns

Libraries should typically get the loggers they want by name, but not do any configuration. An application will set the configuration
at startup for whatever loggers they care to configure. This is typically done at load time for the top-level entrypoint of the
application, before any other modules are loaded so that the configuration is in place before any loggers are used. For good measure,
the application can get an exclusive configuration lock which will prevent any other code from configuring logging.

## Configuration Concepts

### Logger Middleware

Middleware is used to transform log entries before they are actually added to the log. For each log entry, the configured
middleware layers are invoked in a chain: the first is invoked with the log entry and a function for continuing the chain.
The middleware is responsible for invoking the next layer with a log entry; typically one derived from the one that was passed
in. Or, it can filter out the log entry by invoking the provided `terminate` hook.

Common use cases include:

-   Filters that exclude log entries from being added to the log based on their contents.
-   Decorators that add fixed metadata to every log entry.
-   Log rewriters to catch logs you don't have control over (e.g., from a third-party library) and transforming them into
    something more useful to you.

### Metadata Transformers

It is often convenient to allow raw values, as opposed to dictionary objects, to be passed as metadata arguments. For instance,
it is common to pass an Error object as metadata from within an error handler. It would be needlessly verbose to require the
calling code to wrap this in something like `{ error }` just to get it logged. However, certain objects do not log well natively.
Errors are a notable example; when you JSON-ify an Error object by default, you end up with an empty object literal: `{}`. This
is because the default implementation doesn't include the three most useful properties of an Error: the name, message, or stack.
A metadata transformer can look for Error objects passed in the meta arguments and transform it into something more useful.
Similarly, Set and Map objects do not natively JSON-ify in very useful ways.

A log configuration can have any number of metadata transformers configured for it. For each metadata value applied, they are invoked
sequentially to transform the value into something useful.

### Metadata Reducer

The log function can be invoked with an arbitrary number of metadata values; in order to generate a log entry, these need to
be collapsed into a single metadata value. This is the job of the metadata reducer. A config can only have a single reducer do to the
nature of it's job.

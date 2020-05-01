# witness

## Conceptual Overview

A witness takes note of what's happening inside an app (or a library, or just part of a library). When something happens
they record it as an event taking place. With witnesses recording sufficient information, you can _aggregate_ those
events into a detailed picture of what happened.

To be more concrete about it, your witnesses will record:

1. Log statements (with arbitrary data) to create custom trails of breadcrumbs to help you piece together the execution.
2. Application events, such as user interactions, network requests, task completion, etc: whatever events you want to
   care about.
3. Named values to record specific data about the apps execution, like the value of an input parameter or the results
   of some task.
4. Stateful values, like counters, gauges, timers, etc. These are just special wrappers around named values that let you
   more easily record things like the number of requests received or how long a particular task took to execute.

All of these items are recorded as records in a conceptual timeline and _aggregated_ at various times and various ways to _report_
what's happening (or what happened) in your app.

For batch processing apps that start up, perform a task, and then exit
(e.g., an AWS Lambda function); a common style of reporting is to simply store the timeline in memory and then dump a
relevant summary immediately before the app exits, giving a single report for the entire task rather that a stream of
individual log messages to piece together.

For long-running apps, you might want to log out each timeline record as it occurs to get a live stream of what's going on,
or create a summary of the latest items periodically, for instance.

### Records

Each entry in the timeline is a Record with the following properties:

-   **timestamp**: The millisecond resolution timestamp that the entry was recorded.
-   **name**: Filtering and other rules for Records are most frequently applied by matching a prefix of the name. As noted below,
    records created in dependencies will have a prefix automatically applied to their names (unless your app configures them otherwise)
    so rules can easily target every record from a specific dependency, or every record _not_ created by your main app.
-   **witness**: The full name of the Witness that recorded it. Rules can target records by the Witness's heirarchical name.
-   **data**: Arbitrary data submitted with the event. For named values, this will include the current value. For stateful values,
    it may include the previous value and a description of the change that was made, for instance. For log statements, it will
    include the main log message and any additional data provided with it.

### Witnesses

Every app has a **Witness Master**, which is associated with the first Witness to be created (typically in the entry-point
of the app so that the app controls all Witnesses). The Master has full configuration priviliges for all Witnesses in the
execution environment, including those created by dependencies.

Each Witness has a name defining its hierarchical place in the world. Configuration is inherited down the heirarchy with
overrides at any level and includes things like filtering of which items are even recorded and which of those items are
included in various reports. In this way, the Master can, for instance, filter out an entire tree of Witnesses by configuring
the root Witness of the tree, rather than having to know each Witness beneath it.

Every Witness has an associated **Root Witness** named by the first component in the heirarchy. For instance, a Witness named
"foo/bar/baz" has as it's Root the Witness named "foo". By convention, every package (app or library) will use it's full
package name as the name of the Root. Note that the Root Witness does not actually have to be created, it's existance is implied
by the existance of any Witness that has it as a Root.

A Witness's **Relative Name** is simply it's name without the Root component.

Every Root Witness has a **Name Prefix** defined for it. The Master is able to configure this Prefix for each Root; by default
only the Root associated with the Master has an empty Prefix, and all other Roots use their name as a Prefix. When events
are recorded in the timeline, the name of the event is _always_ prefixed with the Prefix of the Root associated with the recording
Witness. In this way, Witnesses created dependencies will have their events naturally namespaced under their Root's name, and only
the master (i.e., the top-level app) can override this prefix to allow them to break out of this namespace if desired.

### Record Names

When a Record is created, a **Base Name** is specified for it. This Base Name is combined with the Prefix of the Witness's Root
and optionally the Relative Name of the Witness to get the actual name of the Record in the timeline. If the Base Name is specified
with a leading ":", then the Relative Name of the Witness is prepended to it. In either case, the associated Root Prefix is further
prepended to produce the full name of the record.

For instance, assume the Root "foo" is configured with a non-default prefix of "ABC", then when Witness "foo/bar/baz" records a
Record with Base Name "trot:wonder:fun", it will be recorded with the full name "ABC/trot:wonder:fun". If the same Witness creates a Record with
Base Name ":thunder:woot:gar", it will be recorded with the full name "ABC/bar:baz:thunder:woot:gar". In this way, child Witnesses can automatically
namespace their record base names beyond just that provided by their Root's prefix.

Note that a Base Name cannot contain the "/" character so that events are not inadvertantly placed under another Prefix.

The Master (and only the master) can configure Roots to have a null prefix, in which case there is no "/" present in the Record's full name. This is
also why a auto-namespaced basename has the relative name components of the Witness joined with ":" instead of the typical "/", otherwise a
child Witness of a Root with a null Prefix would end up prefixed anyway.

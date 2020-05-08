export type LogEntryHandler = (
    date: Date,
    loggerName: string,
    message: string,
    metadata: object
) => void;

export type LogFunction = (message: string, ...metas: object) => void;

export default function getLogger(loggerName: string): LogFunction;

import { log as logImpl } from "./config";

export type LogEntryHandler = (
    date: Date,
    loggerName: string,
    message: string,
    metadata: Record<string, unknown>
) => void;

export type LogFunction = (
    message: string,
    ...metas: Array<Record<string, unknown>>
) => void;

export default function getLogger(loggerName: string): LogFunction {
    const log: LogFunction = (message, ...metas) =>
        logImpl({ loggerName, message, metas });
    return log;
}

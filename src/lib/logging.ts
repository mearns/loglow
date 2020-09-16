/**
 * This is the client portion of the system.
 */
import { log as logImpl } from "./config";

export type LogEntryHandler = (
    date: Date,
    loggerName: string,
    message: string,
    metadata: Record<string, unknown>
) => void;

export type LogFunction = (message: string, ...metas: Array<unknown>) => void;

export default function getLogger(loggerName: string): LogFunction {
    return (message, ...metas) => logImpl({ loggerName, message, metas });
}

import { log as logImpl, buildLoggerName } from "./config";

export type LogFunction = (message: string, ...metas: Array<unknown>) => void;

export function getLogger(...loggerNames: Array<string>): LogFunction {
    const loggerName = buildLoggerName(loggerNames);
    return (message, ...metas) => logImpl({ loggerName, message, metas });
}

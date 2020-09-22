export declare type LogFunction = (
    message: string,
    ...metas: Array<unknown>
) => void;

export default function getLogger(...loggerNames: Array<string>): LogFunction;

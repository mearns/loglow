export declare type LogFunction = (message: string, ...metas: Array<unknown>) => void;
export declare function getLogger(...loggerNames: Array<string>): LogFunction;

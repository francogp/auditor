import { ObjectLiteralExpression, SourceFile } from "ts-morph";
export declare function deepMergeMissingJson(target: Record<string, unknown>, missing: Record<string, unknown>): boolean;
export declare function appendMissingSectionsToJsonFile(configFilePath: string, sectionsToInsert: Record<string, Record<string, unknown>>): void;
export declare function findTargetAuditConfigObject(sourceFile: SourceFile): ObjectLiteralExpression | undefined;
export declare function mutateAuditConfigFileAst(configFilePath: string, mutator: (targetObj: ObjectLiteralExpression, sourceFile: SourceFile) => boolean): boolean;
export declare function syncAuditorVersionInTsFile(configFilePath: string, version: string): boolean;
export declare function appendMissingSectionsToConfigFile(configFilePath: string, sectionsToInsert: Record<string, Record<string, unknown>>): void;
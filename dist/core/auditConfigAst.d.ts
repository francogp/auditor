import { deduplicateObjectLiteralProperties, findTargetAuditConfigObject, getNormalizedPropName, syncArrayElementsWithTsMorph, syncMissingPropsWithTsMorph, valueToTsMorphInitializer } from "./auditConfigAstMutation.js";
import { appendMissingSectionsToJsonFile, deepMergeMissingJson } from "./auditConfigJson.js";
import { ObjectLiteralExpression, SourceFile } from "ts-morph";
export declare function mutateAuditConfigFileAst(configFilePath: string, mutator: (targetObj: ObjectLiteralExpression, sourceFile: SourceFile) => boolean): boolean;
export declare function syncAuditorVersionInTsFile(configFilePath: string, version: string): boolean;
export declare function appendMissingSectionsToConfigFile(configFilePath: string, sectionsToInsert: Record<string, Record<string, unknown>>): void;
export { appendMissingSectionsToJsonFile, deduplicateObjectLiteralProperties, deepMergeMissingJson, findTargetAuditConfigObject, getNormalizedPropName, syncArrayElementsWithTsMorph, syncMissingPropsWithTsMorph, valueToTsMorphInitializer };
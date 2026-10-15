import { RuleDescriptor, Violation } from "./auditRuleTypes.js";
import "../suites/architecture/audit_rules.js";
//#region src/analyzers/doxAnalyzer.d.ts
export declare const DOX_ANALYZER_DESCRIPTOR: RuleDescriptor;
export declare function validateDoxSectionStructure(agentsPath: string, rootDir: string, content: string): Violation[];
export declare function checkDoxIntegrity(rootDir: string, ignoreDirs: ReadonlySet<string>): Promise<Violation[]>;
//#endregion
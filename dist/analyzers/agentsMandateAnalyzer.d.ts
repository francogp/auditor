import { DocumentationLanguage } from "../core/auditConfigTypes.js";
//#region src/analyzers/agentsMandateAnalyzer.d.ts
/**
 * Splits markdown content into structural contract sections / paragraph chunks,
 * properly respecting bullet lists and whitespace.
 */
export declare function extractContractSections(content: string): readonly string[];
/**
 * Checks whether text satisfies the expected documentation language constraint.
 */
export declare function matchesMandateLanguage(text: string, expectedLanguage: DocumentationLanguage | undefined, englishTokens: RegExp, spanishTokens: RegExp): boolean;
export interface InjectMandateOptions {
  agentsMdPath: string;
  content: string;
  canonicalSnippet: string;
  isExistingLine: (line: string) => boolean;
}
/**
 * Injects or updates a canonical mandate under `## Local Contracts` in AGENTS.md in-place,
 * guaranteeing zero duplicate lines on repeated executions.
 */
export declare function injectOrUpdateMandateInAgentsMd(options: InjectMandateOptions): void;
/**
 * Finds the 1-indexed line number of the `## Local Contracts` header in AGENTS.md content.
 */
export declare function findLocalContractsHeaderLine(content: string): number;
//#endregion
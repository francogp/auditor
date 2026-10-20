import { AuditFinding } from "../../core/auditContract.js";
import { BaseAuditor } from "../../core/auditorBase.js";
//#region src/suites/architecture/validate_package_hygiene.d.ts
export declare const PACKAGE_HYGIENE_RULES: readonly ["package-unused-dependency", "package-unlisted-dependency", "package-unused-binary", "package-lockfile-integrity"];
export type PackageHygieneRuleId = (typeof PACKAGE_HYGIENE_RULES)[number];
export interface KnipIssueItem {
  readonly name: string;
  readonly line?: number;
  readonly col?: number;
  readonly pos?: number;
}
export interface KnipFileIssues {
  readonly file: string;
  readonly dependencies?: readonly KnipIssueItem[];
  readonly devDependencies?: readonly KnipIssueItem[];
  readonly optionalPeerDependencies?: readonly KnipIssueItem[];
  readonly unlisted?: readonly KnipIssueItem[];
  readonly binaries?: readonly KnipIssueItem[];
  readonly unresolved?: readonly KnipIssueItem[];
}
export interface KnipReport {
  readonly issues?: readonly KnipFileIssues[];
}
export declare function extractReferencedScriptDependencies(projectRoot: string): Set<string>;
export declare function extractOwnPackageBinaries(projectRoot: string): Set<string>;
/**
 * Parses raw JSON output from Knip into canonical AuditFindings.
 */
export declare function parseKnipIssues(report: KnipReport | readonly KnipFileIssues[], projectRoot?: string, isPathIgnored?: (relPath: string) => boolean): AuditFinding[];
/**
 * Validates package-lock.json integrity, version standards, and absence of insecure HTTP registries.
 */
export declare function verifyLockfileIntegrity(projectRoot: string, isFixMode?: boolean): AuditFinding[];
export declare class ValidatePackageHygieneAuditor extends BaseAuditor<PackageHygieneRuleId> {
  constructor(options?: {
    projectRoot?: string;
    fix?: boolean;
  });
  runAudit(): Promise<void>;
  private resolveFallowIgnoredDependencies;
  private resolveImplicitCoverageDependencies;
  private hasVitePlusDependencyOrConfig;
  private buildEphemeralKnipConfig;
  private executeKnip;
}
/**
 * Detects whether the host root `tsconfig.json` declares project `references`.
 * Parsed with the TypeScript JSONC reader (no regex) so comments and trailing commas are tolerated.
 */
export declare function tsconfigHasReferences(projectRoot: string): boolean;
//#endregion
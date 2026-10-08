/**
 * packages/auditor/src/cli/auditScanner.ts
 *
 * AUDITOR SCANNER & AUTO-DISCOVERY ENGINE (Node.js 26+)
 * Scans packages/auditor/src/suites/ recursively and loads host extensions from audit.config.ts,
 * infers families, generates canonical task definitions, and guarantees that ZERO auditors
 * are ever left behind from the orchestrator.
 */
import { type AuditTaskDefinition, type AuditorCapabilities, type GitIgnoreRequirement, type AuditorPackageScriptRequirement } from '../core/auditContract.ts';
import { loadAuditConfig } from '../core/auditConfig.ts';
export declare const AUDIT_PRESETS: Record<string, readonly string[]>;
export type AuditPresetName = 'lint' | 'md' | 'build' | (string & {});
export { type DiscoveryOptions, getTimeoutForTask, DEFAULT_PERMISSIONS, getPermissionsForTask, formatTaskTitle, shouldSkipTaskByFilters, shouldSkipTaskByCapabilities, buildTaskCliArguments, createAuditTaskDefinition } from './auditTaskFactory.ts';
import { type DiscoveryOptions } from './auditTaskFactory.ts';
export { type ExtractedAuditorMetadata, extractStaticMetadataFromFile, extractAuditorMetadataFromFile } from './auditorMetadata.ts';
export declare function extractCapabilitiesFromFile(fullPath: string): Promise<AuditorCapabilities>;
export declare function extractGitIgnoreRequirementsFromFile(fullPath: string): Promise<readonly GitIgnoreRequirement[]>;
export declare function discoverAuditors(options?: DiscoveryOptions): Promise<AuditTaskDefinition[]>;
/**
 * Dynamically collects gitignore requirements from all discovered subauditors,
 * registered extensions, and audit.config.ts, guaranteeing that zero rules are hardcoded.
 */
export declare function collectAllGitIgnoreRequirements(projectRoot?: string, config?: Awaited<ReturnType<typeof loadAuditConfig>>): Promise<GitIgnoreRequirement[]>;
/**
 * Dynamically collects package.json script requirements from all discovered subauditors,
 * registered extensions, and audit.config.ts, collecting unique script names in a Set
 * to prevent duplicates when multiple auditors share or expose the same command.
 */
export declare function collectAllPackageScriptRequirements(projectRoot?: string, config?: Awaited<ReturnType<typeof loadAuditConfig>>): Promise<readonly AuditorPackageScriptRequirement[]>;
//# sourceMappingURL=auditScanner.d.ts.map
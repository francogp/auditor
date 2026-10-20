import { loadAuditConfig } from "../core/auditConfigLoader.js";
import { AuditTaskDefinition, AuditorCapabilities, AuditorPackageScriptRequirement, GitIgnoreRequirement } from "../core/auditContract.js";
import { DEFAULT_PERMISSIONS } from "../core/permissionGuard.js";
import { isSimilarCodeSkipped } from "../suites/architecture/validate_similar_code.js";
import { DiscoveryOptions, buildTaskCliArguments, createAuditTaskDefinition, formatTaskTitle, getPermissionsForTask, getTimeoutForTask, shouldSkipTaskByCapabilities, shouldSkipTaskByFilters } from "./auditTaskFactory.js";
import { ExtractedAuditorMetadata, extractAuditorMetadataFromFile, extractStaticMetadataFromFile } from "./auditorMetadata.js";
//#region src/cli/auditScanner.d.ts
export declare const AUDIT_PRESETS: Record<string, readonly string[]>;
export type AuditPresetName = 'lint' | 'full' | 'precommit' | 'md' | 'post-build' | 'build' | 'critical' | (string & {});
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
//#endregion
export { DEFAULT_PERMISSIONS, type DiscoveryOptions, type ExtractedAuditorMetadata, buildTaskCliArguments, createAuditTaskDefinition, extractAuditorMetadataFromFile, extractStaticMetadataFromFile, formatTaskTitle, getPermissionsForTask, getTimeoutForTask, isSimilarCodeSkipped, shouldSkipTaskByCapabilities, shouldSkipTaskByFilters };
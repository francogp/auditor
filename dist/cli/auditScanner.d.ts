/**
 * packages/auditor/src/cli/auditScanner.ts
 *
 * AUDITOR SCANNER & AUTO-DISCOVERY ENGINE (Node.js 26+)
 * Scans packages/auditor/src/suites/ recursively and loads host extensions from audit.config.ts,
 * infers families, generates canonical task definitions, and guarantees that ZERO auditors
 * are ever left behind from the orchestrator.
 */
import { type AuditTaskDefinition, type AuditorCapabilities, type GitIgnoreRequirement, type AuditorManifestDTO } from '../core/auditContract.ts';
import { loadAuditConfig } from '../core/auditConfig.ts';
export declare const AUDIT_PRESETS: Record<string, readonly string[]>;
export type AuditPresetName = 'lint' | 'md' | 'build' | (string & {});
export interface DiscoveryOptions {
    baseDir?: string;
    projectRoot?: string;
    family?: string;
    task?: string;
    suites?: string[];
    preset?: string;
    fastOnly?: boolean;
    skipSimilar?: boolean;
    fixOnly?: boolean;
    lintOnly?: boolean;
    mdOnly?: boolean;
    buildOnly?: boolean;
    withBuild?: boolean;
    includeHeavy?: boolean;
}
export interface ExtractedAuditorMetadata {
    readonly capabilities: AuditorCapabilities;
    readonly gitIgnoreEntries: readonly GitIgnoreRequirement[];
    readonly icon?: string;
    readonly manifest?: AuditorManifestDTO;
    readonly description?: string;
    readonly ruleDescriptions?: Readonly<Record<string, string>>;
    readonly configKey?: string;
}
export declare function extractAuditorMetadataFromFile(fullPath: string): Promise<ExtractedAuditorMetadata>;
export declare function extractCapabilitiesFromFile(fullPath: string): Promise<AuditorCapabilities>;
export declare function extractGitIgnoreRequirementsFromFile(fullPath: string): Promise<readonly GitIgnoreRequirement[]>;
export declare function discoverAuditors(options?: DiscoveryOptions): Promise<AuditTaskDefinition[]>;
/**
 * Dynamically collects gitignore requirements from all discovered subauditors,
 * registered extensions, and audit.config.ts, guaranteeing that zero rules are hardcoded.
 */
export declare function collectAllGitIgnoreRequirements(projectRoot?: string, config?: Awaited<ReturnType<typeof loadAuditConfig>>): Promise<GitIgnoreRequirement[]>;
//# sourceMappingURL=auditScanner.d.ts.map
/**
 * packages/auditor/src/cli/auditorMetadata.ts
 *
 * Dedicated metadata extractor for auditor suites and tasks.
 */
import { type AuditorCapabilities, type GitIgnoreRequirement, type AuditorPackageScriptRequirement, type AuditorManifestDTO } from '../core/auditContract.ts';
export interface ExtractedAuditorMetadata {
    readonly capabilities: AuditorCapabilities;
    readonly gitIgnoreEntries: readonly GitIgnoreRequirement[];
    readonly scripts?: readonly AuditorPackageScriptRequirement[];
    readonly icon?: string;
    readonly manifest?: AuditorManifestDTO;
    readonly description?: string;
    readonly ruleDescriptions?: Readonly<Record<string, string>>;
    readonly configKey?: string;
    readonly defaultConfig?: Readonly<Record<string, unknown>>;
}
export declare function extractStaticMetadataFromFile(fullPath: string): ExtractedAuditorMetadata;
export declare function extractAuditorMetadataFromFile(fullPath: string): Promise<ExtractedAuditorMetadata>;
//# sourceMappingURL=auditorMetadata.d.ts.map
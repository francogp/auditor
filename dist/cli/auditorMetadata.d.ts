import { AuditorCapabilities, AuditorCriticalConfig, AuditorManifestDTO, AuditorPackageScriptRequirement, GitIgnoreRequirement } from "../core/auditContract.js";
export interface ExtractedAuditorMetadata {
  readonly capabilities: AuditorCapabilities;
  readonly ruleCapabilities?: Readonly<Record<string, AuditorCapabilities>>;
  readonly gitIgnoreEntries: readonly GitIgnoreRequirement[];
  readonly defaultIgnoredDirs?: readonly string[];
  readonly defaultIgnoreGlobs?: readonly string[];
  readonly scripts?: readonly AuditorPackageScriptRequirement[];
  readonly icon?: string;
  readonly manifest?: AuditorManifestDTO;
  readonly description?: string;
  readonly ruleDescriptions?: Readonly<Record<string, string>>;
  readonly ruleRemediations?: Readonly<Record<string, string>>;
  readonly configKey?: string;
  readonly defaultConfig?: Readonly<Record<string, unknown>>;
  readonly criticalConfig?: AuditorCriticalConfig;
}
export declare function extractStaticMetadataFromFile(fullPath: string): ExtractedAuditorMetadata;
export declare function clearMetadataCache(): void;
export declare function extractAuditorMetadataFromFile(fullPath: string): Promise<ExtractedAuditorMetadata>;
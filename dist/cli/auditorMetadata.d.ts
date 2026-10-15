import { AuditorCapabilities, AuditorCriticalConfig, AuditorManifestDTO, AuditorPackageScriptRequirement, GitIgnoreRequirement } from "../core/auditContract.js";
//#region src/cli/auditorMetadata.d.ts
export interface ExtractedAuditorMetadata {
  readonly capabilities: AuditorCapabilities;
  readonly ruleCapabilities?: Readonly<Record<string, AuditorCapabilities>>;
  readonly gitIgnoreEntries: readonly GitIgnoreRequirement[];
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
export declare function extractAuditorMetadataFromFile(fullPath: string): Promise<ExtractedAuditorMetadata>;
//#endregion
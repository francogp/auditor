import { AuditFamily, AuditorConfigFileRequirement, AuditorPackageScriptRequirement, GitIgnoreRequirement } from "../core/auditContract.js";
import { BaseAuditor } from "../core/auditorBase.js";
//#region src/plugin/defineAuditorExtension.d.ts
export interface AuditorExtensionDefinition {
  readonly id: string;
  readonly name: string;
  readonly family: AuditFamily;
  readonly description?: string;
  readonly scripts?: readonly AuditorPackageScriptRequirement[];
  readonly auditorClass?: new () => BaseAuditor<string>;
  readonly factory?: () => BaseAuditor<string>;
  readonly scriptPath?: string;
  readonly fast?: boolean;
  readonly timeoutMs?: number;
  readonly order?: number;
  readonly requiresAst?: boolean;
  readonly gitIgnoreEntries?: readonly GitIgnoreRequirement[];
  readonly configFiles?: readonly AuditorConfigFileRequirement[];
}
export declare function defineAuditorExtension(definition: AuditorExtensionDefinition): AuditorExtensionDefinition;
//#endregion
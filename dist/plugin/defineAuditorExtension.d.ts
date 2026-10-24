import { AuditFamily, AuditorConfigFileRequirement, AuditorPackageScriptRequirement, GitIgnoreRequirement } from "../core/auditContract.js";
import { BaseAuditor } from "../core/auditorBase.js";
export interface AuditorExtensionDefinition {
  readonly id: string;
  readonly name: string;
  readonly family: AuditFamily;
  readonly description?: string;
  readonly scripts?: readonly AuditorPackageScriptRequirement[];
  readonly auditorClass?: new () => BaseAuditor;
  readonly factory?: () => BaseAuditor;
  readonly scriptPath?: string;
  readonly fast?: boolean;
  readonly timeoutMs?: number;
  readonly order?: number;
  readonly requiresAst?: boolean;
  readonly gitIgnoreEntries?: readonly GitIgnoreRequirement[];
  readonly configFiles?: readonly AuditorConfigFileRequirement[];
}
export declare function defineAuditorExtension(definition: AuditorExtensionDefinition): AuditorExtensionDefinition;
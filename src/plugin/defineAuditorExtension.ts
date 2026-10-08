/**
 * packages/auditor/src/plugin/defineAuditorExtension.ts
 *
 * AUDITOR EXTENSION PROTOCOL (Node.js 26+)
 * Contract and helper functions for defining and registering project-specific audit extensions.
 */

import type {
  AuditFamily,
  AuditorConfigFileRequirement,
  GitIgnoreRequirement,
  AuditorPackageScriptRequirement
} from '../core/auditContract.ts';
import type { BaseAuditor } from '../core/auditorBase.ts';
import { PackageScriptRegistry } from '../core/packageScriptRegistry.ts';

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

export function defineAuditorExtension(definition: AuditorExtensionDefinition): AuditorExtensionDefinition {
  if (!definition.id) {
    throw new Error('Auditor extension must define an id');
  }
  if (!definition.auditorClass && !definition.factory && (!definition.scripts || definition.scripts.length === 0)) {
    throw new Error(
      `Auditor extension [${definition.id}] must define a mandatory 'scripts' contract exposing how it is executed via CLI / package.json.`
    );
  }
  if (definition.scripts && definition.scripts.length > 0) {
    PackageScriptRegistry.registerMany(definition.scripts, definition.id);
  }
  return definition;
}

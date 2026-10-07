/**
 * packages/auditor/src/plugin/defineAuditorExtension.ts
 *
 * AUDITOR EXTENSION PROTOCOL (Node.js 26+)
 * Contract and helper functions for defining and registering project-specific audit extensions.
 */
import type { AuditFamily, AuditorConfigFileRequirement, GitIgnoreRequirement } from '../core/auditContract.ts';
import type { BaseAuditor } from '../core/auditorBase.ts';
export interface AuditorExtensionDefinition {
    readonly id: string;
    readonly name: string;
    readonly family: AuditFamily;
    readonly description?: string;
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
//# sourceMappingURL=defineAuditorExtension.d.ts.map
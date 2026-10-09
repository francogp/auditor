/**
 * src/suites/architecture/validate_auditor_hygiene.ts
 *
 * AUDITOR ARCHITECTURE & HOMEBREW HYGIENE VALIDATOR (Node.js 26+ Native)
 *
 * Scans all official auditor suites, analyzers, and host project extensions,
 * validating that they leverage the unified core framework abstractions
 * (getPackageJson, AuditedDocument, scannerUtils, safePath, SharedAstContext,
 * auditTestPredicates, auditProjectIdentity) and eliminate homebrew anti-patterns.
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
import { AUDITOR_HOMEBREW_RULES, type AuditorHomebrewRuleId } from '../../analyzers/homebrew/index.ts';
export { AUDITOR_HOMEBREW_RULES, type AuditorHomebrewRuleId };
export declare class AuditorHygieneAuditor extends BaseAuditor<AuditorHomebrewRuleId> {
    constructor(projectRoot?: string);
    private collectTargetFiles;
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_auditor_hygiene.d.ts.map
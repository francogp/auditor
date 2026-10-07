/**
 * scripts/auditors/documentation/validate_dox_integrity.ts
 *
 * DOX & AGENTS.md HIERARCHY AND INTEGRITY AUDITOR (Node.js 26+ Native)
 *
 * Enforces documentation governance and link integrity across all AGENTS.md files:
 *   1. Verifies that every code directory contains an AGENTS.md file.
 *   2. Verifies that child AGENTS.md files are registered in their nearest parent index.
 *   3. Enforces relative links (forbids absolute paths).
 *   4. Verifies target files exist on disk (no broken links).
 *   5. Forbids linking to git-ignored files (.gitignore).
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/documentation/validate_dox_integrity.ts
 *   npm run validate:dox-integrity
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
export type DoxRuleId = 'dox-missing-agents-md' | 'dox-unregistered-child' | 'dox-absolute-link' | 'dox-broken-link' | 'dox-gitignore-target' | 'dox-unindexed-file' | 'dox-missing-section' | 'dox-section-order' | 'dox-empty-section';
export declare const DOX_RULES: readonly DoxRuleId[];
export declare class DoxIntegrityAuditor extends BaseAuditor<DoxRuleId> {
    private readonly rootDir;
    constructor(rootDir?: string);
    runAudit(): Promise<void>;
}
//# sourceMappingURL=validate_dox_integrity.d.ts.map
/**
 * scripts/auditors/architecture/validate_error_suppression.ts
 *
 * ZERO ERROR SUPPRESSION AUDITOR (Node.js 26+ Native)
 *
 * Enforces the project's Zero Error Suppression Mandate (AGENTS.md):
 *   1. No Empty Catch Blocks (`no-empty-catch`):
 *      Forbids empty `catch {}` or `catch (err) {}` blocks that swallow exceptions silently.
 *   2. No Silent Promise Catch (`no-silent-promise-catch`):
 *      Forbids `.catch(() => {})`, `.catch(() => null)`, `.catch(() => undefined)`
 *      that discard promise rejections without re-throwing or logging.
 *   3. No Silent Mock Fallbacks (`no-silent-mock-fallbacks`):
 *      Forbids using schema fallback wrappers (such as `v.fallback(...)` in Valibot)
 *      that silently heal invalid data rather than failing loud at trust boundaries.
 *   4. Strict Catch Narrowing (`strict-catch-narrowing`):
 *      Requires explicit type narrowing (`if (err instanceof Error)`) before accessing
 *      `.message` or `.code` on caught exception objects.
 *
 * Escape Hatches:
 *   `// catch-ok: <reason>`, `// fallback-ok: <reason>`, `// error-ok: <reason>`
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_error_suppression.ts
 */
import { FileScanAuditor } from '../../core/auditorBase.ts';
export type ErrorSuppressionRuleId = 'no-empty-catch' | 'no-silent-promise-catch' | 'no-silent-mock-fallbacks' | 'strict-catch-narrowing';
export declare const ERROR_SUPPRESSION_RULES: readonly ErrorSuppressionRuleId[];
export declare class ErrorSuppressionAuditor extends FileScanAuditor<ErrorSuppressionRuleId> {
    constructor(roots?: readonly string[], projectRoot?: string);
    protected scanFile(relPath: string, content: string): void;
    private forEachNonCommentMatch;
    private auditEmptyCatch;
    private auditSilentPromiseCatch;
    private auditSchemaFallbacks;
    private auditCatchNarrowing;
}
//# sourceMappingURL=validate_error_suppression.d.ts.map
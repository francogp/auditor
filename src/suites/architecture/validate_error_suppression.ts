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

import { enableCompileCache } from 'node:module';
import { BaseAuditor,
  createUniformRemediationPhases, FileScanAuditor, createRuleCapabilities,
  resolveFileScanRoots, type FileScanRootsOptions } from '../../core/auditorBase.ts';
import { stripComments } from '../../core/scannerUtils.ts';

enableCompileCache();

export type ErrorSuppressionRuleId =
  | 'no-empty-catch'
  | 'no-silent-promise-catch'
  | 'no-silent-mock-fallbacks'
  | 'strict-catch-narrowing';

export const ERROR_SUPPRESSION_RULES: readonly ErrorSuppressionRuleId[] = [
  'no-empty-catch',
  'no-silent-promise-catch',
  'no-silent-mock-fallbacks',
  'strict-catch-narrowing'
] as const;

// Regex for empty catch: catch (...) { /* only spaces or comments */ }
const EMPTY_CATCH_REGEX = /catch\s*(?:\([^)]*\)\s*)?\{([^{}]*)\}/g;

// Regex for silent promise catches: .catch(() => {}) or .catch(() => null/undefined/false)
const SILENT_PROMISE_CATCH_REGEX =
  /\.catch\s*\(\s*(?:\(\s*\)|[a-zA-Z_$][\w$]*)\s*=>\s*(?:\{(?:\s*|\s*(?:\/\/[^\r\n]*\r?\n|\/\*[\s\S]*?\*\/)\s*)\}|null|undefined|false|true)\s*\)/g;

// Regex for Valibot fallback in schemas: v.fallback( or fallback(
const VALIBOT_FALLBACK_REGEX = /\b(?:v\.)?fallback\s*\(/g;

export class ErrorSuppressionAuditor extends FileScanAuditor<ErrorSuppressionRuleId> {
  constructor(options: FileScanRootsOptions = {}) {
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(options, ['src', 'scripts']);

    super({
      usesThirdPartyTool: false,
      requiredPermissions: [],
      roots: targetRoots,
      projectRoot: effectiveRoot,
      ruleCapabilities: createRuleCapabilities(ERROR_SUPPRESSION_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_error_suppression',
      name: 'Zero Error Suppression Auditor',
      description: 'Prohibits error suppression, empty catches, and fallbacks',
      family: 'architecture',
      ruleIds: ERROR_SUPPRESSION_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(ERROR_SUPPRESSION_RULES, 'hygiene'),
      packageName: 'Error',
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
      icon: '🚫',
      ruleDescriptions: {
        'no-empty-catch': 'Empty or silent catch block',
        'no-silent-promise-catch': 'Promise with silent .catch()',
        'no-silent-mock-fallbacks': 'Prohibited use of v.fallback',
        'strict-catch-narrowing': 'Catch block without instanceof Error'
      },
      ruleRemediations: {
        'no-empty-catch':
          '📖 REMEDIATION GUIDE: no-empty-catch\n' +
          '1. Root Cause: An empty catch block or one that performs no action was found. Silencing exceptions masks critical defects and violates Loud Failure principles.\n' +
          '2. Diagnosis: Locate the reported catch block at the specified file and line.\n' +
          '3. Canonical Solution:\n' +
          '   a) Propagate the error by throwing a typed exception (`throw error`).\n' +
          '   b) Formally log or handle the error if performing controlled degradation.\n' +
          '   c) If ignoring the error is strictly intentional and safe (e.g. attempting to read an optional file), annotate with `// catch-ok: <explicit technical justification>` inside the catch block.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Incorrect: Empty catch block with no handling or justification\n' +
          '   ✅ Correct:   Handle the error or annotate `// catch-ok: optional cleanup if resource already closed`',
        'no-silent-promise-catch':
          '📖 REMEDIATION GUIDE: no-silent-promise-catch\n' +
          '1. Root Cause: An empty `.catch()` handler was chained to a Promise without logging or re-throwing, leaving the promise silently swallowed.\n' +
          '2. Diagnosis: Check the `.catch()` handler on the promise at the reported line.\n' +
          '3. Canonical Solution:\n' +
          '   a) Log the error or propagate it to the caller.\n' +
          '   b) If omission is deliberate and safe, document `// catch-ok: <reason>` in the callback.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Incorrect: Promise with empty catch discarding errors silently\n' +
          '   ✅ Correct:   `fetchData().catch((err) => { logger.error("Failed to fetch data", err); });`',
        'no-silent-mock-fallbacks':
          '📖 REMEDIATION GUIDE: no-silent-mock-fallbacks\n' +
          '1. Root Cause: Use of `v.fallback()` in Valibot schemas. Silent fallbacks mask data corruptions or API divergence instead of triggering early validation failures.\n' +
          '2. Diagnosis: Look for `v.fallback(...)` calls in validation schemas.\n' +
          '3. Canonical Solution: Remove `v.fallback()`. If an API field is optional, type it explicitly with `v.optional(...)` or `v.nullish(...)` and supply defaults in domain constructors.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Incorrect: Using silent schema fallback\n' +
          '   ✅ Correct:   `v.optional(v.string(), "default")`',
        'strict-catch-narrowing':
          '📖 REMEDIATION GUIDE: strict-catch-narrowing\n' +
          '1. Root Cause: In modern TypeScript with `useUnknownInCatchVariables: true`, catch error variables are `unknown`. Accessing properties like message or stack without checking `instanceof Error` triggers runtime crashes if non-Errors are thrown.\n' +
          '2. Diagnosis: Locate unsafe error property accesses inside the catch block.\n' +
          '3. Canonical Solution: Narrow the type via `e instanceof Error ? e.message : String(e)` or use a typed helper like `toErrorMessage(e)`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Incorrect: Direct property access on unknown error without narrowing\n' +
          '   ✅ Correct:   `const msg = e instanceof Error ? e.message : String(e);`'
      },
      allowedExtensions: new Set(['.ts', '.vue'])
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    this.runSubAuditorSync('no-empty-catch', () => {
      this.auditEmptyCatch(relPath, content);
    });
    this.runSubAuditorSync('no-silent-promise-catch', () => {
      this.auditSilentPromiseCatch(relPath, content);
    });
    this.runSubAuditorSync('no-silent-mock-fallbacks', () => {
      this.auditSchemaFallbacks(relPath, content);
    });
    this.runSubAuditorSync('strict-catch-narrowing', () => {
      this.auditCatchNarrowing(relPath, content);
    });
  }

  private forEachNonCommentMatch(
    content: string,
    regexTemplate: RegExp,
    callback: (match: RegExpExecArray, line: number, lineContent: string) => void
  ): void {
    const regex = new RegExp(regexTemplate.source, regexTemplate.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);
      const lineContent = this.getLineAt(content, line);
      const trimmed = lineContent.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }
      callback(match, line, lineContent);
    }
  }

  private auditEmptyCatch(relPath: string, content: string): void {
    this.forEachNonCommentMatch(content, EMPTY_CATCH_REGEX, (match, line, lineContent) => {
      const innerContent = match[1] ?? '';
      const strippedComments = stripComments(innerContent).trim();

      if (strippedComments.length === 0) {
        if (
          this.hasEscapeHatch(lineContent, ['catch-ok', 'error-ok']) ||
          this.hasEscapeHatch(match[0], ['catch-ok', 'error-ok']) ||
          this.hasEscapeHatch(innerContent, ['catch-ok', 'error-ok'])
        ) {
          return;
        }

        this.addViolation({
          ruleId: 'no-empty-catch',
          severity: 'error',
          file: relPath,
          line,
          message: `Empty catch block detected. Swallowing errors violates the Zero Error Suppression Mandate. Fail loudly or log with reason.`,
          context: match[0].slice(0, 100)
        });
      }
    });
  }

  private auditSilentPromiseCatch(relPath: string, content: string): void {
    this.forEachNonCommentMatch(content, SILENT_PROMISE_CATCH_REGEX, (match, line, lineContent) => {
      if (
        this.hasEscapeHatch(lineContent, ['catch-ok', 'error-ok']) ||
        this.hasEscapeHatch(match[0], ['catch-ok', 'error-ok'])
      ) {
        return;
      }

      this.addViolation({
        ruleId: 'no-silent-promise-catch',
        severity: 'error',
        file: relPath,
        line,
        message: `Silent promise .catch() handler detected. Swallowing rejections silently is strictly forbidden. Log or handle the rejection explicitly.`,
        context: match[0].slice(0, 100)
      });
    });
  }

  private auditSchemaFallbacks(relPath: string, content: string): void {
    if (
      !relPath.includes('schema') &&
      !relPath.includes('models') &&
      !relPath.includes('storage')
    ) {
      return;
    }

    this.forEachNonCommentMatch(content, VALIBOT_FALLBACK_REGEX, (_match, line, lineContent) => {
      if (this.hasEscapeHatch(lineContent, ['fallback-ok', 'schema-ok'])) {
        return;
      }

      this.addViolation({
        ruleId: 'no-silent-mock-fallbacks',
        severity: 'error',
        file: relPath,
        line,
        message: `Schema fallback detected via fallback(). Runtime schema auto-heal is prohibited; data schemas must fail loud on invalid shapes.`,
        context: lineContent.trim()
      });
    });
  }

  private auditCatchNarrowing(relPath: string, content: string): void {
    const catchBlockRegex = /catch\s*\(\s*([a-zA-Z_$][\w$]*)\s*\)\s*\{([\s\S]*?)\}/g;
    let match: RegExpExecArray | null;

    while ((match = catchBlockRegex.exec(content)) !== null) {
      const varName = match[1]!;
      const blockBody = match[2]!;

      // Check if blockBody accesses varName.message or (varName as any).message
      const hasMessageAccess = new RegExp(
        `\\b${varName}\\.message\\b|\\(\\s*${varName}\\s+as\\s+` + `any\\s*\\)\\.message`
      ).test(blockBody);
      if (hasMessageAccess) {
        // Check if there is an instanceof Error check
        const hasInstanceCheck = new RegExp(`\\b${varName}\\s+instanceof\\s+Error\\b`).test(
          blockBody
        );
        if (!hasInstanceCheck) {
          const line = this.getLineNumber(content, match.index);
          const lineContent = this.getLineAt(content, line);

          if (this.hasEscapeHatch(lineContent, ['catch-ok', 'error-ok'])) {
            continue;
          }

          this.addViolation({
            ruleId: 'strict-catch-narrowing',
            severity: 'error',
            file: relPath,
            line,
            message: `Caught error '${varName}' accessed without strict type narrowing. Verify '${varName} instanceof Error' before reading properties.`,
            context: `catch (${varName})`
          });
        }
      }
    }
  }
}

// Standalone execution support
await BaseAuditor.runCliIfMain(import.meta.url, new ErrorSuppressionAuditor());

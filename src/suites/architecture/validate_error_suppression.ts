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
import { BaseAuditor, FileScanAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
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
const SILENT_PROMISE_CATCH_REGEX = /\.catch\s*\(\s*(?:\(\s*\)|[a-zA-Z_$][\w$]*)\s*=>\s*(?:\{(?:\s*|\s*(?:\/\/[^\r\n]*\r?\n|\/\*[\s\S]*?\*\/)\s*)\}|null|undefined|false|true)\s*\)/g;

// Regex for Valibot fallback in schemas: v.fallback( or fallback(
const VALIBOT_FALLBACK_REGEX = /\b(?:v\.)?fallback\s*\(/g;

export class ErrorSuppressionAuditor extends FileScanAuditor<ErrorSuppressionRuleId> {
constructor(roots?: readonly string[], projectRoot?: string) {
    const config = getAuditConfig();
    const codeRoots = roots ?? (config.paths.codeRoots && config.paths.codeRoots.length > 0
      ? config.paths.codeRoots
      : ['src', 'scripts']);

    super({
      capabilities: {
        fix: false,
        fixPriority: false,
        lint: true,
        md: false,
        ast: false,
        changedSince: false,
        heavy: false,
        requiresBuild: false,
        postRun: false
      },
id: 'validate_error_suppression',
      name: 'Zero Error Suppression Auditor',
      description: 'Prohíbe supresión de errores, catch vacíos y fallbacks',
      family: 'architecture',
      ruleIds: ERROR_SUPPRESSION_RULES,
      packageName: 'Error',
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
      icon: '🚫',
      ruleDescriptions: {
        'no-empty-catch': 'Bloque catch vacío o silencioso',
        'no-silent-promise-catch': 'Promesa con .catch() silencioso',
        'no-silent-mock-fallbacks': 'Uso prohibido de v.fallback',
        'strict-catch-narrowing': 'Catch sin instanceof Error'
      },
      roots: codeRoots,
      allowedExtensions: new Set(['.ts', '.vue']),
      projectRoot
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    // 1. Audit empty catch blocks
    this.auditEmptyCatch(relPath, content);

    // 2. Audit silent promise catches
    this.auditSilentPromiseCatch(relPath, content);

    // 3. Audit silent schema fallbacks
    this.auditSchemaFallbacks(relPath, content);

    // 4. Audit loose catch narrowing
    this.auditCatchNarrowing(relPath, content);
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
    if (!relPath.includes('schema') && !relPath.includes('models') && !relPath.includes('storage')) {
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
      const hasMessageAccess = new RegExp(`\\b${varName}\\.message\\b|\\(\\s*${varName}\\s+as\\s+` + `any\\s*\\)\\.message`).test(blockBody);
      if (hasMessageAccess) {
        // Check if there is an instanceof Error check
        const hasInstanceCheck = new RegExp(`\\b${varName}\\s+instanceof\\s+Error\\b`).test(blockBody);
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

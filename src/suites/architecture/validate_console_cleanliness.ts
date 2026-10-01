/**
 * scripts/auditors/architecture/validate_console_cleanliness.ts
 *
 * CONSOLE & DEBUGGER CLEANLINESS AUDITOR (Node.js 26+ Native)
 *
 * Enforces production code cleanliness across src/ (mobile-design & clean-code):
 *   1. No Debugger Statement (`no-debugger-statement`):
 *      Forbids `debugger;` statements in production source files.
 *   2. No Raw Console Log in Src (`no-console-log-in-src`):
 *      Prohibits uncoordinated `console.log(...)` in `src/`. Direct calls to `console.warn`
 *      and `console.error` remain 100% permitted for standard system error reporting.
 *      Authorized logging is mediated via `@/logic/utils/logger.ts`.
 *
 * Escape Hatches:
 *   `// console-ok: <reason>`, `// debugger-ok: <reason>`
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_console_cleanliness.ts
 */

import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, FileScanAuditor } from '../../core/auditorBase.ts';

enableCompileCache();

export type ConsoleCleanlinessRuleId =
  | 'no-debugger-statement'
  | 'no-console-log-in-src';

export const CONSOLE_CLEANLINESS_RULES: readonly ConsoleCleanlinessRuleId[] = [
  'no-debugger-statement',
  'no-console-log-in-src'
] as const;

const DEBUGGER_REGEX = /\bdebugger\b;?/g;
const CONSOLE_LOG_REGEX = /\bconsole\.log\s*\(/g;

const EXEMPT_LOGGING_FILES = new Set([
  'src/logic/utils/logger.ts'
]);

export class ConsoleCleanlinessAuditor extends FileScanAuditor<ConsoleCleanlinessRuleId> {
  constructor() {
    super({
      id: 'validate_console_cleanliness',
      name: 'Console & Debugger Cleanliness Auditor',
      description: 'Prohíbe console.log directo y debugger en src/',
      family: 'architecture',
      ruleIds: CONSOLE_CLEANLINESS_RULES,
      packageName: 'Consola',
      ruleDescriptions: {
        'no-debugger-statement': 'Instrucciones debugger en src/',
        'no-console-log-in-src': 'Llamadas directas a console.log()'
      },
      roots: ['src'],
      allowedExtensions: new Set(['.ts', '.vue', '.js'])
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    const normalizedPath = relPath.replace(/\\/g, '/');

    // 1. Audit debugger statements (all files)
    this.auditDebugger(normalizedPath, content);

    // 2. Audit raw console.log (exempt files excluded)
    if (!EXEMPT_LOGGING_FILES.has(normalizedPath)) {
      this.auditConsoleLog(normalizedPath, content);
    }
  }

  private auditDebugger(relPath: string, content: string): void {
    let match: RegExpExecArray | null;
    const regex = new RegExp(DEBUGGER_REGEX.source, DEBUGGER_REGEX.flags);

    while ((match = regex.exec(content)) !== null) {
      const line = this.getLineNumber(content, match.index);
      const lineContent = this.getLineAt(content, line);

      if (this.hasEscapeHatch(lineContent, ['debugger-ok', 'console-ok'])) {
        continue;
      }

      this.addViolation({
        ruleId: 'no-debugger-statement',
        severity: 'error',
        file: relPath,
        line,
        message: `Forbidden debugger statement found. Remove all debug breakpoints before committing.`,
        context: lineContent.trim()
      });
    }
  }

  private auditConsoleLog(relPath: string, content: string): void {
    this.scanRegexMatches(
      content,
      CONSOLE_LOG_REGEX,
      relPath,
      'no-console-log-in-src',
      ['console-ok', 'log-ok'],
      `Direct console.log() call detected in src/. Use console.warn/console.error for standard reporting, logger service for structured tracing, or '// console-ok: <reason>'.`,
      (lineContent) => {
        const trimmed = lineContent.trim();
        return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
      }
    );
  }
}

// Standalone execution support
if (process.argv[1] && import.meta.filename && path.basename(process.argv[1]) === path.basename(import.meta.filename)) {
  await BaseAuditor.runCli(new ConsoleCleanlinessAuditor());
}

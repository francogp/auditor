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
import { enableCompileCache } from 'node:module';
import { BaseAuditor, FileScanAuditor } from "../../core/auditorBase.js";
import { getAuditConfig, isExemptFile, isScriptPath, isCliPath } from "../../core/auditConfig.js";
enableCompileCache();
export const CONSOLE_CLEANLINESS_RULES = [
    'no-debugger-statement',
    'no-console-log-in-src'
];
const DEBUGGER_REGEX = /\bdebugger\b;?/g;
const CONSOLE_LOG_REGEX = /\bconsole\.log\s*\(/g;
function getExemptLoggingFiles(projectRoot) {
    const config = getAuditConfig(projectRoot);
    const custom = [
        ...(config.paths.exemptFiles ?? []),
        ...(config.domain.loggerModule ? [config.domain.loggerModule] : [])
    ];
    return new Set(custom);
}
export class ConsoleCleanlinessAuditor extends FileScanAuditor {
    constructor(roots, projectRoot) {
        const config = getAuditConfig(projectRoot);
        const effectiveRoots = roots ?? config.paths.srcRoots ?? ['src'];
        super({
            capabilities: { lint: true },
            id: 'validate_console_cleanliness',
            name: 'Console & Debugger Cleanliness Auditor',
            description: 'Prohíbe console.log directo y debugger en src/',
            family: 'architecture',
            ruleIds: CONSOLE_CLEANLINESS_RULES,
            packageName: 'Consola',
            icon: '🧹',
            ruleDescriptions: {
                'no-debugger-statement': 'Instrucciones debugger en src/',
                'no-console-log-in-src': 'Llamadas directas a console.log()'
            },
            roots: effectiveRoots,
            allowedExtensions: new Set(['.ts', '.vue', '.js']),
            projectRoot
        });
    }
    scanFile(relPath, content) {
        const normalizedPath = relPath.replace(/\\/g, '/');
        // 1. Audit debugger statements (all files)
        this.auditDebugger(normalizedPath, content);
        // 2. Audit raw console.log (exempt files, CLI tools, and terminal/auditor engine modules excluded)
        const config = getAuditConfig(this.projectRoot);
        const exemptFiles = getExemptLoggingFiles(this.projectRoot);
        const isCliOrTerminalOutput = isScriptPath(normalizedPath, config) ||
            isExemptFile(normalizedPath, config) ||
            isCliPath(normalizedPath, config);
        if (!exemptFiles.has(normalizedPath) && !isCliOrTerminalOutput) {
            this.auditConsoleLog(normalizedPath, content);
        }
    }
    auditDebugger(relPath, content) {
        this.scanRegexMatches(content, DEBUGGER_REGEX, relPath, 'no-debugger-statement', ['debugger-ok', 'console-ok'], 'Forbidden debugger statement found. Remove all debug breakpoints before committing.', (lineContent) => {
            const trimmed = lineContent.trim();
            if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
                return false;
            }
            return !/['"`][^'"`]*\bdebugger\b[^'"`]*['"`]/.test(lineContent);
        });
    }
    auditConsoleLog(relPath, content) {
        this.scanRegexMatches(content, CONSOLE_LOG_REGEX, relPath, 'no-console-log-in-src', ['console-ok', 'log-ok'], `Direct console.log() call detected in src/. Use console.warn/console.error for standard reporting, logger service for structured tracing, or '// console-ok: <reason>'.`, (lineContent) => {
            const trimmed = lineContent.trim();
            return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
        });
    }
}
// Standalone execution support
await BaseAuditor.runCliIfMain(import.meta.url, new ConsoleCleanlinessAuditor());
//# sourceMappingURL=validate_console_cleanliness.js.map
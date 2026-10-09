/**
 * packages/auditor/src/suites/architecture/validate_type_assertion_hygiene.ts
 *
 * TYPE ASSERTION HYGIENE & STRICT TYPING AUDITOR (Node.js 26+ Native)
 *
 * Enforces strict TypeScript assertion hygiene across codebase AST:
 * 1. Zero 'as any' or 'any[]' casts.
 * 2. Zero double casts ('as unknown as T').
 * 3. Zero boolean literal type annotations (': true', ': false').
 * 4. Zero floating asynchronous promises without await or void.
 * 5. Zero broad array casts ('as string[]', 'as readonly string[]').
 */
import { enableCompileCache } from 'node:module';
import { FileScanAuditor } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import { isTestFileForCodeAudit } from "../../core/auditTestPredicates.js";
import { isCommentLine } from "../../analyzers/auditRuleTypes.js";
import { toPosixRelative } from "../../core/safePath.js";
enableCompileCache();
export const TYPE_ASSERTION_RULES = [
    'type-assertion-zero-any',
    'type-assertion-double-cast',
    'type-assertion-boolean-literal',
    'type-assertion-floating-promise',
    'type-assertion-loose-array'
];
const EXTENSIONS = new Set(['.ts', '.vue']); // runtime-set: Fast O(1) file extensions set
const P_TYPECAST_INLINE_ANY = /\bas\s+any\b/g;
const P_TYPECAST_ARRAY_ANY_UNKNOWN = /\bas\s+(?:unknown|any)\[\]/g;
const P_TYPECAST_UNKNOWN = /\bas\s+unknown\s+as\b/g;
const P_DOUBLE_CAST_DOMAIN_ID = /\bas\s+(?:unknown|any)\s+as\s+[A-Z]\w*Id\b/g;
const P_BOOLEAN_LITERAL_TYPE_ANNOTATION = /\b(?:(?:export\s+)?const|let|var)\s+[A-Z_a-z]\w*\s*:\s*(?:true|false)\b|\b(?:export\s+)?type\s+[A-Z_a-z]\w*\s*=\s*(?:true|false)\s*;|^\s*(?:readonly\s+)?[A-Z_a-z]\w*\??:\s*(?:true|false)\s*;|\(\s*[A-Z_a-z]\w*\??:\s*(?:true|false)\b/gm;
const P_FLOATING_PROMISE = /^\s*(?!(?:await|void|return|const|let|var)\s)(?:[A-Z_a-z]\w*\.)?[a-z]\w*Async\s*\([^)]*\)\s*;/gm;
const P_TYPECAST_READONLY_STRING_ARRAY = /\bas\s+(?:readonly\s+)?string\[\]/g;
export class ValidateTypeAssertionHygieneAuditor extends FileScanAuditor {
    constructor(options) {
        const rootPath = typeof options === 'string' ? options : options?.projectRoot;
        const cfg = getAuditConfig(rootPath);
        const codeRoots = typeof options === 'object' && options?.roots ? options.roots : (cfg.paths.codeRoots ?? ['src', 'scripts']);
        super({
            capabilities: { lint: true, ast: false, fix: false, heavy: false },
            id: 'validate_type_assertion_hygiene',
            name: 'TypeScript Assertion & Strict Typing Hygiene',
            description: 'Prohíbe as any, doble casteo y promesas flotantes',
            family: 'architecture',
            ruleIds: TYPE_ASSERTION_RULES,
            packageName: 'Tipos',
            icon: '🛡️',
            configKey: 'paths',
            defaultConfig: {},
            ruleDescriptions: {
                'type-assertion-zero-any': 'Prohibición de as any o any[]',
                'type-assertion-double-cast': 'Prohibición de doble casteo as unknown as',
                'type-assertion-boolean-literal': 'Prohibición de anotación literal true/false',
                'type-assertion-floating-promise': 'Prohibición de promesa flotante sin await',
                'type-assertion-loose-array': 'Prohibición de casteo a string[] o readonly'
            },
            coverage: {
                include: deriveCoverageFromRoots(codeRoots, EXTENSIONS).include,
                exclude: ['coverage/**', 'dist/**', 'scratch/**', '.agents/**']
            },
            roots: codeRoots,
            allowedExtensions: EXTENSIONS,
            extraIgnorePatterns: ['coverage/**', 'dist/**', 'scratch/**', '.agents/**'],
            projectRoot: rootPath
        });
    }
    async scanFile(filePath, content) {
        const rel = toPosixRelative(this.projectRoot, filePath);
        if (isTestFileForCodeAudit(rel, this.projectRoot) || rel.includes('validate_type_assertion_hygiene.ts') || rel.includes('validate_domain_types.ts')) {
            return;
        }
        const lines = content.split('\n');
        // 1. Zero any casts
        this.scanPattern(content, lines, rel, P_TYPECAST_INLINE_ANY, 'type-assertion-zero-any', (_match, line) => {
            if (line.includes('// domain-ok:') || line.includes('// any-ok:') || line.includes('// type-ok:') || line.includes('// no-domain:') || line.includes('// open-record:'))
                return false;
            return true;
        }, 'Type assertion `as any` degrades type safety — derive domain type or specify precise union');
        this.scanPattern(content, lines, rel, P_TYPECAST_ARRAY_ANY_UNKNOWN, 'type-assertion-zero-any', (_match, line) => {
            if (line.includes('// domain-ok:') || line.includes('// any-ok:') || line.includes('// type-ok:') || line.includes('// no-domain:') || line.includes('// open-record:'))
                return false;
            return true;
        }, 'Array typecast `as any[]` or `as unknown[]` degrades type safety');
        // 2. Double casts
        this.scanPattern(content, lines, rel, P_TYPECAST_UNKNOWN, 'type-assertion-double-cast', (_match, line) => {
            if (line.includes('// domain-ok:') || line.includes('// cast-ok:') || line.includes('// double-cast-ok:'))
                return false;
            return true;
        }, 'Double type assertion `as unknown as ...` bypasses type checker');
        this.scanPattern(content, lines, rel, P_DOUBLE_CAST_DOMAIN_ID, 'type-assertion-double-cast', (_match, line) => {
            if (line.includes('// domain-ok:') || line.includes('// cast-ok:'))
                return false;
            return true;
        }, 'Double type assertion `as unknown as [Domain]Id` bypasses type checking');
        // 3. Boolean literal annotations
        this.scanPattern(content, lines, rel, P_BOOLEAN_LITERAL_TYPE_ANNOTATION, 'type-assertion-boolean-literal', (_match, line) => {
            if (line.includes('// domain-ok:') || line.includes('// literal-ok:'))
                return false;
            return true;
        }, 'Type annotation with boolean literal `true` or `false` — use `boolean` type or domain state');
        // 4. Floating promises
        this.scanPattern(content, lines, rel, P_FLOATING_PROMISE, 'type-assertion-floating-promise', (_match, line) => {
            if (line.includes('// promise-ok:') || line.includes('// void-ok:'))
                return false;
            return true;
        }, 'Floating Promise call `...Async()` without await or void — unhandled async execution');
        // 5. Broad array casts
        this.scanPattern(content, lines, rel, P_TYPECAST_READONLY_STRING_ARRAY, 'type-assertion-loose-array', (_match, line) => {
            if (line.includes('// domain-ok:') || line.includes('// array-ok:') || line.includes('// no-domain:') || line.includes('// type-ok:') || line.includes('// open-record:'))
                return false;
            return true;
        }, 'Typecast `as string[]` or `as readonly string[]` widens domain collection — preserve literal types with `as const`');
    }
    scanPattern(content, lines, file, regex, ruleId, filter, message) {
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(content)) !== null) {
            const matchIndex = match.index;
            const before = content.slice(0, matchIndex);
            const lineNum = (before.match(/\n/g) ?? []).length + 1;
            const col = matchIndex - before.lastIndexOf('\n');
            const line = lines[lineNum - 1] ?? '';
            if (isCommentLine(line.trim()))
                continue;
            if (!filter(match, line))
                continue;
            this.addViolation({
                ruleId,
                severity: 'error',
                file,
                line: lineNum,
                column: col,
                message,
                context: match[0].trim()
            });
        }
    }
}
// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await FileScanAuditor.runCliIfMain(import.meta.url, new ValidateTypeAssertionHygieneAuditor());
//# sourceMappingURL=validate_type_assertion_hygiene.js.map
/**
 * src/suites/architecture/validate_constant_hygiene.ts
 *
 * UNIFIED CONSTANT HYGIENE & DUPLICATION AUDITOR (Node.js 26+ Native)
 *
 * Enforces unified constant declaration architecture and magic number governance:
 *   1. Cross-module duplicate constant detection (identical or divergent values via AST).
 *   2. Strict prohibition of inline magic numbers outside designated data/config roots.
 *   3. Naming convention enforcement: prohibition of value suffixes in constant names.
 *   4. Prohibition of redundant 1:1 constant aliases (const A = B / export const A = B).
 *   5. Prohibition of raw numeric literals in constant suffixes (_100, _600).
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* src/suites/architecture/validate_constant_hygiene.ts
 */
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { FileScanAuditor } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
import { detectDuplicateConstants } from "../../analyzers/constantAnalyzer.js";
import { magicNumbers, badConstantNames, noAliasConstants, noLiteralSuffixInConstantName } from "../../analyzers/constantRules.js";
import { normalizePosixPath } from "../../core/safePath.js";
enableCompileCache();
export const CONSTANT_HYGIENE_RULES = [
    'duplicate-constant-identical',
    'duplicate-constant-divergent',
    'constant-magic-numbers',
    'constant-bad-names',
    'constant-no-alias',
    'constant-no-literal-suffix'
];
const P_EXPORT_REDUNDANT_ALIAS = /^\s*export\s+const\s+([A-Z_a-z]\w*)\s*=\s*([A-Z_a-z]\w*)\s*;/gm;
export class ValidateConstantHygieneAuditor extends FileScanAuditor {
    scannedAbsFiles = [];
    constructor(rootsOrOptions, maybeProjectRoot) {
        const optionsObj = rootsOrOptions && !Array.isArray(rootsOrOptions)
            ? rootsOrOptions
            : undefined;
        const effectiveProjectRoot = optionsObj?.projectRoot ?? maybeProjectRoot ?? process.cwd();
        const config = getAuditConfig(effectiveProjectRoot);
        const effectiveRoots = optionsObj?.roots ?? (Array.isArray(rootsOrOptions) ? rootsOrOptions : (config.paths.srcRoots ?? ['src']));
        super({
            capabilities: {
                ast: true,
                fix: false,
                changedSince: false,
                heavy: false,
                requiresBuild: false
            },
            id: 'validate_constant_hygiene',
            name: 'Constant Hygiene & Duplicate Validator',
            description: 'Gobernanza de constantes, números mágicos y duplicados',
            family: 'architecture',
            packageName: 'Constantes',
            configKey: 'constants',
            defaultConfig: { enabled: true },
            icon: '🔢',
            roots: effectiveRoots,
            allowedExtensions: new Set(['.ts', '.vue']),
            requiresAst: true,
            ruleIds: CONSTANT_HYGIENE_RULES,
            ruleDescriptions: {
                'duplicate-constant-identical': 'Constante idéntica duplicada',
                'duplicate-constant-divergent': 'Constante dispar entre módulos',
                'constant-magic-numbers': 'Número mágico inline en código',
                'constant-bad-names': 'Nombre con sufijo de valor',
                'constant-no-alias': 'Alias redundante de constante',
                'constant-no-literal-suffix': 'Sufijo numérico en constante'
            },
            projectRoot: effectiveProjectRoot
        });
    }
    scanFile(relPath, content) {
        const absPath = path.resolve(this.projectRoot, relPath);
        if (!relPath.includes('.spec.') && !relPath.includes('.test.') && !relPath.includes('.d.ts')) {
            this.scannedAbsFiles.push(absPath);
        }
        // Inspección unificada de reglas de constantes basadas en regex
        const regexChecks = [
            { ruleId: 'constant-magic-numbers', rule: magicNumbers },
            { ruleId: 'constant-bad-names', rule: badConstantNames },
            { ruleId: 'constant-no-literal-suffix', rule: noLiteralSuffixInConstantName },
            { ruleId: 'constant-no-alias', rule: noAliasConstants }
        ];
        let m;
        for (const { ruleId, rule } of regexChecks) {
            rule.regex.lastIndex = 0;
            while ((m = rule.regex.exec(content)) !== null) {
                if (rule.check && !rule.check(content, m, relPath)) {
                    continue;
                }
                const message = typeof rule.message === 'function' ? rule.message(m[0]) : rule.message;
                this.addViolationAtMatch({
                    ruleId,
                    filePath: relPath,
                    content,
                    matchIndex: m.index,
                    message,
                    context: m[0]
                });
            }
        }
        // Chequeo de alias redundante en exportaciones (P_EXPORT_REDUNDANT_ALIAS)
        P_EXPORT_REDUNDANT_ALIAS.lastIndex = 0;
        while ((m = P_EXPORT_REDUNDANT_ALIAS.exec(content)) !== null) {
            const aliasName = m[1];
            const targetName = m[2];
            if (!aliasName || !targetName || aliasName === targetName)
                continue;
            if (/^(?:true|false|null|undefined|NaN|Infinity|\d+)$/.test(targetName))
                continue;
            const norm = normalizePosixPath(relPath).toLowerCase();
            if (norm.includes('node_modules') || norm.includes('.test.') || norm.includes('.spec.'))
                continue;
            const preceding = content.slice(0, m.index);
            const lineText = preceding.split('\n').pop() ?? '';
            if (lineText.includes('// value-ok:') || lineText.includes('// const-ok:'))
                continue;
            const line = preceding.split('\n').length;
            const column = lineText.length + 1;
            this.addViolation({
                ruleId: 'constant-no-alias',
                severity: 'error',
                filePath: relPath,
                line,
                column,
                message: `Redefinición redundante 1:1 de constante/función: '${m[0].trim()}'. Usa la constante canónica de origen directamente en lugar de declarar alias passthrough.`,
                context: m[0].trim()
            });
        }
    }
    async runAudit(astContext) {
        this.scannedAbsFiles.length = 0;
        await super.runAudit(astContext);
        if (this.scannedAbsFiles.length === 0) {
            this.markRuleNotApplicable('duplicate-constant-identical', 'No se encontraron archivos para verificar duplicación');
            this.markRuleNotApplicable('duplicate-constant-divergent', 'No se encontraron archivos para verificar duplicación');
            return;
        }
        this.markRuleEvaluated('duplicate-constant-identical');
        this.markRuleEvaluated('duplicate-constant-divergent');
        const rawViolations = await detectDuplicateConstants(this.scannedAbsFiles, astContext, this.projectRoot);
        for (const v of rawViolations) {
            const isIdentical = v.message.includes('idéntico');
            const ruleId = isIdentical
                ? 'duplicate-constant-identical'
                : 'duplicate-constant-divergent';
            this.addViolation({
                ruleId,
                severity: v.severity || 'error',
                filePath: v.file,
                line: v.line || 1,
                message: v.message,
                context: v.context
            });
        }
    }
}
export { ValidateConstantHygieneAuditor as ConstantHygieneAuditor };
// Canonical CLI Entrypoint
await FileScanAuditor.runCliIfMain(import.meta.url, new ValidateConstantHygieneAuditor());
//# sourceMappingURL=validate_constant_hygiene.js.map
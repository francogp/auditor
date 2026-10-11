import { enableCompileCache } from 'node:module';
import { BaseAuditor, FileScanAuditor, createRuleCapabilities } from "../../core/auditorBase.js";
import { isTestPath } from "../../core/auditTestPredicates.js";
enableCompileCache();
export const CODE_SIMPLIFICATION_RULES = [
    'dead-code-accumulation',
    'boolean-trap-parameters',
    'deep-nesting-control-flow',
    'redundant-else-after-return',
    'premature-abstraction-wrapper',
    'massive-switch-branching'
];
const SCANNABLE_EXTS = new Set(['.ts', '.js', '.vue']);
export class ValidateCodeSimplificationAuditor extends FileScanAuditor {
    constructor(options = {}) {
        const effectiveRoot = options.projectRoot ?? process.cwd();
        super({
            id: 'validate_code_simplification',
            name: 'Code Complexity & Readability Simplifier Validator',
            description: 'Simplificación de código, nesting y claridad sintáctica',
            family: 'architecture',
            packageName: 'Simplify',
            icon: '🧹',
            configKey: 'codeSimplification.enabled',
            defaultConfig: { enabled: true },
            criticalConfig: {},
            roots: options.roots ?? ['src'],
            allowedExtensions: SCANNABLE_EXTS,
            ruleIds: CODE_SIMPLIFICATION_RULES,
            ruleDescriptions: {
                'dead-code-accumulation': 'Bloques de código muerto comentados',
                'boolean-trap-parameters': 'Parámetros booleanos posicionales',
                'deep-nesting-control-flow': 'Anidamiento excesivo > 4 niveles',
                'redundant-else-after-return': 'Cláusula else tras return o throw',
                'premature-abstraction-wrapper': 'Wrapper innecesario sin lógica',
                'massive-switch-branching': 'Switch masivo con más de 10 casos'
            },
            ruleCapabilities: createRuleCapabilities(CODE_SIMPLIFICATION_RULES, {
                fix: false,
                fixPriority: false,
                lint: true,
                md: false,
                ast: false,
                changedSince: false,
                heavy: false,
                requiresBuild: false,
                postRun: false
            }),
            projectRoot: effectiveRoot,
            coverage: { include: ['src/**/*.{ts,js,vue}'] }
        });
    }
    scanFile(relPath, content) {
        const lines = content.split('\n');
        const isTest = isTestPath(relPath);
        this.runSubAuditorSync('dead-code-accumulation', () => {
            if (!isTest && !content.includes('dead-code-ok'))
                this.auditDeadCodeAccumulation(relPath, lines);
        });
        this.runSubAuditorSync('boolean-trap-parameters', () => {
            if (!isTest && !content.includes('boolean-trap-ok'))
                this.auditBooleanTrapParameters(relPath, content, lines);
        });
        this.runSubAuditorSync('deep-nesting-control-flow', () => {
            if (!isTest && !content.includes('nesting-ok'))
                this.auditDeepNestingControlFlow(relPath, content, lines);
        });
        this.runSubAuditorSync('redundant-else-after-return', () => {
            if (!isTest && !content.includes('redundant-else-ok'))
                this.auditRedundantElseAfterReturn(relPath, content, lines);
        });
        this.runSubAuditorSync('premature-abstraction-wrapper', () => {
            if (!isTest && !content.includes('wrapper-ok'))
                this.auditPrematureAbstractionWrapper(relPath, content, lines);
        });
        this.runSubAuditorSync('massive-switch-branching', () => {
            if (!isTest && !content.includes('switch-ok'))
                this.auditMassiveSwitchBranching(relPath, content, lines);
        });
    }
    recordSimplificationFinding(relPath, content, lines, matchIndex, tag, ruleId, message) {
        const line = this.getLineNumber(content, matchIndex);
        const lineText = lines[line - 1] ?? '';
        const prevLineText = line > 1 ? (lines[line - 2] ?? '') : '';
        if (lineText.includes(tag) || prevLineText.includes(tag))
            return;
        this.addViolation({
            ruleId,
            severity: 'error',
            message,
            file: relPath,
            line
        });
    }
    auditDeadCodeAccumulation(relPath, lines) {
        let consecutiveCommentedCode = 0;
        let startLine = 0;
        const codeLikePattern = /^\s*\/\/\s*(?:const|let|var|if\s*\(|for\s*\(|while\s*\(|return\b|function\b|import\b|await\b|\w+\.\w+\s*\(|\w+\s*=[^=])/;
        const docExemptions = /-(?:ok|audit|domain|path|type|lint)|TODO|FIXME|NOTE|eslint|@param|@returns|\/\/\s*[-*#]/i;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (codeLikePattern.test(line) && !docExemptions.test(line)) {
                if (consecutiveCommentedCode === 0)
                    startLine = i + 1;
                consecutiveCommentedCode++;
                if (consecutiveCommentedCode >= 3) {
                    this.addViolation({
                        ruleId: 'dead-code-accumulation',
                        severity: 'error',
                        message: `Acumulación de código muerto comentado (>= 3 líneas consecutivas iniciando en línea ${startLine})`,
                        file: relPath,
                        line: startLine
                    });
                    consecutiveCommentedCode = 0;
                }
            }
            else {
                consecutiveCommentedCode = 0;
            }
        }
    }
    auditBooleanTrapParameters(relPath, content, lines) {
        // Detect function signatures with 2 or more positional boolean parameters
        const signatureRegex = /(?:function\s+\w+\s*|\b\w+\s*)\(([^);{}]+)\)/g;
        let match;
        while ((match = signatureRegex.exec(content)) !== null) {
            const rawParams = match[1] ?? '';
            // Exclude typed options objects like { a?: boolean; b?: boolean }
            const positionalParams = rawParams.replace(/\{[^}]*\}/g, '');
            const booleanParamMatches = positionalParams.match(/:\s*boolean\b/g);
            if (booleanParamMatches && booleanParamMatches.length >= 2) {
                this.recordSimplificationFinding(relPath, content, lines, match.index, 'boolean-trap-ok', 'boolean-trap-parameters', 'Firma de función con múltiples parámetros booleanos posicionales; refactorizar hacia options object');
            }
        }
    }
    auditDeepNestingControlFlow(relPath, _content, lines) {
        let depth = 0;
        const blockStartRegex = /\b(?:if|for|while|switch)\s*\([^)]*\)\s*\{/;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (blockStartRegex.test(line)) {
                depth++;
                if (depth > 4) {
                    const lineText = line;
                    const prevLineText = i > 0 ? (lines[i - 1] ?? '') : '';
                    if (lineText.includes('nesting-ok') || prevLineText.includes('nesting-ok'))
                        continue;
                    this.addViolation({
                        ruleId: 'deep-nesting-control-flow',
                        severity: 'error',
                        message: `Control de flujo con anidamiento profundo (${depth} niveles > 4); aplicar early return`,
                        file: relPath,
                        line: i + 1
                    });
                }
            }
            const closeCount = (line.match(/\}/g) ?? []).length;
            if (closeCount > 0) {
                depth = Math.max(0, depth - closeCount);
            }
        }
    }
    auditRedundantElseAfterReturn(relPath, content, lines) {
        const redundantElseRegex = /(?:return\b[^;]*;|throw\b[^;]*;)\s*\}\s*else\s*\{/g;
        let match;
        while ((match = redundantElseRegex.exec(content)) !== null) {
            this.recordSimplificationFinding(relPath, content, lines, match.index, 'redundant-else-ok', 'redundant-else-after-return', 'Cláusula else redundante inmediatamente después de return o throw definitivo');
        }
    }
    auditPrematureAbstractionWrapper(relPath, content, lines) {
        // Detect function foo(a, b) { return bar(a, b); } where function only delegates identical parameters
        const wrapperRegex = /function\s+(\w+)\s*\(([^)]*)\)\s*:\s*([^{]+)\{\s*return\s+([\w.]+)\s*\(([^)]*)\);\s*\}/g;
        let match;
        while ((match = wrapperRegex.exec(content)) !== null) {
            const fnName = match[1];
            const params = match[2].replace(/\s*:[^,)]+/g, '').replace(/\s+/g, '');
            const returnType = match[3] ?? '';
            const delegateName = match[4];
            const args = match[5].replace(/\s+/g, '');
            // Exclude TypeScript type predicates (e.g. "value is MyType") and Set encapsulation
            if (/\b\w+\s+is\s+/i.test(returnType) || delegateName.endsWith('.has')) {
                continue;
            }
            if (fnName !== delegateName && params === args && params.length > 0) {
                this.recordSimplificationFinding(relPath, content, lines, match.index, 'wrapper-ok', 'premature-abstraction-wrapper', `Función wrapper '${fnName}' innecesaria que solo reenvía parámetros idénticos a '${delegateName}'`);
            }
        }
    }
    auditMassiveSwitchBranching(relPath, content, lines) {
        const switchRegex = /switch\s*\([^)]*\)\s*\{([^}]*)\}/g;
        let match;
        while ((match = switchRegex.exec(content)) !== null) {
            const body = match[1] ?? '';
            const caseMatches = body.match(/\bcase\s[^:]+:/g);
            if (caseMatches && caseMatches.length > 10) {
                this.recordSimplificationFinding(relPath, content, lines, match.index, 'switch-ok', 'massive-switch-branching', `Estructura switch masiva (${caseMatches.length} casos > 10); refactorizar hacia tabla Map`);
            }
        }
    }
}
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateCodeSimplificationAuditor());
//# sourceMappingURL=validate_code_simplification.js.map
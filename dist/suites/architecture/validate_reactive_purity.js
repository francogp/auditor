/**
 * scripts/auditors/architecture/validate_reactive_purity.ts
 *
 * REACTIVE COMPUTED PURITY AUDITOR (Node.js 26+ Native)
 *
 * Enforces pure, side-effect-free computed getters across stores and composables:
 *   1. Computed getters must NEVER mutate state (.value =, state.x =, this.x =, store.x =).
 *   2. Computed getters must NEVER trigger persistence side-effects (.save(), scheduleSave(), etc.).
 *
 * Escape Hatch:
 *   // purity-ok: <justification> disables check on that line or block.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_reactive_purity.ts
 *   npm run validate:reactive-purity
 */
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import ts from 'typescript';
import { BaseAuditor, FileScanAuditor } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
enableCompileCache();
export const REACTIVE_PURITY_RULES = [
    'computed-state-mutation',
    'computed-side-effect'
];
const IMPURE_CALL_PATTERNS = [
    'scheduleSave',
    'scheduleLocalSave',
    '.save(',
    '.persist(',
    '.saveLocal(',
    'authStore.logout',
    'window.location'
];
function extractGetterFromObjectLiteral(expr, sf) {
    for (const prop of expr.properties) {
        if (ts.isPropertyAssignment(prop) && prop.name.getText(sf) === 'get') {
            if (ts.isArrowFunction(prop.initializer) || ts.isFunctionExpression(prop.initializer)) {
                return prop.initializer.body;
            }
        }
    }
    return null;
}
function extractComputedGetterBody(firstArg, sf) {
    if (ts.isArrowFunction(firstArg) || ts.isFunctionExpression(firstArg)) {
        return firstArg.body;
    }
    if (ts.isObjectLiteralExpression(firstArg)) {
        return extractGetterFromObjectLiteral(firstArg, sf);
    }
    return null;
}
export class ReactivePurityAuditor extends FileScanAuditor {
    constructor(roots, projectRoot) {
        const config = getAuditConfig(projectRoot);
        const effectiveRoots = roots ?? [
            ...(config.paths.storesRoots ?? ['src/stores']),
            ...(config.paths.composablesRoots ?? ['src/composables'])
        ];
        super({
            id: 'validate_reactive_purity',
            name: 'Reactive Computed Purity Auditor',
            description: 'Verifica pureza reactiva y ausencia de efectos en computeds',
            family: 'architecture',
            ruleIds: REACTIVE_PURITY_RULES,
            packageName: 'Computed',
            icon: '🧼',
            ruleDescriptions: {
                'computed-state-mutation': 'Mutación de estado prohibida',
                'computed-side-effect': 'Efecto secundario prohibido'
            },
            roots: effectiveRoots,
            allowedExtensions: new Set(['.ts', '.vue']),
            projectRoot
        });
    }
    checkComputedCall(node, sf, relPath, content, offsetLine) {
        if (!ts.isCallExpression(node))
            return;
        if (node.expression.getText(sf) !== 'computed' || node.arguments.length === 0)
            return;
        const firstArg = node.arguments[0];
        if (!firstArg)
            return;
        const getterBody = extractComputedGetterBody(firstArg, sf);
        if (getterBody) {
            this.inspectGetterBody(getterBody, sf, relPath, content, offsetLine);
        }
    }
    scanFile(relPath, content) {
        if (!content.includes('computed'))
            return;
        const { scriptContent, offsetLine } = this.extractScript(content, relPath);
        if (!scriptContent)
            return;
        const sf = ts.createSourceFile(path.basename(relPath), scriptContent, ts.ScriptTarget.Latest, true);
        const visit = (node) => {
            this.checkComputedCall(node, sf, relPath, content, offsetLine);
            ts.forEachChild(node, visit);
        };
        visit(sf);
    }
    reportComputedViolation(node, sourceFile, relPath, fullContent, lineOffset, ruleId, message) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        const realLine = line + lineOffset + 1;
        if (!this.hasPuritySuppression(fullContent, realLine - 1)) {
            this.addViolation({
                ruleId,
                severity: 'error',
                file: relPath,
                line: realLine,
                message,
                context: node.getText(sourceFile)
            });
        }
    }
    inspectGetterBody(bodyNode, sourceFile, relPath, fullContent, lineOffset) {
        const walk = (child) => {
            // Check for state mutations (=, +=, -=, etc.)
            if (ts.isBinaryExpression(child)) {
                const op = child.operatorToken.kind;
                const isAssignment = op >= ts.SyntaxKind.FirstAssignment && op <= ts.SyntaxKind.LastAssignment;
                if (isAssignment) {
                    const leftText = child.left.getText(sourceFile);
                    const isReactiveMutation = leftText.includes('.value') ||
                        leftText.startsWith('state.') ||
                        leftText.startsWith('this.') ||
                        leftText.includes('Store.');
                    if (isReactiveMutation) {
                        this.reportComputedViolation(child, sourceFile, relPath, fullContent, lineOffset, 'computed-state-mutation', `Mutación impura dentro de 'computed()': '${child.getText(sourceFile)}'. Los computed deben ser funciones puras.`);
                    }
                }
            }
            // Check for impure side-effect calls (.scheduleSave(), etc.)
            if (ts.isCallExpression(child)) {
                const callText = child.expression.getText(sourceFile);
                const isImpureCall = IMPURE_CALL_PATTERNS.some(pat => callText.includes(pat));
                if (isImpureCall) {
                    this.reportComputedViolation(child, sourceFile, relPath, fullContent, lineOffset, 'computed-side-effect', `Llamada con efectos secundarios dentro de 'computed()': '${child.getText(sourceFile)}'. Queda prohibido disparar persistencia en getters.`);
                }
            }
            ts.forEachChild(child, walk);
        };
        ts.forEachChild(bodyNode, walk);
    }
    hasPuritySuppression(content, lineIndex) {
        const lines = content.split('\n');
        const targetLine = lines[lineIndex] || '';
        const prevLine = lineIndex > 0 ? (lines[lineIndex - 1] || '') : '';
        const suppressionRegex = /\/\/\s*purity-ok:\s*\S+/i;
        return suppressionRegex.test(targetLine) || suppressionRegex.test(prevLine);
    }
    extractScript(content, filePath) {
        if (!filePath.endsWith('.vue')) {
            return { scriptContent: content, offsetLine: 0 };
        }
        const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/i;
        const match = scriptRegex.exec(content);
        if (!match) {
            return { scriptContent: '', offsetLine: 0 };
        }
        const linesBefore = content.substring(0, match.index).split('\n').length - 1;
        return { scriptContent: match[1] || '', offsetLine: linesBefore };
    }
}
// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new ReactivePurityAuditor());
//# sourceMappingURL=validate_reactive_purity.js.map
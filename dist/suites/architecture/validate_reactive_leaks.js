/**
 * scripts/auditors/architecture/validate_reactive_leaks.ts
 *
 * REACTIVE & DOM EVENT LEAK AUDITOR (Node.js 26+ Native)
 *
 * Enforces strict memory leak prevention and listener hygiene across Vue components and composables:
 *   1. Event Listeners: Every window/document/element.addEventListener must either have { once: true },
 *      an explicit removeEventListener, or an unmount lifecycle hook (onUnmounted, onBeforeUnmount, onScopeDispose).
 *   2. Native Timers: Every setInterval must have a clearInterval.
 *
 * Escape Hatch:
 *   // leak-ok: <justification> or // reactive-leak-ok: <justification>
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_reactive_leaks.ts
 *   npm run validate:reactive-leaks
 */
import { enableCompileCache } from 'node:module';
import ts from 'typescript';
import { BaseAuditor, FileScanAuditor } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
enableCompileCache();
export const REACTIVE_LEAK_RULES = [
    'dom-event-leak',
    'interval-leak'
];
function hasOnceOption(node) {
    if (node.arguments.length < 3)
        return false;
    const optionsArg = node.arguments[2];
    if (!optionsArg || !ts.isObjectLiteralExpression(optionsArg))
        return false;
    for (const prop of optionsArg.properties) {
        if (ts.isPropertyAssignment(prop) && prop.name && ts.isIdentifier(prop.name) && prop.name.text === 'once') {
            if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
                return true;
            }
        }
    }
    return false;
}
function resolveReactiveRoots(config, customRoots) {
    if (customRoots && customRoots.length > 0)
        return customRoots;
    return [
        ...(config.paths.componentsRoots ?? ['src/components']),
        ...(config.paths.viewsRoots ?? ['src/views']),
        ...(config.paths.composablesRoots ?? ['src/composables'])
    ];
}
export class ReactiveLeaksAuditor extends FileScanAuditor {
    constructor(roots, projectRoot) {
        const config = getAuditConfig(projectRoot);
        const effectiveRoots = resolveReactiveRoots(config, roots);
        super({
            capabilities: { ast: true },
            id: 'validate_reactive_leaks',
            name: 'Reactive & DOM Event Leak Auditor',
            description: 'Detecta posibles fugas de memoria y listeners sin limpiar',
            family: 'architecture',
            ruleIds: REACTIVE_LEAK_RULES,
            packageName: 'Fuga',
            configKey: 'paths',
            defaultConfig: {},
            icon: '💧',
            ruleDescriptions: {
                'dom-event-leak': 'addEventListener sin limpiar',
                'interval-leak': 'setInterval sin limpiar'
            },
            roots: effectiveRoots,
            allowedExtensions: new Set(['.ts', '.vue']),
            projectRoot
        });
    }
    checkEventListenerLeak(node, sf, relPath, checkLineEscape, hasRemoveEventListener, hasUnmountHook) {
        const expr = node.expression;
        if (!ts.isPropertyAccessExpression(expr) || expr.name.text !== 'addEventListener')
            return;
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        if (checkLineEscape(line))
            return;
        if (!hasOnceOption(node) && !hasRemoveEventListener && !hasUnmountHook) {
            this.addViolation({
                ruleId: 'dom-event-leak',
                severity: 'error',
                file: relPath,
                line,
                message: 'addEventListener sin removeEventListener ni ciclo de vida onUnmounted / onScopeDispose (potencial fuga de memoria).',
                context: node.getText(sf)
            });
        }
    }
    checkIntervalLeak(node, sf, relPath, checkLineEscape, hasClearInterval) {
        const expr = node.expression;
        if (!ts.isIdentifier(expr) || expr.text !== 'setInterval')
            return;
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        if (checkLineEscape(line) || hasClearInterval)
            return;
        this.addViolation({
            ruleId: 'interval-leak',
            severity: 'error',
            file: relPath,
            line,
            message: 'setInterval ejecutado sin clearInterval en el componente o composable.',
            context: node.getText(sf)
        });
    }
    scanFile(relPath, content, sourceFile) {
        // Fast string pre-filter to skip files that cannot contain reactive leaks
        if (!content.includes('addEventListener') && !content.includes('setInterval')) {
            return;
        }
        const sf = sourceFile ?? this.context.getAst(relPath, content);
        if (!sf.text.trim())
            return;
        const fullLines = content.split('\n');
        const hasUnmountHook = content.includes('onUnmounted') || content.includes('onBeforeUnmount') || content.includes('onScopeDispose');
        const hasRemoveEventListener = content.includes('removeEventListener');
        const hasClearInterval = content.includes('clearInterval');
        const checkLineEscape = (lineNum) => {
            const lineText = fullLines[lineNum - 1] || '';
            return lineText.includes('leak-ok') || lineText.includes('reactive-leak-ok');
        };
        const visit = (node) => {
            if (ts.isCallExpression(node)) {
                this.checkEventListenerLeak(node, sf, relPath, checkLineEscape, hasRemoveEventListener, hasUnmountHook);
                this.checkIntervalLeak(node, sf, relPath, checkLineEscape, hasClearInterval);
            }
            ts.forEachChild(node, visit);
        };
        visit(sf);
    }
}
// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new ReactiveLeaksAuditor());
//# sourceMappingURL=validate_reactive_leaks.js.map
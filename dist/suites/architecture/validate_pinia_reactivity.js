/**
 * scripts/auditors/architecture/validate_pinia_reactivity.ts
 *
 * PINIA REACTIVITY & STATE INTEGRITY AUDITOR (Node.js 26+ Native)
 *
 * Enforces Pinia reactivity standards across components and composables (vue-pinia-best-practices):
 *   1. No Store Destructuring Without storeToRefs (`no-store-destructuring-without-storetorefs`):
 *      Calling `const { a, b } = useXxxStore()` directly strips reactivity from reactive
 *      state properties and getters. Reactive state destructuring MUST be wrapped with `storeToRefs(store)`.
 *   2. No Direct State Mutation Outside Actions (`no-direct-state-mutation-outside-actions`):
 *      Direct assignment to `store.$state = ...` bypasses Pinia mutation tracking and action
 *      lifecycle. Permitted exclusively in authorized save persistence coordinators and tests.
 *
 * Escape Hatches:
 *   `// pinia-ok: <reason>`, `// store-ok: <reason>`
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_pinia_reactivity.ts
 */
import path from 'node:path';
import ts from 'typescript';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, FileScanAuditor } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
enableCompileCache();
export const PINIA_REACTIVITY_RULES = [
    'no-store-destructuring-without-storetorefs',
    'no-direct-state-mutation-outside-actions'
];
export const DEFAULT_AUTHORIZED_STATE_MUTATION_FILES = [];
export function getAuthorizedStateMutationFiles(projectRoot) {
    const config = getAuditConfig(projectRoot);
    const fromPersistence = config.persistence?.authorizedSaveFiles ?? [];
    const fromPinia = config.pinia?.authorizedMutationFiles ?? [];
    return new Set([...DEFAULT_AUTHORIZED_STATE_MUTATION_FILES, ...fromPersistence, ...fromPinia]);
}
export const AUTHORIZED_STATE_MUTATION_FILES = new Set(DEFAULT_AUTHORIZED_STATE_MUTATION_FILES);
function isStoreCallExpression(expr, sf) {
    if (!ts.isCallExpression(expr))
        return false;
    const calleeText = expr.expression.getText(sf);
    return /^use[A-Z]\w*Store$/.test(calleeText);
}
function isStoreDestructuring(initializer, sf, storeVariables) {
    if (isStoreCallExpression(initializer, sf))
        return true;
    return ts.isIdentifier(initializer) && storeVariables.has(initializer.text);
}
export class PiniaReactivityAuditor extends FileScanAuditor {
    storesRoots;
    authorizedStateMutationFiles;
    constructor(roots, projectRoot) {
        const config = getAuditConfig(projectRoot);
        const effectiveRoots = roots ?? config.paths.srcRoots ?? ['src'];
        super({
            capabilities: { ast: true },
            id: 'validate_pinia_reactivity',
            name: 'Pinia Reactivity & State Integrity Auditor',
            description: 'Protege reactividad e integridad de stores de Pinia',
            family: 'architecture',
            ruleIds: PINIA_REACTIVITY_RULES,
            packageName: 'Pinia',
            icon: '🍍',
            ruleDescriptions: {
                'no-store-destructuring-without-storetorefs': 'Desestructuración sin storeToRefs',
                'no-direct-state-mutation-outside-actions': 'Mutación directa de $state'
            },
            roots: effectiveRoots,
            allowedExtensions: new Set(['.vue', '.ts']),
            requiresAst: true,
            projectRoot
        });
        this.storesRoots = config.paths.storesRoots ?? ['src/stores'];
        this.authorizedStateMutationFiles = getAuthorizedStateMutationFiles(projectRoot);
    }
    reportPiniaViolation(node, sf, content, relPath, ruleId, message) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
        const lineNum = line + 1;
        const lineContent = this.getLineAt(content, lineNum);
        if (!this.hasEscapeHatch(lineContent, ['pinia-ok', 'store-ok'])) {
            this.addViolation({
                ruleId,
                severity: 'error',
                file: relPath,
                line: lineNum,
                message,
                context: lineContent.trim()
            });
        }
    }
    checkStoreVariableDeclaration(node, sf, content, relPath, storeVariables, isStoreFile) {
        if (!node.initializer)
            return;
        if (ts.isIdentifier(node.name) && isStoreCallExpression(node.initializer, sf)) {
            storeVariables.add(node.name.text);
        }
        if (!isStoreFile && ts.isObjectBindingPattern(node.name)) {
            if (isStoreDestructuring(node.initializer, sf, storeVariables)) {
                this.reportPiniaViolation(node, sf, content, relPath, 'no-store-destructuring-without-storetorefs', `Direct or indirect destructuring from use...Store() detected. Destructuring directly strips reactivity from state and getters; wrap with 'storeToRefs(store)' or use '// pinia-ok: <reason>' if destructuring actions only.`);
            }
        }
    }
    checkStateMutation(node, sf, content, relPath, storeVariables, isAuthorized) {
        if (isAuthorized || !ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
            return;
        }
        if (ts.isPropertyAccessExpression(node.left) && node.left.name.text === '$state') {
            const objText = node.left.expression.getText(sf);
            if (objText.toLowerCase().includes('store') || storeVariables.has(objText)) {
                this.reportPiniaViolation(node, sf, content, relPath, 'no-direct-state-mutation-outside-actions', `Direct assignment to store.$state detected. Mutating $state directly outside persistence coordinators bypasses action lifecycles. Use actions or store.$patch instead.`);
            }
        }
    }
    scanFile(relPath, content, sourceFile) {
        const normalizedPath = relPath.replace(/\\/g, '/');
        // Fast O(1) string pre-filter to eliminate files without store keywords
        if (!content.includes('Store') && !content.includes('$state')) {
            return;
        }
        const isStoreFile = this.storesRoots.some(root => {
            const normalizedRoot = root.replace(/\\/g, '/').replace(/\/+$/, '') + '/';
            return normalizedPath.startsWith(normalizedRoot);
        });
        const isAuthorized = this.authorizedStateMutationFiles.has(normalizedPath) || AUTHORIZED_STATE_MUTATION_FILES.has(normalizedPath);
        const sf = sourceFile ?? ts.createSourceFile(path.basename(relPath), content, ts.ScriptTarget.Latest, true, relPath.endsWith('.vue') ? ts.ScriptKind.TS : undefined);
        const storeVariables = new Set();
        const visit = (node) => {
            if (ts.isVariableDeclaration(node)) {
                this.checkStoreVariableDeclaration(node, sf, content, relPath, storeVariables, isStoreFile);
            }
            else {
                this.checkStateMutation(node, sf, content, relPath, storeVariables, isAuthorized);
            }
            ts.forEachChild(node, visit);
        };
        visit(sf);
    }
}
// Standalone execution support
await BaseAuditor.runCliIfMain(import.meta.url, new PiniaReactivityAuditor());
//# sourceMappingURL=validate_pinia_reactivity.js.map
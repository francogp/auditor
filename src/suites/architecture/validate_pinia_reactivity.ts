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
import { BaseAuditor, FileScanAuditor } from '../../core/auditorBase.ts';

enableCompileCache();

export type PiniaReactivityRuleId =
  | 'no-store-destructuring-without-storetorefs'
  | 'no-direct-state-mutation-outside-actions';

export const PINIA_REACTIVITY_RULES: readonly PiniaReactivityRuleId[] = [
  'no-store-destructuring-without-storetorefs',
  'no-direct-state-mutation-outside-actions'
] as const;

const AUTHORIZED_STATE_MUTATION_FILES = new Set<string>([
  // Authorized state coordinators if any
]);

export class PiniaReactivityAuditor extends FileScanAuditor<PiniaReactivityRuleId> {
  constructor(roots: readonly string[] = ['src'], projectRoot?: string) {
    super({
      id: 'validate_pinia_reactivity',
      name: 'Pinia Reactivity & State Integrity Auditor',
      description: 'Protege reactividad e integridad de stores de Pinia',
      family: 'architecture',
      ruleIds: PINIA_REACTIVITY_RULES,
      packageName: 'Pinia',
      ruleDescriptions: {
        'no-store-destructuring-without-storetorefs': 'Desestructuración sin storeToRefs',
        'no-direct-state-mutation-outside-actions': 'Mutación directa de $state'
      },
      roots,
      allowedExtensions: new Set(['.vue', '.ts']),
      requiresAst: true,
      projectRoot
    });
  }

  protected override scanFile(relPath: string, content: string, sourceFile?: ts.SourceFile): void {
    const normalizedPath = relPath.replace(/\\/g, '/');

    // Fast O(1) string pre-filter to eliminate files without store keywords
    if (!content.includes('Store') && !content.includes('$state')) {
      return;
    }

    const isStoreFile = normalizedPath.startsWith('src/stores/');
    const isAuthorized = AUTHORIZED_STATE_MUTATION_FILES.has(normalizedPath);

    const sf = sourceFile ?? ts.createSourceFile(
      path.basename(relPath),
      content,
      ts.ScriptTarget.Latest,
      true,
      relPath.endsWith('.vue') ? ts.ScriptKind.TS : undefined
    );

    const storeVariables = new Set<string>();

    const visit = (node: ts.Node) => {
      // 1. Track variables assigned to useXxxStore(...)
      if (ts.isVariableDeclaration(node) && node.initializer) {
        if (ts.isIdentifier(node.name) && ts.isCallExpression(node.initializer)) {
          const calleeText = node.initializer.expression.getText(sf);
          if (/^use[A-Z]\w*Store$/.test(calleeText)) {
            storeVariables.add(node.name.text);
          }
        }

        // Case: Store Destructuring without storeToRefs
        if (!isStoreFile && ts.isObjectBindingPattern(node.name)) {
          let isStoreDestructuring = false;

          // Direct: const { a, b } = useXxxStore(...)
          if (ts.isCallExpression(node.initializer)) {
            const calleeText = node.initializer.expression.getText(sf);
            if (/^use[A-Z]\w*Store$/.test(calleeText)) {
              isStoreDestructuring = true;
            }
          }
          // Indirect: const { a, b } = storeVar
          else if (ts.isIdentifier(node.initializer) && storeVariables.has(node.initializer.text)) {
            isStoreDestructuring = true;
          }

          if (isStoreDestructuring) {
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
            const lineNum = line + 1;
            const lineContent = this.getLineAt(content, lineNum);

            if (!this.hasEscapeHatch(lineContent, ['pinia-ok', 'store-ok'])) {
              this.addViolation({
                ruleId: 'no-store-destructuring-without-storetorefs',
                severity: 'error',
                file: relPath,
                line: lineNum,
                message: `Direct or indirect destructuring from use...Store() detected. Destructuring directly strips reactivity from state and getters; wrap with 'storeToRefs(store)' or use '// pinia-ok: <reason>' if destructuring actions only.`,
                context: lineContent.trim()
              });
            }
          }
        }
      }

      // 2. Direct $state mutation: store.$state = ...
      if (!isAuthorized && ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        if (ts.isPropertyAccessExpression(node.left) && node.left.name.text === '$state') {
          const objText = node.left.expression.getText(sf);
          if (objText.toLowerCase().includes('store') || storeVariables.has(objText)) {
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
            const lineNum = line + 1;
            const lineContent = this.getLineAt(content, lineNum);

            if (!this.hasEscapeHatch(lineContent, ['pinia-ok', 'store-ok'])) {
              this.addViolation({
                ruleId: 'no-direct-state-mutation-outside-actions',
                severity: 'error',
                file: relPath,
                line: lineNum,
                message: `Direct assignment to store.$state detected. Mutating $state directly outside persistence coordinators bypasses action lifecycles. Use actions or store.$patch instead.`,
                context: lineContent.trim()
              });
            }
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sf);
  }
}

// Standalone execution support
if (process.argv[1] && import.meta.filename && path.basename(process.argv[1]) === path.basename(import.meta.filename)) {
  await BaseAuditor.runCli(new PiniaReactivityAuditor());
}

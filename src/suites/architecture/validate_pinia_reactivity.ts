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

import ts from 'typescript';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, FileScanAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { normalizePosixPath } from '../../core/safePath.ts';

enableCompileCache();

export type PiniaReactivityRuleId =
  | 'no-store-destructuring-without-storetorefs'
  | 'no-direct-state-mutation-outside-actions';

export const PINIA_REACTIVITY_RULES: readonly PiniaReactivityRuleId[] = [
  'no-store-destructuring-without-storetorefs',
  'no-direct-state-mutation-outside-actions'
] as const;

export const DEFAULT_AUTHORIZED_STATE_MUTATION_FILES: readonly string[] = [];

export function getAuthorizedStateMutationFiles(projectRoot?: string): ReadonlySet<string> {
  const config = getAuditConfig(projectRoot);
  const fromPersistence = config.persistence?.authorizedSaveFiles ?? [];
  const fromPinia = config.pinia?.authorizedMutationFiles ?? [];
  return new Set([...DEFAULT_AUTHORIZED_STATE_MUTATION_FILES, ...fromPersistence, ...fromPinia]);
}

export const AUTHORIZED_STATE_MUTATION_FILES: ReadonlySet<string> = new Set(DEFAULT_AUTHORIZED_STATE_MUTATION_FILES);

function isStoreCallExpression(expr: ts.Expression, sf: ts.SourceFile): boolean {
  if (!ts.isCallExpression(expr)) return false;
  const calleeText = expr.expression.getText(sf);
  return /^use[A-Z]\w*Store$/.test(calleeText);
}

function isStoreDestructuring(
  initializer: ts.Expression,
  sf: ts.SourceFile,
  storeVariables: ReadonlySet<string>
): boolean {
  if (isStoreCallExpression(initializer, sf)) return true;
  return ts.isIdentifier(initializer) && storeVariables.has(initializer.text);
}

function resolvePiniaAuditRoots(roots?: readonly string[], projectRoot?: string): readonly string[] {
  return roots ?? getAuditConfig(projectRoot).paths.srcRoots ?? ['src'];
}

export class PiniaReactivityAuditor extends FileScanAuditor<PiniaReactivityRuleId> {
  private readonly storesRoots: readonly string[];
  private readonly authorizedStateMutationFiles: ReadonlySet<string>;

  constructor(roots?: readonly string[], projectRoot?: string) {
    const piniaRoots = resolvePiniaAuditRoots(roots, projectRoot);
    const config = getAuditConfig(projectRoot);
    super({
      roots: piniaRoots,
      projectRoot,
      capabilities: {
        fix: false,
        fixPriority: false,
        lint: true,
        md: false,
        ast: true,
        changedSince: false,
        heavy: false,
        requiresBuild: false,
        postRun: false
      },
      id: 'validate_pinia_reactivity',
      name: 'Pinia Reactivity & State Integrity Auditor',
      description: 'Protege reactividad e integridad de stores de Pinia',
      family: 'architecture',
      ruleIds: PINIA_REACTIVITY_RULES,
      packageName: 'Pinia',
      configKey: 'pinia.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '🍍',
      ruleDescriptions: {
        'no-store-destructuring-without-storetorefs': 'Desestructuración sin storeToRefs',
        'no-direct-state-mutation-outside-actions': 'Mutación directa de $state'
      },
      allowedExtensions: new Set(['.vue', '.ts']),
      requiresAst: true
    });
    this.storesRoots = config.paths.storesRoots ?? ['src/stores'];
    this.authorizedStateMutationFiles = getAuthorizedStateMutationFiles(projectRoot);
  }

  private reportPiniaViolation(
    node: ts.Node,
    sf: ts.SourceFile,
    content: string,
    relPath: string,
    ruleId: PiniaReactivityRuleId,
    message: string
  ): void {
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

  private checkStoreVariableDeclaration(
    node: ts.VariableDeclaration,
    sf: ts.SourceFile,
    content: string,
    relPath: string,
    storeVariables: Set<string>,
    isStoreFile: boolean
  ): void {
    if (!node.initializer) return;

    if (ts.isIdentifier(node.name) && isStoreCallExpression(node.initializer, sf)) {
      storeVariables.add(node.name.text);
    }

    if (!isStoreFile && ts.isObjectBindingPattern(node.name)) {
      if (isStoreDestructuring(node.initializer, sf, storeVariables)) {
        this.reportPiniaViolation(
          node,
          sf,
          content,
          relPath,
          'no-store-destructuring-without-storetorefs',
          `Direct or indirect destructuring from use...Store() detected. Destructuring directly strips reactivity from state and getters; wrap with 'storeToRefs(store)' or use '// pinia-ok: <reason>' if destructuring actions only.`
        );
      }
    }
  }

  private checkStateMutation(
    node: ts.Node,
    sf: ts.SourceFile,
    content: string,
    relPath: string,
    storeVariables: ReadonlySet<string>,
    isAuthorized: boolean
  ): void {
    if (isAuthorized || !ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) {
      return;
    }
    if (ts.isPropertyAccessExpression(node.left) && node.left.name.text === '$state') {
      const objText = node.left.expression.getText(sf);
      if (objText.toLowerCase().includes('store') || storeVariables.has(objText)) {
        this.reportPiniaViolation(
          node,
          sf,
          content,
          relPath,
          'no-direct-state-mutation-outside-actions',
          `Direct assignment to store.$state detected. Mutating $state directly outside persistence coordinators bypasses action lifecycles. Use actions or store.$patch instead.`
        );
      }
    }
  }

  protected override scanFile(relPath: string, content: string, sourceFile?: ts.SourceFile): void {
    const normalizedPath = normalizePosixPath(relPath);

    // Fast O(1) string pre-filter to eliminate files without store keywords
    if (!content.includes('Store') && !content.includes('$state')) {
      return;
    }

    const isStoreFile = this.storesRoots.some(root => {
      const normalizedRoot = normalizePosixPath(root).replace(/\/+$/, '') + '/';
      return normalizedPath.startsWith(normalizedRoot);
    });
    const isAuthorized = this.authorizedStateMutationFiles.has(normalizedPath) || AUTHORIZED_STATE_MUTATION_FILES.has(normalizedPath);

    const sf = sourceFile ?? this.context.getAst(relPath, content);

    const storeVariables = new Set<string>();

    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node)) {
        this.checkStoreVariableDeclaration(node, sf, content, relPath, storeVariables, isStoreFile);
      } else {
        this.checkStateMutation(node, sf, content, relPath, storeVariables, isAuthorized);
      }
      ts.forEachChild(node, visit);
    };

    visit(sf);
  }
}

// Standalone execution support
await BaseAuditor.runCliIfMain(import.meta.url, new PiniaReactivityAuditor());

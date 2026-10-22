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
import { BaseAuditor,
  createUniformRemediationPhases, FileScanAuditor, createRuleCapabilities, resolveFileScanRoots, type FileScanRootsOptions } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { normalizePosixPath, isPathContained } from '../../core/safePath.ts';

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

export const AUTHORIZED_STATE_MUTATION_FILES: ReadonlySet<string> = new Set(
  DEFAULT_AUTHORIZED_STATE_MUTATION_FILES
);

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

export class PiniaReactivityAuditor extends FileScanAuditor<PiniaReactivityRuleId> {
  private readonly storesRoots: readonly string[];
  private readonly authorizedStateMutationFiles: ReadonlySet<string>;

  constructor(options: FileScanRootsOptions = {}) {
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(
      options,
      (cfg) => cfg.paths.srcRoots ?? []
    );
    const config = getAuditConfig(effectiveRoot);
    super({
      usesThirdPartyTool: false,
      requiredPermissions: [],
      roots: targetRoots,
      projectRoot: effectiveRoot,
      ruleCapabilities: createRuleCapabilities(PINIA_REACTIVITY_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: true,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_pinia_reactivity',
      name: 'Pinia Reactivity & State Integrity Auditor',
      description: 'Protects reactivity and integrity of Pinia stores',
      family: 'architecture',
      ruleIds: PINIA_REACTIVITY_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(PINIA_REACTIVITY_RULES, 'behavior'),
      packageName: 'Pinia',
      configKey: 'pinia.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '🍍',
      ruleDescriptions: {
        'no-store-destructuring-without-storetorefs': 'Destructuring without storeToRefs',
        'no-direct-state-mutation-outside-actions': 'Direct mutation of $state'
      },
      ruleRemediations: {
        'no-store-destructuring-without-storetorefs':
          '1. Root Cause:\n' +
          'State properties or getters were destructured directly from a Pinia store instance: "const { foo, bar } = useMyStore()".\n' +
          'In Pinia, the store is a reactive proxy built on reactive(). When destructuring primitive state directly without wrapping, JavaScript copies the values, silently severing reactivity from the store.\n\n' +
          '2. Diagnosis:\n' +
          'Inspect the destructuring assignment that calls "use...Store()". If extracting state or getters, they must pass through storeToRefs.\n\n' +
          '3. Canonical Solution:\n' +
          '1. Use the official utility "storeToRefs(store)" to destructure state and getters as "Ref<T>".\n' +
          '2. Actions (store methods) must NOT pass through storeToRefs; destructure actions directly from the store instance or call "store.action()".\n' +
          '3. If exclusively destructuring actions, document with "// pinia-ok: actions only".\n\n' +
          '4. Example / Auto-fix command:\n' +
          '// ❌ Incorrect: severed reactivity on username and score\n' +
          'const { username, score, login } = useAuthStore();\n\n' +
          '// ✅ Correct: storeToRefs for state/getters, direct store for actions\n' +
          'import { storeToRefs } from "pinia";\n' +
          'const authStore = useAuthStore();\n' +
          'const { username, score } = storeToRefs(authStore);\n' +
          'const { login } = authStore;',
        'no-direct-state-mutation-outside-actions':
          '1. Root Cause:\n' +
          'Direct assignment to the internal property "store.$state = ..." was detected outside authorized persistence coordinators.\n' +
          'Overwriting $state bypasses Pinia plugins, desynchronizes $subscribe audit listeners, and violates state encapsulation.\n\n' +
          '2. Diagnosis:\n' +
          'Search for ".$state =" in the component or composable source code.\n\n' +
          '3. Canonical Solution:\n' +
          '1. Encapsulate the mutation inside a named action in the store definition.\n' +
          '2. If applying multiple property updates simultaneously, use "store.$patch({ ... })" or "store.$patch((state) => { ... })".\n' +
          '3. If this is an authorized game persistence/hydration coordinator, register the file in "config.persistence.authorizedSaveFiles" or "config.pinia.authorizedMutationFiles" in "audit.config.ts".\n\n' +
          '4. Example / Auto-fix command:\n' +
          '// ❌ Incorrect: direct reassignment of $state in component\n' +
          'playerStore.$state = newPlayerData;\n\n' +
          '// ✅ Correct: call action or use $patch\n' +
          'playerStore.loadProfile(newPlayerData);\n' +
          '// or: playerStore.$patch(newPlayerData);'
      },
      allowedExtensions: new Set(['.vue', '.ts']),
      requiresAst: true
    });
    this.storesRoots = config.paths.storesRoots ?? [];
    this.authorizedStateMutationFiles = getAuthorizedStateMutationFiles(effectiveRoot);
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

    this.addViolation({
      ruleId,
      severity: 'error',
      file: relPath,
      line: lineNum,
      message,
      context: lineContent.trim()
    });
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
    if (
      isAuthorized ||
      !ts.isBinaryExpression(node) ||
      node.operatorToken.kind !== ts.SyntaxKind.EqualsToken
    ) {
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

    const isStoreFile = this.storesRoots.some((root) =>
      isPathContained(
        path.resolve(this.projectRoot, root),
        path.resolve(this.projectRoot, normalizedPath)
      )
    );
    const isAuthorized =
      this.authorizedStateMutationFiles.has(normalizedPath) ||
      AUTHORIZED_STATE_MUTATION_FILES.has(normalizedPath);

    const sf = sourceFile ?? this.context.getAst(relPath, content);

    const storeVariables = new Set<string>();

    this.runSubAuditorSync('no-store-destructuring-without-storetorefs', () => {
      const visitDestructuring = (node: ts.Node) => {
        if (ts.isVariableDeclaration(node)) {
          this.checkStoreVariableDeclaration(
            node,
            sf,
            content,
            relPath,
            storeVariables,
            isStoreFile
          );
        }
        ts.forEachChild(node, visitDestructuring);
      };
      visitDestructuring(sf);
    });

    this.runSubAuditorSync('no-direct-state-mutation-outside-actions', () => {
      const visitMutations = (node: ts.Node) => {
        if (!ts.isVariableDeclaration(node)) {
          this.checkStateMutation(node, sf, content, relPath, storeVariables, isAuthorized);
        }
        ts.forEachChild(node, visitMutations);
      };
      visitMutations(sf);
    });
  }
}

// Standalone execution support
await BaseAuditor.runCliIfMain(import.meta.url, new PiniaReactivityAuditor());

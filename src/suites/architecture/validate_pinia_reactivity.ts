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
import { BaseAuditor,
  createUniformRemediationPhases, FileScanAuditor, createRuleCapabilities } from '../../core/auditorBase.ts';
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

function resolvePiniaAuditRoots(
  roots?: readonly string[],
  projectRoot?: string
): readonly string[] {
  return roots ?? getAuditConfig(projectRoot).paths.srcRoots ?? [];
}

export class PiniaReactivityAuditor extends FileScanAuditor<PiniaReactivityRuleId> {
  private readonly storesRoots: readonly string[];
  private readonly authorizedStateMutationFiles: ReadonlySet<string>;

  constructor(roots?: readonly string[], projectRoot?: string) {
    const piniaRoots = resolvePiniaAuditRoots(roots, projectRoot);
    const config = getAuditConfig(projectRoot);
    super({
      usesThirdPartyTool: false,
      roots: piniaRoots,
      projectRoot,
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
      description: 'Protege reactividad e integridad de stores de Pinia',
      family: 'architecture',
      ruleIds: PINIA_REACTIVITY_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(PINIA_REACTIVITY_RULES, 'behavior'),
      packageName: 'Pinia',
      configKey: 'pinia.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '🍍',
      ruleDescriptions: {
        'no-store-destructuring-without-storetorefs': 'Desestructuración sin storeToRefs',
        'no-direct-state-mutation-outside-actions': 'Mutación directa de $state'
      },
      ruleRemediations: {
        'no-store-destructuring-without-storetorefs':
          'Causa Raíz:\n' +
          'Se desestructuraron propiedades de estado o getters directamente desde una instancia de store de Pinia: "const { foo, bar } = useMyStore()".\n' +
          'En Pinia, la store es un proxy reactivo creado sobre reactive(). Al desestructurar primitivos directamente sin envoltorio, JavaScript extrae el valor por copia, rompiendo la reactividad con la store de forma silenciosa.\n\n' +
          'Diagnóstico:\n' +
          'Revisa la declaración desestructurada que llama a "use...Store()". Si estás extrayendo estado o getters, deben pasar por storeToRefs.\n\n' +
          'Solución Canónica:\n' +
          '1. Usar la utilidad oficial "storeToRefs(store)" para desestructurar estado y getters como "Ref<T>".\n' +
          '2. Las acciones (métodos de la store) NO deben pasarse por storeToRefs, sino desestructurarse directamente de la store o invocarse como "store.action()".\n' +
          '3. Si solo estás desestructurando acciones, documenta con "// pinia-ok: actions only".\n\n' +
          'Ejemplo Antes vs Después:\n' +
          '// ❌ Incorrecto: reactividad rota en username y score\n' +
          'const { username, score, login } = useAuthStore();\n\n' +
          '// ✅ Correcto: storeToRefs para estado/getters, store directo para acciones\n' +
          'import { storeToRefs } from "pinia";\n' +
          'const authStore = useAuthStore();\n' +
          'const { username, score } = storeToRefs(authStore);\n' +
          'const { login } = authStore;',
        'no-direct-state-mutation-outside-actions':
          'Causa Raíz:\n' +
          'Se detectó una asignación directa a la propiedad interna "store.$state = ..." fuera de los coordinadores autorizados de persistencia.\n' +
          'Sobrescribir $state elude los plugins de Pinia, desincroniza las suscripciones de auditoría ($subscribe) y viola el principio de encapsulamiento del estado.\n\n' +
          'Diagnóstico:\n' +
          'Busca ". $state =" en el código del componente o composable.\n\n' +
          'Solución Canónica:\n' +
          '1. Encapsular la modificación dentro de una acción nombrada ("action") en la definición de la store.\n' +
          '2. Si necesitas aplicar un parche múltiple de varias propiedades a la vez, utiliza "store.$patch({ ... })" o "store.$patch((state) => { ... })".\n' +
          '3. Si se trata de un módulo oficial de persistencia/hidratación de partidas o datos locales, registra el archivo en "config.persistence.authorizedSaveFiles" o "config.pinia.authorizedMutationFiles" en "audit.config.ts".\n\n' +
          'Ejemplo Antes vs Después:\n' +
          '// ❌ Incorrecto: reasignación directa de $state en componente\n' +
          'playerStore.$state = newPlayerData;\n\n' +
          '// ✅ Correcto: llamada a acción o uso de $patch\n' +
          'playerStore.loadProfile(newPlayerData);\n' +
          '// o bien: playerStore.$patch(newPlayerData);'
      },
      allowedExtensions: new Set(['.vue', '.ts']),
      requiresAst: true
    });
    this.storesRoots = config.paths.storesRoots ?? [];
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

    const isStoreFile = this.storesRoots.some((root) => {
      const normalizedRoot = normalizePosixPath(root).replace(/\/+$/, '') + '/';
      return normalizedPath.startsWith(normalizedRoot);
    });
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

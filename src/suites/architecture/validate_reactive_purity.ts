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

import { enableCompileCache } from 'node:module';
import ts from 'typescript';
import { BaseAuditor,
  createUniformRemediationPhases, FileScanAuditor, createRuleCapabilities } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';

enableCompileCache();

export const REACTIVE_PURITY_RULES = ['computed-state-mutation', 'computed-side-effect'] as const;

export type ReactivePurityRuleId = (typeof REACTIVE_PURITY_RULES)[number];

const IMPURE_CALL_PATTERNS = [
  'scheduleSave',
  'scheduleLocalSave',
  '.save(',
  '.persist(',
  '.saveLocal(',
  'authStore.logout',
  'window.location'
] as const;

function extractGetterFromObjectLiteral(
  expr: ts.ObjectLiteralExpression,
  sf: ts.SourceFile
): ts.Node | null {
  for (const prop of expr.properties) {
    if (ts.isPropertyAssignment(prop) && prop.name.getText(sf) === 'get') {
      if (ts.isArrowFunction(prop.initializer) || ts.isFunctionExpression(prop.initializer)) {
        return prop.initializer.body;
      }
    }
  }
  return null;
}

function extractComputedGetterBody(firstArg: ts.Node, sf: ts.SourceFile): ts.Node | null {
  if (ts.isArrowFunction(firstArg) || ts.isFunctionExpression(firstArg)) {
    return firstArg.body;
  }
  if (ts.isObjectLiteralExpression(firstArg)) {
    return extractGetterFromObjectLiteral(firstArg, sf);
  }
  return null;
}

export class ReactivePurityAuditor extends FileScanAuditor<ReactivePurityRuleId> {
  constructor(roots?: readonly string[], projectRoot?: string) {
    const config = getAuditConfig(projectRoot);
    const effectiveRoots = roots ?? [
      ...(config.paths.storesRoots ?? []),
      ...(config.paths.composablesRoots ?? [])
    ];
    super({
      usesThirdPartyTool: false,
      ruleCapabilities: createRuleCapabilities(REACTIVE_PURITY_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_reactive_purity',
      name: 'Reactive Computed Purity Auditor',
      description: 'Verifica pureza reactiva y ausencia de efectos en computeds',
      family: 'architecture',
      ruleIds: REACTIVE_PURITY_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(REACTIVE_PURITY_RULES, 'behavior'),
      packageName: 'Computed',
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
      icon: '🧼',
      ruleDescriptions: {
        'computed-state-mutation': 'Mutación de estado prohibida',
        'computed-side-effect': 'Efecto secundario prohibido'
      },
      ruleRemediations: {
        'computed-state-mutation':
          'Causa Raíz:\n' +
          'Se detectó una asignación de mutación (ref.value =, state.x =, store.x =) dentro del getter de una propiedad "computed()".\n' +
          'Los computeds en Vue 3 deben ser funciones de cálculo puro que derivan un valor sin alterar el estado del sistema. Mutar estado dentro de un getter desestabiliza el grafo de dependencias reactivas y genera loops de actualización descontrolados.\n\n' +
          'Diagnóstico:\n' +
          'Revisa el bloque computed indicado en el reporte. Localiza la asignación con operador de igualdad (=, +=, -=).\n\n' +
          'Solución Canónica:\n' +
          '1. Eliminar la asignación de estado del interior del computed.\n' +
          '2. Si la mutación debe dispararse cuando cambian otras dependencias, utiliza un "watch" o "watchEffect" explícito.\n' +
          '3. Si el caso es una inicialización perezosa intencional legítima y aislada, utiliza el escape "// purity-ok: <justificación>".\n\n' +
          'Ejemplo Antes vs Después:\n' +
          '// ❌ Incorrecto: mutación de ref dentro del getter\n' +
          'const fullName = computed(() => {\n' +
          '  accessCount.value++;\n' +
          '  return `${firstName.value} ${lastName.value}`;\n' +
          '});\n\n' +
          '// ✅ Correcto: derivación pura\n' +
          'const fullName = computed(() => `${firstName.value} ${lastName.value}`);',
        'computed-side-effect':
          'Causa Raíz:\n' +
          'Se detectó una invocación a un método con efectos secundarios (ej. ".save()", "scheduleSave()", "authStore.logout()", "window.location") dentro de un "computed()".\n' +
          'Los getters computados son evaluados de forma perezosa (lazy) por el motor reactivo de Vue o de forma recurrente durante el ciclo de vida del componente. Disparar persistencia o navegación dentro de un getter genera efectos colaterales impredecibles.\n\n' +
          'Diagnóstico:\n' +
          'Busca llamadas a persistencia o navegación dentro de "computed(() => ...)".\n\n' +
          'Solución Canónica:\n' +
          'Mover la llamada a la persistencia o navegación a una acción de store, a un manejador de eventos o a un "watch" que reaccione al cambio de la propiedad computada.\n\n' +
          'Ejemplo Antes vs Después:\n' +
          '// ❌ Incorrecto: guardar cambios automáticamente dentro del getter\n' +
          'const total = computed(() => {\n' +
          '  const res = calculateTotal();\n' +
          '  scheduleSave();\n' +
          '  return res;\n' +
          '});\n\n' +
          '// ✅ Correcto: cálculo puro en computed y persistencia en evento o watch\n' +
          'const total = computed(() => calculateTotal());\n' +
          'watch(total, () => { scheduleSave(); });'
      },
      roots: effectiveRoots,
      allowedExtensions: new Set(['.ts', '.vue']),
      projectRoot
    });
  }

  private checkComputedCall(
    node: ts.Node,
    sf: ts.SourceFile,
    relPath: string,
    content: string
  ): void {
    if (!ts.isCallExpression(node)) return;
    if (node.expression.getText(sf) !== 'computed' || node.arguments.length === 0) return;

    const firstArg = node.arguments[0];
    if (!firstArg) return;

    const getterBody = extractComputedGetterBody(firstArg, sf);
    if (getterBody) {
      this.inspectGetterBody(getterBody, sf, relPath, content);
    }
  }

  private activeTargetRule?: ReactivePurityRuleId;

  protected override scanFile(relPath: string, content: string, sourceFile?: ts.SourceFile): void {
    if (!content.includes('computed')) return;

    const sf = sourceFile ?? this.context.getAst(relPath, content);
    if (!sf.text.trim()) return;

    this.runSubAuditorSync('computed-state-mutation', () => {
      this.activeTargetRule = 'computed-state-mutation';
      const visit = (node: ts.Node) => {
        this.checkComputedCall(node, sf, relPath, content);
        ts.forEachChild(node, visit);
      };
      visit(sf);
    });

    this.runSubAuditorSync('computed-side-effect', () => {
      this.activeTargetRule = 'computed-side-effect';
      const visit = (node: ts.Node) => {
        this.checkComputedCall(node, sf, relPath, content);
        ts.forEachChild(node, visit);
      };
      visit(sf);
      this.activeTargetRule = undefined;
    });
  }

  private reportComputedViolation(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    relPath: string,
    fullContent: string,
    ruleId: ReactivePurityRuleId,
    message: string
  ): void {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const realLine = line + 1;
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

  private inspectGetterBody(
    bodyNode: ts.Node,
    sourceFile: ts.SourceFile,
    relPath: string,
    fullContent: string
  ): void {
    const walk = (child: ts.Node) => {
      // Check for state mutations (=, +=, -=, etc.)
      if (!this.activeTargetRule || this.activeTargetRule === 'computed-state-mutation') {
        if (ts.isBinaryExpression(child)) {
          const op = child.operatorToken.kind;
          const isAssignment =
            op >= ts.SyntaxKind.FirstAssignment && op <= ts.SyntaxKind.LastAssignment;
          if (isAssignment) {
            const leftText = child.left.getText(sourceFile);
            const isReactiveMutation =
              leftText.includes('.value') ||
              leftText.startsWith('state.') ||
              leftText.startsWith('this.') ||
              leftText.includes('Store.');

            if (isReactiveMutation) {
              this.reportComputedViolation(
                child,
                sourceFile,
                relPath,
                fullContent,
                'computed-state-mutation',
                `Mutación impura dentro de 'computed()': '${child.getText(sourceFile)}'. Los computed deben ser funciones puras.`
              );
            }
          }
        }
      }

      // Check for impure side-effect calls (.scheduleSave(), etc.)
      if (!this.activeTargetRule || this.activeTargetRule === 'computed-side-effect') {
        if (ts.isCallExpression(child)) {
          const callText = child.expression.getText(sourceFile);
          const isImpureCall = IMPURE_CALL_PATTERNS.some((pat) => callText.includes(pat));
          if (isImpureCall) {
            this.reportComputedViolation(
              child,
              sourceFile,
              relPath,
              fullContent,
              'computed-side-effect',
              `Llamada con efectos secundarios dentro de 'computed()': '${child.getText(sourceFile)}'. Queda prohibido disparar persistencia en getters.`
            );
          }
        }
      }

      ts.forEachChild(child, walk);
    };

    ts.forEachChild(bodyNode, walk);
  }

  private hasPuritySuppression(content: string, lineIndex: number): boolean {
    const lines = content.split('\n');
    const targetLine = lines[lineIndex] || '';
    const prevLine = lineIndex > 0 ? lines[lineIndex - 1] || '' : '';
    const suppressionRegex = /\/\/\s*purity-ok:\s*\S+/i;
    return suppressionRegex.test(targetLine) || suppressionRegex.test(prevLine);
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new ReactivePurityAuditor());

/**
 * scripts/auditors/architecture/validate_reactive_purity.ts
 *
 * REACTIVE COMPUTED PURITY AUDITOR (Node.js 26+ Native)
 *
 * Enforces pure, side-effect-free computed getters across stores and composables:
 *   1. Computed getters must NEVER mutate state (.value =, state.x =, this.x =, store.x =).
 *   2. Computed getters must NEVER trigger persistence side-effects (.save(), scheduleSave(), etc.).
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_reactive_purity.ts
 *   npm run validate:reactive-purity
 */

import { enableCompileCache } from 'node:module';

import ts from 'typescript';

import {
  BaseAuditor,
  createUniformRemediationPhases,
  FileScanAuditor,
  createRuleCapabilities,
  resolveFileScanRoots,
  type FileScanRootsOptions
} from '../../core/auditorBase.ts';

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
  public constructor(options: FileScanRootsOptions = {}) {
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(options, (config) => [
      ...(config.paths.storesRoots ?? []),
      ...(config.paths.composablesRoots ?? [])
    ]);
    super({
      ruleFixers: {},
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleCapabilities: createRuleCapabilities(REACTIVE_PURITY_RULES, {
        speed: 'light',
        phase: 'normal',
        md: false,
        ast: true,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_reactive_purity',
      name: 'Reactive Computed Purity Auditor',
      description: 'Verifies reactive purity and computed effects',
      family: 'architecture',
      ruleIds: REACTIVE_PURITY_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(REACTIVE_PURITY_RULES, 'behavior'),
      packageName: 'Computed',
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
      icon: '🧼',
      ruleDescriptions: {
        'computed-state-mutation': 'Prohibited state mutation',
        'computed-side-effect': 'Prohibited side-effect in computed'
      },
      ruleRemediations: {
        'computed-state-mutation':
          '📖 REMEDIATION GUIDE: computed-state-mutation\n' +
          '1. Root Cause: A state mutation assignment (`ref.value =`, `state.x =`, `store.x =`) was detected inside a `computed()` getter. In Vue 3, computed properties must be pure derivations without side effects. Mutating state inside a getter destabilizes reactive dependencies and triggers infinite re-render loops.\n' +
          '2. Diagnosis: Inspect the reported computed block and locate the assignment operator (`=`, `+=`, `-=`).\n' +
          '3. Canonical Solution:\n' +
          '   a) Remove state mutations from the computed getter.\n' +
          '   b) If mutations must execute on dependency changes, use an explicit `watch` or `watchEffect`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Prohibited: `const fullName = computed(() => { accessCount.value++; return `${firstName.value} ${lastName.value}`; });`\n' +
          '   ✅ Canonical:  `const fullName = computed(() => `${firstName.value} ${lastName.value}`);`',
        'computed-side-effect':
          '📖 REMEDIATION GUIDE: computed-side-effect\n' +
          '1. Root Cause: A side-effect method call (e.g., `.save()`, `scheduleSave()`, `authStore.logout()`, `window.location`) was detected inside a `computed()` getter. Computed getters are lazily evaluated by Vue and should remain free of side-effects.\n' +
          '2. Diagnosis: Look for persistence, navigation, or asynchronous calls inside `computed(() => ...)`.\n' +
          '3. Canonical Solution: Move side effects to an event handler, store action, or a `watch()` observing the computed property.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Prohibited: `const total = computed(() => { const r = calc(); scheduleSave(); return r; });`\n' +
          '   ✅ Canonical:  `const total = computed(() => calc()); watch(total, () => scheduleSave());`'
      },
      roots: targetRoots,
      allowedExtensions: new Set(['.ts', '.vue']),
      projectRoot: effectiveRoot
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
      const visit = (node: ts.Node): void => {
        this.checkComputedCall(node, sf, relPath, content);
        ts.forEachChild(node, visit);
      };
      visit(sf);
    });

    this.runSubAuditorSync('computed-side-effect', () => {
      this.activeTargetRule = 'computed-side-effect';
      const visit = (node: ts.Node): void => {
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
    _fullContent: string,
    ruleId: ReactivePurityRuleId,
    message: string
  ): void {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const realLine = line + 1;
    this.addViolation({
      ruleId,
      severity: 'error',
      file: relPath,
      line: realLine,
      message,
      context: node.getText(sourceFile)
    });
  }

  private inspectGetterBody(
    bodyNode: ts.Node,
    sourceFile: ts.SourceFile,
    relPath: string,
    fullContent: string
  ): void {
    const walk = (child: ts.Node): void => {
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
              `Side-effect call detected inside 'computed()': '${child.getText(sourceFile)}'. Triggering persistence or mutations inside getters is prohibited.`
            );
          }
        }
      }

      ts.forEachChild(child, walk);
    };

    ts.forEachChild(bodyNode, walk);
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new ReactivePurityAuditor());

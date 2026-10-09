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
import { BaseAuditor, FileScanAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';

enableCompileCache();

export type ReactivePurityRuleId =
  | 'computed-state-mutation'
  | 'computed-side-effect';

export const REACTIVE_PURITY_RULES: readonly ReactivePurityRuleId[] = [
  'computed-state-mutation',
  'computed-side-effect'
] as const;

const IMPURE_CALL_PATTERNS = [
  'scheduleSave',
  'scheduleLocalSave',
  '.save(',
  '.persist(',
  '.saveLocal(',
  'authStore.logout',
  'window.location'
] as const;

function extractGetterFromObjectLiteral(expr: ts.ObjectLiteralExpression, sf: ts.SourceFile): ts.Node | null {
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
      configKey: 'paths',
      defaultConfig: {},
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

  protected override scanFile(relPath: string, content: string, sourceFile?: ts.SourceFile): void {
    if (!content.includes('computed')) return;

    const sf = sourceFile ?? this.context.getAst(relPath, content);
    if (!sf.text.trim()) return;

    const visit = (node: ts.Node) => {
      this.checkComputedCall(node, sf, relPath, content);
      ts.forEachChild(node, visit);
    };

    visit(sf);
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
      if (ts.isBinaryExpression(child)) {
        const op = child.operatorToken.kind;
        const isAssignment = op >= ts.SyntaxKind.FirstAssignment && op <= ts.SyntaxKind.LastAssignment;
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

      // Check for impure side-effect calls (.scheduleSave(), etc.)
      if (ts.isCallExpression(child)) {
        const callText = child.expression.getText(sourceFile);
        const isImpureCall = IMPURE_CALL_PATTERNS.some(pat => callText.includes(pat));
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

      ts.forEachChild(child, walk);
    };

    ts.forEachChild(bodyNode, walk);
  }

  private hasPuritySuppression(content: string, lineIndex: number): boolean {
    const lines = content.split('\n');
    const targetLine = lines[lineIndex] || '';
    const prevLine = lineIndex > 0 ? (lines[lineIndex - 1] || '') : '';
    const suppressionRegex = /\/\/\s*purity-ok:\s*\S+/i;
    return suppressionRegex.test(targetLine) || suppressionRegex.test(prevLine);
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new ReactivePurityAuditor());

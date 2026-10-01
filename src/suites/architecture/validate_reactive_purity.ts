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
      ruleDescriptions: {
        'computed-state-mutation': 'Mutación de estado prohibida',
        'computed-side-effect': 'Efecto secundario prohibido'
      },
      roots: effectiveRoots,
      allowedExtensions: new Set(['.ts', '.vue']),
      projectRoot
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    if (!content.includes('computed')) return;

    const { scriptContent, offsetLine } = this.extractScript(content, relPath);
    if (!scriptContent) return;

    const sf = ts.createSourceFile(path.basename(relPath), scriptContent, ts.ScriptTarget.Latest, true);

    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const calleeText = node.expression.getText(sf);
        if (calleeText === 'computed' && node.arguments.length > 0) {
          const firstArg = node.arguments[0];
          if (!firstArg) return;

          let getterBody: ts.Node | null = null;
          if (ts.isArrowFunction(firstArg) || ts.isFunctionExpression(firstArg)) {
            getterBody = firstArg.body;
          } else if (ts.isObjectLiteralExpression(firstArg)) {
            for (const prop of firstArg.properties) {
              if (ts.isPropertyAssignment(prop) && prop.name.getText(sf) === 'get') {
                if (ts.isArrowFunction(prop.initializer) || ts.isFunctionExpression(prop.initializer)) {
                  getterBody = prop.initializer.body;
                }
              }
            }
          }

          if (getterBody) {
            this.inspectGetterBody(getterBody, sf, relPath, content, offsetLine);
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sf);
  }

  private inspectGetterBody(
    bodyNode: ts.Node,
    sourceFile: ts.SourceFile,
    relPath: string,
    fullContent: string,
    lineOffset: number
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
            const { line } = sourceFile.getLineAndCharacterOfPosition(child.getStart(sourceFile));
            const realLine = line + lineOffset + 1;
            if (!this.hasPuritySuppression(fullContent, realLine - 1)) {
              this.addViolation({
                ruleId: 'computed-state-mutation',
                severity: 'error',
                file: relPath,
                line: realLine,
                message: `Mutación impura dentro de 'computed()': '${child.getText(sourceFile)}'. Los computed deben ser funciones puras.`,
                context: child.getText(sourceFile)
              });
            }
          }
        }
      }

      // Check for impure side-effect calls (.scheduleSave(), etc.)
      if (ts.isCallExpression(child)) {
        const callText = child.expression.getText(sourceFile);
        const isImpureCall = IMPURE_CALL_PATTERNS.some(pat => callText.includes(pat));
        if (isImpureCall) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(child.getStart(sourceFile));
          const realLine = line + lineOffset + 1;
          if (!this.hasPuritySuppression(fullContent, realLine - 1)) {
            this.addViolation({
              ruleId: 'computed-side-effect',
              severity: 'error',
              file: relPath,
              line: realLine,
              message: `Llamada con efectos secundarios dentro de 'computed()': '${child.getText(sourceFile)}'. Queda prohibido disparar persistencia en getters.`,
              context: child.getText(sourceFile)
            });
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
    const prevLine = lineIndex > 0 ? (lines[lineIndex - 1] || '') : '';
    const suppressionRegex = /\/\/\s*purity-ok:\s*\S+/i;
    return suppressionRegex.test(targetLine) || suppressionRegex.test(prevLine);
  }

  private extractScript(content: string, filePath: string): { scriptContent: string; offsetLine: number } {
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
if (process.argv[1] && import.meta.filename && path.basename(process.argv[1]) === path.basename(import.meta.filename)) {
  await BaseAuditor.runCli(new ReactivePurityAuditor());
}

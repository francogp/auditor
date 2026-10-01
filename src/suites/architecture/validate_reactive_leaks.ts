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

import path from 'node:path';
import { enableCompileCache } from 'node:module';
import ts from 'typescript';
import { BaseAuditor, FileScanAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';

enableCompileCache();

export type ReactiveLeakRuleId =
  | 'dom-event-leak'
  | 'interval-leak';

export const REACTIVE_LEAK_RULES: readonly ReactiveLeakRuleId[] = [
  'dom-event-leak',
  'interval-leak'
] as const;

export class ReactiveLeaksAuditor extends FileScanAuditor<ReactiveLeakRuleId> {
  constructor(roots?: readonly string[], projectRoot?: string) {
    const config = getAuditConfig(projectRoot);
    const effectiveRoots = roots ?? [
      ...(config.paths.componentsRoots ?? ['src/components']),
      ...(config.paths.viewsRoots ?? ['src/views']),
      ...(config.paths.composablesRoots ?? ['src/composables'])
    ];
    super({
      id: 'validate_reactive_leaks',
      name: 'Reactive & DOM Event Leak Auditor',
      description: 'Detecta posibles fugas de memoria y listeners sin limpiar',
      family: 'architecture',
      ruleIds: REACTIVE_LEAK_RULES,
      packageName: 'Fuga',
      ruleDescriptions: {
        'dom-event-leak': 'addEventListener sin limpiar',
        'interval-leak': 'setInterval sin limpiar'
      },
      requiresAst: true,
      roots: effectiveRoots,
      allowedExtensions: new Set(['.ts', '.vue']),
      projectRoot
    });
  }

  protected override scanFile(relPath: string, content: string, sourceFile?: ts.SourceFile): void {
    // Fast string pre-filter to skip files that cannot contain reactive leaks
    if (!content.includes('addEventListener') && !content.includes('setInterval')) {
      return;
    }

    const sf = sourceFile ?? this.createStandaloneSourceFile(relPath, content);
    if (!sf.text.trim()) return;

    const fullLines = content.split('\n');
    const hasUnmountHook = content.includes('onUnmounted') || content.includes('onBeforeUnmount') || content.includes('onScopeDispose');
    const hasRemoveEventListener = content.includes('removeEventListener');
    const hasClearInterval = content.includes('clearInterval');

    const checkLineEscape = (lineNum: number): boolean => {
      const lineText = fullLines[lineNum - 1] || '';
      return lineText.includes('leak-ok') || lineText.includes('reactive-leak-ok');
    };

    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const expr = node.expression;

        // 1. addEventListener Check
        if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'addEventListener') {
          const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

          if (!checkLineEscape(line)) {
            let isOnce = false;
            if (node.arguments.length >= 3) {
              const optionsArg = node.arguments[2];
              if (optionsArg && ts.isObjectLiteralExpression(optionsArg)) {
                for (const prop of optionsArg.properties) {
                  if (ts.isPropertyAssignment(prop) && prop.name && ts.isIdentifier(prop.name) && prop.name.text === 'once') {
                    if (prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
                      isOnce = true;
                    }
                  }
                }
              }
            }

            if (!isOnce && !hasRemoveEventListener && !hasUnmountHook) {
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
        }

        // 2. setInterval Check
        if (ts.isIdentifier(expr) && expr.text === 'setInterval') {
          const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

          if (!checkLineEscape(line) && !hasClearInterval) {
            this.addViolation({
              ruleId: 'interval-leak',
              severity: 'error',
              file: relPath,
              line,
              message: 'setInterval ejecutado sin clearInterval en el componente o composable.',
              context: node.getText(sf)
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sf);
  }

  private createStandaloneSourceFile(relPath: string, content: string): ts.SourceFile {
    let scriptContent = content;
    if (relPath.endsWith('.vue')) {
      const match = content.match(/<script\b[^>]*>([\s\S]*?)<\/script>/i);
      const openTagMatch = content.match(/<script\b[^>]*>/i);
      const openTagEnd = openTagMatch && openTagMatch.index !== undefined ? openTagMatch.index + openTagMatch[0].length : 0;
      const linesBefore = (content.substring(0, openTagEnd).match(/\n/g) ?? []).length;
      scriptContent = '\n'.repeat(linesBefore) + (match ? match[1] ?? '' : '');
    }

    return ts.createSourceFile(
      path.basename(relPath),
      scriptContent,
      ts.ScriptTarget.Latest,
      true,
      relPath.endsWith('.vue') ? ts.ScriptKind.TS : undefined
    );
  }
}

// Canonical CLI Entrypoint
if (process.argv[1] && import.meta.filename && path.basename(process.argv[1]) === path.basename(import.meta.filename)) {
  await BaseAuditor.runCli(new ReactiveLeaksAuditor());
}

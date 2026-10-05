/**
 * TEMPLATE: AST-Driven Sub-Auditor
 * Location: scripts/auditors/<family>/validate_<name>.ts
 * 
 * Use this template when your auditor requires TypeScript AST syntax analysis
 * across source files or Vue Single File Components (SFC).
 */

import path from 'node:path';
import ts from 'typescript';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, SharedAstContext } from '@francogp/auditor';

enableCompileCache();

export type MyAstRuleId =
  | 'my-ast-forbidden-pattern'
  | 'my-ast-missing-contract';

export const MY_AST_RULES: readonly MyAstRuleId[] = [
  'my-ast-forbidden-pattern',
  'my-ast-missing-contract'
] as const;

export class MyAstAuditor extends BaseAuditor<MyAstRuleId> {
  constructor() {
    super({
      capabilities: { ast: true },
      id: 'validate_my_ast',
      name: 'My AST Validator',
      description: 'Valida contratos AST en TypeScript y Vue SFC',
      icon: '🌳', // Mandatory thematic emoji representing this auditor
      family: 'architecture', // 'architecture' | 'domain_data' | 'persistence' | 'fsm' | 'assets' | 'documentation'
      ruleIds: MY_AST_RULES,
      packageName: 'AST',
      ruleDescriptions: {
        'my-ast-forbidden-pattern': 'Patrón sintáctico prohibido en AST',
        'my-ast-missing-contract': 'Declaración requerida faltante'
      },
      requiresAst: true,
      roots: ['src'],
      allowedExtensions: new Set(['.ts', '.vue'])
    });
  }

  public override async runAudit(astContext?: SharedAstContext): Promise<void> {
    this.context.logStep(1, 1, 'Inspeccionando nodos AST en archivos del proyecto...');

    // Guarantee AST engine availability (injected by orchestrator or fallback)
    const astEngine = astContext ?? new SharedAstContext();

    const relFiles = await this.context.collectFiles(['src'], new Set(['.ts', '.vue']));
    const targetFiles = relFiles.filter(f => !f.includes('.spec.') && !f.includes('.test.') && !f.includes('.d.ts'));

    for (const relFile of targetFiles) {
      const absPath = path.resolve(this.projectRoot, relFile);
      this.recordScanned(absPath);
      this.markRuleEvaluated('my-ast-forbidden-pattern');

      // Cached O(1) AST retrieval with Vue script extraction & line offset support
      const sourceFile = astEngine.getSourceFile(absPath);

      const visit = (node: ts.Node): void => {
        // Implement AST inspection logic:
        // if (ts.isIdentifier(node) && node.text === 'forbidden') { ... }
        ts.forEachChild(node, visit);
      };

      visit(sourceFile);
    }

    this.context.setMetric('AST Files Analyzed', targetFiles.length);
  }
}

// Canonical CLI Entrypoint for standalone and dynamic execution
await BaseAuditor.runCliIfMain(import.meta.url, new MyAstAuditor());


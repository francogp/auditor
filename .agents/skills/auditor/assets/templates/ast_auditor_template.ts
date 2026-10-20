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
import {
  BaseAuditor,
  SharedAstContext,
  createUniformRuleCapabilities,
  createUniformRemediationPhases,
  resolveFileScanRoots,
  deriveCoverageFromRoots,
  type FileScanRootsOptions
} from '@francogp/auditor';

enableCompileCache();

export type MyAstRuleId =
  | 'my-ast-forbidden-pattern'
  | 'my-ast-missing-contract';

export const MY_AST_RULES: readonly MyAstRuleId[] = [
  'my-ast-forbidden-pattern',
  'my-ast-missing-contract'
] as const;

export type MyAstAuditorOptions = FileScanRootsOptions;

export class MyAstAuditor extends BaseAuditor<MyAstRuleId> {
  private readonly targetRoots: readonly string[];

  constructor(options: MyAstAuditorOptions = {}) {
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(
      options,
      (config) => config.paths?.srcRoots
    );
    const allowedExtensions = new Set(['.ts', '.vue']);

    super({
      // Mandatory: Explicit 7-field orthogonal rule capabilities (Zero Fallbacks Mandate)
      ruleCapabilities: createUniformRuleCapabilities(MY_AST_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: true,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_my_ast',
      name: 'My AST Validator',
      description: 'Valida contratos AST en TypeScript y Vue SFC',
      icon: '🌳', // Mandatory thematic emoji representing this auditor
      family: 'architecture', // 'architecture' | 'domain_data' | 'persistence' | 'fsm' | 'assets' | 'documentation'
      ruleIds: MY_AST_RULES,
      packageName: 'AST',
      // Mandatory: SSoT configuration key inspected by the dynamic suite gating engine:
      configKey: 'paths.srcRoots',
      // Mandatory: Default configuration object dynamically collected for .auditor/audit.config.ts:
      defaultConfig: {
        srcRoots: ['src']
      },
      // Mandatory: Invariant critical configuration baseline (requiredMinimums / forbiddenOverrides)
      // Pass empty object {} when no immutable minimums are enforced.
      criticalConfig: {},
      // Mandatory: Node.js Permission Model flags required by this suite (pass [] for standard suites)
      requiredPermissions: [],
      usesThirdPartyTool: false,
      ruleDescriptions: {
        'my-ast-forbidden-pattern': 'Patrón sintáctico prohibido en AST',
        'my-ast-missing-contract': 'Declaración requerida faltante'
      },
      // Mandatory diagnostic and remediation guide for 100% of declared rules (4-section canonical structure):
      ruleRemediations: {
        'my-ast-forbidden-pattern':
          'Causa Raíz: Se detectó una construcción de AST prohibida por las políticas arquitecturales del proyecto.\n' +
          'Diagnóstico: Inspecciona el archivo y localiza el nodo AST infractor reportado.\n' +
          'Solución Canónica: Refactoriza el código utilizando los métodos o estructuras canónicas indicadas.\n' +
          'Ejemplo / Comando: npm run auditor',
        'my-ast-missing-contract':
          'Causa Raíz: El archivo analizado carece de una declaración o contrato mandatorio.\n' +
          'Diagnóstico: Inspecciona las firmas del módulo y contrasta con la interfaz requerida.\n' +
          'Solución Canónica: Implementa la interfaz o añade la exportación exigida por la arquitectura.\n' +
          'Ejemplo / Comando: npm run auditor'
      },
      // Strategic Remediation Order: Mandatory mapping of every rule to one of the 7 canonical phases
      ruleRemediationPhases: createUniformRemediationPhases(MY_AST_RULES, 'hygiene'),
      requiresAst: true,
      roots: targetRoots,
      allowedExtensions,
      coverage: deriveCoverageFromRoots(targetRoots, allowedExtensions, effectiveRoot),
      projectRoot: effectiveRoot
    });

    this.targetRoots = targetRoots;
  }

  public override async runAudit(astContext?: SharedAstContext): Promise<void> {
    // Guarantee AST engine availability (injected by orchestrator or fallback)
    const astEngine = astContext ?? new SharedAstContext(this.projectRoot);

    const relFiles = await this.context.collectFiles(this.targetRoots, new Set(['.ts', '.vue']));
    const targetFiles = relFiles.filter(f => !f.includes('.spec.') && !f.includes('.test.') && !f.includes('.d.ts'));

    for (const relFile of targetFiles) {
      const absPath = path.resolve(this.projectRoot, relFile);
      this.recordScanned(relFile);

      // Cached O(1) AST retrieval with Vue script extraction & line offset support
      const sourceFile = astEngine.getSourceFile(absPath);

      // Rule 1: Forbidden pattern in AST (automatically timed and marked evaluated)
      this.runSubAuditorSync('my-ast-forbidden-pattern', () => {
        const visit = (node: ts.Node): void => {
          // Implement AST inspection logic:
          // if (ts.isIdentifier(node) && node.text === 'forbidden') { ... }
          ts.forEachChild(node, visit);
        };
        visit(sourceFile);
      });

      // Rule 2: Missing contract in AST (automatically timed and marked evaluated)
      this.runSubAuditorSync('my-ast-missing-contract', () => {
        // Implement missing contract inspection logic
      });
    }

    this.context.setMetric('AST Files Analyzed', targetFiles.length);
  }
}

// Canonical CLI Entrypoint for standalone and dynamic execution
await BaseAuditor.runCliIfMain(import.meta.url, new MyAstAuditor());


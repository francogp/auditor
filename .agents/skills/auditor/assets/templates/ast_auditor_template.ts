/**
 * TEMPLATE: AST-Driven Sub-Auditor
 * Location: scripts/auditors/<family>/validate_<name>.ts
 *
 * Use this template when your auditor requires TypeScript AST syntax analysis
 * across source files or Vue Single File Components (SFC).
 *
 * CLI Contract Governance (`validate_cli_contracts`):
 *   - Standalone CLI execution MUST use `await BaseAuditor.runCliIfMain(import.meta.url, new MyAstAuditor());`
 *     which delegates argument parsing (`human`, `--fix`, `--json`, `--help`) to the canonical `citty` harness.
 *   - Direct `process.argv` access, `node:util.parseArgs`, or homebrew flag parsing (`startsWith('--')`)
 *     is strictly prohibited.
 */

import path from 'node:path';
import ts from 'typescript';
import { enableCompileCache } from 'node:module';
import {
  BaseAuditor,
  SharedAstContext,
  getEffectiveIgnoreGlobs,
  resolveFileScanRoots,
  deriveCoverageFromRoots,
  createUniformRuleCapabilities,
  type AuditorRuleCapabilities,
  type RemediationPhaseId,
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
  // Sub-Auditor Cache & Temporary Paths Contract:
  // Declare custom cache/temp folders so auditor registers them and auto-injects them to .gitignore
  public static readonly cachePaths = ['.my_ast_cache'] as const;

  private readonly targetRoots: readonly string[];

  constructor(options: MyAstAuditorOptions = {}) {
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(
      options,
      (config) => config.paths?.srcRoots
    );
    const allowedExtensions = new Set(['.ts', '.vue']);

    super({
      ruleFixers: {},
      // Mandatory: Explicit orthogonal rule capabilities.
      // Zero Manual Booleans: 'fix' is computed dynamically by BaseAuditor based on registered fixers.
      ruleCapabilities: createUniformRuleCapabilities(MY_AST_RULES, {
        speed: 'light',
        phase: 'normal',
        md: false,
        ast: true,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_my_ast',
      name: 'My AST Validator',
      description: 'Validates AST contracts across TypeScript and Vue SFCs',
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
      // Mandatory sub-auditor cache paths contract:
      cachePaths: MyAstAuditor.cachePaths,
      ruleDescriptions: {
        'my-ast-forbidden-pattern': 'Forbidden syntactic pattern in AST (e.g. direct eval or forbidden token)',
        'my-ast-missing-contract': 'Missing required declaration contract in exported functions'
      },
      // Mandatory diagnostic and remediation guide for 100% of declared rules (4-section canonical structure in English):
      ruleRemediations: {
        'my-ast-forbidden-pattern':
          '1. Root Cause: An AST construct prohibited by architectural policies was detected.\n' +
          '2. Diagnosis: Inspect the file and locate the offending AST node reported.\n' +
          '3. Canonical Solution: Refactor the code using the canonical methods or structures.\n' +
          '4. Example / Command: npm run auditor',
        'my-ast-missing-contract':
          '1. Root Cause: The analyzed module is missing a mandatory declaration or contract.\n' +
          '2. Diagnosis: Inspect the module signatures and compare against the required interface.\n' +
          '3. Canonical Solution: Implement the required interface or export.\n' +
          '4. Example / Command: npm run auditor'
      },
      // Strategic Remediation Order: Mandatory mapping of every rule to one of the 7 canonical phases
      ruleRemediationPhases: {
        'my-ast-forbidden-pattern': 'hygiene',
        'my-ast-missing-contract': 'contracts'
      },
      requiresAst: true,
      roots: targetRoots,
      allowedExtensions,
      // Dynamic SSoT ignore globs derived without hardcoding
      coverage: {
        ...deriveCoverageFromRoots(targetRoots, allowedExtensions, effectiveRoot),
        exclude: getEffectiveIgnoreGlobs(effectiveRoot)
      },
      projectRoot: effectiveRoot
    });

    this.targetRoots = targetRoots;
  }

  public override async runAudit(astContext?: SharedAstContext): Promise<void> {
    // Guarantee AST engine availability (injected by orchestrator or fallback)
    const astEngine = astContext ?? new SharedAstContext(this.projectRoot);

    const relFiles = await this.context.collectFiles(this.targetRoots, new Set(['.ts', '.vue']));
    const targetFiles = relFiles.filter(
      (f) => !f.includes('.spec.') && !f.includes('.test.') && !f.includes('.d.ts')
    );

    for (const relFile of targetFiles) {
      const absPath = path.resolve(this.projectRoot, relFile);
      this.recordScanned(relFile);

      // Cached O(1) AST retrieval with Vue script extraction & line offset support
      const sourceFile = astEngine.getSourceFile(absPath);

      // Rule 1: Forbidden pattern in AST (inspected via TypeScript Compiler API AST traversal)
      this.runSubAuditorSync('my-ast-forbidden-pattern', () => {
        const visit = (node: ts.Node): void => {
          // Canonical AST traversal: detect forbidden Identifier or CallExpression
          if (ts.isIdentifier(node) && node.text === 'eval') {
            const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
            this.addFinding({
              ruleId: 'my-ast-forbidden-pattern',
              file: relFile,
              line: line + 1,
              column: character + 1,
              message: `Prohibited identifier '${node.text}' found in AST.`
            });
          }
          ts.forEachChild(node, visit);
        };
        visit(sourceFile);
      });

      // Rule 2: Missing contract in AST (checks exported declarations)
      this.runSubAuditorSync('my-ast-missing-contract', () => {
        let hasExportedContract = false;
        for (const statement of sourceFile.statements) {
          if (
            ts.isFunctionDeclaration(statement) &&
            statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
          ) {
            hasExportedContract = true;
            break;
          }
        }
        if (!hasExportedContract && !relFile.endsWith('.vue')) {
          this.addFinding({
            ruleId: 'my-ast-missing-contract',
            file: relFile,
            line: 1,
            column: 1,
            message: `File '${relFile}' does not export any function contract.`
          });
        }
      });
    }

    this.context.setMetric('AST Files Analyzed', targetFiles.length);
  }
}

// Canonical CLI Entrypoint (delegates argument parsing to Citty via BaseAuditor)
await BaseAuditor.runCliIfMain(import.meta.url, new MyAstAuditor());

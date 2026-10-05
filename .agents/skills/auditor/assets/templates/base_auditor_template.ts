/**
 * TEMPLATE: BaseAuditor (Composite / Multi-File / Database Auditor)
 * Location: scripts/auditors/<family>/validate_<name>.ts
 * 
 * Use this template when your auditor validates cross-file relationships,
 * static TypeScript databases, SQL schemas, FSM diagrams, or asset bundles.
 */

import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, type GitIgnoreRequirement } from '@francogp/auditor';

enableCompileCache();

export type MyCompositeRuleId =
  | 'composite-missing-entry'
  | 'composite-parity-mismatch';

export const MY_COMPOSITE_RULES: readonly MyCompositeRuleId[] = [
  'composite-missing-entry',
  'composite-parity-mismatch'
] as const;

export class MyCompositeAuditor extends BaseAuditor<MyCompositeRuleId> {
  // Optional gitignore requirements for tool caches or ephemeral artifacts:
  public static readonly gitIgnoreEntries: readonly GitIgnoreRequirement[] = [
    // { id: 'my-cache', pattern: '.my-cache/', reason: 'Caché de mi herramienta' }
  ];

  constructor() {
    super({
      // Optional capabilities: all default to false automatically.
      // Example: capabilities: { lint: true, fix: true },
      // Optional gitignore requirements registered dynamically without hardcoding:
      gitIgnoreEntries: MyCompositeAuditor.gitIgnoreEntries,
      id: 'validate_my_composite',
      name: 'My Composite Auditor',
      description: 'Valida integridad y paridad cruzada en bases de datos',
      icon: '🏛️', // Mandatory thematic emoji representing this auditor
      family: 'domain_data', // 'architecture' | 'domain_data' | 'persistence' | 'fsm' | 'assets' | 'documentation'
      ruleIds: MY_COMPOSITE_RULES,
      packageName: 'Datos',
      ruleDescriptions: {
        'composite-missing-entry': 'Entrada faltante en registro canónico',
        'composite-parity-mismatch': 'Desincronización entre datasets'
      },
      coverage: {
        include: ['src/data/**/*.{ts,json}'],
        source: 'runtime'
      },
      requiredFiles: [
        path.resolve(process.cwd(), 'src/data/canonicalData.ts')
      ]
    });
  }

  public override async runAudit(): Promise<void> {
    this.context.logStep(1, 2, 'Loading and indexing canonical datasets...');

    // Option A: Inspect centralized files and record scanned telemetry
    const files = await this.context.collectFiles(['src/data'], new Set(['.ts', '.json']));
    for (const file of files) {
      this.recordScanned(file);
    }

    // Option B: Validate data structures or relationships
    this.context.logStep(2, 2, 'Verifying cross-entity parity...');
    const simulatedMismatch = false;

    // Mark rules evaluated so telemetry verifies active evaluation (prevents coverage-dormant-rule)
    this.markRuleEvaluated('composite-missing-entry');
    this.markRuleEvaluated('composite-parity-mismatch');

    if (simulatedMismatch) {
      this.addViolation({
        ruleId: 'composite-parity-mismatch',
        severity: 'error',
        file: 'src/data/canonicalData.ts',
        line: 1,
        message: `Entity parity mismatch between canonical list and runtime registry.`,
        context: 'entity_id_example'
      });
    }

    // Set informative domain metrics for the console Box-Drawing summary table
    this.context.setMetric('Data Records Checked', files.length);

    // Note: ensureSubAuditorsLogged() will automatically report each rule in MY_COMPOSITE_RULES
    // in the main console and attach them to StandardAuditResult.subAuditors.
  }
}

// Canonical CLI Entrypoint for standalone and dynamic execution
await BaseAuditor.runCliIfMain(import.meta.url, new MyCompositeAuditor());


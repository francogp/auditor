/**
 * TEMPLATE: BaseAuditor (Composite / Multi-File / Database Auditor)
 * Location: scripts/auditors/<family>/validate_<name>.ts
 * 
 * Use this template when your auditor validates cross-file relationships,
 * static TypeScript databases, SQL schemas, FSM diagrams, or asset bundles.
 */

import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '@fgp/auditor';

enableCompileCache();

export type MyCompositeRuleId =
  | 'composite-missing-entry'
  | 'composite-parity-mismatch';

export const MY_COMPOSITE_RULES: readonly MyCompositeRuleId[] = [
  'composite-missing-entry',
  'composite-parity-mismatch'
] as const;

export class MyCompositeAuditor extends BaseAuditor<MyCompositeRuleId> {
  constructor() {
    super({
      id: 'validate_my_composite',
      name: 'My Composite Auditor',
      description: 'Valida integridad y paridad cruzada en bases de datos',
      family: 'domain_data', // 'architecture' | 'domain_data' | 'persistence' | 'fsm' | 'assets' | 'documentation'
      ruleIds: MY_COMPOSITE_RULES,
      packageName: 'Datos',
      ruleDescriptions: {
        'composite-missing-entry': 'Entrada faltante en registro canónico',
        'composite-parity-mismatch': 'Desincronización de entidades entre datasets'
      },
      requiredFiles: [
        path.resolve(process.cwd(), 'src/data/canonicalData.ts')
      ]
    });
  }

  public override async runAudit(): Promise<void> {
    this.context.logStep(1, 2, 'Loading and indexing canonical datasets...');

    // Option A: Inspect centralized files
    const files = await this.context.collectFiles(['src/data'], new Set(['.ts']));
    this.filesScannedCount += files.length;

    // Option B: Validate data structures or relationships
    this.context.logStep(2, 2, 'Verifying cross-entity parity...');
    const simulatedMismatch = false;

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
  }
}

// Canonical CLI Entrypoint for standalone and dynamic execution
if (process.argv[1] && import.meta.filename && path.basename(process.argv[1]) === path.basename(import.meta.filename)) {
  await BaseAuditor.runCli(new MyCompositeAuditor());
}

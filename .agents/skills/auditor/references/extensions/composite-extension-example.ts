/**
 * .agents/skills/auditor/references/extensions/composite-extension-example.ts
 *
 * HOST COMPOSITE EXTENSION BLUEPRINT (Node.js 26+ Native)
 *
 * Demonstrates a host project extension composed of multiple internal sub-auditors.
 * Conforms to:
 *   1. 3-Tier Hierarchical Architecture: Inherits directly from BaseAuditor (zero duplication).
 *   2. Resource Sharing: Coordinates shared AST/data across sub-auditors for peak performance.
 *   3. Atomic Console Reporting: Waits for all sub-auditors to finish before progress output is flushed.
 *   4. Mandatory Rule Registration: Every rule ID is typed and declared in ruleDescriptions.
 *
 * Registration in .auditor/audit.config.ts:
 *   export default defineAuditConfig({
 *     extensions: ['scripts/auditors/extensions/composite-extension-example.ts']
 *   });
 */

import {
  BaseAuditor,
  type AuditorConfigFileRequirement,
  type AuditorOptions
} from '@francogp/auditor';

export type HostDomainRuleId =
  | 'host-catalog-sync'
  | 'host-schema-invariants'
  | 'host-state-consistency'
  | 'host-missing-config';

export const HOST_DOMAIN_RULES: readonly HostDomainRuleId[] = [
  'host-catalog-sync',
  'host-schema-invariants',
  'host-state-consistency',
  'host-missing-config'
] as const;

export class HostDomainCompositeAuditor extends BaseAuditor<HostDomainRuleId> {
  // Declarative tool / host configuration file requirements:
  public static readonly configFiles: readonly AuditorConfigFileRequirement[] = [
    {
      file: '.host-domain.json',
      content: JSON.stringify({ version: 1, strictMode: true }, null, 2) + '\n',
      description: 'Host domain state machine configuration',
      customMissingMessage: 'Missing .host-domain.json domain configuration file.'
    }
  ];

  constructor(projectRoot: string = process.cwd()) {
    super({
      id: 'validate_host_domain',
      name: 'Host Domain Invariants & Parity Validator',
      description: 'Valida sincronización de catálogos e invariantes del host',
      icon: '🧩',
      family: 'domain_data',
      packageName: 'HostDomain',
      ruleIds: HOST_DOMAIN_RULES,
      configFiles: HostDomainCompositeAuditor.configFiles,
      ruleDescriptions: {
        'host-catalog-sync': 'Desincronización en catálogo canónico',
        'host-schema-invariants': 'Violación de invariante en esquema',
        'host-state-consistency': 'Inconsistencia en máquina de estados',
        'host-missing-config': 'Archivo de configuración faltante'
      },
      coverage: {
        include: ['src/domain/**/*.{ts,json}'],
        source: 'runtime'
      },
      projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    // 1. Mark all rules evaluated for audit coverage ledger
    for (const rule of HOST_DOMAIN_RULES) {
      this.markRuleEvaluated(rule);
    }

    // 2. Load shared domain resources once (zero redundant disk I/O)
    const domainFiles = this.context.collectFiles(['src/domain'], new Set(['.ts', '.json']));
    for (const f of domainFiles) {
      this.recordScanned(f);
    }

    // 3. Declarative config verification & auto-creation in --fix mode
    const missingConfigs = await this.verifyAndFixConfigFiles();
    for (const missing of missingConfigs) {
      this.addViolation({
        ruleId: 'host-missing-config',
        severity: 'error',
        file: missing.file,
        message: missing.message
      });
    }

    // 4. Sub-auditor 1: Catalog Synchronization
    await this.runCatalogSyncSubAuditor(domainFiles);

    // 5. Sub-auditor 2: Schema Invariants
    await this.runSchemaInvariantsSubAuditor(domainFiles);

    // 6. Sub-auditor 3: State Consistency
    await this.runStateConsistencySubAuditor(domainFiles);

    // 7. ATOMIC CONSOLE REPORTING:
    // All sub-auditors have completed. BaseAuditor will automatically emit
    // the progress lines (│  🔍 [1/3] ...) atomically, preventing terminal interleaving.
    this.ensureSubAuditorsLogged();
  }

  private async runCatalogSyncSubAuditor(_files: readonly string[]): Promise<void> {
    // Sub-auditor logic inspecting catalog parity...
  }

  private async runSchemaInvariantsSubAuditor(_files: readonly string[]): Promise<void> {
    // Sub-auditor logic inspecting schemas...
  }

  private async runStateConsistencySubAuditor(_files: readonly string[]): Promise<void> {
    // Sub-auditor logic inspecting state machines...
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new HostDomainCompositeAuditor());

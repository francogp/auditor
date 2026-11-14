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
  getAuditConfig,
  DEFAULT_AUDIT_CONFIG,
  createRuleCapabilities,
  createUniformRemediationPhases,
  type AuditorConfigFileRequirement,
  type FileScanRootsOptions
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
  public static readonly configFiles: readonly AuditorConfigFileRequirement<HostDomainRuleId>[] = [
    {
      id: 'host-domain-config',
      file: '.host-domain.json',
      ruleId: 'host-missing-config',
      generateDefaultContent: (): string =>
        JSON.stringify({ version: 1, strictMode: true }, null, 2) + '\n',
      description: 'Host domain state machine configuration'
    }
  ];

  private readonly domainRoots: readonly string[];

  public constructor(options: FileScanRootsOptions = {}) {
    const projectRoot = options.projectRoot ?? process.cwd();
    const config = getAuditConfig(projectRoot);
    const domainRoots =
      options.roots ??
      (config.paths.logicRoots?.length
        ? config.paths.logicRoots
        : (config.paths.srcRoots ?? DEFAULT_AUDIT_CONFIG.paths.srcRoots));

    super({
      ruleFixers: {},
      id: 'validate_host_domain',
      name: 'Host Domain Invariants & Parity Validator',
      description: 'Validates host catalog sync and state invariants',
      icon: '🧩',
      family: 'domain_data',
      packageName: 'HostDomain',
      ruleIds: HOST_DOMAIN_RULES,
      ruleCapabilities: {
        ...createRuleCapabilities(
          ['host-catalog-sync', 'host-schema-invariants', 'host-state-consistency'],
          {
            speed: 'heavy',
            phase: 'normal',
            md: false,
            ast: true,
            changedOnly: true,
            critical: false
          }
        ),
        ...createRuleCapabilities(['host-missing-config'], {
          speed: 'heavy',
          phase: 'setup',
          md: false,
          ast: false,
          changedOnly: false,
          critical: true
        })
      },
      configKey: 'domain.hostDomain',
      defaultConfig: {
        enabled: true
      },
      criticalConfig: {},
      requiredPermissions: [],
      ruleRemediationPhases: {
        ...createUniformRemediationPhases(
          ['host-catalog-sync', 'host-schema-invariants', 'host-state-consistency'],
          'contracts'
        ),
        'host-missing-config': 'setup'
      },
      usesThirdPartyTool: false,
      configFiles: HostDomainCompositeAuditor.configFiles,
      ruleDescriptions: {
        'host-catalog-sync': 'Canonical catalog out of sync',
        'host-schema-invariants': 'Schema invariant violation',
        'host-state-consistency': 'State machine transition mismatch',
        'host-missing-config': 'Missing host domain config file'
      },
      ruleRemediations: {
        'host-catalog-sync':
          '1. Root Cause: The local catalog diverges from the canonical master registry.\n' +
          '2. Diagnosis: Compare keys between the catalog and the canonical data definitions.\n' +
          '3. Canonical Solution: Synchronize missing or extra entries to enforce 1:1 parity.\n' +
          '4. Example / Command: npm run auditor',
        'host-schema-invariants':
          '1. Root Cause: A data schema violates declared validation invariants.\n' +
          '2. Diagnosis: Inspect the types and constraints in the reported schema.\n' +
          '3. Canonical Solution: Align the Valibot schema and canonical TypeScript types.\n' +
          '4. Example / Command: npm run auditor',
        'host-state-consistency':
          '1. Root Cause: A state machine transition references an unreachable or undeclared state.\n' +
          '2. Diagnosis: Compare declared state transitions against the finite event union.\n' +
          '3. Canonical Solution: Add missing state handlers or prune obsolete transitions.\n' +
          '4. Example / Command: npm run auditor',
        'host-missing-config':
          '1. Root Cause: Required host domain configuration file (.host-domain.json) is missing.\n' +
          '2. Diagnosis: Check whether .host-domain.json exists at the project root.\n' +
          '3. Canonical Solution: Run "npm run auditor:fix" to scaffold it automatically.\n' +
          '4. Example / Command: npm run auditor:fix'
      },
      coverage: {
        include: domainRoots.map((r) => `${r}/**/*.{ts,json}`),
        source: 'runtime'
      },
      projectRoot
    });
    this.domainRoots = domainRoots;
  }

  public override async runAudit(): Promise<void> {
    // 1. Load shared domain resources once (zero redundant disk I/O)
    const domainFiles = this.context.collectFiles(this.domainRoots, new Set(['.ts', '.json']));
    for (const f of domainFiles) {
      this.recordScanned(f);
    }

    // 2. Declarative config verification & auto-creation in --fix mode.
    // verifyAndFixConfigFiles() automatically emits host-missing-config when missing in audit mode
    // and scaffolds .host-domain.json in --fix mode.
    await this.runSubAuditor('host-missing-config', async () => {
      await this.verifyAndFixConfigFiles();
    });

    // 3. Sub-auditor 1: Catalog Synchronization (timed individually)
    await this.runSubAuditor('host-catalog-sync', async () => {
      await this.runCatalogSyncSubAuditor(domainFiles);
    });

    // 4. Sub-auditor 2: Schema Invariants (timed individually)
    await this.runSubAuditor('host-schema-invariants', async () => {
      await this.runSchemaInvariantsSubAuditor(domainFiles);
    });

    // 5. Sub-auditor 3: State Consistency (timed individually)
    await this.runSubAuditor('host-state-consistency', async () => {
      await this.runStateConsistencySubAuditor(domainFiles);
    });
  }

  private async runCatalogSyncSubAuditor(files: readonly string[]): Promise<void> {
    this.context.setMetric('Catalog Files Evaluated', files.length);
  }

  private async runSchemaInvariantsSubAuditor(files: readonly string[]): Promise<void> {
    this.context.setMetric('Schema Files Evaluated', files.length);
  }

  private async runStateConsistencySubAuditor(files: readonly string[]): Promise<void> {
    this.context.setMetric('State Files Evaluated', files.length);
  }
}

// Canonical CLI Entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new HostDomainCompositeAuditor());

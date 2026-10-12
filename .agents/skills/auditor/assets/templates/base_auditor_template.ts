/**
 * TEMPLATE: BaseAuditor (Composite / Multi-File / Database Auditor)
 * Location: scripts/auditors/<family>/validate_<name>.ts
 * 
 * Use this template when your auditor validates cross-file relationships,
 * static TypeScript databases, SQL schemas, FSM diagrams, or asset bundles.
 */

import path from 'node:path';
import { enableCompileCache } from 'node:module';
import {
  BaseAuditor,
  createRuleCapabilities,
  type AuditorConfigFileRequirement,
  type AuditorPackageScriptRequirement,
  type GitIgnoreRequirement
} from '@francogp/auditor';

enableCompileCache();

export type MyCompositeRuleId =
  | 'composite-missing-entry'
  | 'composite-parity-mismatch'
  | 'composite-missing-config';

export const MY_COMPOSITE_RULES: readonly MyCompositeRuleId[] = [
  'composite-missing-entry',
  'composite-parity-mismatch',
  'composite-missing-config'
] as const;

export interface MyCompositeAuditorOptions {
  readonly projectRoot?: string;
}

export class MyCompositeAuditor extends BaseAuditor<MyCompositeRuleId> {
  // Optional gitignore requirements for tool caches or ephemeral artifacts:
  public static readonly gitIgnoreEntries: readonly GitIgnoreRequirement[] = [
    // { id: 'my-cache', pattern: '.my-cache/', reason: 'Tool ephemeral cache' }
  ];

  // Optional declarative configuration file requirements for external tools or sub-systems:
  public static readonly configFiles: readonly AuditorConfigFileRequirement[] = [
    // {
    //   file: '.mytoolrc.json',
    //   content: JSON.stringify({ version: 1, strict: true }, null, 2) + '\n',
    //   description: 'Default configuration for MyTool engine',
    //   customMissingMessage: 'Missing .mytoolrc.json configuration file.'
    // }
  ];

  // Optional custom package script aliases:
  // By default, BaseAuditor automatically derives "audit:<short-id>" (auditor task=<id>)
  // from your auditor id, description, and family with zero boilerplate.
  // Custom scripts are only declared here when you require non-standard aliases or CLI flags.
  public static readonly scripts: readonly AuditorPackageScriptRequirement[] = [];

  constructor(options: MyCompositeAuditorOptions = {}) {
    super({
      // Explicit rule capabilities for all 9 boolean flags with fixable rule overrides:
      ruleCapabilities: createRuleCapabilities(
        MY_COMPOSITE_RULES,
        {
          fix: false,
          fixPriority: false,
          lint: true,
          md: false,
          ast: false,
          changedSince: false,
          heavy: false,
          requiresBuild: false,
          postRun: false
        },
        ['composite-missing-config']
      ),
      // Optional gitignore requirements registered dynamically without hardcoding:
      gitIgnoreEntries: MyCompositeAuditor.gitIgnoreEntries,
      // Optional declarative configuration files verified and auto-created with --fix:
      configFiles: MyCompositeAuditor.configFiles,
      id: 'validate_my_composite',
      name: 'My Composite Auditor',
      description: 'Valida integridad y paridad cruzada en bases de datos',
      icon: '🏛️', // Mandatory thematic emoji representing this auditor
      family: 'domain_data', // 'architecture' | 'domain_data' | 'persistence' | 'fsm' | 'assets' | 'documentation'
      ruleIds: MY_COMPOSITE_RULES,
      packageName: 'Datos',
      // Mandatory: SSoT configuration key inspected by the dynamic suite gating engine:
      configKey: 'paths.dataRoots',
      // Mandatory: Default configuration object dynamically collected for .auditor/audit.config.ts:
      defaultConfig: {
        dataRoots: ['src/data']
      },
      // Mandatory: Invariant critical configuration baseline (requiredMinimums / forbiddenOverrides)
      // Pass empty object {} when no immutable minimums are enforced.
      criticalConfig: {},
      ruleDescriptions: {
        'composite-missing-entry': 'Entrada faltante en registro canónico',
        'composite-parity-mismatch': 'Desincronización entre datasets',
        'composite-missing-config': 'Archivo de configuración faltante'
      },
      coverage: {
        include: ['src/data/**/*.{ts,json}'],
        source: 'runtime'
      },
      projectRoot: options.projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    // Option A: Inspect centralized files and record scanned telemetry
    const files = await this.context.collectFiles(['src/data'], new Set(['.ts', '.json']));
    for (const file of files) {
      this.recordScanned(file);
    }

    // Option B: Validate data structures or relationships with individual empirical timing
    // Rule 1: Missing entry check (measured individually)
    this.runSubAuditorSync('composite-missing-entry', () => {
      // In real code: check if all required entries exist in registry
    });

    // Rule 2: Parity mismatch check (measured individually)
    this.runSubAuditorSync('composite-parity-mismatch', () => {
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
    });

    // Rule 3: Verify declarative configuration files (measured individually via async wrapper, returns result directly)
    const missingConfigs = await this.runSubAuditor('composite-missing-config', async () => {
      return await this.verifyAndFixConfigFiles();
    });
    for (const missing of missingConfigs) {
      this.addViolation({
        ruleId: 'composite-missing-config',
        severity: 'error',
        file: missing.file,
        message: missing.message
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


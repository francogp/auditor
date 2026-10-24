/**
 * TEMPLATE: BaseAuditor (Composite / Multi-File / Database Auditor)
 * Location: scripts/auditors/<family>/validate_<name>.ts
 *
 * Use this template when your auditor validates cross-file relationships,
 * static TypeScript databases, SQL schemas, FSM diagrams, or asset bundles.
 *
 * CLI Contract Governance (`validate_cli_contracts`):
 *   - Standalone CLI execution MUST use `await BaseAuditor.runCliIfMain(import.meta.url, new MyCompositeAuditor());`
 *     which delegates argument parsing (`human`, `--fix`, `--json`, `--help`) to the canonical `citty` harness.
 *   - Direct `process.argv` access, `node:util.parseArgs`, or homebrew flag parsing (`startsWith('--')`)
 *     is strictly prohibited.
 */

import { enableCompileCache } from 'node:module';
import {
  BaseAuditor,
  createRuleCapabilities,
  createUniformRemediationPhases,
  resolveFileScanRoots,
  deriveCoverageFromRoots,
  DEFAULT_AUDIT_CONFIG,
  type AuditorConfigFileRequirement,
  type AuditorPackageScriptRequirement,
  type FileScanRootsOptions,
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

export interface MyCompositeAuditorOptions extends FileScanRootsOptions {
  // Bespoke configuration options can be added here
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
  // By default, BaseAuditor automatically derives "auditor:<short-id>" (auditor task=<id>)
  // from your auditor id, description, and family with zero boilerplate.
  // Custom scripts are only declared here when you require non-standard aliases or CLI flags.
  public static readonly scripts: readonly AuditorPackageScriptRequirement[] = [];

  constructor(options: MyCompositeAuditorOptions = {}) {
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(
      options,
      (config) => config.paths?.dataRoots ?? DEFAULT_AUDIT_CONFIG.paths.dataRoots
    );
    const allowedExtensions = new Set(['.ts', '.json']);

    super({
      // Explicit 7-field orthogonal rule capabilities (Zero Fallbacks Mandate):
      // Tip: For tools with fast/deep CLI flags (e.g. TieredCommandProfile), you can pass
      // speed: ['light', 'full'] so the rule runs fast in light/heavy and deep in full.
      ruleCapabilities: createRuleCapabilities(
        MY_COMPOSITE_RULES,
        {
          speed: 'light',
          phase: 'normal',
          fix: 'none',
          md: false,
          ast: false,
          changedOnly: false,
          critical: false
        },
        ['composite-missing-config']
      ),
      // Optional gitignore requirements registered dynamically without hardcoding:
      gitIgnoreEntries: MyCompositeAuditor.gitIgnoreEntries,
      // Optional custom cache or temporary paths outside scratch/ (auto-injected into .gitignore and ignored by scanners):
      // cachePaths: ['.mytoolcache'],
      // Optional declarative configuration files verified and auto-created with --fix:
      configFiles: MyCompositeAuditor.configFiles,
      id: 'validate_my_composite',
      name: 'My Composite Auditor',
      description: 'Validates cross-dataset parity and registry integrity',
      icon: '🏛️', // Mandatory thematic emoji representing this auditor
      family: 'domain_data', // 'architecture' | 'domain_data' | 'persistence' | 'fsm' | 'assets' | 'documentation'
      ruleIds: MY_COMPOSITE_RULES,
      packageName: 'Data',
      // Mandatory: SSoT configuration key inspected by the dynamic suite gating engine:
      configKey: 'paths.dataRoots',
      // Mandatory: Default configuration object dynamically collected for .auditor/audit.config.ts:
      defaultConfig: {
        dataRoots: ['src/data']
      },
      // Mandatory: Invariant critical configuration baseline (requiredMinimums / forbiddenOverrides)
      // Pass empty object {} when no immutable minimums are enforced.
      criticalConfig: {},
      // Mandatory: Node.js Permission Model flags required by this suite (pass [] for standard suites)
      requiredPermissions: [],
      // Mandatory: Whether this auditor delegates to third-party tools/binaries (true or false).
      // If true, thirdPartyToolPolicy ({ toolName, fallbackBehavior: 'throw' | 'violation', fallbackRuleId }) is mandatory.
      usesThirdPartyTool: false,
      ruleDescriptions: {
        'composite-missing-entry': 'Missing entry in canonical registry',
        'composite-parity-mismatch': 'Cross-dataset parity mismatch',
        'composite-missing-config': 'Missing required configuration file'
      },
      // Mandatory diagnostic and remediation guide for 100% of declared rules (4-section canonical structure in English):
      ruleRemediations: {
        'composite-missing-entry':
          '1. Root Cause: A required entry is missing from the canonical data registry.\n' +
          '2. Diagnosis: Inspect the target dataset file in src/data/ and compare against the canonical schema.\n' +
          '3. Canonical Solution: Declare all required keys ensuring no null or undefined values exist.\n' +
          '4. Example / Command: npm run auditor',
        'composite-parity-mismatch':
          '1. Root Cause: Structural or key parity mismatch detected between compared datasets.\n' +
          '2. Diagnosis: Review the mismatched records reported in the finding.\n' +
          '3. Canonical Solution: Synchronize keys and structures so they match 1-to-1.\n' +
          '4. Example / Command: npm run auditor',
        'composite-missing-config':
          '1. Root Cause: The configuration file required by the subsystem is missing from the project root.\n' +
          '2. Diagnosis: Check whether the file specified in configFiles exists on disk.\n' +
          '3. Canonical Solution: Run "npm run auditor:fix" or "auditor fix" to scaffold it automatically, or create it with the canonical structure.\n' +
          '4. Example / Command: npm run auditor:fix'
      },
      // Strategic Remediation Order: Mandatory mapping of every rule to one of the 7 canonical phases
      ruleRemediationPhases: createUniformRemediationPhases(MY_COMPOSITE_RULES, 'contracts'),
      coverage: deriveCoverageFromRoots(targetRoots, allowedExtensions, effectiveRoot),
      roots: targetRoots,
      allowedExtensions,
      projectRoot: effectiveRoot
    });
  }

  public override async runAudit(): Promise<void> {
    // Option A: Inspect centralized files and record scanned telemetry
    const files = await this.context.collectFiles(this.roots, new Set(['.ts', '.json']));
    for (const file of files) {
      this.recordScanned(file);
    }

    // Option B (High-Performance Multi-Rule File Scan):
    // If you need to scan multiple rules across the same files, use this.scanFilesSinglePass:
    // await this.scanFilesSinglePass(files, [
    //   { ruleId: 'composite-missing-entry', scan: (file, content, lines) => { /* ... */ } }
    // ]);
    // This reads each file once in RAM, preventing 'auditor-inefficient-file-scan'.

    // Option C: Validate data structures or relationships with individual empirical timing
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

// Canonical CLI Entrypoint (delegates argument parsing to Citty via BaseAuditor)
await BaseAuditor.runCliIfMain(import.meta.url, new MyCompositeAuditor());

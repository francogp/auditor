/**
 * .agents/skills/auditor/assets/templates/extension.template.ts
 *
 * CANONICAL EXTENSION SUB-AUDITOR TEMPLATE (@francogp/auditor)
 *
 * Ready-to-copy blueprint for implementing custom project-specific sub-auditors
 * in scripts/auditors/<family>/<suite_name>.ts.
 *
 * Usage in .auditor/audit.config.ts:
 *   import { MyCustomAuditor } from '../scripts/auditors/architecture/validate_my_custom.ts';
 *   export default defineAuditConfig({
 *     extensions: [new MyCustomAuditor()]
 *   });
 *
 * CLI Contract Governance (`validate_cli_contracts`):
 *   - Standalone CLI execution MUST use `await BaseAuditor.runCliIfMain(import.meta.url, new MyCustomAuditor());`
 *     which delegates argument parsing (`human`, `--fix`, `--json`, `--help`) to the canonical `citty` harness.
 *   - Direct `process.argv` access, `node:util.parseArgs`, or homebrew flag parsing (`startsWith('--')`)
 *     is strictly prohibited.
 */

import {
  BaseAuditor,
  createUniformRuleCapabilities,
  resolveFileScanRoots,
  type FileScanRootsOptions,
  type RemediationPhaseId
} from '@francogp/auditor';

export type MyCustomRuleId = 'my-custom-rule-a' | 'my-custom-rule-b';

export const MY_CUSTOM_RULES: readonly MyCustomRuleId[] = [
  'my-custom-rule-a',
  'my-custom-rule-b'
] as const;

export class MyCustomAuditor extends BaseAuditor<MyCustomRuleId> {
  public constructor(options: FileScanRootsOptions = {}) {
    // Dynamic Zero Hardcoded Paths resolution from audit.config.ts or constructor options
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(
      options,
      (config) => config.paths?.srcRoots
    );

    super({
      id: 'validate_my_custom',
      name: 'My Custom Project Rules Validator',
      description: 'Validates project-specific domain and architectural invariants',
      icon: '🛡️',
      family: 'architecture',
      // Explicit orthogonal rule capabilities:
      // Zero Manual Booleans: 'fix' is computed automatically by BaseAuditor from registered ruleFixers
      ruleCapabilities: createUniformRuleCapabilities(MY_CUSTOM_RULES, {
        speed: 'light',
        phase: 'normal',
        md: false,
        ast: false,
        changedOnly: true,
        critical: false
      }),
      // Optional Contract-Driven Auto-Fix Map:
      // Suites provide executable repair functions mapping ruleId -> ({ projectRoot, options }) => Promise<boolean | void>
      // BaseAuditor automatically marks rules with registered fixers as fixable (capabilities.fix: 'normal').
      // Rules without a fixer function are strictly fixable: false (Zero False-Fix Mandate).
      // Function Identity Deduplication Mandate:
      // If multiple rules reference the exact same fixer function, BaseAuditor executes it strictly ONCE per run.
      // ruleFixers: {
      //   'my-custom-rule-a': async ({ projectRoot, options }) => {
      //     // Execute deterministic mechanical repair
      //     return true;
      //   }
      // },
      ruleIds: MY_CUSTOM_RULES,
      packageName: 'HostProject',
      configKey: 'customRules.enabled',
      defaultConfig: {
        enabled: true
      },
      criticalConfig: {},
      // Mandatory: Node.js Permission Model flags required by this extension (pass [] for standard suites)
      requiredPermissions: [],
      // Optional: Custom tool cache paths outside scratch/ (auto-injected into .gitignore and ignored by scanners):
      // cachePaths: ['.mycustomcache'],
      // Mandatory strategic remediation phase (e.g. 'setup' | 'prune' | 'dedup' | 'contracts' | 'behavior' | 'hygiene' | 'polish')
      remediationPhase: 'contracts' as RemediationPhaseId,
      usesThirdPartyTool: false,
      ruleDescriptions: {
        'my-custom-rule-a': 'Violation of custom project architectural rule A',
        'my-custom-rule-b': 'Violation of custom project architectural rule B'
      },
      // Mandatory 4-section diagnostic & remediation guide contract
      ruleRemediations: {
        'my-custom-rule-a':
          '1. Root Cause: Custom rule A detected an architectural deviation from the documented contract.\n' +
          '2. Diagnosis: Check the reported file to verify compliance with expected domain interfaces.\n' +
          '3. Canonical Solution: Update the module definition to align with project architecture standards.\n' +
          '4. Example / Command: Consult AGENTS.md for domain boundary requirements.',
        'my-custom-rule-b':
          '1. Root Cause: Custom rule B detected inconsistent domain types or untyped structures.\n' +
          '2. Diagnosis: Review derived types in the affected module.\n' +
          '3. Canonical Solution: Use canonical domain type models instead of raw strings or primitives.\n' +
          '4. Example / Command: npm run auditor:domain'
      },
      roots: targetRoots,
      projectRoot: effectiveRoot
    });
  }

  public override async runAudit(): Promise<void> {
    await this.runSubAuditor('my-custom-rule-a', async () => {
      // Diagnostic inspection code...
      // If violation found:
      // this.addViolation({
      //   ruleId: 'my-custom-rule-a',
      //   severity: 'error',
      //   file: 'src/example.ts',
      //   line: 10,
      //   message: 'Description of detected issue',
      //   context: 'snippet'
      // });
    });

    this.runSubAuditorSync('my-custom-rule-b', () => {
      // Synchronous diagnostic inspection code...
    });
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new MyCustomAuditor());

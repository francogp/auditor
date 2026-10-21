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
    super({
      id: 'validate_my_custom',
      name: 'My Custom Project Rules Validator',
      description: 'Validates project-specific domain and architectural invariants',
      icon: '🛡️',
      family: 'architecture',
      ruleCapabilities: createUniformRuleCapabilities(MY_CUSTOM_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: true,
        critical: false
      }),
      ruleIds: MY_CUSTOM_RULES,
      packageName: 'HostProject',
      configKey: 'customRules.enabled',
      defaultConfig: {
        enabled: true
      },
      criticalConfig: {},
      // Mandatory: Node.js Permission Model flags required by this extension (pass [] for standard suites)
      requiredPermissions: [],
      // Mandatory strategic remediation phase (e.g. 'setup' | 'prune' | 'dedup' | 'contracts' | 'behavior' | 'hygiene' | 'polish')
      remediationPhase: 'contracts' as RemediationPhaseId,
      usesThirdPartyTool: false,
      ruleDescriptions: {
        'my-custom-rule-a': 'Violation of custom project architectural rule A',
        'my-custom-rule-b': 'Violation of custom project architectural rule B'
      },
      ruleRemediations: {
        'my-custom-rule-a':
          'Causa Raíz: Custom rule A detected an architectural deviation from the documented contract.\n' +
          'Diagnóstico: Check the reported file to verify compliance with expected domain interfaces.\n' +
          'Solución Canónica: Update the module definition to align with project architecture standards.\n' +
          'Ejemplo / Comando: Consult AGENTS.md for domain boundary requirements.',
        'my-custom-rule-b':
          'Causa Raíz: Custom rule B detected inconsistent domain types or untyped structures.\n' +
          'Diagnóstico: Review derived types in the affected module.\n' +
          'Solución Canónica: Use canonical domain type models instead of raw strings or primitives.\n' +
          'Ejemplo / Comando: npm run auditor:domain'
      },
      roots: options.roots ?? ['src'],
      projectRoot: options.projectRoot
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

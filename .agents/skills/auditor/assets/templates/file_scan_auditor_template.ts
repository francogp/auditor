/**
 * TEMPLATE: FileScanAuditor (Line-by-Line File Scanner)
 * Location: scripts/auditors/<family>/validate_<name>.ts
 *
 * Use this template when your auditor scans source files (e.g. .vue, .ts, .json, .md)
 * line-by-line to detect forbidden tokens, anti-patterns, missing attributes, or syntax errors.
 *
 * CLI Contract Governance (`validate_cli_contracts`):
 *   - Standalone CLI execution MUST use `await BaseAuditor.runCliIfMain(import.meta.url, new MyFeatureAuditor());`
 *     which delegates argument parsing (`human`, `--fix`, `--json`, `--help`) to the canonical `citty` harness.
 *   - Direct `process.argv` access, `node:util.parseArgs`, or homebrew flag parsing (`startsWith('--')`)
 *     is strictly prohibited.
 */

import { enableCompileCache } from 'node:module';
import {
  BaseAuditor,
  FileScanAuditor,
  createUniformRuleCapabilities,
  createUniformRemediationPhases,
  resolveFileScanRoots,
  deriveCoverageFromRoots,
  type FileScanRootsOptions,
  type GitIgnoreRequirement
} from '@francogp/auditor';

enableCompileCache();

export type MyFeatureRuleId =
  | 'my-feature-forbidden-pattern'
  | 'my-feature-missing-attribute';

export const MY_FEATURE_RULES: readonly MyFeatureRuleId[] = [
  'my-feature-forbidden-pattern',
  'my-feature-missing-attribute'
] as const;

export interface MyFeatureAuditorOptions extends FileScanRootsOptions {
  readonly exemptPaths?: readonly (string | RegExp)[];
}

export class MyFeatureAuditor extends FileScanAuditor<MyFeatureRuleId> {
  // Optional gitignore requirements for tool caches or ephemeral artifacts:
  public static readonly gitIgnoreEntries: readonly GitIgnoreRequirement[] = [];

  constructor(options: MyFeatureAuditorOptions = {}) {
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(
      options,
      (config) => config.paths?.srcRoots
    );
    const allowedExtensions = new Set(['.vue', '.ts']);

    super({
      // Mandatory: Explicit 7-field orthogonal rule capabilities (Zero Fallbacks Mandate)
      ruleCapabilities: createUniformRuleCapabilities(MY_FEATURE_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      // Optional gitignore requirements registered dynamically without hardcoding:
      gitIgnoreEntries: MyFeatureAuditor.gitIgnoreEntries,
      id: 'validate_my_feature',
      name: 'My Feature Auditor',
      description: 'Validates forbidden tokens and required attributes in src/',
      icon: '🔍', // Mandatory thematic emoji representing this auditor
      family: 'architecture', // 'architecture' | 'domain_data' | 'persistence' | 'fsm' | 'assets' | 'documentation'
      ruleIds: MY_FEATURE_RULES,
      packageName: 'MyModule',
      // Configuration Governance:
      // Case 1 (Standalone feature): Declare dedicated section in .auditor/audit.config.ts:
      //   configKey: 'myFeature',
      //   defaultConfig: { enabled: true }
      // Case 2 (General scanner): Reuses core paths with no dedicated config section:
      //   configKey: 'paths',
      //   defaultConfig: {}
      configKey: 'myFeature',
      defaultConfig: {
        enabled: true
      },
      // Mandatory: Invariant critical configuration baseline (requiredMinimums / forbiddenOverrides)
      // Pass empty object {} when no immutable minimums are enforced.
      criticalConfig: {},
      // Mandatory: Node.js Permission Model flags required by this suite (pass [] for standard suites)
      requiredPermissions: [],
      usesThirdPartyTool: false,
      ruleDescriptions: {
        'my-feature-forbidden-pattern': 'Forbidden token in source file',
        'my-feature-missing-attribute': 'Missing mandatory attribute'
      },
      // Mandatory diagnostic and remediation guide for 100% of declared rules (4-section canonical structure in English):
      ruleRemediations: {
        'my-feature-forbidden-pattern':
          '1. Root Cause: A token or pattern prohibited by architectural standards was detected.\n' +
          '2. Diagnosis: Open the reported file and line to locate the forbidden identifier.\n' +
          '3. Canonical Solution: Replace the forbidden token with the canonical project helper.\n' +
          '4. Example / Command: npm run auditor',
        'my-feature-missing-attribute':
          '1. Root Cause: A mandatory attribute required by component or markup standards is missing.\n' +
          '2. Diagnosis: Inspect the element declaration in the template or source file.\n' +
          '3. Canonical Solution: Add the mandatory attribute with its canonical value.\n' +
          '4. Example / Command: npm run auditor'
      },
      // Strategic Remediation Order: Mandatory mapping of every rule to one of the 7 canonical phases
      ruleRemediationPhases: createUniformRemediationPhases(MY_FEATURE_RULES, 'behavior'),
      roots: targetRoots,
      allowedExtensions,
      // Dynamic Exemption Architecture: automatically skips documents matching strings or RegExps.
      // Prohibits hardcoding ignores or candidate file arrays in code.
      exemptPaths: options.exemptPaths,
      coverage: deriveCoverageFromRoots(targetRoots, allowedExtensions, effectiveRoot),
      projectRoot: effectiveRoot
    });

    // ARCHITECTURAL NOTE: FileScanAuditor supports two canonical authoring patterns:
    // Option A (Declarative): Register sub-auditors in the constructor via:
    //   this.declarePatternSubAuditor('my-feature-forbidden-pattern', { pattern: /forbiddenToken/, message: '...' });
    //   this.declareFileSubAuditor('my-feature-missing-attribute', (doc) => { /* check doc.rawContent */ });
    // Option B (Per-file scanner): Override scanFile(relPath, content) with runSubAuditorSync (shown below).
  }

  protected override scanFile(relPath: string, content: string): void {
    const lines = content.split(/\r?\n/);

    // Rule 1: Forbidden pattern check
    // runSubAuditorSync automatically measures duration and marks the rule evaluated.
    // Do NOT manually call markRuleEvaluated beforehand.
    this.runSubAuditorSync('my-feature-forbidden-pattern', () => {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const lineNum = i + 1;

        if (line.includes('forbiddenToken')) {
          this.addViolation({
            ruleId: 'my-feature-forbidden-pattern',
            severity: 'error',
            file: relPath,
            line: lineNum,
            message: `Detected forbidden token 'forbiddenToken'. Replace with canonical helper.`,
            context: line.trim()
          });
        }
      }
    });

    // Rule 2: Missing attribute check
    this.runSubAuditorSync('my-feature-missing-attribute', () => {
      if (
        relPath.endsWith('.vue') &&
        content.includes('<custom-widget') &&
        !content.includes('aria-label=')
      ) {
        this.addViolation({
          ruleId: 'my-feature-missing-attribute',
          severity: 'error',
          file: relPath,
          line: 1,
          message: `<custom-widget> requires an 'aria-label' attribute.`,
          context: '<custom-widget'
        });
      }
    });
  }
}

// Canonical CLI Entrypoint (delegates argument parsing to Citty via BaseAuditor)
await BaseAuditor.runCliIfMain(import.meta.url, new MyFeatureAuditor());

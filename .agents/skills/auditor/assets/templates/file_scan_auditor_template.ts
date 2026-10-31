/**
 * TEMPLATE: FileScanAuditor (Textual Non-Code File Scanner)
 * Location: scripts/auditors/<family>/validate_<name>.ts
 *
 * Use this template when your auditor scans non-code textual files (e.g. .md, .txt, .json, .env)
 * line-by-line to detect formatting errors, unauthorized commands, or malformed sections.
 *
 * MANDATORY ARCHITECTURAL GOVERNANCE (Zero Regex Code Inspection Mandate):
 *   - For TypeScript/JavaScript/Vue code analysis (.ts, .tsx, .js, .vue), line splitting and
 *     regular expressions are STRICTLY PROHIBITED. Use `ast_auditor_template.ts` (SharedAstContext) instead.
 *   - FileScanAuditor line iteration is reserved exclusively for non-code textual assets where
 *     AST parsers do not exist.
 *
 * CLI Contract Governance (`validate_cli_contracts`):
 *   - Standalone CLI execution MUST use `await BaseAuditor.runCliIfMain(import.meta.url, new MyDocAuditor());`
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
  getEffectiveIgnoreGlobs,
  getEffectiveUnignoreDirs,
  DEFAULT_AUDIT_CONFIG,
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
      (config) => config.documentation?.skillsRoots ?? DEFAULT_AUDIT_CONFIG.documentation.skillsRoots
    );
    const allowedExtensions = new Set(['.md']);

    super({
      ruleFixers: {},
      // Mandatory: Explicit orthogonal rule capabilities.
      // Zero Manual Booleans: 'fix' is computed automatically by BaseAuditor/FileScanAuditor
      // based on whether declareFileSubAuditor defines a 'fix' handler or declarePatternSubAuditor defines 'replace'.
      ruleCapabilities: createUniformRuleCapabilities(MY_FEATURE_RULES, {
        speed: 'light',
        phase: 'normal',
        md: true,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      // Optional gitignore requirements registered dynamically without hardcoding:
      gitIgnoreEntries: MyFeatureAuditor.gitIgnoreEntries,
      // Optional tool cache paths outside scratch/ (auto-injected into .gitignore and ignored by scanners):
      // cachePaths: ['.mydoccache'],
      id: 'validate_my_doc',
      name: 'My Document Auditor',
      description: 'Validates forbidden tokens and required headers in documentation',
      icon: '📖', // Mandatory thematic emoji representing this auditor
      family: 'documentation', // 'architecture' | 'domain_data' | 'persistence' | 'fsm' | 'assets' | 'documentation'
      ruleIds: MY_FEATURE_RULES,
      packageName: 'Docs',
      configKey: 'documentation.enabled',
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
        'my-feature-forbidden-pattern': 'Forbidden token in documentation file',
        'my-feature-missing-attribute': 'Missing mandatory document section'
      },
      // Mandatory diagnostic and remediation guide for 100% of declared rules (4-section canonical structure in English):
      ruleRemediations: {
        'my-feature-forbidden-pattern':
          '1. Root Cause: A token or pattern prohibited by documentation standards was detected.\n' +
          '2. Diagnosis: Open the reported file and line to locate the forbidden pattern.\n' +
          '3. Canonical Solution: Replace the forbidden pattern with the canonical project syntax.\n' +
          '4. Example / Command: npm run auditor',
        'my-feature-missing-attribute':
          '1. Root Cause: A mandatory section or heading required by documentation standards is missing.\n' +
          '2. Diagnosis: Inspect the headings in the markdown file.\n' +
          '3. Canonical Solution: Add the mandatory heading.\n' +
          '4. Example / Command: npm run auditor'
      },
      // Strategic Remediation Order: Mandatory mapping of every rule to one of the 7 canonical phases
      ruleRemediationPhases: createUniformRemediationPhases(MY_FEATURE_RULES, 'polish'),
      roots: targetRoots,
      allowedExtensions,
      // Dynamic Exemption Architecture: automatically skips documents matching strings or RegExps.
      // Prohibits hardcoding ignores or candidate file arrays in code.
      exemptPaths: options.exemptPaths,
      extraIgnorePatterns: getEffectiveIgnoreGlobs(effectiveRoot),
      unignoreDirs: getEffectiveUnignoreDirs(effectiveRoot),
      coverage: deriveCoverageFromRoots(targetRoots, allowedExtensions, effectiveRoot),
      projectRoot: effectiveRoot
    });

    // ARCHITECTURAL NOTE: FileScanAuditor line scanning is reserved for non-code text files.
    // For TypeScript or Vue SFC code analysis, use BaseAuditor with AST (ast_auditor_template.ts).

    // Option A (Declarative Pattern Sub-Auditor with Auto-Fix):
    // Providing 'replace' automatically registers the rule as auto-fixable and mutates the document.
    // Omitting 'replace' strictly marks the rule as unfixable (Zero False-Fix Mandate).
    // this.declarePatternSubAuditor('my-feature-forbidden-pattern', {
    //   regex: /forbiddenPattern/g,
    //   message: "Detected forbidden pattern 'forbiddenPattern'. Replace with canonical syntax.",
    //   replace: 'canonicalPattern'
    // });

    // Option B (Declarative File Sub-Auditor with explicit Fix Handler):
    // Function Identity Deduplication Mandate:
    // - If multiple sub-auditors share the exact same 'audit' or 'fix' function, FileScanAuditor executes it strictly ONCE per document.
    // - If 'audit === fix', running in --fix mode executes the function strictly ONCE (not twice).
    // this.declareFileSubAuditor('my-feature-missing-attribute', {
    //   audit: (doc) => {
    //     if (!doc.getContent().includes('# Purpose')) {
    //       this.addViolation({
    //         ruleId: 'my-feature-missing-attribute',
    //         severity: 'error',
    //         file: doc.getRelativePath(),
    //         message: 'Missing # Purpose header'
    //       });
    //     }
    //   },
    //   fix: (doc) => {
    //     doc.setContent('# Purpose\n\n' + doc.getContent());
    //     return true;
    //   }
    // });
  }

  protected override scanFile(relPath: string, content: string): void {
    const lines = content.split(/\r?\n/);

    // Rule 1: Forbidden pattern check in documentation
    this.runSubAuditorSync('my-feature-forbidden-pattern', () => {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const lineNum = i + 1;

        if (line.includes('forbiddenPattern')) {
          this.addViolation({
            ruleId: 'my-feature-forbidden-pattern',
            severity: 'error',
            file: relPath,
            line: lineNum,
            message: `Detected forbidden pattern 'forbiddenPattern'. Replace with canonical syntax.`,
            context: line.trim()
          });
        }
      }
    });

    // Rule 2: Missing mandatory section header in documentation
    this.runSubAuditorSync('my-feature-missing-attribute', () => {
      if (!content.includes('# Purpose')) {
        this.addViolation({
          ruleId: 'my-feature-missing-attribute',
          severity: 'error',
          file: relPath,
          line: 1,
          message: `Documentation file '${relPath}' is missing required '# Purpose' header.`,
          context: relPath
        });
      }
    });
  }
}

// Canonical CLI Entrypoint (delegates argument parsing to Citty via BaseAuditor)
await BaseAuditor.runCliIfMain(import.meta.url, new MyFeatureAuditor());

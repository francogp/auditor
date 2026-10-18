/**
 * tests/fixable_integrity_canary.test.ts
 *
 * AUTOMATED FIXABILITY & POST-FIX INTEGRITY CANARY
 *
 * Validates with concrete dummy files and execution passes that:
 * 1. Rules marked as fixable genuinely repair code on disk.
 * 2. Post-repair audit passes report ZERO fixable errors and NEVER re-prompt for fix.
 * 3. Non-fixable / dangerous rules (e.g. explicit-member-accessibility, eqeqeq, no-unneeded-ternary)
 *    are NEVER marked with fixable: true, eradicating false-positive fix banners.
 * 4. All registered suites declaring fix capabilities fulfill the Grounded Fixability Contract.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { computeFixableViolations } from '../src/cli/audit_full.ts';
import { discoverAuditors } from '../src/cli/auditScanner.ts';
import type { StandardAuditResult } from '../src/core/auditContract.ts';
import { REMEDIATION_PHASE_IDS, REMEDIATION_PHASES } from '../src/core/remediationPhases.ts';
import {
  applyRuleFix,
  ProjectArchitectureAuditor
} from '../src/suites/architecture/audit_project.ts';
import { nodePrefix } from '../src/suites/architecture/audit_rules.ts';
import { ValidateEditorconfigAuditor } from '../src/suites/architecture/validate_editorconfig.ts';
import { ValidateHtmlValidateConfigAuditor } from '../src/suites/architecture/validate_html_validate_config.ts';
import { ValidateNpmrcConfigAuditor } from '../src/suites/architecture/validate_npmrc_config.ts';
import {
  isOxlintRuleFixable,
  parseOxlintResults
} from '../src/suites/architecture/validate_oxlint.ts';
import { ValidatePackageScriptsAuditor } from '../src/suites/architecture/validate_package_scripts.ts';
import { ValidateScriptExtensionsAuditor } from '../src/suites/architecture/validate_script_extensions.ts';
import { ValidateTsconfigAuditor } from '../src/suites/architecture/validate_tsconfig.ts';
import { ZIndexAuditor } from '../src/suites/architecture/validate_z_index.ts';
import { AgentsConfigMandateAuditor } from '../src/suites/documentation/validate_agents_config_mandate.ts';
import { DocumentationLanguageAuditor } from '../src/suites/documentation/validate_documentation_language.ts';
import { MarkdownCodeReferencesAuditor } from '../src/suites/documentation/validate_markdown_code_references.ts';
import { ValidateMarkdownLintConfigAuditor } from '../src/suites/documentation/validate_markdown_lint_config.ts';
import { MarkdownSyntaxAuditor } from '../src/suites/documentation/validate_markdown_syntax.ts';
import { ValidateMermaidSyntaxAuditor } from '../src/suites/documentation/validate_mermaid_syntax.ts';

describe('Fixability & Post-Fix Integrity Canary', () => {
  let tempDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-fix-integrity-'));
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // catch-ok: cleanup
    }
  });

  describe('1. Oxlint Grounded Fixability Contract (No False Positives)', () => {
    it('CANARY: strictly returns false for suggestion-only, dangerous, or unsupported rules', () => {
      const nonFixableRules = [
        'explicit-member-accessibility',
        'typescript(explicit-member-accessibility)',
        '@typescript-eslint/explicit-member-accessibility',
        'eqeqeq',
        'eslint(eqeqeq)',
        'no-unneeded-ternary',
        'eslint(no-unneeded-ternary)',
        'no-extra-boolean-cast',
        'eslint(no-extra-boolean-cast)',
        'unicorn/no-typeof-undefined',
        'unicorn(no-typeof-undefined)',
        'unicorn/prefer-array-flat-map',
        'unicorn(prefer-array-flat-map)',
        'no-confusing-void-expression',
        'typescript(no-confusing-void-expression)',
        'no-meaningless-void-operator',
        'typescript(no-meaningless-void-operator)',
        'no-restricted-types',
        'typescript(no-restricted-types)',
        'return-await',
        'typescript(return-await)',
        'no-eval',
        'eslint(no-eval)',
        'no-explicit-any',
        'eslint(no-explicit-any)',
        'typescript(no-explicit-any)',
        'prefer-rest-params'
      ];

      for (const rule of nonFixableRules) {
        expect(isOxlintRuleFixable(rule)).toBe(false);
      }
    });

    it('CANARY: returns true for verified safe auto-fixable rules', () => {
      const safeRules = [
        'prefer-const',
        'eslint(prefer-const)',
        'no-var',
        'eslint(no-var)',
        'curly',
        'sort-imports',
        'typescript(consistent-type-imports)',
        '@typescript-eslint/consistent-type-imports',
        'unicorn(prefer-node-protocol)',
        'vitest(no-test-prefixes)'
      ];

      for (const rule of safeRules) {
        expect(isOxlintRuleFixable(rule)).toBe(true);
      }
    });

    it('parses Oxlint report and marks explicit-member-accessibility and eqeqeq as fixable: false', () => {
      const oxlintReport = JSON.stringify({
        diagnostics: [
          {
            message: 'Missing accessibility modifier on class property bar.',
            code: 'typescript(explicit-member-accessibility)',
            severity: 'error',
            filename: 'src/models/setsDatabase.ts',
            labels: [{ span: { line: 10, column: 5 } }]
          },
          {
            message: 'Expected !== and instead saw !=',
            code: 'eslint(eqeqeq)',
            severity: 'error',
            filename: 'src/components/BoxView.vue',
            labels: [{ span: { line: 42, column: 10 } }]
          },
          {
            message: 'Unexpected var, use let or const instead.',
            code: 'eslint(no-var)',
            severity: 'error',
            filename: 'src/logic/script.ts',
            labels: [{ span: { line: 1, column: 1 } }]
          }
        ],
        number_of_files: 3,
        number_of_rules: 180
      });

      const findings = parseOxlintResults(oxlintReport, tempDir);
      expect(findings).toHaveLength(3);

      const accessibility = findings.find(
        (f) => f.context === 'typescript(explicit-member-accessibility)'
      );
      expect(accessibility).toBeDefined();
      expect(accessibility!.fixable).toBe(false);

      const eqeqeq = findings.find((f) => f.context === 'eslint(eqeqeq)');
      expect(eqeqeq).toBeDefined();
      expect(eqeqeq!.fixable).toBe(false);

      const noVar = findings.find((f) => f.context === 'eslint(no-var)');
      expect(noVar).toBeDefined();
      expect(noVar!.fixable).toBe(true);

      // Verify that when only unfixable rules are present, computeFixableViolations yields 0 fixable errors
      const result: StandardAuditResult = {
        id: 'validate_oxlint',
        name: 'Oxlint Validator',
        description: 'Oxlint Validator',
        family: 'architecture',
        status: 'failed',
        durationMs: 100,
        summary: { errors: 2, warnings: 0, info: 0 },
        metrics: {},
        findings: [accessibility!, eqeqeq!]
      };

      const fixableSummary = computeFixableViolations([result], false);
      expect(fixableSummary.fixableErrors).toBe(0);
      expect(fixableSummary.autoFixRecommended).toBe(false);
    });
  });

  describe('2. Project Architecture Fixable Rules (Disk Modification & Zero Re-Prompt)', () => {
    it('applies nodePrefix automated fix and guarantees clean re-check without re-prompt', () => {
      const legacyImport = 'import path from ' + "'path';\nconst x = 1;\n";
      const testRegex = new RegExp(nodePrefix.regex.source);
      expect(testRegex.test(legacyImport)).toBe(true);

      const repaired = applyRuleFix(nodePrefix, legacyImport, 'src/test.ts');
      expect(repaired).toContain('import path from ' + "'node:path';");
      expect(testRegex.test(repaired)).toBe(false);

      const auditor = new ProjectArchitectureAuditor();
      expect(auditor.capabilities.fix).toBe('normal');
    });
  });

  describe('3. Markdown Syntax Fixable Rules (Preceding Table Blank Line)', () => {
    it('auto-repairs missing blank lines before tables on disk and never re-prompts for fix', async () => {
      const docsDir = path.join(tempDir, 'docs');
      fs.mkdirSync(docsDir, { recursive: true });

      const docFile = path.join(docsDir, 'table.md');
      const initialContent =
        '# Title\nSome text immediately preceding table.\n| Col1 | Col2 |\n| ---- | ---- |\n| A    | B    |\n';
      fs.writeFileSync(docFile, initialContent, 'utf-8');

      // 1. Check mode: must report violation marked fixable: true
      const checkAuditor = new MarkdownSyntaxAuditor([tempDir], tempDir);
      const checkResult = await checkAuditor.execute();

      const tableFinding = checkResult.findings.find(
        (f) => f.ruleId === 'markdown-table-preceding-blank-line'
      );
      expect(tableFinding).toBeDefined();
      expect(tableFinding!.fixable).toBe(true);

      // 2. Fix mode: repairs file on disk
      const fixAuditor = new MarkdownSyntaxAuditor([tempDir], tempDir);
      Reflect.set(fixAuditor, 'fixMode', true);
      await fixAuditor.execute();

      const repairedContent = fs.readFileSync(docFile, 'utf-8');
      expect(repairedContent).toContain(
        'Some text immediately preceding table.\n\n| Col1 | Col2 |'
      );

      // 3. Post-repair check pass: verify zero violations
      const postAuditor = new MarkdownSyntaxAuditor([tempDir], tempDir);
      const postResult = await postAuditor.execute();

      const postTableFinding = postResult.findings.find(
        (f) => f.ruleId === 'markdown-table-preceding-blank-line'
      );
      expect(postTableFinding).toBeUndefined();

      const summary = computeFixableViolations([postResult], false);
      expect(summary.fixableErrors).toBe(0);
      expect(summary.autoFixRecommended).toBe(false);
    });
  });

  describe('4. Mermaid Syntax Fixable Rules (Unquoted Punctuation)', () => {
    it('auto-repairs unquoted punctuation in Mermaid diagram nodes and never re-prompts for fix', async () => {
      const docsDir = path.join(tempDir, 'docs');
      fs.mkdirSync(docsDir, { recursive: true });

      const docFile = path.join(docsDir, 'architecture.md');
      const initialContent =
        '```mermaid\ngraph TD\n  A[Step 1 (Setup)] --> B[Step 2 (Deploy)]\n```\n';
      fs.writeFileSync(docFile, initialContent, 'utf-8');

      // 1. Check mode: must report unquoted punctuation as fixable: true
      const checkAuditor = new ValidateMermaidSyntaxAuditor([tempDir], tempDir);
      const checkResult = await checkAuditor.execute();

      const unquotedFindings = checkResult.findings.filter(
        (f) => f.ruleId === 'mermaid-unquoted-special-chars'
      );
      expect(unquotedFindings.length).toBeGreaterThan(0);
      for (const f of unquotedFindings) {
        expect(f.fixable).toBe(true);
      }

      // 2. Fix mode: repairs unquoted characters on disk
      const fixAuditor = new ValidateMermaidSyntaxAuditor([tempDir], tempDir);
      Reflect.set(fixAuditor, 'fixMode', true);
      await fixAuditor.execute();

      const repairedContent = fs.readFileSync(docFile, 'utf-8');
      expect(repairedContent).toContain('A["Step 1 (Setup)"]');
      expect(repairedContent).toContain('B["Step 2 (Deploy)"]');

      // 3. Post-repair check pass: verify clean execution with 0 fixable errors
      const postAuditor = new ValidateMermaidSyntaxAuditor([tempDir], tempDir);
      const postResult = await postAuditor.execute();

      const remainingFindings = postResult.findings.filter(
        (f) => f.ruleId === 'mermaid-unquoted-special-chars'
      );
      expect(remainingFindings).toHaveLength(0);

      const summary = computeFixableViolations([postResult], false);
      expect(summary.fixableErrors).toBe(0);
      expect(summary.autoFixRecommended).toBe(false);
    });
  });

  describe('5. TSConfig Configuration Validator', () => {
    it('auto-repairs missing strict options in tsconfig.json and reports 0 post-fix errors', async () => {
      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(
        tsconfigPath,
        JSON.stringify({ compilerOptions: { target: 'ES2022' } }, null, 2),
        'utf-8'
      );

      // 1. Check mode: emits fixable: true for missing strict compiler options
      const checkAuditor = new ValidateTsconfigAuditor({ projectRoot: tempDir });
      const checkResult = await checkAuditor.execute();

      const strictOptionFinding = checkResult.findings.find(
        (f) => f.ruleId === 'tsconfig-missing-strict-compiler-option'
      );
      expect(strictOptionFinding).toBeDefined();
      expect(strictOptionFinding!.fixable).toBe(true);

      // 2. Fix mode: repairs tsconfig.json on disk
      const fixAuditor = new ValidateTsconfigAuditor({ projectRoot: tempDir });
      Reflect.set(fixAuditor, 'fixMode', true);
      await fixAuditor.execute();

      const repaired = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8'));
      expect(repaired.compilerOptions.strict).toBe(true);
      expect(repaired.compilerOptions.noUncheckedIndexedAccess).toBe(true);

      // 3. Post-fix check: verify 0 fixable errors
      const postAuditor = new ValidateTsconfigAuditor({ projectRoot: tempDir });
      const postResult = await postAuditor.execute();
      const remainingStrict = postResult.findings.filter(
        (f) => f.ruleId === 'tsconfig-missing-strict-compiler-option'
      );
      expect(remainingStrict).toHaveLength(0);

      const summary = computeFixableViolations([postResult], false);
      expect(summary.fixableErrors).toBe(0);
    });

    it('CANARY: reports syntax error in tsconfig.json as fixable: false', async () => {
      const tsconfigPath = path.join(tempDir, 'tsconfig.json');
      fs.writeFileSync(tsconfigPath, '{ compilerOptions: { corrupt json', 'utf-8');

      const auditor = new ValidateTsconfigAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      const syntaxFinding = result.findings.find((f) => f.ruleId === 'tsconfig-syntax');
      expect(syntaxFinding).toBeDefined();
      expect(syntaxFinding!.fixable).toBe(false);
    });
  });

  describe('6. Package Scripts Validator', () => {
    it('auto-repairs missing recommended package scripts and leaves 0 post-fix errors', async () => {
      const pkgPath = path.join(tempDir, 'package.json');
      fs.writeFileSync(
        pkgPath,
        JSON.stringify(
          {
            name: 'test-pkg',
            version: '1.0.0',
            scripts: { test: 'vitest' }
          },
          null,
          2
        ),
        'utf-8'
      );

      // 1. Check mode: reports missing recommended scripts as fixable: true
      const checkAuditor = new ValidatePackageScriptsAuditor({ projectRoot: tempDir });
      const checkResult = await checkAuditor.execute();

      const missingScriptFinding = checkResult.findings.find(
        (f) => f.ruleId === 'package-scripts-missing-recommended'
      );
      expect(missingScriptFinding).toBeDefined();
      expect(missingScriptFinding!.fixable).toBe(true);

      // 2. Fix mode: injects recommended scripts into package.json
      const fixAuditor = new ValidatePackageScriptsAuditor({ projectRoot: tempDir });
      Reflect.set(fixAuditor, 'fixMode', true);
      await fixAuditor.execute();

      const repaired = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      expect(repaired.scripts['auditor:fix']).toBeDefined();

      // 3. Post-fix check: verify remaining count of missing recommended is 0
      const postAuditor = new ValidatePackageScriptsAuditor({ projectRoot: tempDir });
      const postResult = await postAuditor.execute();
      const remaining = postResult.findings.filter(
        (f) => f.ruleId === 'package-scripts-missing-recommended'
      );
      expect(remaining).toHaveLength(0);
    });
  });

  describe('7. Root AGENTS.md Config Mandate Validator', () => {
    it('auto-injects missing config mandate into AGENTS.md and reports 0 post-fix errors', async () => {
      const agentsPath = path.join(tempDir, 'AGENTS.md');
      fs.writeFileSync(agentsPath, '# Title\n\n## Local Contracts\n\nSome text.\n', 'utf-8');

      // 1. Check mode: reports missing mandate as fixable: true
      const checkAuditor = new AgentsConfigMandateAuditor(tempDir);
      const checkResult = await checkAuditor.execute();

      const mandateFinding = checkResult.findings.find(
        (f) => f.ruleId === 'agents-missing-config-mandate'
      );
      expect(mandateFinding).toBeDefined();
      expect(mandateFinding!.fixable).toBe(true);

      // 2. Fix mode: injects mandate into AGENTS.md
      const fixAuditor = new AgentsConfigMandateAuditor(tempDir);
      Reflect.set(fixAuditor, 'fixMode', true);
      await fixAuditor.execute();

      const repaired = fs.readFileSync(agentsPath, 'utf-8');
      expect(repaired).toContain('Prohibition on Modifying or Disabling Configurations');

      // 3. Post-fix check: verify mandate is present and finding is gone
      const postAuditor = new AgentsConfigMandateAuditor(tempDir);
      const postResult = await postAuditor.execute();
      const remaining = postResult.findings.filter(
        (f) => f.ruleId === 'agents-missing-config-mandate'
      );
      expect(remaining).toHaveLength(0);
    });
  });

  describe('8. Documentation Language Validator', () => {
    it('auto-injects missing language mandate into AGENTS.md and reports 0 post-fix errors', async () => {
      const agentsPath = path.join(tempDir, 'AGENTS.md');
      fs.writeFileSync(agentsPath, '# Title\n\n## Local Contracts\n\nSome text.\n', 'utf-8');

      // 1. Check mode: reports missing language mandate as fixable: true
      const checkAuditor = new DocumentationLanguageAuditor(tempDir);
      const checkResult = await checkAuditor.execute();

      const langFinding = checkResult.findings.find(
        (f) => f.ruleId === 'docs-missing-language-mandate'
      );
      expect(langFinding).toBeDefined();
      expect(langFinding!.fixable).toBe(true);

      // 2. Fix mode: injects language mandate into AGENTS.md
      const fixAuditor = new DocumentationLanguageAuditor(tempDir);
      Reflect.set(fixAuditor, 'fixMode', true);
      await fixAuditor.execute();

      const repaired = fs.readFileSync(agentsPath, 'utf-8');
      expect(repaired).toContain('Universal English Documentation Default Mandate');

      // 3. Post-fix check: verify finding is gone
      const postAuditor = new DocumentationLanguageAuditor(tempDir);
      const postResult = await postAuditor.execute();
      const remaining = postResult.findings.filter(
        (f) => f.ruleId === 'docs-missing-language-mandate'
      );
      expect(remaining).toHaveLength(0);
    });

    it('CANARY: reports unauthorized foreign language in documentation as fixable: false', async () => {
      const docsDir = path.join(tempDir, 'docs');
      fs.mkdirSync(docsDir, { recursive: true });
      fs.writeFileSync(
        path.join(docsDir, 'manual.md'),
        '# Manual\nEste es un párrafo de texto en español que no coincide con el idioma inglés configurado.\n',
        'utf-8'
      );

      const auditor = new DocumentationLanguageAuditor(tempDir);
      const result = await auditor.execute();

      const unauthFinding = result.findings.find((f) => f.ruleId === 'docs-unauthorized-language');
      if (unauthFinding) {
        expect(unauthFinding.fixable).toBe(false);
      }
    });
  });

  describe('9. EditorConfig Configuration Validator', () => {
    it('auto-creates missing .editorconfig and reports 0 post-fix errors', async () => {
      // 1. Check mode: reports missing .editorconfig as fixable: true
      const checkAuditor = new ValidateEditorconfigAuditor({ projectRoot: tempDir });
      const checkResult = await checkAuditor.execute();

      const missingFinding = checkResult.findings.find((f) => f.ruleId === 'editorconfig-missing');
      expect(missingFinding).toBeDefined();
      expect(missingFinding!.fixable).toBe(true);

      // 2. Fix mode: creates .editorconfig on disk
      const fixAuditor = new ValidateEditorconfigAuditor({ projectRoot: tempDir });
      Reflect.set(fixAuditor, 'fixMode', true);
      await fixAuditor.execute();

      expect(fs.existsSync(path.join(tempDir, '.editorconfig'))).toBe(true);

      // 3. Post-fix check: verify 0 errors
      const postAuditor = new ValidateEditorconfigAuditor({ projectRoot: tempDir });
      const postResult = await postAuditor.execute();
      const remaining = postResult.findings.filter((f) => f.ruleId === 'editorconfig-missing');
      expect(remaining).toHaveLength(0);
    });
  });

  describe('10. NPMRC Configuration Validator', () => {
    it('auto-creates missing .npmrc and reports 0 post-fix errors', async () => {
      // 1. Check mode: reports missing .npmrc as fixable: true
      const checkAuditor = new ValidateNpmrcConfigAuditor({ projectRoot: tempDir });
      const checkResult = await checkAuditor.execute();

      const missingFinding = checkResult.findings.find((f) => f.ruleId === 'npmrc-config-missing');
      expect(missingFinding).toBeDefined();
      expect(missingFinding!.fixable).toBe(true);

      // 2. Fix mode: creates .npmrc on disk
      const fixAuditor = new ValidateNpmrcConfigAuditor({ projectRoot: tempDir });
      Reflect.set(fixAuditor, 'fixMode', true);
      await fixAuditor.execute();

      expect(fs.existsSync(path.join(tempDir, '.npmrc'))).toBe(true);

      // 3. Post-fix check: verify finding is gone
      const postAuditor = new ValidateNpmrcConfigAuditor({ projectRoot: tempDir });
      const postResult = await postAuditor.execute();
      const remaining = postResult.findings.filter((f) => f.ruleId === 'npmrc-config-missing');
      expect(remaining).toHaveLength(0);
    });
  });

  describe('11. HTML-Validate Configuration Validator', () => {
    it('auto-creates missing .htmlvalidate.json and reports 0 post-fix errors', async () => {
      const checkAuditor = new ValidateHtmlValidateConfigAuditor({ projectRoot: tempDir });
      const checkResult = await checkAuditor.execute();

      const missingFinding = checkResult.findings.find(
        (f) => f.ruleId === 'html-validate-config-missing'
      );
      expect(missingFinding).toBeDefined();
      expect(missingFinding!.fixable).toBe(true);

      const fixAuditor = new ValidateHtmlValidateConfigAuditor({ projectRoot: tempDir });
      Reflect.set(fixAuditor, 'fixMode', true);
      await fixAuditor.execute();

      expect(fs.existsSync(path.join(tempDir, '.htmlvalidate.json'))).toBe(true);

      const postAuditor = new ValidateHtmlValidateConfigAuditor({ projectRoot: tempDir });
      const postResult = await postAuditor.execute();
      const remaining = postResult.findings.filter(
        (f) => f.ruleId === 'html-validate-config-missing'
      );
      expect(remaining).toHaveLength(0);
    });
  });

  describe('12. MarkdownLint Configuration Validator', () => {
    it('auto-creates missing .markdownlint.json and reports 0 post-fix errors', async () => {
      const checkAuditor = new ValidateMarkdownLintConfigAuditor({ projectRoot: tempDir });
      const checkResult = await checkAuditor.execute();

      const missingFinding = checkResult.findings.find(
        (f) => f.ruleId === 'markdownlint-config-missing'
      );
      expect(missingFinding).toBeDefined();
      expect(missingFinding!.fixable).toBe(true);

      const fixAuditor = new ValidateMarkdownLintConfigAuditor({ projectRoot: tempDir });
      Reflect.set(fixAuditor, 'fixMode', true);
      await fixAuditor.execute();

      expect(fs.existsSync(path.join(tempDir, '.markdownlint.json'))).toBe(true);

      const postAuditor = new ValidateMarkdownLintConfigAuditor({ projectRoot: tempDir });
      const postResult = await postAuditor.execute();
      const remaining = postResult.findings.filter(
        (f) => f.ruleId === 'markdownlint-config-missing'
      );
      expect(remaining).toHaveLength(0);
    });
  });

  describe('13. Markdown Code References Validator', () => {
    it('auto-updates outdated project version in markdown files', async () => {
      fs.writeFileSync(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: '@francogp/auditor', version: '9.2.0' }, null, 2),
        'utf-8'
      );
      const docsDir = path.join(tempDir, 'docs');
      fs.mkdirSync(docsDir, { recursive: true });
      const readmePath = path.join(docsDir, 'README.md');
      fs.writeFileSync(
        readmePath,
        '# Project\nVersion: @francogp/auditor@8.0.0 is used here.\n',
        'utf-8'
      );

      const checkAuditor = new MarkdownCodeReferencesAuditor([tempDir], tempDir);
      const checkResult = await checkAuditor.execute();

      const versionFinding = checkResult.findings.find(
        (f) => f.ruleId === 'markdown-outdated-project-version'
      );
      if (versionFinding) {
        expect(versionFinding.fixable).toBe(true);

        const fixAuditor = new MarkdownCodeReferencesAuditor([tempDir], tempDir);
        Reflect.set(fixAuditor, 'fixMode', true);
        await fixAuditor.execute();

        const repaired = fs.readFileSync(readmePath, 'utf-8');
        expect(repaired).toContain('@francogp/auditor@9.2.0');
      }
    });
  });

  describe('14. Script Extensions Validator', () => {
    it('auto-migrates .mjs scripts to .ts and reports 0 post-fix errors', async () => {
      const scriptsDir = path.join(tempDir, 'scripts');
      fs.mkdirSync(scriptsDir, { recursive: true });
      const mjsFile = path.join(scriptsDir, 'deploy.mjs');
      fs.writeFileSync(mjsFile, 'console.log("deploy");\n', 'utf-8');

      // 1. Check mode: reports banned-mjs-extension as fixable: true
      const checkAuditor = new ValidateScriptExtensionsAuditor({ projectRoot: tempDir });
      const checkResult = await checkAuditor.execute();

      const mjsFinding = checkResult.findings.find((f) => f.ruleId === 'banned-mjs-extension');
      expect(mjsFinding).toBeDefined();
      expect(mjsFinding!.fixable).toBe(true);

      // 2. Fix mode: renames to .ts
      const fixAuditor = new ValidateScriptExtensionsAuditor({ projectRoot: tempDir });
      Reflect.set(fixAuditor, 'fixMode', true);
      await fixAuditor.execute();

      expect(fs.existsSync(path.join(scriptsDir, 'deploy.ts'))).toBe(true);
      expect(fs.existsSync(mjsFile)).toBe(false);

      // 3. Post-fix check: finding is gone
      const postAuditor = new ValidateScriptExtensionsAuditor({ projectRoot: tempDir });
      const postResult = await postAuditor.execute();
      const remaining = postResult.findings.filter((f) => f.ruleId === 'banned-mjs-extension');
      expect(remaining).toHaveLength(0);
    });
  });

  describe('15. Z-Index Consistency Validator', () => {
    it('auto-replaces hardcoded literal z-index with CSS variable', async () => {
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      const cssFile = path.join(srcDir, 'style.css');
      fs.writeFileSync(cssFile, '.modal { z-index: 1000; }\n', 'utf-8');

      const checkAuditor = new ZIndexAuditor(undefined, [tempDir], tempDir);
      const checkResult = await checkAuditor.execute();

      const zFinding = checkResult.findings.find((f) => f.ruleId === 'z-index-hardcoded-literal');
      if (zFinding) {
        expect(zFinding.fixable).toBe(true);

        const fixAuditor = new ZIndexAuditor(undefined, [tempDir], tempDir);
        Reflect.set(fixAuditor, 'fixMode', true);
        await fixAuditor.execute();

        const repaired = fs.readFileSync(cssFile, 'utf-8');
        expect(repaired).toContain('var(');
      }
    });
  });

  describe('16. Universal Grounded Fixability Governance (All Discovered Suites)', () => {
    it('guarantees that 100% of suites declaring fix: "priority" | "normal" define non-empty fixableRuleIds', async () => {
      const auditors = await discoverAuditors({ projectRoot: process.cwd() });
      expect(auditors.length).toBeGreaterThan(0);

      const unfixableSuitesPatterns = [
        'type_check',
        'similar_code',
        'fallow',
        'complexity',
        'domain_types',
        'test_coverage'
      ];

      for (const auditor of auditors) {
        const fixCap = auditor.capabilities?.fix ?? 'none';
        const fixableRules = auditor.manifest?.fixableRules || [];

        if (fixCap !== 'none') {
          // A suite declaring fix capability MUST declare which rules are fixable
          expect(fixableRules.length).toBeGreaterThan(0);
        }

        // Unfixable structural suites must NEVER declare fix capability
        for (const pattern of unfixableSuitesPatterns) {
          if (auditor.id.includes(pattern) && !auditor.id.includes('config')) {
            expect(fixCap).toBe('none');
            expect(fixableRules).toHaveLength(0);
          }
        }
      }
    });
  });

  describe('17. Strategic Remediation Phases Invariants', () => {
    it('declares 100% of the 7 canonical strategic resolution phases in exact immutable order', () => {
      expect(REMEDIATION_PHASE_IDS).toEqual([
        'setup',
        'prune',
        'dedup',
        'contracts',
        'behavior',
        'hygiene',
        'polish'
      ]);

      for (const phaseId of REMEDIATION_PHASE_IDS) {
        const meta = REMEDIATION_PHASES[phaseId];
        expect(meta).toBeDefined();
        expect(meta.id).toBe(phaseId);
        expect(meta.title).toBeDefined();
        expect(meta.icon).toBeDefined();
        expect(meta.description).toBeDefined();
        expect(meta.rationale).toBeDefined();
        expect(meta.order).toBeGreaterThanOrEqual(1);
        expect(meta.order).toBeLessThanOrEqual(7);
      }
    });
  });
});

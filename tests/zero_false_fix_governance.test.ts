/**
 * tests/zero_false_fix_governance.test.ts
 *
 * ZERO FALSE-FIX MANDATE SPECIFICATION & TESTS
 *
 * Guarantees that the framework NEVER reports false "auto-fixable" errors
 * to developers or AI agents when the errors are architectural or non-mechanical.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseLintResultsToFindings } from '../src/core/reportUtils.ts';
import { processStylelintResults } from '../src/suites/architecture/validate_stylelint.ts';
import { computeFixableViolations } from '../src/cli/audit_full.ts';
import type { StandardAuditResult, AuditFinding } from '../src/core/auditContract.ts';

describe('Zero False-Fix Mandate (Gobernanza de Auto-Reparación Estricta)', () => {
  const fixturesDir = path.resolve(import.meta.dirname, 'fixtures');

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('1. ESLint Real-World Fixture Parsing', () => {
    it('correctly flags unfixable and fixable ESLint violations from raw report', () => {
      const rawJson = fs.readFileSync(path.join(fixturesDir, 'eslint_real_world_report.json'), 'utf-8');
      const reports = JSON.parse(rawJson);

      const findings = parseLintResultsToFindings(reports, {
        suiteId: 'validate_eslint',
        suiteName: 'ESLint Code Hygiene Validator',
        ruleId: 'eslint-violation',
        ruleDescription: 'Error de sintaxis o regla'
      });

      expect(findings).toHaveLength(4);

      // 1. Date.now() via no-restricted-syntax -> MUST be fixable: false
      const dateNowFinding = findings.find(f => f.message.includes('Date.now()'));
      expect(dateNowFinding).toBeDefined();
      expect(dateNowFinding!.context).toBe('no-restricted-syntax');
      expect(dateNowFinding!.fixable).toBe(false);

      // 2. new Date() via no-restricted-syntax -> MUST be fixable: false
      const newDateFinding = findings.find(f => f.message.includes('new Date()'));
      expect(newDateFinding).toBeDefined();
      expect(newDateFinding!.context).toBe('no-restricted-syntax');
      expect(newDateFinding!.fixable).toBe(false);

      // 3. no-useless-assignment -> MUST be fixable: false
      const uselessAssignFinding = findings.find(f => f.context === 'no-useless-assignment');
      expect(uselessAssignFinding).toBeDefined();
      expect(uselessAssignFinding!.fixable).toBe(false);

      // 4. semi (with EditInfo) -> MUST be fixable: true
      const semiFinding = findings.find(f => f.context === 'semi');
      expect(semiFinding).toBeDefined();
      expect(semiFinding!.fixable).toBe(true);

      // Invariant: every single finding must declare an explicit boolean fixable flag
      for (const f of findings) {
        expect(typeof f.fixable).toBe('boolean');
      }
    });
  });

  describe('2. Stylelint Real-World Fixture Parsing', () => {
    it('correctly flags unfixable and fixable Stylelint warnings from raw report', () => {
      const rawJson = fs.readFileSync(path.join(fixturesDir, 'stylelint_real_world_report.json'), 'utf-8');
      const reports = JSON.parse(rawJson);

      const { violations } = processStylelintResults(reports, process.cwd());
      expect(violations).toHaveLength(4);

      // 1. no-duplicate-selectors -> MUST be fixable: false
      const dupSelector = violations.find(v => v.context === 'no-duplicate-selectors');
      expect(dupSelector).toBeDefined();
      expect(dupSelector!.fixable).toBe(false);

      // 2. keyframes-name-pattern -> MUST be fixable: false
      const keyframesViolation = violations.find(v => v.context === 'keyframes-name-pattern');
      expect(keyframesViolation).toBeDefined();
      expect(keyframesViolation!.fixable).toBe(false);

      // 3. order/order -> MUST be fixable: true (governed by isStylelintRuleFixable)
      const orderFix = violations.find(v => v.context === 'order/order');
      expect(orderFix).toBeDefined();
      expect(orderFix!.fixable).toBe(true);

      // 4. color-hex-length -> MUST be fixable: true (governed by isStylelintRuleFixable)
      const hexFinding = violations.find(v => v.context === 'color-hex-length');
      expect(hexFinding).toBeDefined();
      expect(hexFinding!.fixable).toBe(true);

      for (const v of violations) {
        expect(typeof v.fixable).toBe('boolean');
      }
    });
  });

  describe('3. Orchestrator computeFixableViolations (The Exact 88-Error Test Case)', () => {
    it('computes 0 fixable errors for the exact 88 unfixable errors detected in test_aventura', () => {
      // Simulate the 4 suites that produced the 88 errors in test_aventura
      const eslintFindings: AuditFinding[] = Array.from({ length: 63 }, (_, i) => ({
        suiteId: 'validate_eslint',
        suiteName: 'ESLint Code Hygiene Validator',
        ruleId: 'eslint-violation',
        ruleDescription: 'Error de sintaxis o regla',
        severity: 'error',
        file: `test_aventura/file_${i}.ts`,
        line: 10,
        context: i % 2 === 0 ? 'no-restricted-syntax' : 'no-useless-assignment',
        message: 'Non-fixable architectural defect',
        fixable: false
      }));

      const stylelintFindings: AuditFinding[] = Array.from({ length: 22 }, (_, i) => ({
        suiteId: 'validate_stylelint',
        suiteName: 'Stylelint & SCSS Hygiene Validator',
        ruleId: 'css-duplicate-selectors',
        ruleDescription: 'Selectores duplicados en el bloque',
        severity: 'error',
        file: `test_aventura/styles_${i}.scss`,
        line: 25,
        context: 'no-duplicate-selectors',
        message: 'Duplicate selector',
        fixable: false
      }));

      const auditProjectFindings: AuditFinding[] = [
        {
          suiteId: 'audit_project',
          suiteName: 'Project Architecture & Style Rules',
          ruleId: 'noRawJsonImportsOutsideData',
          ruleDescription: 'Arquitectura: Optimización de Bundle',
          severity: 'error',
          file: 'test_aventura/composables/studio/useAssetAtlas.ts',
          line: 12,
          context: "import manifestJson from '../../data/map/canonical_assets_manifest.json'",
          message: 'Importación estática de JSON fuera de src/data/',
          fixable: false
        },
        {
          suiteId: 'audit_project',
          suiteName: 'Project Architecture & Style Rules',
          ruleId: 'noRawJsonImportsOutsideData',
          ruleDescription: 'Arquitectura: Optimización de Bundle',
          severity: 'error',
          file: 'test_aventura/composables/studio/useAssetAtlas.ts',
          line: 45,
          context: "import manifestJson from '../../data/map/canonical_assets_manifest.json'",
          message: 'Importación estática de JSON fuera de src/data/',
          fixable: false
        }
      ];

      const a11yFindings: AuditFinding[] = [
        {
          suiteId: 'validate_accessibility',
          suiteName: 'Vue & Web Accessibility Standards Auditor',
          ruleId: 'a11y-interactive-supports-focus',
          ruleDescription: 'Elemento interactivo sin foco',
          severity: 'error',
          file: 'test_aventura/components/studio/ContinentStudioControls.vue',
          line: 55,
          context: 'vuejs-accessibility/interactive-supports-focus',
          message: 'Visible, non-interactive elements with click handlers must have at least one keyboard listener.',
          fixable: false
        }
      ];

      const results: StandardAuditResult[] = [
        {
          id: 'validate_eslint',
          name: 'ESLint Code Hygiene Validator',
          description: 'ESLint Code Hygiene Validator',
          family: 'architecture',
          status: 'failed',
          durationMs: 1200,
          summary: { errors: 63, warnings: 0, info: 0 },
          metrics: {},
          findings: eslintFindings
        },
        {
          id: 'validate_stylelint',
          name: 'Stylelint & SCSS Hygiene Validator',
          description: 'Stylelint & SCSS Hygiene Validator',
          family: 'architecture',
          status: 'failed',
          durationMs: 800,
          summary: { errors: 22, warnings: 0, info: 0 },
          metrics: {},
          findings: stylelintFindings
        },
        {
          id: 'audit_project',
          name: 'Project Architecture & Style Rules',
          description: 'Project Architecture & Style Rules',
          family: 'architecture',
          status: 'failed',
          durationMs: 500,
          summary: { errors: 2, warnings: 0, info: 0 },
          metrics: {},
          findings: auditProjectFindings
        },
        {
          id: 'validate_accessibility',
          name: 'Vue & Web Accessibility Standards Auditor',
          description: 'Vue & Web Accessibility Standards Auditor',
          family: 'architecture',
          status: 'failed',
          durationMs: 300,
          summary: { errors: 1, warnings: 0, info: 0 },
          metrics: {},
          findings: a11yFindings
        }
      ];

      const totalErrors = results.reduce((acc, r) => acc + r.summary.errors, 0);
      expect(totalErrors).toBe(88); // 63 + 22 + 2 + 1 = 88

      const fixableResult = computeFixableViolations(results, false);

      // In check mode: MUST NOT report ANY fixable error because none have fixable: true!
      expect(fixableResult.fixableErrors).toBe(0);
      expect(fixableResult.fixableWarnings).toBe(0);
      expect(fixableResult.autoFixRecommended).toBe(false);
    });

    it('reports strictly the subset of errors that genuinely have fixable: true', () => {
      const results: StandardAuditResult[] = [
        {
          id: 'validate_eslint',
          name: 'ESLint Code Hygiene Validator',
          description: 'ESLint Code Hygiene Validator',
          family: 'architecture',
          status: 'failed',
          durationMs: 500,
          summary: { errors: 10, warnings: 2, info: 0 },
          metrics: {},
          findings: [
            // 3 fixable errors
            { severity: 'error', message: 'Missing semicolon', fixable: true },
            { severity: 'error', message: 'Missing semicolon', fixable: true },
            { severity: 'error', message: 'Quotes mismatch', fixable: true },
            // 7 unfixable errors
            { severity: 'error', message: 'Date.now() forbidden', fixable: false },
            { severity: 'error', message: 'Date.now() forbidden', fixable: false },
            { severity: 'error', message: 'Date.now() forbidden', fixable: false },
            { severity: 'error', message: 'no-useless-assignment', fixable: false },
            { severity: 'error', message: 'no-useless-assignment', fixable: false },
            { severity: 'error', message: 'no-useless-assignment', fixable: false },
            { severity: 'error', message: 'no-useless-assignment', fixable: false },
            // 1 fixable warning, 1 unfixable warning
            { severity: 'warning', message: 'Indentation', fixable: true },
            { severity: 'warning', message: 'Complex function', fixable: false }
          ] as AuditFinding[]
        }
      ];

      const res = computeFixableViolations(results, false);
      expect(res.fixableErrors).toBe(3);
      expect(res.fixableWarnings).toBe(1);
      expect(res.autoFixRecommended).toBe(true);
    });

    it('enforces post-fix invariant: when isFixMode is true, fixableErrors is always 0', () => {
      const results: StandardAuditResult[] = [
        {
          id: 'validate_eslint',
          name: 'ESLint Code Hygiene Validator',
          description: 'ESLint Code Hygiene Validator',
          family: 'architecture',
          status: 'failed',
          durationMs: 500,
          summary: { errors: 5, warnings: 0, info: 0 },
          metrics: {},
          findings: [
            { severity: 'error', message: 'Remaining error after fix', fixable: true }
          ] as AuditFinding[]
        }
      ];

      // In fix mode, all remaining findings could not be repaired by the fix runner.
      const res = computeFixableViolations(results, true);
      expect(res.fixableErrors).toBe(0);
      expect(res.fixableWarnings).toBe(0);
      expect(res.autoFixRecommended).toBe(false);
    });
  });

  describe('4. Project Architecture AST Rules fixable propagation', () => {
    it('sets fixable: false for noRawJsonImportsOutsideData (unfixable bundle rule)', async () => {
      const { runRules } = await import('../src/suites/architecture/audit_project.ts');
      const { auditRulesConfig } = await import('../src/suites/architecture/audit_rules.ts');
      const violations: any[] = [];
      const code = "import manifestJson from '../../data/map/canonical_assets_manifest.json';";
      runRules('src/composables/studio/useAssetAtlas.ts', code, [auditRulesConfig.noRawJsonImportsOutsideData], violations, false, 0);

      expect(violations).toHaveLength(1);
      expect(violations[0].ruleId).toBe('noRawJsonImportsOutsideData');
      expect(violations[0].fixable).toBe(false);
    });

    it('sets fixable: true for rules that implement an automated fix function (e.g. esmExtensions)', async () => {
      const { runRules } = await import('../src/suites/architecture/audit_project.ts');
      const { auditRulesConfig } = await import('../src/suites/architecture/audit_rules.ts');
      const violations: any[] = [];
      const code = 'import { helper } from ' + "'./helper';";
      runRules('src/logic/engine.ts', code, [auditRulesConfig.esmExtensions], violations, false, 0);

      expect(violations).toHaveLength(1);
      expect(violations[0].ruleId).toBe('esmExtensions');
      expect(violations[0].fixable).toBe(true);
    });
  });

  describe('5. Z-Index Auditor fixable classification & BaseAuditor OOP Helpers', () => {
    it('marks hardcoded z-index violations as fixable: false', async () => {
      const { ZIndexAuditor } = await import('../src/suites/architecture/validate_z_index.ts');
      const auditor = new ZIndexAuditor();
      auditor.addViolation({
        ruleId: 'z-index-hardcoded-literal',
        severity: 'error',
        file: 'test_aventura/styles/animations.css',
        line: 146,
        message: "Z-Index hardcodeado fuera de estándar: 'z-index: 100'",
        context: 'z-index: 100',
        fixable: false
      });

      // Verification of BaseAuditor OOP getters & polymorphism
      expect(auditor.getFixableErrors()).toBe(0);
      expect(auditor.getFixableWarnings()).toBe(0);
      expect(auditor.getFixableFindings()).toHaveLength(0);
      expect(auditor.getFixableErrorsByRule().get('z-index-hardcoded-literal')).toBe(0);

      const result = await auditor.finishAudit();
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]!.fixable).toBe(false);
      expect(result.summary.fixableErrors).toBe(0);
      expect(result.summary.fixableWarnings).toBe(0);
    });

    it('tracks fixable violations polymorphically in BaseAuditor', async () => {
      const { BaseAuditor } = await import('../src/core/auditorBase.ts');
      const { ZIndexAuditor } = await import('../src/suites/architecture/validate_z_index.ts');
      const auditor = new ZIndexAuditor();

      // Unfixable error
      auditor.addViolation({
        ruleId: 'z-index-hardcoded-literal',
        severity: 'error',
        message: 'Hardcoded literal',
        fixable: false
      });

      // Fixable warning
      auditor.addViolation({
        ruleId: 'z-index-mismatch',
        severity: 'warning',
        message: 'TS vs SCSS desync',
        fixable: true
      });

      expect(auditor.getFixableErrors()).toBe(0);
      expect(auditor.getFixableWarnings()).toBe(1);
      expect(auditor.getFixableFindings()).toHaveLength(1);
      expect(auditor.getFixableWarningsByRule().get('z-index-mismatch')).toBe(1);

      const result = await auditor.finishAudit();
      expect(result.summary.errors).toBe(1);
      expect(result.summary.warnings).toBe(1);
      expect(result.summary.fixableErrors).toBe(0);
      expect(result.summary.fixableWarnings).toBe(1);

      // Universal static coordination helper
      const stats = BaseAuditor.computeFixableViolations([result], false);
      expect(stats.fixableErrors).toBe(0);
      expect(stats.fixableWarnings).toBe(1);
      expect(stats.autoFixRecommended).toBe(true);

      const postFixStats = BaseAuditor.computeFixableViolations([result], true);
      expect(postFixStats.fixableErrors).toBe(0);
      expect(postFixStats.autoFixRecommended).toBe(false);
    });
  });
});

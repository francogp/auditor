/**
 * tests/audit_executive_output.test.ts
 *
 * Unit tests verifying executive AI-friendly console summaries, phase breakdowns,
 * and console mode resolution contracts.
 */

import { describe, it, expect } from 'vite-plus/test';

import { resolveConsoleMode } from '../src/cli/audit_full.ts';
import type { StandardAuditResult } from '../src/core/auditContract.ts';
import {
  renderExecutivePassSummary,
  renderExecutiveFailSummary,
  renderExecutiveSetupBlockingSummary,
  renderExecutiveFixSummary,
  extractPhaseBreakdown
} from '../src/core/executiveTheme.ts';

describe('Executive Console Output & AI-Friendly Theme', () => {
  describe('renderExecutivePassSummary', () => {
    it('omits Ratchet label when ratchetStatus is undefined (partial runs, speed=light, filters)', () => {
      const output = renderExecutivePassSummary({
        totalSuites: 80,
        passedSuites: 80,
        totalErrors: 0,
        totalWarnings: 2,
        durationMs: 10400,
        latestAuditJsonPath: 'scratch/audits/latest_audit.json'
      });

      const lines = output.trim().split('\n');
      expect(lines).toHaveLength(3);
      expect(lines[0]).toContain('[WARN] AUDIT PASSED WITH WARNINGS [80/80 suites]');
      expect(lines[1]).toBe('  Errors: 0 | Warnings: 2');
      expect(lines[1]).not.toContain('Ratchet');
      expect(lines[2]).toContain('Report: scratch/audits/latest_audit.json');
      expect(output).not.toContain('╔');
      expect(output).not.toContain('┌');
    });

    it('emits Ratchet: OK only when ratchetStatus is passed', () => {
      const output = renderExecutivePassSummary({
        totalSuites: 80,
        passedSuites: 80,
        totalErrors: 0,
        totalWarnings: 1,
        durationMs: 10400,
        latestAuditJsonPath: 'scratch/audits/latest_audit.json',
        ratchetStatus: 'passed'
      });

      const lines = output.trim().split('\n');
      expect(lines[1]).toBe('  Errors: 0 | Warnings: 1 | Ratchet: OK');
    });

    it('emits Ratchet: INIT when ratchetStatus is initialized', () => {
      const output = renderExecutivePassSummary({
        totalSuites: 80,
        passedSuites: 80,
        totalErrors: 0,
        totalWarnings: 1,
        durationMs: 10400,
        latestAuditJsonPath: 'scratch/audits/latest_audit.json',
        ratchetStatus: 'initialized'
      });

      const lines = output.trim().split('\n');
      expect(lines[1]).toBe('  Errors: 0 | Warnings: 1 | Ratchet: INIT');
    });

    it('notes skipped suites cleanly when suites are omitted', () => {
      const output = renderExecutivePassSummary({
        totalSuites: 76,
        passedSuites: 68,
        skippedSuites: 8,
        totalErrors: 0,
        totalWarnings: 0,
        durationMs: 9500
      });

      expect(output).toContain('[68/76 suites (8 skipped)]');
    });
  });

  describe('renderExecutiveFailSummary', () => {
    it('emits structured executive breakdown with phases and canonical next action commands', () => {
      const output = renderExecutiveFailSummary({
        totalSuites: 80,
        failedSuites: 2,
        totalErrors: 3,
        totalWarnings: 1,
        durationMs: 11200,
        fixableErrors: 2,
        phaseBreakdown: [
          { phase: 'contracts', errors: 2, warnings: 0 },
          { phase: 'polish', errors: 1, warnings: 1 }
        ]
      });

      expect(output).toContain('[FAIL] AUDIT FAILED [80 suites]');
      expect(output).toContain('Status: 3 error(s), 1 warning(s) (2 auto-fixable) in 2 suite(s)');
      expect(output).toContain('Breakdown by Phase:');
      expect(output).toContain('• contracts   : 2 error(s)');
      expect(output).toContain('• polish      : 1 error(s), 1 warning(s)');
      expect(output).toContain('Next Actions for AI:');
      expect(output).toContain('Mandatory Auto-Fix: npm run auditor:fix (2 auto-fixable)');
      // When auto-fixable errors exist, DO NOT recommend manual triage tools to keep AI on rails
      expect(output).not.toContain('npm run auditor:next');
      expect(output).not.toContain('npm run auditor:findings');
      expect(output).toContain('Full Report: scratch/audits/latest_audit.json');
      expect(output).not.toContain('╔');
    });

    it('emits phase and findings triage recommendations when fixableErrors is zero', () => {
      const output = renderExecutiveFailSummary({
        totalSuites: 80,
        failedSuites: 1,
        totalErrors: 2,
        totalWarnings: 0,
        durationMs: 9800,
        fixableErrors: 0,
        phaseBreakdown: [{ phase: 'behavior', errors: 2, warnings: 0 }]
      });

      expect(output).toContain('Next Actions for AI:');
      expect(output).toContain('1. Focus critical phase: npm run auditor:next');
      expect(output).toContain('2. Inspect findings:   npm run auditor:findings');
      expect(output).toContain('3. Inspect by phase:   npm run auditor:findings -- phase=behavior');
      expect(output).toContain('4. Consult rule guide: npm run auditor -- guide <ruleId>');
      expect(output).not.toContain('auditor:fix');
    });

    it('emits mandatory auto-fix when fixableWarnings > 0 even if fixableErrors is zero', () => {
      const output = renderExecutiveFailSummary({
        totalSuites: 80,
        failedSuites: 1,
        totalErrors: 1,
        totalWarnings: 2,
        durationMs: 4000,
        fixableErrors: 0,
        fixableWarnings: 2,
        phaseBreakdown: [{ phase: 'hygiene', errors: 1, warnings: 2 }]
      });

      expect(output).toContain('Next Actions for AI:');
      expect(output).toContain('Mandatory Auto-Fix: npm run auditor:fix (2 auto-fixable)');
      expect(output).not.toContain('npm run auditor:next');
    });

    it('replaces Next Actions for AI with Top Detected Errors when topFindings is provided in build:deploy', () => {
      const output = renderExecutiveFailSummary({
        totalSuites: 80,
        failedSuites: 2,
        totalErrors: 2,
        totalWarnings: 0,
        durationMs: 4000,
        phaseBreakdown: [{ phase: 'hygiene', errors: 2, warnings: 0 }],
        topFindings: [
          {
            severity: 'error',
            ruleId: 'fallow-workspace-diagnostic',
            file: 'src/main.ts',
            line: 42,
            message: 'Unused export found'
          },
          {
            severity: 'error',
            ruleId: 'oxlint-no-unused-vars',
            file: 'src/util.ts',
            line: 10,
            message: 'Variable foo is unused'
          }
        ]
      });

      expect(output).toContain('Top Detected Errors (first 2):');
      expect(output).toContain('src/main.ts:42');
      expect(output).toContain('[fallow-workspace-diagnostic] Unused export found');
      expect(output).toContain('src/util.ts:10');
      expect(output).toContain('[oxlint-no-unused-vars] Variable foo is unused');
      expect(output).not.toContain('Next Actions for AI');
      expect(output).not.toContain('npm run auditor:next');
      expect(output).not.toContain('👉 Guide:');
    });

    it('emits explicit ratchet threshold exceeded explanation when run fails with 0 errors but ratchet status is failed', () => {
      const output = renderExecutiveFailSummary({
        totalSuites: 80,
        failedSuites: 0,
        totalErrors: 0,
        totalWarnings: 2,
        durationMs: 4000,
        phaseBreakdown: [{ phase: 'polish', errors: 0, warnings: 2 }],
        ratchetVerdict: {
          status: 'failed',
          newWarnings: 1,
          productionRef: 'origin/main'
        }
      });

      expect(output).toContain('[FAIL] AUDIT FAILED [80 suites]');
      expect(output).toContain(
        "Status: 0 error(s), 2 warning(s) — 🔒 Ratchet threshold exceeded (+1 new warning(s) relative to 'origin/main')"
      );
    });
  });

  describe('renderExecutiveSetupBlockingSummary', () => {
    it('emits prominent blocking notice and explicit mandate forbidding application code mutation', () => {
      const output = renderExecutiveSetupBlockingSummary({
        totalSuites: 80,
        setupErrors: 2,
        postponedAppErrors: 14,
        durationMs: 2500,
        blockingSuites: ['validate_audit_config', 'validate_environment_engines'],
        hasFixableErrors: true
      });

      expect(output).toContain('[BLOCKED] AUDIT BLOCKED: Setup Phase Failure [80 suites]');
      expect(output).toContain(
        'Status: 2 setup error(s) (14 downstream app errors postponed to prevent false positives)'
      );
      expect(output).toContain('Blocking Suites:');
      expect(output).toContain('• validate_audit_config');
      expect(output).toContain('• validate_environment_engines');
      expect(output).toContain(
        'MANDATE: STRICTLY FORBIDDEN to modify application code or styles while setup phase is blocked.'
      );
      expect(output).toContain('npm run auditor:findings -- phase=setup');
      expect(output).toContain('npm run auditor:fix');
    });

    it('replaces MANDATE and Next Actions for AI with Top Blocking Errors when topFindings is provided in build:deploy', () => {
      const output = renderExecutiveSetupBlockingSummary({
        totalSuites: 80,
        setupErrors: 2,
        postponedAppErrors: 5,
        durationMs: 960,
        blockingSuites: ['validate_fallow_config'],
        hasFixableErrors: false,
        topFindings: [
          {
            severity: 'error',
            ruleId: 'fallow-undeclared-config-entry',
            file: '.fallowrc.json',
            line: 1,
            message: 'Undeclared entry found in satellite config'
          }
        ]
      });

      expect(output).toContain('Top Blocking Errors (first 1):');
      expect(output).toContain('.fallowrc.json:1');
      expect(output).toContain(
        '[fallow-undeclared-config-entry] Undeclared entry found in satellite config'
      );
      expect(output).not.toContain('MANDATE: STRICTLY FORBIDDEN');
      expect(output).not.toContain('Next Actions for AI');
      expect(output).not.toContain('npm run auditor:findings -- phase=setup');
      expect(output).not.toContain('👉 Guide:');
    });
  });

  describe('renderExecutiveFixSummary', () => {
    it('emits clean repair summary recommending canonical npm run auditor next step', () => {
      const output = renderExecutiveFixSummary({
        durationMs: 1400,
        totalViolationsRepaired: 4,
        filesModified: 2
      });

      expect(output).toContain('[OK] AUTO-FIX COMPLETED');
      expect(output).toContain('Repaired: 4 violation(s) across 2 file(s)');
      expect(output).toContain("Next Action: Run 'npm run auditor' to verify clean pass.");
      expect(output).toContain('Full Report: scratch/audits/latest_audit.json');
      expect(output).not.toContain('╔');
    });

    it('reports remaining unfixable errors when present', () => {
      const output = renderExecutiveFixSummary({
        durationMs: 1400,
        totalViolationsRepaired: 2,
        filesModified: 1,
        remainingErrors: 3,
        remainingWarnings: 1
      });

      expect(output).toContain('Remaining: 3 unfixable error(s), 1 warning(s)');
    });
  });

  describe('extractPhaseBreakdown', () => {
    it('groups and sorts findings prioritizing setup phase first', () => {
      const dummyResults = [
        {
          id: 'validate_audit_config',
          name: 'Audit Config',
          family: 'architecture',
          status: 'failed',
          durationMs: 10,
          description: 'Audit Config',
          metrics: {},
          summary: { errors: 1, warnings: 0, info: 0 },
          findings: [{ severity: 'error', message: 'Err 1', remediationPhase: 'setup' }]
        },
        {
          id: 'validate_domain_types',
          name: 'Domain Types',
          family: 'domain_data',
          status: 'failed',
          durationMs: 10,
          description: 'Domain Types',
          metrics: {},
          summary: { errors: 2, warnings: 1, info: 0 },
          findings: [
            { severity: 'error', message: 'Err 2', remediationPhase: 'contracts' },
            { severity: 'error', message: 'Err 3', remediationPhase: 'contracts' },
            { severity: 'warning', message: 'Warn 1', remediationPhase: 'polish' }
          ]
        }
      ] as StandardAuditResult[];

      const breakdown = extractPhaseBreakdown(dummyResults);
      expect(breakdown[0]?.phase).toBe('setup');
      expect(breakdown[0]?.errors).toBe(1);
      expect(breakdown[1]?.phase).toBe('contracts');
      expect(breakdown[1]?.errors).toBe(2);
      expect(breakdown[2]?.phase).toBe('polish');
      expect(breakdown[2]?.warnings).toBe(1);
    });
  });

  describe('resolveConsoleMode', () => {
    it('defaults strictly to compact when no flags are provided', () => {
      expect(resolveConsoleMode({}, [])).toBe('compact');
    });

    it('resolves human when human flags or aliases are passed', () => {
      expect(resolveConsoleMode({ human: true }, [])).toBe('human');
      expect(resolveConsoleMode({ format: 'human' }, [])).toBe('human');
      expect(resolveConsoleMode({}, ['human'])).toBe('human');
      expect(resolveConsoleMode({}, ['--human'])).toBe('human');
      expect(resolveConsoleMode({ verbose: true }, [])).toBe('human');
      expect(resolveConsoleMode({ format: 'verbose' }, [])).toBe('human');
      expect(resolveConsoleMode({}, ['verbose'])).toBe('human');
    });
  });
});

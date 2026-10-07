import { describe, it, expect, afterEach } from 'vitest';
import {
  resolveTargetFamily,
  resolveFormattedRules,
  resolveTargetSuites,
  resolveConcurrencyLimit,
  resolveSkipSimilar,
  resolveTargetPreset,
  parseAuditFullCliArgs,
  determineRunMode,
  buildTaskArgs,
  extractSubprocessErrorMessage,
  computeAuditCategoryCounts,
  isRatchetScope,
  createAuditBannerDetails
} from '../src/cli/audit_full.ts';
import type {
  AuditTaskDefinition,
  StandardAuditResult,
  AuditFinding
} from '../src/core/auditContract.ts';
import { DEFAULT_AUDITOR_CAPABILITIES } from '../src/core/auditorBase.ts';

describe('audit_full CLI orchestration helpers', () => {
  const activeFamilies = ['architecture', 'domain_data', 'documentation', 'testing'];

  describe('resolveTargetFamily', () => {
    it('resolves family from family option if provided', () => {
      expect(resolveTargetFamily('architecture', [], activeFamilies)).toBe('architecture');
      expect(resolveTargetFamily('domain_data', ['documentation'], activeFamilies)).toBe('domain_data');
    });

    it('resolves family from positionals if present in activeFamilies', () => {
      expect(resolveTargetFamily(undefined, ['documentation', 'foo'], activeFamilies)).toBe('documentation');
    });

    it('returns undefined if no family option or valid positional matches', () => {
      expect(resolveTargetFamily(undefined, ['unknown', 'random'], activeFamilies)).toBeUndefined();
      expect(resolveTargetFamily(undefined, [], activeFamilies)).toBeUndefined();
    });
  });

  describe('resolveFormattedRules', () => {
    it('joins single or multiple rule options', () => {
      expect(resolveFormattedRules({ rule: 'no-any' }, [])).toBe('no-any');
      expect(resolveFormattedRules({ rule: ['no-any', 'legacy-date'] }, [])).toBe('no-any,legacy-date');
    });

    it('joins single or multiple rules options', () => {
      expect(resolveFormattedRules({ rules: 'rule-a' }, [])).toBe('rule-a');
      expect(resolveFormattedRules({ rules: ['rule-a', 'rule-b'] }, [])).toBe('rule-a,rule-b');
    });

    it('includes positionals with dox or comma-separated lists', () => {
      expect(resolveFormattedRules({}, ['dox'])).toBe('dox');
      expect(resolveFormattedRules({}, ['DOX'])).toBe('DOX');
      expect(resolveFormattedRules({}, ['rule1,rule2'])).toBe('rule1,rule2');
    });

    it('combines values and positionals', () => {
      expect(resolveFormattedRules({ rule: 'rule-a' }, ['dox'])).toBe('rule-a,dox');
    });

    it('returns empty string when nothing matches', () => {
      expect(resolveFormattedRules({}, ['other', 'args'])).toBe('');
    });
  });

  describe('resolveTargetSuites', () => {
    it('resolves from suites comma-separated string', () => {
      expect(resolveTargetSuites({ suites: 'audit_project, validate_stylelint ' })).toEqual([
        'audit_project',
        'validate_stylelint'
      ]);
    });

    it('resolves from tasks comma-separated string', () => {
      expect(resolveTargetSuites({ tasks: 'task1,task2' })).toEqual(['task1', 'task2']);
    });

    it('resolves from task when it contains a comma', () => {
      expect(resolveTargetSuites({ task: 'task1,task2' })).toEqual(['task1', 'task2']);
    });

    it('returns undefined when task is single or not provided', () => {
      expect(resolveTargetSuites({ task: 'single_task' })).toBeUndefined();
      expect(resolveTargetSuites({})).toBeUndefined();
    });
  });

  describe('resolveConcurrencyLimit', () => {
    it('parses valid numeric concurrency string', () => {
      expect(resolveConcurrencyLimit('4')).toBe(4);
      expect(resolveConcurrencyLimit('8')).toBe(8);
    });

    it('enforces MIN_CONCURRENCY of at least 1', () => {
      expect(resolveConcurrencyLimit('0')).toBeGreaterThanOrEqual(1);
      expect(resolveConcurrencyLimit('-5')).toBeGreaterThanOrEqual(1);
    });

    it('uses available CPU calculation when concurrency is undefined or NaN', () => {
      const fallback = resolveConcurrencyLimit(undefined);
      expect(fallback).toBeGreaterThanOrEqual(1);
      expect(resolveConcurrencyLimit('invalid')).toBe(fallback);
    });
  });

  describe('resolveSkipSimilar', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('returns true when AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS is set to true or 1', () => {
      delete process.env.AUDIT_SKIP_SIMILAR;
      process.env.AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS = 'true';
      expect(resolveSkipSimilar()).toBe(true);

      process.env.AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS = '1';
      expect(resolveSkipSimilar()).toBe(true);
    });

    it('returns true when AUDIT_SKIP_SIMILAR is set to true or 1', () => {
      delete process.env.AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS;
      process.env.AUDIT_SKIP_SIMILAR = 'true';
      expect(resolveSkipSimilar()).toBe(true);

      process.env.AUDIT_SKIP_SIMILAR = '1';
      expect(resolveSkipSimilar()).toBe(true);
    });

    it('returns false when neither environment variable is active', () => {
      delete process.env.AUDITOR_SKIP_SIMILAR_CODE_VECTOR_ANALYSIS;
      delete process.env.AUDIT_SKIP_SIMILAR;
      expect(resolveSkipSimilar()).toBe(false);
    });
  });

  describe('resolveTargetPreset', () => {
    it('returns preset option if set', () => {
      expect(resolveTargetPreset({ preset: 'lint' }, [])).toBe('lint');
      expect(resolveTargetPreset({ preset: 'md' }, [])).toBe('md');
    });

    it('returns build when values.build is truthy', () => {
      expect(resolveTargetPreset({ build: true }, [])).toBe('build');
    });

    it('returns preset when found in positionals', () => {
      expect(resolveTargetPreset({}, ['build'])).toBe('build');
      expect(resolveTargetPreset({}, ['lint'])).toBe('lint');
      expect(resolveTargetPreset({}, ['md'])).toBe('md');
    });

    it('returns undefined when no preset is requested', () => {
      expect(resolveTargetPreset({}, ['other'])).toBeUndefined();
    });
  });

  describe('parseAuditFullCliArgs', () => {
    it('parses empty args to sensible defaults', () => {
      const cli = parseAuditFullCliArgs(activeFamilies, []);
      expect(cli.positionals).toEqual([]);
      expect(cli.targetFamily).toBeUndefined();
      expect(cli.formattedRules).toBe('');
      expect(cli.targetPreset).toBeUndefined();
      expect(cli.targetSuites).toBeUndefined();
      expect(cli.concurrencyLimit).toBeGreaterThanOrEqual(1);
      expect(cli.isEnabledFilter).toBe(false);
      expect(cli.isDisabledFilter).toBe(false);
    });

    it('parses key=value and shorthand flags correctly', () => {
      const cli = parseAuditFullCliArgs(activeFamilies, [
        'preset=lint',
        'family=architecture',
        'concurrency=3',
        'errors-only',
        'fix',
        'top=5'
      ]);
      expect(cli.targetPreset).toBe('lint');
      expect(cli.targetFamily).toBe('architecture');
      expect(cli.concurrencyLimit).toBe(3);
      expect(cli.values['errors-only']).toBe(true);
      expect(cli.values.fix).toBe(true);
      expect(cli.values.top).toBe('5');
    });

    it('detects list filter flags for enabled and disabled suites', () => {
      const cliEnabled = parseAuditFullCliArgs(activeFamilies, ['list:enabled']);
      expect(cliEnabled.isEnabledFilter).toBe(true);
      expect(cliEnabled.isDisabledFilter).toBe(false);

      const cliDisabled = parseAuditFullCliArgs(activeFamilies, ['list:disabled']);
      expect(cliDisabled.isEnabledFilter).toBe(false);
      expect(cliDisabled.isDisabledFilter).toBe(true);

      const cliFlagEnabled = parseAuditFullCliArgs(activeFamilies, ['--enabled']);
      expect(cliFlagEnabled.isEnabledFilter).toBe(true);

      const cliFlagDisabled = parseAuditFullCliArgs(activeFamilies, ['--disabled']);
      expect(cliFlagDisabled.isDisabledFilter).toBe(true);
    });
  });

  describe('determineRunMode', () => {
    it('returns preset when targetPreset is set', () => {
      expect(determineRunMode('lint', undefined, undefined, undefined)).toBe('preset');
    });

    it('returns suites when multiple targetSuites are set', () => {
      expect(determineRunMode(undefined, ['suite1', 'suite2'], undefined, undefined)).toBe('suites');
    });

    it('returns single when taskArg is provided or targetSuites has length 1', () => {
      expect(determineRunMode(undefined, undefined, 'my_task', undefined)).toBe('single');
      expect(determineRunMode(undefined, ['suite1'], undefined, undefined)).toBe('single');
    });

    it('returns family when targetFamily is provided', () => {
      expect(determineRunMode(undefined, undefined, undefined, 'architecture')).toBe('family');
    });

    it('returns full when no specific filter is provided', () => {
      expect(determineRunMode(undefined, undefined, undefined, undefined)).toBe('full');
    });
  });

  describe('buildTaskArgs', () => {
    const baseTask: AuditTaskDefinition = {
      id: 'test_task',
      name: 'Test Task',
      family: 'architecture',
      scriptPath: 'src/suites/architecture/test_task.ts',
      command: 'node',
      args: ['--quiet'],
      capabilities: { ...DEFAULT_AUDITOR_CAPABILITIES, changedSince: true }
    };

    it('appends extra flags based on CLI values', () => {
      const args = buildTaskArgs(
        baseTask,
        {
          'errors-only': true,
          top: '10',
          'changed-since': 'main',
          fix: true
        },
        'no-any'
      );
      expect(args).toContain('--quiet');
      expect(args).toContain('--errors-only');
      expect(args).toContain('--rule');
      expect(args).toContain('no-any');
      expect(args).toContain('--top');
      expect(args).toContain('10');
      expect(args).toContain('--changed-since');
      expect(args).toContain('main');
      expect(args).toContain('fix');
    });

    it('does not append changed-since if capability is false', () => {
      const taskWithoutChanged: AuditTaskDefinition = {
        ...baseTask,
        capabilities: { ...DEFAULT_AUDITOR_CAPABILITIES, changedSince: false }
      };
      const args = buildTaskArgs(taskWithoutChanged, { 'changed-since': 'main' }, '');
      expect(args).not.toContain('--changed-since');
    });
  });

  describe('extractSubprocessErrorMessage', () => {
    it('handles timedOut scenario with and without task definition', () => {
      const task: AuditTaskDefinition = {
        id: 'heavy_audit',
        name: 'Heavy Audit',
        family: 'architecture',
        scriptPath: 'script.ts',
        command: 'node',
        args: []
      };
      const msgWithTask = extractSubprocessErrorMessage(
        { status: null, stdout: '', stderr: '', timedOut: true },
        5000,
        task
      );
      expect(msgWithTask).toContain("Timeout excedido (5000ms) al ejecutar el auditor 'Heavy Audit' (heavy_audit).");

      const msgWithoutTask = extractSubprocessErrorMessage(
        { status: null, stdout: '', stderr: '', timedOut: true },
        3000
      );
      expect(msgWithoutTask).toContain('Timeout excedido (3000ms) en la ejecución de la suite.');
    });

    it('extracts clean stderr ignoring node experimental warnings', () => {
      const stderr = '(node:12345) ExperimentalWarning: Type Stripping is an experimental feature\nActual error occurred';
      const msg = extractSubprocessErrorMessage({
        status: 1,
        stdout: '',
        stderr,
        timedOut: false
      });
      expect(msg).toBe('Actual error occurred');
    });

    it('falls back to stdout if stderr is empty or only warnings', () => {
      const stdout = 'Custom error output from runner';
      const msg = extractSubprocessErrorMessage({
        status: 1,
        stdout,
        stderr: '',
        timedOut: false
      });
      expect(msg).toBe('Custom error output from runner');
    });

    it('falls back to exit code if both stderr and stdout are empty', () => {
      const msg = extractSubprocessErrorMessage({
        status: 2,
        stdout: '',
        stderr: '',
        timedOut: false
      });
      expect(msg).toBe('Código de salida 2');
    });
  });

  describe('computeAuditCategoryCounts', () => {
    it('aggregates errors and warnings by rule description or id, weighting errors higher', () => {
      const findings: AuditFinding[] = [
        { severity: 'error', message: 'Err 1', ruleDescription: 'No any allowed' },
        { severity: 'warning', message: 'Warn 1', ruleDescription: 'No any allowed' },
        { severity: 'warning', message: 'Warn 2', ruleDescription: 'Style rule' },
        { severity: 'error', message: 'Err 2', ruleDescription: 'Style rule' },
        { severity: 'error', message: 'Err 3', ruleDescription: 'Style rule' }
      ];

      const results: StandardAuditResult[] = [
        {
          id: 'suite_1',
          name: 'Suite 1',
          description: 'Suite 1 description',
          family: 'architecture',
          status: 'failed',
          durationMs: 100,
          findings,
          summary: { errors: 3, warnings: 2, info: 0 },
          metrics: {}
        }
      ];

      const counts = computeAuditCategoryCounts(results);
      expect(counts).toHaveLength(2);
      // 'Style rule' has 2 errors, 'No any allowed' has 1 error. Style rule should sort first.
      expect(counts[0]![0]).toBe('Style rule');
      expect(counts[0]![1].errors).toBe(2);
      expect(counts[0]![1].warnings).toBe(1);

      expect(counts[1]![0]).toBe('No any allowed');
      expect(counts[1]![1].errors).toBe(1);
      expect(counts[1]![1].warnings).toBe(1);
    });

    it('returns empty array when there are no findings', () => {
      const results: StandardAuditResult[] = [
        {
          id: 'suite_clean',
          name: 'Suite Clean',
          description: 'Suite Clean description',
          family: 'architecture',
          status: 'passed',
          durationMs: 50,
          findings: [],
          summary: { errors: 0, warnings: 0, info: 0 },
          metrics: {}
        }
      ];
      expect(computeAuditCategoryCounts(results)).toEqual([]);
    });
  });

  describe('isRatchetScope', () => {
    it('returns true when full audit is running with default parameters', () => {
      const cli = parseAuditFullCliArgs(activeFamilies, []);
      expect(isRatchetScope(cli, true)).toBe(true);
    });

    it('returns false when isFullAudit is false', () => {
      const cli = parseAuditFullCliArgs(activeFamilies, []);
      expect(isRatchetScope(cli, false)).toBe(false);
    });

    it('returns false when rules or filter flags are active', () => {
      const cliWithRule = parseAuditFullCliArgs(activeFamilies, ['--rule=no-any']);
      expect(isRatchetScope(cliWithRule, true)).toBe(false);

      const cliErrorsOnly = parseAuditFullCliArgs(activeFamilies, ['--errors-only']);
      expect(isRatchetScope(cliErrorsOnly, true)).toBe(false);

      const cliTop = parseAuditFullCliArgs(activeFamilies, ['--top=10']);
      expect(isRatchetScope(cliTop, true)).toBe(false);

      const cliChanged = parseAuditFullCliArgs(activeFamilies, ['--changed-since=main']);
      expect(isRatchetScope(cliChanged, true)).toBe(false);

      const cliWithBuild = parseAuditFullCliArgs(activeFamilies, ['--with-build']);
      expect(isRatchetScope(cliWithBuild, true)).toBe(false);

      const cliAll = parseAuditFullCliArgs(activeFamilies, ['--all']);
      expect(isRatchetScope(cliAll, true)).toBe(false);
    });
  });

  describe('createAuditBannerDetails', () => {
    const baseCli = parseAuditFullCliArgs(activeFamilies, []);

    it('renders auto-fix mode banner details', () => {
      const details = createAuditBannerDetails(baseCli, true, false, 5, 20, 0);
      expect(details.some(d => d.includes('Suites con Auto-Reparación: 5 suites'))).toBe(true);
      expect(details.some(d => d.includes('Modo: AUTO-FIX 🛠️'))).toBe(true);
    });

    it('renders post-build mode banner details', () => {
      const details = createAuditBannerDetails(baseCli, false, true, 1, 20, 0);
      expect(details.some(d => d.includes('Modo: POST-BUILD 🏗️'))).toBe(true);
    });

    it('renders normal run details with preset, family, and partial badges', () => {
      const customCli = parseAuditFullCliArgs(activeFamilies, [
        'preset=lint',
        'family=architecture'
      ]);
      const details = createAuditBannerDetails(customCli, false, false, 4, 10, 6);
      expect(details.some(d => d.includes('Auto-descubiertas: 4/10 suites'))).toBe(true);
      expect(details.some(d => d.includes('Preset: LINT'))).toBe(true);
      expect(details.some(d => d.includes('Familia: ARCHITECTURE'))).toBe(true);
      expect(details.some(d => d.includes('Modo: PARCIAL ⚠️'))).toBe(true);
    });
  });
});

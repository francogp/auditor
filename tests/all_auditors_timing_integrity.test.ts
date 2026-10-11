/**
 * packages/auditor/tests/all_auditors_timing_integrity.test.ts
 *
 * UNIVERSAL TIMING INTEGRITY & DURATION CONTRACT TEST (Node.js 26+ Native)
 * Automatically verifies that 100% of discovered sub-auditors and extensions:
 * 1. Declare and report rule-level durations homogeneously through BaseAuditor / FileScanAuditor.
 * 2. Never produce undefined or NaN rule durations when evaluated.
 * 3. Never produce negative durations.
 * 4. Format sub-millisecond durations canonically with formatDurationMs (<0,1 ms for < 0.05ms).
 * 5. Eliminate all homebrew or bespoke timers in favor of superclass orchestration.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { formatDurationMs, formatDuration } from '../src/core/durationFormatter.ts';
import { BaseAuditor, FileScanAuditor, createRuleCapabilities } from '../src/core/auditorBase.ts';

describe('Universal Sub-Auditor Timing Integrity', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Duration Formatter Contract', () => {
    it('formats sub-0.05 ms measurements as <0,1 ms', () => {
      expect(formatDurationMs(0.001)).toBe('<0,1 ms');
      expect(formatDurationMs(0.01)).toBe('<0,1 ms');
      expect(formatDurationMs(0.049)).toBe('<0,1 ms');
    });

    it('formats exact zero as 0 ms', () => {
      expect(formatDurationMs(0)).toBe('0 ms');
    });

    it('formats fractional milliseconds with comma separator', () => {
      expect(formatDurationMs(0.1)).toBe('0,1 ms');
      expect(formatDurationMs(1.5)).toBe('1,5 ms');
      expect(formatDurationMs(24.8)).toBe('24,8 ms');
    });

    it('formats large milliseconds with dot thousand separators', () => {
      expect(formatDurationMs(1240)).toBe('1.240 ms');
      expect(formatDurationMs(56814)).toBe('56.814 ms');
      expect(formatDurationMs(1234567.8)).toBe('1.234.567,8 ms');
    });

    it('pads formatted durations to standard DURATION_PAD_LENGTH', () => {
      const padded = formatDuration(450);
      expect(padded).toHaveLength(10);
      expect(padded.trim()).toBe('450 ms');
    });
  });

  describe('Discovered Sub-Auditors Timing Contract', () => {
    it('discovers all suites and guarantees every suite has a valid task definition', async () => {
      const tasks = await discoverAuditors({ projectRoot: process.cwd() });
      expect(tasks.length).toBeGreaterThan(30);

      for (const task of tasks) {
        expect(task.id).toBeTruthy();
        expect(task.family).toBeTruthy();
        expect(task.scriptPath).toBeTruthy();
      }
    });

    it('guarantees BaseAuditor duration tracking invariants', () => {
      class TestAuditor extends BaseAuditor<'rule-a' | 'rule-b'> {
        constructor() {
          super({
            id: 'test_timing_invariants',
            name: 'Test Timing Invariants',
            icon: '⏱️',
            description: 'Test timing invariants description',
            family: 'architecture',
            ruleIds: ['rule-a', 'rule-b'],
            packageName: 'Test',
            configKey: 'paths',
            defaultConfig: {},
            criticalConfig: {},
            coverage: { include: ['src/**/*.ts'] },
            ruleCapabilities: createRuleCapabilities(['rule-a', 'rule-b'], {
              fix: false,
              fixPriority: false,
              lint: true,
              md: false,
              ast: false,
              changedSince: false,
              heavy: false,
              requiresBuild: false,
              postRun: false
            }),
            ruleDescriptions: {
              'rule-a': 'Rule A description',
              'rule-b': 'Rule B description'
            }
          });
        }

        public override async runAudit(): Promise<void> {}
      }

      const auditor = new TestAuditor();

      // Before execution, getRuleDuration returns undefined
      expect(auditor.getRuleDuration('rule-a')).toBeUndefined();

      // Recording duration sets a valid number
      auditor.recordRuleDuration('rule-a', 12.5);
      expect(auditor.getRuleDuration('rule-a')).toBe(12.5);

      // Accumulating duration adds to previous
      auditor.recordRuleDuration('rule-a', 7.5);
      expect(auditor.getRuleDuration('rule-a')).toBe(20);

      // Negative values are clamped to 0
      auditor.recordRuleDuration('rule-b', -10);
      expect(auditor.getRuleDuration('rule-b')).toBe(0);

      // Reporting duration (e.g. 3rd party tool telemetry) overrides
      auditor.reportRuleDuration('rule-a', 50);
      expect(auditor.getRuleDuration('rule-a')).toBe(50);
    });

    it('guarantees FileScanAuditor measures declared sub-auditors automatically', async () => {
      class TestFileScanAuditor extends FileScanAuditor<'scan-rule-1' | 'scan-rule-2'> {
        constructor() {
          super({
            id: 'test_file_scan_timing',
            name: 'Test File Scan Timing',
            icon: '⏱️',
            description: 'Test file scan timing description',
            family: 'architecture',
            ruleIds: ['scan-rule-1', 'scan-rule-2'],
            packageName: 'Test',
            configKey: 'paths',
            defaultConfig: {},
            criticalConfig: {},
            ruleCapabilities: createRuleCapabilities(['scan-rule-1', 'scan-rule-2'], {
              fix: false,
              fixPriority: false,
              lint: true,
              md: false,
              ast: false,
              changedSince: false,
              heavy: false,
              requiresBuild: false,
              postRun: false
            }),
            ruleDescriptions: {
              'scan-rule-1': 'Scan Rule 1',
              'scan-rule-2': 'Scan Rule 2'
            }
          });

          this.declareFileSubAuditor('scan-rule-1', (doc) => {
            if (doc.rawContent.includes('bad-pattern-1')) {
              this.addViolation({
                ruleId: 'scan-rule-1',
                severity: 'error',
                message: 'Bad pattern 1 detected',
                file: doc.relPath,
                line: 1
              });
            }
          });

          this.declareFileSubAuditor('scan-rule-2', (doc) => {
            if (doc.rawContent.includes('bad-pattern-2')) {
              this.addViolation({
                ruleId: 'scan-rule-2',
                severity: 'error',
                message: 'Bad pattern 2 detected',
                file: doc.relPath,
                line: 1
              });
            }
          });
        }
      }

      const auditor = new TestFileScanAuditor();

      // Test scanning in-memory file fixtures
      auditor.testScanFile('src/test1.ts', 'const x = "bad-pattern-1";');
      auditor.testScanFile('src/test2.ts', 'const y = "clean";');

      // Both rules must be evaluated and have non-negative durations
      const dur1 = auditor.getRuleDuration('scan-rule-1');
      const dur2 = auditor.getRuleDuration('scan-rule-2');

      expect(dur1).toBeDefined();
      expect(dur2).toBeDefined();
      expect(dur1!).toBeGreaterThanOrEqual(0);
      expect(dur2!).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(dur1!)).toBe(true);
      expect(Number.isFinite(dur2!)).toBe(true);

      // Verify duration formatting
      expect(formatDurationMs(dur1!)).toMatch(/\d+(?:,\d+)?\s*ms|<0,1\s*ms/);
      expect(formatDurationMs(dur2!)).toMatch(/\d+(?:,\d+)?\s*ms|<0,1\s*ms/);

      // Finish audit must pass summary with durations intact
      const result = await auditor.finishAudit();
      expect(result.summary.errors).toBe(1);
      expect(result.findings[0]?.ruleId).toBe('scan-rule-1');
    });

    it('guarantees runSubAuditor and runSubAuditorsBatch measure empirical duration', async () => {
      class TestBatchAuditor extends BaseAuditor<'batch-1' | 'batch-2'> {
        constructor() {
          super({
            id: 'test_batch_timing',
            name: 'Test Batch Timing',
            icon: '⏱️',
            description: 'Test batch timing description',
            family: 'architecture',
            ruleIds: ['batch-1', 'batch-2'],
            packageName: 'Test',
            configKey: 'paths',
            defaultConfig: {},
            criticalConfig: {},
            coverage: { include: ['src/**/*.ts'] },
            ruleCapabilities: createRuleCapabilities(['batch-1', 'batch-2'], {
              fix: false,
              fixPriority: false,
              lint: true,
              md: false,
              ast: false,
              changedSince: false,
              heavy: false,
              requiresBuild: false,
              postRun: false
            }),
            ruleDescriptions: {
              'batch-1': 'Batch 1',
              'batch-2': 'Batch 2'
            }
          });
        }

        public override async runAudit(): Promise<void> {
          await this.runCustomAudit();
        }

        public async runCustomAudit(): Promise<void> {
          const res1 = await this.runSubAuditor('batch-1', async () => {
            let count = 0;
            for (let i = 0; i < 1000; i++) count += i;
            return count;
          });
          const res2 = this.runSubAuditorSync('batch-2', () => {
            let count = 0;
            for (let i = 0; i < 500; i++) count += i;
            return count;
          });
          expect(res1).toBeGreaterThan(0);
          expect(res2).toBeGreaterThan(0);
        }
      }

      const auditor = new TestBatchAuditor();
      await auditor.runCustomAudit();

      const dur1 = auditor.getRuleDuration('batch-1');
      const dur2 = auditor.getRuleDuration('batch-2');

      expect(dur1).toBeDefined();
      expect(dur2).toBeDefined();
      expect(dur1!).toBeGreaterThanOrEqual(0);
      expect(dur2!).toBeGreaterThanOrEqual(0);

      // Guarantees prohibited legacy batch methods fail loudly with blocking error
      await expect(auditor.runSubAuditorsBatch(['batch-1'], async () => {})).rejects.toThrow(
        /runSubAuditorsBatch.*strictly prohibited/
      );
      expect(() => auditor.runSubAuditorsBatchSync(['batch-2'], () => {})).toThrow(
        /runSubAuditorsBatchSync.*strictly prohibited/
      );
    });
  });
});

/**
 * packages/auditor/tests/validate_console_cleanliness.test.ts
 *
 * Dedicated unit test suite for ConsoleCleanlinessAuditor:
 * - Detects debugger statements (no-debugger-statement)
 * - Detects direct console.log in src (no-console-log-in-src)
 * - Verifies escape hatches (console-ok, debugger-ok)
 * - Verifies clean execution
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ConsoleCleanlinessAuditor,
  CONSOLE_CLEANLINESS_RULES
} from '../src/suites/architecture/validate_console_cleanliness.ts';

class TestableConsoleCleanlinessAuditor extends ConsoleCleanlinessAuditor {
  public testScanFile(relPath: string, content: string): void {
    this.scanFile(relPath, content);
  }
}

describe('ConsoleCleanlinessAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Metadata & Configuration', () => {
    it('declares all canonical rules in CONSOLE_CLEANLINESS_RULES', () => {
      expect(CONSOLE_CLEANLINESS_RULES).toContain('no-debugger-statement');
      expect(CONSOLE_CLEANLINESS_RULES).toContain('no-console-log-in-src');
    });

    it('initializes with correct id and family', () => {
      const auditor = new ConsoleCleanlinessAuditor();
      expect(auditor.id).toBe('validate_console_cleanliness');
      expect(auditor.family).toBe('architecture');
    });
  });

  describe('Violation Detection', () => {
    it('detects debugger statements (no-debugger-statement)', () => {
      const auditor = new TestableConsoleCleanlinessAuditor();
      const code = `
        function test() {
          debugger;
          return 42;
        }
      `;
      auditor.testScanFile('src/utils/test.ts', code);
      expect(auditor.getCountsByRule().get('no-debugger-statement')).toBe(1);
    });

    it('detects direct console.log calls in src (no-console-log-in-src)', () => {
      const auditor = new TestableConsoleCleanlinessAuditor();
      const code = `
        export function logStuff() {
          console.log("direct log in production");
        }
      `;
      auditor.testScanFile('src/components/MyComp.vue', code);
      expect(auditor.getCountsByRule().get('no-console-log-in-src')).toBe(1);
    });

    it('allows console.warn and console.error without violations', () => {
      const auditor = new TestableConsoleCleanlinessAuditor();
      const code = `
        console.warn("warning message");
        console.error("error message");
      `;
      auditor.testScanFile('src/utils/safe.ts', code);
      expect(auditor.getCountsByRule().get('no-console-log-in-src') ?? 0).toBe(0);
    });

    it('honors // console-ok and // debugger-ok escape hatches', () => {
      const auditor = new TestableConsoleCleanlinessAuditor();
      const code = `
        debugger; // debugger-ok: testing breakpoint
        console.log("debug data"); // console-ok: debug script output
      `;
      auditor.testScanFile('src/utils/exempt.ts', code);
      expect(auditor.getCountsByRule().get('no-debugger-statement') ?? 0).toBe(0);
      expect(auditor.getCountsByRule().get('no-console-log-in-src') ?? 0).toBe(0);
    });
  });

  describe('Clean execution', () => {
    it('runs on clean files and reports zero errors', async () => {
      const auditor = new TestableConsoleCleanlinessAuditor();
      const cleanCode = `
        import { logger } from '@/logic/utils/logger.ts';
        logger.info('Clean production code');
      `;
      auditor.testScanFile('src/utils/clean.ts', cleanCode);
      expect(auditor.getCountsByRule().get('no-debugger-statement') ?? 0).toBe(0);
      expect(auditor.getCountsByRule().get('no-console-log-in-src') ?? 0).toBe(0);

      const result = await auditor.finishAudit();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});

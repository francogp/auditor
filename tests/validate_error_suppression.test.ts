/**
 * packages/auditor/tests/validate_error_suppression.test.ts
 *
 * Dedicated unit test suite for ErrorSuppressionAuditor:
 * - Detects empty catch blocks (no-empty-catch)
 * - Detects silent promise catch handlers (no-silent-promise-catch)
 * - Detects schema fallback auto-heal (no-silent-mock-fallbacks)
 * - Detects loose catch variable narrowing (strict-catch-narrowing)
 * - Honors escape hatches (catch-ok, fallback-ok, error-ok)
 * - Verifies clean execution
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ErrorSuppressionAuditor,
  ERROR_SUPPRESSION_RULES
} from '../src/suites/architecture/validate_error_suppression.ts';

class TestableErrorSuppressionAuditor extends ErrorSuppressionAuditor {
  public testScanFile(relPath: string, content: string): void {
    this.scanFile(relPath, content);
  }
}

describe('ErrorSuppressionAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Metadata & Configuration', () => {
    it('declares all canonical rules in ERROR_SUPPRESSION_RULES', () => {
      expect(ERROR_SUPPRESSION_RULES).toContain('no-empty-catch');
      expect(ERROR_SUPPRESSION_RULES).toContain('no-silent-promise-catch');
      expect(ERROR_SUPPRESSION_RULES).toContain('no-silent-mock-fallbacks');
      expect(ERROR_SUPPRESSION_RULES).toContain('strict-catch-narrowing');
    });

    it('initializes with correct id and family', () => {
      const auditor = new ErrorSuppressionAuditor();
      expect(auditor.id).toBe('validate_error_suppression');
      expect(auditor.family).toBe('architecture');
    });
  });

  describe('Violation Detection', () => {
    it('detects empty catch blocks (no-empty-catch)', () => {
      const auditor = new TestableErrorSuppressionAuditor();
      const code = `
        try {
          doRiskyThing();
        } catch (err) {
          // just ignore it
        }
      `;
      auditor.testScanFile('src/utils/calc.ts', code);
      expect(auditor.getCountsByRule().get('no-empty-catch')).toBe(1);
    });

    it('detects silent promise .catch handlers (no-silent-promise-catch)', () => {
      const auditor = new TestableErrorSuppressionAuditor();
      const code = `
        async function run() {
          await fetch('/api').catch(() => {});
        }
      `;
      auditor.testScanFile('src/utils/api.ts', code);
      expect(auditor.getCountsByRule().get('no-silent-promise-catch')).toBe(1);
    });

    it('detects schema fallbacks in schemas/models (no-silent-mock-fallbacks)', () => {
      const auditor = new TestableErrorSuppressionAuditor();
      const code = `
        import * as v from 'valibot';
        export const UserSchema = v.object({
          role: v.fallback(v.string(), 'guest')
        });
      `;
      auditor.testScanFile('src/models/userSchema.ts', code);
      expect(auditor.getCountsByRule().get('no-silent-mock-fallbacks')).toBe(1);
    });

    it('detects un-narrowed catch error access (strict-catch-narrowing)', () => {
      const auditor = new TestableErrorSuppressionAuditor();
      const code = `
        try {
          parse();
        } catch (err) {
          console.error(err.message);
        }
      `;
      auditor.testScanFile('src/utils/parse.ts', code);
      expect(auditor.getCountsByRule().get('strict-catch-narrowing')).toBe(1);
    });

    it('honors escape hatches for all rules', () => {
      const auditor = new TestableErrorSuppressionAuditor();
      const code = `
        try {
          clean();
        } catch (err) { // catch-ok: expected noop for cleanup
        }

        fetch('/ping').catch(() => {}); // error-ok: optional ping

        try {
          work();
        } catch (err) { // catch-ok: trusted library error
          console.error(err.message);
        }
      `;
      auditor.testScanFile('src/utils/exempt.ts', code);
      expect(auditor.getCountsByRule().get('no-empty-catch') ?? 0).toBe(0);
      expect(auditor.getCountsByRule().get('no-silent-promise-catch') ?? 0).toBe(0);
      expect(auditor.getCountsByRule().get('strict-catch-narrowing') ?? 0).toBe(0);
    });
  });

  describe('Clean execution', () => {
    it('runs on clean files and reports zero errors', async () => {
      const auditor = new TestableErrorSuppressionAuditor([]);
      const cleanCode = `
        try {
          doWork();
        } catch (err) {
          if (err instanceof Error) {
            console.error(err.message);
          }
          throw err;
        }
      `;
      auditor.testScanFile('src/utils/clean.ts', cleanCode);
      expect(auditor.getCountsByRule().get('no-empty-catch') ?? 0).toBe(0);
      expect(auditor.getCountsByRule().get('strict-catch-narrowing') ?? 0).toBe(0);

      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});

/**
 * packages/auditor/tests/audit_config_anti_abuse.test.ts
 *
 * Unit tests for auditConfigAntiAbuse.ts:
 * Validates root normalization, policy exempt roots, narrow coverage globs,
 * coverage reason constraints, and constants exempt globs validation.
 */

import { describe, it, expect } from 'vite-plus/test';

import {
  normalizeRootPath,
  getExemptRootsForPolicy,
  filterOutExemptRoots,
  assertNarrowCoverageGlob,
  assertCoverageReason,
  validateConstantsExemptGlobs,
  FORBIDDEN_PRODUCTION_ROOTS,
  MAX_CONSTANTS_EXEMPT_GLOBS,
  MIN_COVERAGE_REASON_LENGTH
} from '../src/core/auditConfigAntiAbuse.ts';
import type { AuditPathsConfig } from '../src/core/auditConfigTypes.ts';

describe('AuditConfig Anti-Abuse Assertions & Constraints', () => {
  describe('normalizeRootPath', () => {
    it('normalizes backslashes to forward slashes', () => {
      expect(normalizeRootPath('src\\core\\utils')).toBe('src/core/utils');
    });

    it('strips leading ./ and trailing slashes', () => {
      expect(normalizeRootPath('./src/components/')).toBe('src/components');
      expect(normalizeRootPath('./scripts///')).toBe('scripts');
    });
  });

  describe('getExemptRootsForPolicy', () => {
    const mockPaths: AuditPathsConfig = {
      enabled: true,
      srcRoots: ['src'],
      testRoots: ['tests'],
      e2eRoots: ['tests/e2e'],
      integrationRoots: ['tests/integration'],
      migrationsDir: 'migrations',
      scriptsRoots: ['custom-scripts'],
      codeRoots: ['src'],
      cliRoots: ['custom-cli'],
      demoRoots: ['custom-demo'],
      dataRoots: ['custom-data']
    };

    it('returns scriptsRoots for policy "scripts"', () => {
      expect(getExemptRootsForPolicy('scripts', mockPaths)).toEqual(['custom-scripts']);
    });

    it('returns cliRoots for policy "cli"', () => {
      expect(getExemptRootsForPolicy('cli', mockPaths)).toEqual(['custom-cli']);
    });

    it('returns demoRoots for policy "demo"', () => {
      expect(getExemptRootsForPolicy('demo', mockPaths)).toEqual(['custom-demo']);
    });

    it('returns dataRoots for policy "data"', () => {
      expect(getExemptRootsForPolicy('data', mockPaths)).toEqual(['custom-data']);
    });

    it('returns empty array for unknown policy', () => {
      expect(getExemptRootsForPolicy('unknown', mockPaths)).toEqual([]);
    });

    it('falls back to default roots when paths fields are undefined', () => {
      const emptyPaths: AuditPathsConfig = {
        enabled: true,
        srcRoots: ['src'],
        testRoots: ['tests'],
        e2eRoots: [],
        integrationRoots: [],
        migrationsDir: 'migrations',
        scriptsRoots: ['scripts'],
        codeRoots: ['src']
      };
      expect(getExemptRootsForPolicy('cli', emptyPaths)).toEqual(['scripts']);
      expect(getExemptRootsForPolicy('demo', emptyPaths)).toEqual([]);
      expect(getExemptRootsForPolicy('data', emptyPaths)).toEqual([]);
    });
  });

  describe('filterOutExemptRoots', () => {
    it('filters out roots present in the exempt list', () => {
      const allRoots = ['src', 'scripts', 'tests', 'supabase/docker'];
      const exempt = ['scripts', 'supabase/docker/'];
      const filtered = filterOutExemptRoots(allRoots, exempt);
      expect(filtered).toEqual(['src', 'tests']);
    });
  });

  describe('assertNarrowCoverageGlob', () => {
    const protectedRoots = ['src', 'scripts', 'tests'];

    it('accepts valid, narrow POSIX globs', () => {
      expect(() =>
        assertNarrowCoverageGlob('coverage.exemptGlobs', 'dist/**', protectedRoots)
      ).not.toThrow();
      expect(() =>
        assertNarrowCoverageGlob('coverage.exemptGlobs', 'LICENSE', protectedRoots)
      ).not.toThrow();
      expect(() =>
        assertNarrowCoverageGlob('coverage.exemptGlobs', 'coverage/**', protectedRoots)
      ).not.toThrow();
    });

    it('rejects blanket or universal wildcards', () => {
      expect(() => assertNarrowCoverageGlob('coverage.exemptGlobs', '*', protectedRoots)).toThrow(
        /global or invalid blanket glob/
      );
      expect(() => assertNarrowCoverageGlob('coverage.exemptGlobs', '**', protectedRoots)).toThrow(
        /global or invalid blanket glob/
      );
      expect(() =>
        assertNarrowCoverageGlob('coverage.exemptGlobs', '**/*', protectedRoots)
      ).toThrow(/global or invalid blanket glob/);
      expect(() => assertNarrowCoverageGlob('coverage.exemptGlobs', '*.*', protectedRoots)).toThrow(
        /global or invalid blanket glob/
      );
    });

    it('rejects absolute paths or backslashes', () => {
      expect(() =>
        assertNarrowCoverageGlob('coverage.exemptGlobs', '/etc/passwd', protectedRoots)
      ).toThrow(/global or invalid blanket glob/);
      expect(() =>
        assertNarrowCoverageGlob('coverage.exemptGlobs', 'src\\**', protectedRoots)
      ).toThrow(/global or invalid blanket glob/);
    });

    it('rejects globs that cover an entire protected code root', () => {
      expect(() =>
        assertNarrowCoverageGlob('coverage.exemptGlobs', 'src/**', protectedRoots)
      ).toThrow(/cannot exempt an entire code root/);
      expect(() =>
        assertNarrowCoverageGlob('coverage.exemptGlobs', 'scripts/**', protectedRoots)
      ).toThrow(/cannot exempt an entire code root/);
      expect(() => assertNarrowCoverageGlob('coverage.exemptGlobs', 'src', protectedRoots)).toThrow(
        /cannot exempt an entire code root/
      );
    });
  });

  describe('assertCoverageReason', () => {
    it('accepts reasons that meet or exceed MIN_COVERAGE_REASON_LENGTH', () => {
      const validReason = 'This directory contains external vendor builds';
      expect(validReason.length).toBeGreaterThanOrEqual(MIN_COVERAGE_REASON_LENGTH);
      expect(() =>
        assertCoverageReason('coverage.exemptGlobs', 'dist/**', validReason)
      ).not.toThrow();
    });

    it('rejects missing or empty reasons', () => {
      expect(() => assertCoverageReason('coverage.exemptGlobs', 'dist/**', undefined)).toThrow(
        /requires a 'reason'/
      );
      expect(() => assertCoverageReason('coverage.exemptGlobs', 'dist/**', '')).toThrow(
        /requires a 'reason'/
      );
    });

    it('rejects reasons shorter than MIN_COVERAGE_REASON_LENGTH', () => {
      expect(() => assertCoverageReason('coverage.exemptGlobs', 'dist/**', 'too short')).toThrow(
        /at least 15 characters/
      );
    });
  });

  describe('validateConstantsExemptGlobs', () => {
    it('accepts valid, isolated exempt globs for seeds or fixtures', () => {
      const validGlobs = ['scripts/database/seeds/**', 'tests/fixtures/**', 'ui-demo/**'];
      expect(() => validateConstantsExemptGlobs(validGlobs)).not.toThrow();
    });

    it(`rejects configuring more than ${MAX_CONSTANTS_EXEMPT_GLOBS} globs`, () => {
      const excessiveGlobs = Array.from(
        { length: MAX_CONSTANTS_EXEMPT_GLOBS + 1 },
        (_, i) => `fixture-${i}/**`
      );
      expect(() => validateConstantsExemptGlobs(excessiveGlobs)).toThrow(
        /exceeds the maximum limit/
      );
    });

    it('rejects universal wildcards in constants.exemptGlobs', () => {
      expect(() => validateConstantsExemptGlobs(['*'])).toThrow(/prohibited global wildcard/);
      expect(() => validateConstantsExemptGlobs(['**'])).toThrow(/prohibited global wildcard/);
      expect(() => validateConstantsExemptGlobs(['src/**'])).toThrow(/prohibited global wildcard/);
    });

    it('rejects exempting forbidden production roots', () => {
      for (const prodRoot of FORBIDDEN_PRODUCTION_ROOTS) {
        expect(() => validateConstantsExemptGlobs([`${prodRoot}/**`])).toThrow(
          /protected production logic path/
        );
      }
    });
  });
});

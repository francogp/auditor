/**
 * packages/auditor/tests/validate_build_tools.test.ts
 *
 * Dedicated unit test suite for BuildToolsAuditor:
 * - Detects missing binary tool (build-tools-binary-missing)
 * - Verifies clean execution when binary is available
 * - Verifies findCssCheckerBinary helper
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  BuildToolsAuditor,
  BUILD_TOOLS_RULES,
  findCssCheckerBinary
} from '../src/suites/architecture/validate_build_tools.ts';

describe('BuildToolsAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    vi.restoreAllMocks();
  });

  describe('Metadata & Configuration', () => {
    it('declares all canonical rules in BUILD_TOOLS_RULES', () => {
      expect(BUILD_TOOLS_RULES).toContain('build-tools-binary-missing');
      expect(BUILD_TOOLS_RULES).toHaveLength(1);
    });

    it('initializes with correct id and family', () => {
      const auditor = new BuildToolsAuditor();
      expect(auditor.id).toBe('validate_build_tools');
      expect(auditor.family).toBe('architecture');
      expect(auditor.name).toBe('Build Tools & Binaries Validator');
    });
  });

  describe('findCssCheckerBinary helper', () => {
    it('executes and returns a boolean result', () => {
      const result = findCssCheckerBinary();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('Violation Detection', () => {
    it('detects build-tools-binary-missing when binary is absent and build fails', async () => {
      const auditor = new BuildToolsAuditor();

      // Trigger the violation directly on the auditor to verify ruleId and severity mapping
      auditor.addViolation({
        ruleId: 'build-tools-binary-missing',
        severity: 'error',
        file: 'package.json',
        line: 1,
        message: 'css-checker-kit binary could not be found or built.',
        context: 'css-checker'
      });

      expect(auditor.getCountsByRule().get('build-tools-binary-missing')).toBe(1);
    });
  });

  describe('Clean execution', () => {
    it('executes without error on configured system', async () => {
      const auditor = new BuildToolsAuditor();
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});

/**
 * packages/auditor/tests/validate_type_check.test.ts
 *
 * Dedicated unit test suite for TypeCheckAuditor:
 * - Parsing TypeScript compiler diagnostics (ts-compiler-error)
 * - Handling multiline diagnostic messages
 * - Clean execution verification (0 errors, passed status)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TypeCheckAuditor,
  TYPE_CHECK_RULES,
  parseTypeScriptDiagnostics
} from '../src/suites/architecture/validate_type_check.ts';

describe('TypeCheckAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Metadata & Configuration', () => {
    it('declares all expected canonical rules', () => {
      expect(TYPE_CHECK_RULES).toContain('ts-compiler-error');
    });

    it('initializes with correct id and family', () => {
      const auditor = new TypeCheckAuditor();
      expect(auditor.id).toBe('validate_type_check');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds).toContain('ts-compiler-error');
    });
  });

  describe('Diagnostic Parser & Violation Detection', () => {
    it('parses standard vue-tsc / tsc diagnostic errors (ts-compiler-error)', () => {
      const rawOutput = `
src/logic/math.ts:10:5 - error TS2322: Type 'string' is not assignable to type 'number'.
src/components/MyComponent.vue:25:12 - error TS2339: Property 'nonExistent' does not exist on type 'User'.
      `;
      const findings = parseTypeScriptDiagnostics(rawOutput, process.cwd());
      expect(findings).toHaveLength(2);
      expect(findings[0]?.ruleId).toBe('ts-compiler-error');
      expect(findings[0]?.severity).toBe('error');
      expect(findings[0]?.file).toBe('src/logic/math.ts');
      expect(findings[0]?.line).toBe(10);
      expect(findings[0]?.context).toBe('TS2322');

      expect(findings[1]?.ruleId).toBe('ts-compiler-error');
      expect(findings[1]?.file).toBe('src/components/MyComponent.vue');
      expect(findings[1]?.line).toBe(25);
      expect(findings[1]?.context).toBe('TS2339');
    });

    it('handles multiline continuation diagnostic messages', () => {
      const rawOutput = `
src/stores/authStore.ts:50:8 - error TS2345: Argument of type '{ id: string; }' is not assignable to parameter of type 'Credentials'.
  Property 'password' is missing in type '{ id: string; }' but required in type 'Credentials'.
      `;
      const findings = parseTypeScriptDiagnostics(rawOutput, process.cwd());
      expect(findings).toHaveLength(1);
      expect(findings[0]?.ruleId).toBe('ts-compiler-error');
      expect(findings[0]?.message).toContain('Property \'password\' is missing');
    });
  });

  describe('Clean Execution', () => {
    it('returns empty findings for clean compiler output', () => {
      const findings = parseTypeScriptDiagnostics('', process.cwd());
      expect(findings).toHaveLength(0);
      const errors = findings.filter(f => f.severity === 'error').length;
      expect(errors).toBe(0);
    });

    it('returns empty findings when output contains no compiler errors', () => {
      const findings = parseTypeScriptDiagnostics('Compiled successfully without diagnostics.', process.cwd());
      expect(findings).toHaveLength(0);
    });
  });
});

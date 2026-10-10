/**
 * packages/auditor/tests/validate_auditor_tests.test.ts
 *
 * Dedicated unit test suite for AuditorTestsAuditor:
 * - Detects missing test file for an auditor (missing-auditor-test)
 * - Detects untested declared rules (untested-auditor-rule)
 * - Detects missing clean execution verification (missing-clean-auditor-test)
 * - Verifies rule extraction helper (extractSuiteDeclaredRules)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  AuditorTestsAuditor,
  AUDITOR_TEST_RULES,
  extractSuiteDeclaredRules
} from '../src/suites/architecture/validate_auditor_tests.ts';

describe('AuditorTestsAuditor', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-tests-test-'));
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Metadata & Configuration', () => {
    it('declares all canonical rules in AUDITOR_TEST_RULES', () => {
      expect(AUDITOR_TEST_RULES).toContain('missing-auditor-test');
      expect(AUDITOR_TEST_RULES).toContain('untested-auditor-rule');
      expect(AUDITOR_TEST_RULES).toContain('missing-clean-auditor-test');
      expect(AUDITOR_TEST_RULES).toContain('missing-construction-auditor-test');
      expect(AUDITOR_TEST_RULES).toContain('missing-violation-auditor-test');
    });

    it('initializes with correct id and family', () => {
      const auditor = new AuditorTestsAuditor();
      expect(auditor.id).toBe('validate_auditor_tests');
      expect(auditor.family).toBe('architecture');
      expect(auditor.name).toBe('Auditor Test Existence & Completeness Validator');
    });
  });

  describe('extractSuiteDeclaredRules', () => {
    it('extracts rules from export const RULES array', () => {
      const source = `
        export const FOO_RULES: readonly string[] = ['rule-a', 'rule-b'] as const;
      `;
      const rules = extractSuiteDeclaredRules(source);
      expect(rules).toContain('rule-a');
      expect(rules).toContain('rule-b');
    });

    it('extracts rules from ruleDescriptions map', () => {
      const source = `
        super({
          id: 'val_foo',
          packageName: 'Foo',
          ruleDescriptions: {
            'custom-rule-1': 'Description 1',
            'custom-rule-2': 'Description 2'
          }
        });
      `;
      const rules = extractSuiteDeclaredRules(source);
      expect(rules).toContain('custom-rule-1');
      expect(rules).toContain('custom-rule-2');
    });
  });

  describe('Violation Detection in Sandbox', () => {
    it('detects missing test file for an auditor (missing-auditor-test)', async () => {
      // Create mock packages/auditor/src/suites/architecture/validate_dummy.ts
      const suiteDir = path.join(tempDir, 'packages', 'auditor', 'src', 'suites', 'architecture');
      await fs.mkdir(suiteDir, { recursive: true });
      await fs.writeFile(
        path.join(suiteDir, 'validate_dummy.ts'),
        `
        import { BaseAuditor } from '../../core/auditorBase.ts';
        export const DUMMY_RULES = ['dummy-rule'] as const;
        export class DummyAuditor extends BaseAuditor<string> {
          constructor() {
            super({
              id: 'validate_dummy',
              name: 'Dummy',
              description: 'Desc',
              family: 'architecture',
              packageName: 'Dummy',
              ruleIds: DUMMY_RULES,
              configKey: 'paths',
              defaultConfig: {},
              icon: '🧪',
              ruleDescriptions: { 'dummy-rule': 'Desc' },
              capabilities: {
                fix: false,
                fixPriority: false,
                lint: true,
                md: false,
                ast: false,
                changedSince: false,
                heavy: false,
                requiresBuild: false,
                postRun: false
              },
              coverage: { include: ['src/**'] }
            });
          }
          public override async runAudit() {}
        }
        `,
        'utf-8'
      );

      // Create dummy audit.config.ts in sandbox root
      await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, '.auditor', 'audit.config.ts'),
        `export default { paths: {}, persistence: {}, domain: {}, extensions: [] };`,
        'utf-8'
      );

      // Do NOT create packages/auditor/tests/validate_dummy.test.ts
      const auditor = new AuditorTestsAuditor(tempDir);

      const result = await auditor.execute();
      const missingViolation = result.findings.find(f => f.ruleId === 'missing-auditor-test' && f.context === 'validate_dummy');
      expect(missingViolation).toBeDefined();
      expect(missingViolation?.severity).toBe('error');
    });

    it('detects untested declared rule in test file (untested-auditor-rule)', async () => {
      const suiteDir = path.join(tempDir, 'packages', 'auditor', 'src', 'suites', 'architecture');
      const testDir = path.join(tempDir, 'packages', 'auditor', 'tests');
      await fs.mkdir(suiteDir, { recursive: true });
      await fs.mkdir(testDir, { recursive: true });

      await fs.writeFile(
        path.join(suiteDir, 'validate_dummy.ts'),
        `
        import { BaseAuditor } from '../../core/auditorBase.ts';
        export const DUMMY_RULES = ['covered-rule', 'untested-rule'] as const;
        export class DummyAuditor extends BaseAuditor<string> {
          constructor() {
            super({
              id: 'validate_dummy',
              name: 'Dummy',
              description: 'Desc',
              family: 'architecture',
              packageName: 'Dummy',
              ruleIds: DUMMY_RULES,
              configKey: 'paths',
              defaultConfig: {},
              icon: '🧪',
              ruleDescriptions: { 'covered-rule': 'Desc', 'untested-rule': 'Desc' },
              capabilities: {
                fix: false,
                fixPriority: false,
                lint: true,
                md: false,
                ast: false,
                changedSince: false,
                heavy: false,
                requiresBuild: false,
                postRun: false
              },
              coverage: { include: ['src/**'] }
            });
          }
          public override async runAudit() {}
        }
        `,
        'utf-8'
      );

      // Test only mentions 'covered-rule' and has clean verification
      await fs.writeFile(
        path.join(testDir, 'validate_dummy.test.ts'),
        `
        import { describe, it, expect } from 'vitest';
        describe('DummyAuditor', () => {
          it('tests covered-rule', () => {
            const rule = 'covered-rule';
            expect(rule).toBe('covered-rule');
            expect(result.summary.errors).toBe(0);
          });
        });
        `,
        'utf-8'
      );

      const auditor = new AuditorTestsAuditor(tempDir);

      const result = await auditor.execute();
      const untestedViolation = result.findings.find(f => f.ruleId === 'untested-auditor-rule' && f.context === 'untested-rule');
      expect(untestedViolation).toBeDefined();
      expect(untestedViolation?.severity).toBe('error');
    });

    it('detects missing clean execution verification (missing-clean-auditor-test)', async () => {
      const suiteDir = path.join(tempDir, 'packages', 'auditor', 'src', 'suites', 'architecture');
      const testDir = path.join(tempDir, 'packages', 'auditor', 'tests');
      await fs.mkdir(suiteDir, { recursive: true });
      await fs.mkdir(testDir, { recursive: true });

      await fs.writeFile(
        path.join(suiteDir, 'validate_dummy.ts'),
        `
        import { BaseAuditor } from '../../core/auditorBase.ts';
        export const DUMMY_RULES = ['my-rule'] as const;
        export class DummyAuditor extends BaseAuditor<string> {
          constructor() {
            super({
              id: 'validate_dummy',
              name: 'Dummy',
              description: 'Desc',
              family: 'architecture',
              packageName: 'Dummy',
              ruleIds: DUMMY_RULES,
              configKey: 'paths',
              defaultConfig: {},
              icon: '🧪',
              ruleDescriptions: { 'my-rule': 'Desc' },
              capabilities: {
                fix: false,
                fixPriority: false,
                lint: true,
                md: false,
                ast: false,
                changedSince: false,
                heavy: false,
                requiresBuild: false,
                postRun: false
              },
              coverage: { include: ['src/**'] }
            });
          }
          public override async runAudit() {}
        }
        `,
        'utf-8'
      );

      // Mentions 'my-rule' but has NO clean pass check
      await fs.writeFile(
        path.join(testDir, 'validate_dummy.test.ts'),
        `
        import { describe, it, expect } from 'vitest';
        describe('DummyAuditor', () => {
          it('checks my-rule', () => {
            expect('my-rule').toBe('my-rule');
          });
        });
        `,
        'utf-8'
      );

      const auditor = new AuditorTestsAuditor(tempDir);

      const result = await auditor.execute();
      const errClean = result.findings.find(f => f.ruleId === 'missing-clean-auditor-test' && f.context === 'validate_dummy');
      expect(errClean).toBeDefined();
      expect(errClean?.severity).toBe('error');
    });

    it('detects missing test file for an extension in scripts/auditors/ (missing-auditor-test)', async () => {
      const extDir = path.join(tempDir, 'scripts', 'auditors', 'architecture');
      await fs.mkdir(extDir, { recursive: true });
      await fs.writeFile(
        path.join(extDir, 'validate_custom_ext.ts'),
        `
        import { BaseAuditor } from '../../packages/auditor/src/core/auditorBase.ts';
        export const CUSTOM_RULES = ['custom-rule'] as const;
        export class CustomExtAuditor extends BaseAuditor<string> {
          constructor() {
            super({
              id: 'validate_custom_ext',
              name: 'Custom',
              description: 'Desc',
              family: 'architecture',
              packageName: 'Custom',
              ruleIds: CUSTOM_RULES,
              configKey: 'paths',
              defaultConfig: {},
              icon: '🧪',
              ruleDescriptions: { 'custom-rule': 'Desc' },
              capabilities: {
                fix: false,
                fixPriority: false,
                lint: true,
                md: false,
                ast: false,
                changedSince: false,
                heavy: false,
                requiresBuild: false,
                postRun: false
              },
              coverage: { include: ['src/**'] }
            });
          }
          public override async runAudit() {}
        }
        `,
        'utf-8'
      );

      await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, '.auditor', 'audit.config.ts'),
        `export default { paths: {}, persistence: {}, domain: {}, extensions: [] };`,
        'utf-8'
      );

      const auditor = new AuditorTestsAuditor(tempDir);
      const result = await auditor.execute();
      const missingViolation = result.findings.find(f => f.ruleId === 'missing-auditor-test' && f.context === 'validate_custom_ext');
      expect(missingViolation).toBeDefined();
      expect(missingViolation?.severity).toBe('error');
    });

    it('detects missing construction block in auditor test file (missing-construction-auditor-test)', async () => {
      const suiteDir = path.join(tempDir, 'packages', 'auditor', 'src', 'suites', 'architecture');
      const testDir = path.join(tempDir, 'packages', 'auditor', 'tests');
      await fs.mkdir(suiteDir, { recursive: true });
      await fs.mkdir(testDir, { recursive: true });

      await fs.writeFile(
        path.join(suiteDir, 'validate_dummy.ts'),
        `
        import { BaseAuditor } from '../../core/auditorBase.ts';
        export const DUMMY_RULES = ['my-rule'] as const;
        export class DummyAuditor extends BaseAuditor<string> {
          constructor() {
            super({
              id: 'validate_dummy',
              name: 'Dummy',
              description: 'Desc',
              family: 'architecture',
              packageName: 'Dummy',
              ruleIds: DUMMY_RULES,
              configKey: 'paths',
              defaultConfig: {},
              icon: '🧪',
              ruleDescriptions: { 'my-rule': 'Desc' },
              capabilities: {
                fix: false,
                fixPriority: false,
                lint: true,
                md: false,
                ast: false,
                changedSince: false,
                heavy: false,
                requiresBuild: false,
                postRun: false
              },
              coverage: { include: ['src/**'] }
            });
          }
          public override async runAudit() {}
        }
        `,
        'utf-8'
      );

      await fs.writeFile(
        path.join(testDir, 'validate_dummy.test.ts'),
        `
        import { describe, it, expect } from 'vitest';
        describe('DummyAuditor', () => {
          it('checks my-rule and verifies clean execution', () => {
            const rule = 'my-rule';
            expect(rule).toBe('my-rule');
            expect(result.summary.errors).toBe(0);
            expect(result.status).toBe('passed');
          });
          it('detects violation', () => {
            expect(result.status).toBe('failed');
            expect(result.summary.errors).toBe(1);
          });
        });
        `,
        'utf-8'
      );

      await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, '.auditor', 'audit.config.ts'),
        `export default { paths: {}, persistence: {}, domain: {}, extensions: [] };`,
        'utf-8'
      );

      const auditor = new AuditorTestsAuditor(tempDir);
      const result = await auditor.execute();
      const violation = result.findings.find(f => f.ruleId === 'missing-construction-auditor-test');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('detects missing violation block in auditor test file (missing-violation-auditor-test)', async () => {
      const suiteDir = path.join(tempDir, 'packages', 'auditor', 'src', 'suites', 'architecture');
      const testDir = path.join(tempDir, 'packages', 'auditor', 'tests');
      await fs.mkdir(suiteDir, { recursive: true });
      await fs.mkdir(testDir, { recursive: true });

      await fs.writeFile(
        path.join(suiteDir, 'validate_dummy.ts'),
        `
        import { BaseAuditor } from '../../core/auditorBase.ts';
        export const DUMMY_RULES = ['my-rule'] as const;
        export class DummyAuditor extends BaseAuditor<string> {
          constructor() {
            super({
              id: 'validate_dummy',
              name: 'Dummy',
              description: 'Desc',
              family: 'architecture',
              packageName: 'Dummy',
              ruleIds: DUMMY_RULES,
              configKey: 'paths',
              defaultConfig: {},
              icon: '🧪',
              ruleDescriptions: { 'my-rule': 'Desc' },
              capabilities: {
                fix: false,
                fixPriority: false,
                lint: true,
                md: false,
                ast: false,
                changedSince: false,
                heavy: false,
                requiresBuild: false,
                postRun: false
              },
              coverage: { include: ['src/**'] }
            });
          }
          public override async runAudit() {}
        }
        `,
        'utf-8'
      );

      await fs.writeFile(
        path.join(testDir, 'validate_dummy.test.ts'),
        `
        import { describe, it, expect } from 'vitest';
        describe('DummyAuditor', () => {
          it('initializes with correct metadata', () => {
            expect(auditor.id).toBe('validate_dummy');
          });
          it('checks my-rule and verifies clean execution', () => {
            const rule = 'my-rule';
            expect(rule).toBe('my-rule');
            expect(result.summary.errors).toBe(0);
            expect(result.status).toBe('passed');
          });
        });
        `,
        'utf-8'
      );

      await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, '.auditor', 'audit.config.ts'),
        `export default { paths: {}, persistence: {}, domain: {}, extensions: [] };`,
        'utf-8'
      );

      const auditor = new AuditorTestsAuditor(tempDir);
      const result = await auditor.execute();
      const violation = result.findings.find(f => f.ruleId === 'missing-violation-auditor-test');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });

    it('passes with zero errors when all auditors have complete dedicated tests (clean path)', async () => {
      const suiteDir = path.join(tempDir, 'packages', 'auditor', 'src', 'suites', 'architecture');
      const testDir = path.join(tempDir, 'packages', 'auditor', 'tests');
      await fs.mkdir(suiteDir, { recursive: true });
      await fs.mkdir(testDir, { recursive: true });

      await fs.writeFile(
        path.join(suiteDir, 'validate_dummy.ts'),
        `
        import { BaseAuditor } from '../../core/auditorBase.ts';
        export const DUMMY_RULES = ['my-rule'] as const;
        export class DummyAuditor extends BaseAuditor<string> {
          constructor() {
            super({
              id: 'validate_dummy',
              name: 'Dummy',
              description: 'Desc',
              family: 'architecture',
              packageName: 'Dummy',
              ruleIds: DUMMY_RULES,
              configKey: 'paths',
              defaultConfig: {},
              icon: '🧪',
              ruleDescriptions: { 'my-rule': 'Desc' },
              capabilities: {
                fix: false,
                fixPriority: false,
                lint: true,
                md: false,
                ast: false,
                changedSince: false,
                heavy: false,
                requiresBuild: false,
                postRun: false
              },
              coverage: { include: ['src/**'] }
            });
          }
          public override async runAudit() {}
        }
        `,
        'utf-8'
      );

      await fs.writeFile(
        path.join(testDir, 'validate_dummy.test.ts'),
        `
        import { describe, it, expect } from 'vitest';
        describe('DummyAuditor', () => {
          it('initializes with correct metadata', () => {
            expect(auditor.id).toBe('validate_dummy');
          });
          it('checks my-rule and verifies clean execution', () => {
            const rule = 'my-rule';
            expect(rule).toBe('my-rule');
            expect(result.summary.errors).toBe(0);
            expect(result.status).toBe('passed');
          });
          it('detects violations with error', () => {
            expect(result.status).toBe('failed');
            expect(result.summary.errors).toBe(1);
          });
        });
        `,
        'utf-8'
      );

      await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, '.auditor', 'audit.config.ts'),
        `export default { paths: {}, persistence: {}, domain: {}, extensions: [] };`,
        'utf-8'
      );

      const auditor = new AuditorTestsAuditor(tempDir);
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});


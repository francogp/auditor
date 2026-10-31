/**
 * tests/all_auditors_contract_conformance.test.ts
 *
 * Dedicated Vitest suite executing universal dynamic contract & testing conformance
 * across 100% of discovered sub-auditors and extensions.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { BaseAuditor, type AuditorOptions } from '../src/core/auditorBase.ts';
import {
  runAuditorContractConformanceTests,
  validateAuditorConstruction,
  validateAuditorTestFileContent,
  findDedicatedTestFile,
  checkConstructionVerification,
  checkCleanVerification,
  checkViolationVerification
} from '../src/core/auditorContractConformance.ts';

const BASE_MOCK_CAPS = {
  speed: 'light',
  phase: 'normal',
  md: false,
  ast: false,
  changedOnly: false,
  critical: false
} as const;

// 1. Run dynamic conformance tests for all discovered auditors in this project
runAuditorContractConformanceTests();

// 2. Unit tests for the conformance validation engine itself
describe('Auditor Contract Conformance Engine Unit Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'conformance-unit-test-'));
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* non-fatal test cleanup */
    }
  });

  describe('validateAuditorConstruction', () => {
    it('detects redundant capabilities at BaseAuditor construction', () => {
      expect(() => {
        new (class extends BaseAuditor<string> {
          constructor() {
            super({
              id: 'mock_redundant',
              name: 'Mock',
              description: 'Mock desc',
              family: 'architecture',
              packageName: 'Mock',
              icon: '🧪',
              ruleFixers: {},
              capabilities: { ...BASE_MOCK_CAPS },
              ruleCapabilities: { 'rule-1': { ...BASE_MOCK_CAPS } },
              configKey: 'paths',
              defaultConfig: {},
              requiredPermissions: [],
              criticalConfig: {},
              usesThirdPartyTool: false,
              coverage: { include: ['src/**'] },
              ruleIds: ['rule-1'],
              ruleDescriptions: { 'rule-1': 'Desc' },
              ruleRemediations: { 'rule-1': 'Remediacion' }
            } as unknown as AuditorOptions<string>);
          }
          public override async runAudit() {}
        })();
      }).toThrowError(/passed redundant 'capabilities' to constructor options/i);
    });

    it('detects mismatched taskId vs auditor id', () => {
      class MockAuditor extends BaseAuditor<string> {
        constructor() {
          super({
            ruleFixers: {},
            id: 'real_id',
            name: 'Mock',
            description: 'Mock desc',
            family: 'architecture',
            packageName: 'Mock',
            icon: '🧪',
            ruleCapabilities: { 'rule-1': { ...BASE_MOCK_CAPS } },
            configKey: 'paths',
            defaultConfig: {},
            requiredPermissions: [],
            criticalConfig: {},
            usesThirdPartyTool: false,
            coverage: { include: ['src/**'] },
            ruleIds: ['rule-1'],
            ruleDescriptions: { 'rule-1': 'Desc' },
            ruleRemediations: { 'rule-1': 'Remediacion' },
            ruleRemediationPhases: { 'rule-1': 'setup' }
          });
        }
        public override async runAudit() {}
      }

      const auditor = new MockAuditor();
      const errors = validateAuditorConstruction(auditor, 'different_id');
      expect(errors.some((e) => e.includes('no coincide con el taskId'))).toBe(true);
    });

    it('detects missing rule in ruleDescriptions at BaseAuditor construction', () => {
      expect(() => {
        new (class extends BaseAuditor<string> {
          constructor() {
            super({
              id: 'mock_suite',
              name: 'Mock',
              description: 'Mock desc',
              family: 'architecture',
              packageName: 'Mock',
              icon: '🧪',
              ruleFixers: {},
              ruleCapabilities: {
                'rule-1': { ...BASE_MOCK_CAPS },
                'rule-2': { ...BASE_MOCK_CAPS }
              } as never,
              configKey: 'paths',
              defaultConfig: {},
              requiredPermissions: [],
              criticalConfig: {},
              usesThirdPartyTool: false,
              coverage: { include: ['src/**'] },
              ruleIds: ['rule-1', 'rule-2'] as never,
              ruleDescriptions: { 'rule-1': 'Desc' } as never,
              ruleRemediations: { 'rule-1': 'Remediacion', 'rule-2': 'Remediacion 2' } as never,
              scripts: [
                { name: 'auditor:mock', command: 'auditor task=mock_suite', description: 'Mock' }
              ]
            });
          }
          public override async runAudit() {}
        })();
      }).toThrowError(/is missing a rule description/i);
    });

    it('detects missing ruleCapabilities at BaseAuditor construction', () => {
      expect(() => {
        new (class extends BaseAuditor<string> {
          constructor() {
            super({
              id: 'mock_suite',
              name: 'Mock',
              description: 'Mock desc',
              family: 'architecture',
              packageName: 'Mock',
              icon: '🧪',
              configKey: 'paths',
              defaultConfig: {},
              requiredPermissions: [],
              criticalConfig: {},
              usesThirdPartyTool: false,
              coverage: { include: ['src/**'] },
              ruleIds: ['rule-1'] as never,
              ruleDescriptions: { 'rule-1': 'Desc' } as never,
              scripts: [
                { name: 'auditor:mock', command: 'auditor task=mock_suite', description: 'Mock' }
              ]
            } as never);
          }
          public override async runAudit() {}
        })();
      }).toThrowError(/must define mandatory 'ruleCapabilities'/i);
    });

    it('detects description exceeding 60 characters at BaseAuditor construction', () => {
      expect(() => {
        new (class extends BaseAuditor<string> {
          constructor() {
            super({
              id: 'mock_suite',
              name: 'Mock',
              description:
                'Esta descripción es excesivamente larga y supera con creces el límite de 60 caracteres permitidos',
              family: 'architecture',
              packageName: 'Mock',
              icon: '🧪',
              ruleFixers: {},
              ruleCapabilities: { 'rule-1': { ...BASE_MOCK_CAPS } },
              configKey: 'paths',
              defaultConfig: {},
              requiredPermissions: [],
              criticalConfig: {},
              usesThirdPartyTool: false,
              coverage: { include: ['src/**'] },
              ruleIds: ['rule-1'] as never,
              ruleDescriptions: { 'rule-1': 'Desc' } as never,
              ruleRemediations: { 'rule-1': 'Remediacion' } as never,
              scripts: [
                { name: 'auditor:mock', command: 'auditor task=mock_suite', description: 'Mock' }
              ]
            });
          }
          public override async runAudit() {}
        })();
      }).toThrowError(/exceeds 60 characters/i);
    });

    it('detects manual fix declared in ruleCapabilities', () => {
      expect(() => {
        new (class extends BaseAuditor<string> {
          constructor() {
            super({
              ruleFixers: {},
              id: 'mock_fix_missing',
              name: 'Mock',
              description: 'Mock desc',
              family: 'architecture',
              packageName: 'Mock',
              icon: '🛠️',
              ruleCapabilities: { 'rule-1': { ...BASE_MOCK_CAPS, fix: 'normal' } as never },
              configKey: 'paths',
              defaultConfig: {},
              requiredPermissions: [],
              criticalConfig: {},
              usesThirdPartyTool: false,
              coverage: { include: ['src/**'] },
              ruleIds: ['rule-1'] as never,
              ruleDescriptions: { 'rule-1': 'Desc' } as never,
              ruleRemediations: { 'rule-1': 'Remediacion' } as never,
              ruleRemediationPhases: { 'rule-1': 'setup' } as never,
              scripts: [
                {
                  name: 'auditor:mock',
                  command: 'auditor task=mock_fix_missing',
                  description: 'Mock'
                }
              ]
            });
          }
          public override async runAudit() {}
        })();
      }).toThrowError(/declared manual 'fix' in 'ruleCapabilities/i);
    });

    it('detects manual string/boolean fix properties in constructor options', () => {
      expect(() => {
        new (class extends BaseAuditor<string> {
          constructor() {
            super({
              ruleFixers: {},
              id: 'mock_fix_invalid',
              name: 'Mock',
              description: 'Mock desc',
              family: 'architecture',
              packageName: 'Mock',
              icon: '🛠️',
              ruleCapabilities: { 'rule-1': { ...BASE_MOCK_CAPS } },
              fix: 'normal' as never,
              configKey: 'paths',
              defaultConfig: {},
              requiredPermissions: [],
              criticalConfig: {},
              usesThirdPartyTool: false,
              coverage: { include: ['src/**'] },
              ruleIds: ['rule-1'] as never,
              ruleDescriptions: { 'rule-1': 'Desc' } as never,
              ruleRemediations: { 'rule-1': 'Remediacion' } as never,
              ruleRemediationPhases: { 'rule-1': 'setup' } as never,
              scripts: [
                {
                  name: 'auditor:mock',
                  command: 'auditor task=mock_fix_invalid',
                  description: 'Mock'
                }
              ]
            } as never);
          }
          public override async runAudit() {}
        })();
      }).toThrowError(/declared manual fix capabilities/i);
    });

    it('rejects undeclared rules in fixableRuleIds at BaseAuditor construction', () => {
      expect(() => {
        new (class extends BaseAuditor<string> {
          constructor() {
            super({
              ruleFixers: {},
              id: 'mock_fix_invalid_rule',
              name: 'Mock',
              description: 'Mock desc',
              family: 'architecture',
              packageName: 'Mock',
              icon: '🛠️',
              ruleCapabilities: { 'rule-1': { ...BASE_MOCK_CAPS } },
              fixableRuleIds: ['undeclared-rule'] as never,
              configKey: 'paths',
              defaultConfig: {},
              requiredPermissions: [],
              criticalConfig: {},
              usesThirdPartyTool: false,
              coverage: { include: ['src/**'] },
              ruleIds: ['rule-1'] as never,
              ruleDescriptions: { 'rule-1': 'Desc' } as never,
              ruleRemediations: { 'rule-1': 'Remediacion' } as never,
              ruleRemediationPhases: { 'rule-1': 'setup' } as never,
              scripts: [
                {
                  name: 'auditor:mock',
                  command: 'auditor task=mock_fix_invalid_rule',
                  description: 'Mock'
                }
              ]
            } as never);
          }
          public override async runAudit() {}
        })();
      }).toThrowError(
        /declared 'fixableRuleIds' for 'undeclared-rule', but that rule is not declared in 'ruleIds'/i
      );
    });
  });

  describe('validateAuditorTestFileContent', () => {
    class CompliantAuditor extends BaseAuditor<string> {
      constructor() {
        super({
          ruleFixers: {},
          id: 'mock_compliant',
          name: 'Compliant',
          description: 'Desc',
          family: 'architecture',
          packageName: 'Mock',
          icon: '🧪',
          ruleCapabilities: {
            'test-rule-alpha': { ...BASE_MOCK_CAPS },
            'test-rule-beta': { ...BASE_MOCK_CAPS }
          },
          configKey: 'paths',
          defaultConfig: {},
          requiredPermissions: [],
          criticalConfig: {},
          usesThirdPartyTool: false,
          coverage: { include: ['src/**'] },
          ruleIds: ['test-rule-alpha', 'test-rule-beta'],
          ruleDescriptions: {
            'test-rule-alpha': 'Desc alpha',
            'test-rule-beta': 'Desc beta'
          },
          ruleRemediations: {
            'test-rule-alpha': 'Remediacion alpha',
            'test-rule-beta': 'Remediacion beta'
          },
          ruleRemediationPhases: {
            'test-rule-alpha': 'setup',
            'test-rule-beta': 'hygiene'
          },
          scripts: [
            {
              name: 'auditor:mock-compliant',
              command: 'auditor task=mock_compliant',
              description: 'Mock compliant'
            }
          ]
        });
      }
      public override async runAudit() {}
    }

    it('detects missing construction block in test file', () => {
      const auditor = new CompliantAuditor();
      const invalidTestSource = `
        it('clean execution', () => {
          expect(result.summary.errors).toBe(0);
          expect(result.status).toBe('passed');
        });
        it('detects violation', () => {
          expect(result.status).toBe('failed');
          expect(result.summary.errors).toBe(1);
          expect(f.ruleId).toBe('test-rule-alpha');
          expect(f.ruleId).toBe('test-rule-beta');
        });
      `;

      const errors = validateAuditorTestFileContent(
        invalidTestSource,
        'tests/mock_compliant.test.ts',
        auditor
      );
      expect(errors.some((e) => e.includes('no verifica la construcción o metadatos'))).toBe(true);
    });

    it('detects missing clean verification in test file', () => {
      const auditor = new CompliantAuditor();
      const invalidTestSource = `
        describe('Metadata', () => {
          it('initializes with correct metadata', () => {
            expect(auditor.id).toBe('mock_compliant');
          });
        });
        it('detects violation', () => {
          expect(result.status).toBe('failed');
          expect(result.summary.errors).toBe(1);
          expect(f.ruleId).toBe('test-rule-alpha');
          expect(f.ruleId).toBe('test-rule-beta');
        });
      `;

      const errors = validateAuditorTestFileContent(
        invalidTestSource,
        'tests/mock_compliant.test.ts',
        auditor
      );
      expect(errors.some((e) => e.includes('no verifica la ruta limpia'))).toBe(true);
    });

    it('detects missing violation detection in test file', () => {
      const auditor = new CompliantAuditor();
      const invalidTestSource = `
        describe('Metadata', () => {
          it('initializes with correct metadata', () => {
            expect(auditor.id).toBe('mock_compliant');
          });
        });
        it('clean execution', () => {
          expect(result.summary.errors).toBe(0);
          expect(result.status).toBe('passed');
          expect(rules).toContain('test-rule-alpha');
          expect(rules).toContain('test-rule-beta');
        });
      `;

      const errors = validateAuditorTestFileContent(
        invalidTestSource,
        'tests/mock_compliant.test.ts',
        auditor
      );
      expect(errors.some((e) => e.includes('no verifica la detección de errores o fallos'))).toBe(
        true
      );
    });

    it('detects untested declared rules', () => {
      const auditor = new CompliantAuditor();
      const invalidTestSource = `
        describe('Metadata', () => {
          it('initializes with correct metadata', () => {
            expect(auditor.id).toBe('mock_compliant');
          });
        });
        it('clean execution', () => {
          expect(result.summary.errors).toBe(0);
          expect(result.status).toBe('passed');
        });
        it('detects violation', () => {
          expect(result.status).toBe('failed');
          expect(result.summary.errors).toBe(1);
          expect(f.ruleId).toBe('test-rule-alpha');
          // secondary rule is intentionally missing!
        });
      `;

      const errors = validateAuditorTestFileContent(
        invalidTestSource,
        'tests/mock_compliant.test.ts',
        auditor
      );
      expect(
        errors.some((e) => e.includes("no verifica la regla declarada 'test-rule-beta'"))
      ).toBe(true);
    });

    it('passes cleanly when test contains all 5 mandatory blocks and 100% of declared rules', () => {
      const auditor = new CompliantAuditor();
      const validTestSource = `
        describe('Metadata', () => {
          it('initializes with correct metadata', () => {
            expect(auditor.id).toBe('mock_compliant');
          });
        });
        it('clean execution', () => {
          expect(result.summary.errors).toBe(0);
          expect(result.status).toBe('passed');
        });
        it('detects violation', () => {
          expect(result.status).toBe('failed');
          expect(result.summary.errors).toBe(1);
          expect(f.ruleId).toBe('test-rule-alpha');
          expect(f.ruleId).toBe('test-rule-beta');
        });
      `;

      const errors = validateAuditorTestFileContent(
        validTestSource,
        'tests/mock_compliant.test.ts',
        auditor
      );
      expect(errors).toHaveLength(0);
    });
  });

  describe('findDedicatedTestFile for Extensions', () => {
    it('locates extension test in tests/node/auditors/ and tests/auditors/', () => {
      const extDir = path.join(tempDir, 'tests', 'node', 'auditors');
      fs.mkdirSync(extDir, { recursive: true });
      fs.writeFileSync(path.join(extDir, 'validate_custom_host.test.ts'), '// test content\n');

      const { testFileAbs, testFileRel } = findDedicatedTestFile(tempDir, 'validate_custom_host', [
        'tests'
      ]);
      expect(testFileAbs).not.toBeNull();
      expect(testFileRel).toBe('tests/node/auditors/validate_custom_host.test.ts');
    });
  });

  describe('check helpers', () => {
    it('verifies boolean predicates accurately', () => {
      expect(checkConstructionVerification("expect(auditor.id).toBe('x')")).toBe(true);
      expect(checkConstructionVerification('const a = 1;')).toBe(false);

      expect(checkCleanVerification("expect(result.status).toBe('passed')")).toBe(true);
      expect(checkCleanVerification('expect(a).toBe(1)')).toBe(false);

      expect(checkViolationVerification("expect(result.status).toBe('failed')")).toBe(true);
      expect(checkViolationVerification('expect(a).toBe(1)')).toBe(false);
    });
  });

  describe('runAuditorContractConformanceTests', () => {
    it('executes synchronously when explicit vitest hooks are supplied', () => {
      let describeCalled = false;
      let itCalledCount = 0;
      let beforeAllCalled = false;
      let afterAllCalled = false;

      const mockHooks = {
        describe: (_name: string, fn: () => void) => {
          describeCalled = true;
          fn();
        },
        it: (_name: string, _fn: () => void | Promise<void>) => {
          itCalledCount++;
        },
        expect: (_actual: unknown) => ({
          toBeGreaterThan: () => {},
          toHaveLength: () => {}
        }),
        beforeAll: (_fn: () => void | Promise<void>) => {
          beforeAllCalled = true;
        },
        afterAll: (_fn: () => void | Promise<void>) => {
          afterAllCalled = true;
        }
      };

      const result = runAuditorContractConformanceTests({
        projectRoot: tempDir,
        vitest: mockHooks as never
      });

      expect(result).toBeUndefined();
      expect(describeCalled).toBe(true);
      expect(itCalledCount).toBe(2);
      expect(beforeAllCalled).toBe(true);
      expect(afterAllCalled).toBe(true);
    });
  });
});

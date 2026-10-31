/**
 * packages/auditor/tests/base_auditor_polymorphic_fix.test.ts
 *
 * Unit tests for canonical BaseAuditor polymorphic auto-fix and fixableRuleIds governance:
 * - Guarantees dynamic derivation of capabilities.fix and rule capabilities from fixableRuleIds
 * - Verifies correct lifecycle execution with isFixActive() === true without re-instantiation
 * - Validates rejection of undeclared rules in fixableRuleIds
 */

import { describe, it, expect } from 'vite-plus/test';

import { BaseAuditor } from '../src/core/auditorBase.ts';

class MockTestAuditor extends BaseAuditor<'mock-rule-1' | 'mock-rule-2'> {
  public fixCalled = false;
  public auditCalled = false;
  public passedOptions?: { projectRoot?: string };

  constructor(options: { projectRoot?: string } = {}) {
    super({
      id: 'mock_test_auditor',
      name: 'Mock Test Auditor',
      description: 'Auditor for testing polymorphic fixableRuleIds',
      coverage: { include: ['src/**/*.ts'] },
      family: 'architecture',
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleFixers: {},
      fixableRuleIds: ['mock-rule-1'],
      packageName: 'MockPkg',
      icon: '🧪',
      configKey: 'mock.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      ruleIds: ['mock-rule-1', 'mock-rule-2'] as const,
      ruleRemediationPhases: {
        'mock-rule-1': 'hygiene',
        'mock-rule-2': 'hygiene'
      },
      ruleCapabilities: {
        'mock-rule-1': {
          ast: false,
          changedOnly: false,
          critical: false,
          md: false,
          phase: 'normal',
          speed: 'light'
        },
        'mock-rule-2': {
          ast: false,
          changedOnly: false,
          critical: false,
          md: false,
          phase: 'normal',
          speed: 'light'
        }
      },
      ruleDescriptions: {
        'mock-rule-1': 'Rule 1',
        'mock-rule-2': 'Rule 2'
      },
      ruleRemediations: {
        'mock-rule-1': 'Fix 1',
        'mock-rule-2': 'Fix 2'
      }
    });
    this.passedOptions = options;
  }

  public override async runAudit(): Promise<void> {
    if (this.isFixActive()) {
      this.fixCalled = true;
    } else {
      this.auditCalled = true;
    }
  }
}

describe('BaseAuditor Polymorphic Suite Auto-Fix (fixableRuleIds)', () => {
  it('dynamically computes suite and rule fix capabilities from fixableRuleIds', () => {
    const auditor = new MockTestAuditor();

    expect(auditor.capabilities.fix).toBe('normal');
    expect(auditor.ruleCapabilities['mock-rule-1']?.fix).toBe('normal');
    expect(auditor.ruleCapabilities['mock-rule-2']?.fix).toBe('none');
    expect(auditor.getFixableRuleIds()).toEqual(['mock-rule-1']);
  });

  it('executes fix mode directly on instance without re-instantiation', async () => {
    const auditor = new MockTestAuditor();
    expect(auditor.fixCalled).toBe(false);

    await auditor.fix();
    expect(auditor.fixCalled).toBe(true);
    expect(auditor.auditCalled).toBe(false);
  });

  it('executes audit mode cleanly with isFixActive() === false', async () => {
    const auditor = new MockTestAuditor();
    expect(auditor.auditCalled).toBe(false);

    await auditor.audit();
    expect(auditor.auditCalled).toBe(true);
    expect(auditor.fixCalled).toBe(false);
  });

  it('rejects undeclared rules in fixableRuleIds loudly', () => {
    expect(() => {
      new (class extends BaseAuditor<'mock-rule-1'> {
        constructor() {
          super({
            id: 'mock_invalid_rules',
            name: 'Mock',
            description: 'Mock',
            coverage: { include: ['src/**/*.ts'] },
            family: 'architecture',
            usesThirdPartyTool: false,
            requiredPermissions: [],
            ruleFixers: {},
            fixableRuleIds: ['undeclared-rule'] as never,
            packageName: 'Mock',
            icon: '🧪',
            configKey: 'mock.enabled',
            defaultConfig: { enabled: true },
            criticalConfig: {},
            ruleIds: ['mock-rule-1'] as const,
            ruleRemediationPhases: { 'mock-rule-1': 'hygiene' },
            ruleCapabilities: {
              'mock-rule-1': {
                ast: false,
                changedOnly: false,
                critical: false,
                md: false,
                phase: 'normal',
                speed: 'light'
              }
            },
            ruleDescriptions: { 'mock-rule-1': 'Rule 1' },
            ruleRemediations: { 'mock-rule-1': 'Fix 1' }
          });
        }
        public override async runAudit() {}
      })();
    }).toThrowError(/declared 'fixableRuleIds' for 'undeclared-rule'/i);
  });
});

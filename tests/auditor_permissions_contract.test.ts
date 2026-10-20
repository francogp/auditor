/**
 * tests/auditor_permissions_contract.test.ts
 *
 * Validates that sub-auditors and tools declare their required Node.js 26 permissions,
 * and that package script requirements dynamically assemble canonical CLI commands
 * with the exact required permissions (e.g. --allow-addons, --allow-child-process).
 */

import { describe, it, expect } from 'vite-plus/test';

import { BaseAuditor, createRuleCapabilities } from '../src/core/auditorBase.ts';
import { CORE_PACKAGE_SCRIPT_REQUIREMENTS } from '../src/core/packageScriptRegistry.ts';

describe('Auditor Permissions Contract & Dynamic Script Assembly', () => {
  it('allows sub-auditors to declare requiredPermissions in constructor options', () => {
    class MockAddonAuditor extends BaseAuditor<'mock-rule'> {
      constructor() {
        super({
          id: 'mock_addon_auditor',
          name: 'Mock Addon Auditor',
          description: 'Auditor needing native addon permissions',
          family: 'architecture',
          packageName: 'Mock',
          icon: '🧩',
          configKey: 'paths',
          defaultConfig: {},
          criticalConfig: {},
          usesThirdPartyTool: false,
          coverage: { include: ['src/**'] },
          remediationPhase: 'setup',
          requiredPermissions: ['--allow-addons', '--allow-child-process'],
          ruleCapabilities: createRuleCapabilities(['mock-rule'], {
            speed: 'light',
            phase: 'normal',
            fix: 'none',
            md: false,
            ast: false,
            changedOnly: false,
            critical: false
          }),
          ruleIds: ['mock-rule'],
          ruleDescriptions: { 'mock-rule': 'Rule needing addon' },
          ruleRemediations: { 'mock-rule': 'Remediacion' }
        });
      }
      public override async runAudit() {}
    }

    const inst = new MockAddonAuditor();
    expect(inst.requiredPermissions).toEqual(['--allow-addons', '--allow-child-process']);
  });

  it('declares permissions on package script requirements that load native addons', () => {
    const dupesReq = CORE_PACKAGE_SCRIPT_REQUIREMENTS.find((r) => r.name === 'auditor:dupes');
    expect(dupesReq).toBeDefined();
    expect(dupesReq?.permissions).toContain('--allow-addons');
  });

  it('throws an Auditor Contract Violation when requiredPermissions is omitted', () => {
    expect(() => {
      new (class extends BaseAuditor<'mock-rule'> {
        constructor() {
          super({
            id: 'mock_missing_perms',
            name: 'Mock',
            description: 'Mock',
            family: 'architecture',
            packageName: 'Mock',
            icon: '🧩',
            configKey: 'paths',
            defaultConfig: {},
            criticalConfig: {},
            usesThirdPartyTool: false,
            remediationPhase: 'setup',
            ruleCapabilities: createRuleCapabilities(['mock-rule'], {
              speed: 'light',
              phase: 'normal',
              fix: 'none',
              md: false,
              ast: false,
              changedOnly: false,
              critical: false
            }),
            ruleIds: ['mock-rule'],
            ruleDescriptions: { 'mock-rule': 'Rule' },
            ruleRemediations: { 'mock-rule': 'Remediacion' }
          } as never);
        }
        public override async runAudit() {}
      })();
    }).toThrowError(/requiredPermissions/i);
  });
});

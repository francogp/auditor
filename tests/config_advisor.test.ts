/**
 * tests/config_advisor.test.ts
 *
 * Unit tests for the Unidirectional Configuration Advisor Engine (configAdvisor.ts).
 */

import { describe, expect, it } from 'vite-plus/test';

import type { AuditTaskDefinition } from '../src/core/auditContract.ts';
import { evaluateProjectConfig } from '../src/core/configAdvisor.ts';

function createMockTask(
  id: string,
  configKey: string,
  defaultConfig: Record<string, unknown>
): AuditTaskDefinition {
  return {
    id,
    name: `Mock Task ${id}`,
    description: 'Mock task for advisor testing',
    family: 'architecture',
    configKey,
    defaultConfig,
    criticalConfig: {},
    run: async () => ({
      status: 'passed',
      errorsCount: 0,
      warningsCount: 0,
      findings: []
    })
  } as unknown as AuditTaskDefinition;
}

describe('configAdvisor - Unidirectional Configuration Hardening Engine', () => {
  it('strictly preserves stricter ceilings and NEVER recommends relaxing them', () => {
    const rawConfigOverride: Record<string, unknown> = {
      fallow: {
        enabled: true,
        health: {
          maxCognitive: 12, // Stricter than default (20)
          maxCyclomatic: 18 // Stricter than default (25)
        }
      }
    };

    const report = evaluateProjectConfig(process.cwd(), {
      targetSubsystem: 'fallow',
      rawConfigOverride,
      tasks: []
    });

    const cogRec = report.recommendations.find((r) => r.path === 'fallow.health.maxCognitive');
    const cycRec = report.recommendations.find((r) => r.path === 'fallow.health.maxCyclomatic');

    expect(cogRec).toBeUndefined();
    expect(cycRec).toBeUndefined();

    const cogHardened = report.hardenedSettings.find(
      (h) => h.path === 'fallow.health.maxCognitive'
    );
    expect(cogHardened).toBeDefined();
    expect(cogHardened?.currentValue).toBe(12);
    expect(cogHardened?.defaultValue).toBe(20);
  });

  it('recommends hardening when a ceiling is more permissive than canonical default', () => {
    const rawConfigOverride: Record<string, unknown> = {
      fallow: {
        enabled: true,
        health: {
          maxCognitive: 35, // More permissive than 20
          maxCyclomatic: 40 // More permissive than 25
        }
      }
    };

    const report = evaluateProjectConfig(process.cwd(), {
      targetSubsystem: 'fallow',
      rawConfigOverride,
      tasks: []
    });

    const cogRec = report.recommendations.find((r) => r.path === 'fallow.health.maxCognitive');
    expect(cogRec).toBeDefined();
    expect(cogRec?.kind).toBe('relaxed_ceiling');
    expect(cogRec?.currentValue).toBe(35);
    expect(cogRec?.recommendedValue).toBe(20);

    const cycRec = report.recommendations.find((r) => r.path === 'fallow.health.maxCyclomatic');
    expect(cycRec).toBeDefined();
    expect(cycRec?.kind).toBe('relaxed_ceiling');
    expect(cycRec?.currentValue).toBe(40);
    expect(cycRec?.recommendedValue).toBe(25);
  });

  it('recommends adding missing canonical linter plugins while preserving custom plugins', () => {
    const rawConfigOverride: Record<string, unknown> = {
      vitePlusConfig: {
        lint: {
          enabled: true,
          typeAware: true,
          typeCheck: true,
          plugins: ['vitest', 'node', 'react'] // Missing promise, unicorn, typescript, vue, import, jsx-a11y
        }
      }
    };

    const report = evaluateProjectConfig(process.cwd(), {
      targetSubsystem: 'vitePlusConfig',
      rawConfigOverride,
      tasks: []
    });

    const pluginRec = report.recommendations.find((r) => r.path === 'vitePlusConfig.lint.plugins');
    expect(pluginRec).toBeDefined();
    expect(pluginRec?.kind).toBe('missing_plugin');

    const recommended = pluginRec?.recommendedValue as readonly string[];
    expect(recommended).toContain('react'); // Custom plugin preserved!
    expect(recommended).toContain('promise');
    expect(recommended).toContain('unicorn');
    expect(recommended).toContain('typescript');
    expect(recommended).toContain('vue');
    expect(recommended).toContain('import');
    expect(recommended).toContain('jsx-a11y');
  });

  it('recognizes complete canonical plugins with custom additions as hardened', () => {
    const rawConfigOverride: Record<string, unknown> = {
      vitePlusConfig: {
        lint: {
          enabled: true,
          typeAware: true,
          typeCheck: true,
          plugins: [
            'vitest',
            'node',
            'promise',
            'unicorn',
            'typescript',
            'vue',
            'import',
            'jsx-a11y',
            'react'
          ]
        }
      }
    };

    const report = evaluateProjectConfig(process.cwd(), {
      targetSubsystem: 'vitePlusConfig',
      rawConfigOverride,
      tasks: []
    });

    const pluginRec = report.recommendations.find((r) => r.path === 'vitePlusConfig.lint.plugins');
    expect(pluginRec).toBeUndefined(); // Zero missing canonical plugins

    const hardened = report.hardenedSettings.find((h) => h.path === 'vitePlusConfig.lint.plugins');
    expect(hardened).toBeDefined();
    expect(hardened?.reason).toContain('additional custom item(s)');
    expect(hardened?.reason).toContain('react');
  });

  it('recommends activating disabled suites and boolean protection flags', () => {
    const rawConfigOverride: Record<string, unknown> = {
      fallow: {
        enabled: false // Suite deactivated!
      },
      vitePlusConfig: {
        lint: {
          enabled: true,
          typeAware: false, // Disabled type awareness
          typeCheck: false,
          plugins: ['vitest', 'node']
        }
      }
    };

    const report = evaluateProjectConfig(process.cwd(), {
      rawConfigOverride,
      tasks: []
    });

    const fallowRec = report.recommendations.find((r) => r.path === 'fallow.enabled');
    expect(fallowRec).toBeDefined();
    expect(fallowRec?.kind).toBe('relaxed_boolean');
    expect(fallowRec?.currentValue).toBe(false);
    expect(fallowRec?.recommendedValue).toBe(true);

    const typeAwareRec = report.recommendations.find(
      (r) => r.path === 'vitePlusConfig.lint.typeAware'
    );
    expect(typeAwareRec).toBeDefined();
    expect(typeAwareRec?.kind).toBe('relaxed_boolean');
    expect(typeAwareRec?.recommendedValue).toBe(true);
  });

  it('recommends configuring discovered subauditors that are missing in audit.config.ts', () => {
    const mockTask = createMockTask('validate_security_gate', 'securityGate', {
      enabled: true,
      maxVulnerabilities: 0
    });

    const rawConfigOverride: Record<string, unknown> = {
      name: 'Test Project'
    };

    const report = evaluateProjectConfig(process.cwd(), {
      rawConfigOverride,
      tasks: [mockTask]
    });

    const secRec = report.recommendations.find((r) => r.path === 'securityGate');
    expect(secRec).toBeDefined();
    expect(secRec?.kind).toBe('missing_section');
    expect(secRec?.recommendedValue).toEqual({
      enabled: true,
      maxVulnerabilities: 0
    });
  });

  it('preserves stricter floors and never recommends lowering them', () => {
    const mockTask = createMockTask('validate_custom_coverage', 'customCoverage', {
      enabled: true,
      threshold: 80 // Default floor 80
    });

    const rawConfigOverride: Record<string, unknown> = {
      customCoverage: {
        enabled: true,
        threshold: 95 // Stricter floor 95 > 80
      }
    };

    const report = evaluateProjectConfig(process.cwd(), {
      rawConfigOverride,
      tasks: [mockTask]
    });

    const threshRec = report.recommendations.find((r) => r.path === 'customCoverage.threshold');
    expect(threshRec).toBeUndefined(); // NEVER recommend lowering!

    const threshHardened = report.hardenedSettings.find(
      (h) => h.path === 'customCoverage.threshold'
    );
    expect(threshHardened).toBeDefined();
    expect(threshHardened?.currentValue).toBe(95);
    expect(threshHardened?.defaultValue).toBe(80);
  });

  it('correctly parses CLI arguments using Citty harness', async () => {
    const { parseCliArgs } = await import('../src/cli/report_config_recommendations.ts');
    const options = parseCliArgs(['--json', '--diff', '--subsystem=fallow', '--project=/tmp/foo']);
    expect(options.json).toBe(true);
    expect(options.diff).toBe(true);
    expect(options.subsystem).toBe('fallow');
    expect(options.project).toBe('/tmp/foo');
  });

  it('executes runConfigAdvisor in json mode cleanly', async () => {
    const { runConfigAdvisor } = await import('../src/cli/report_config_recommendations.ts');
    const logSpy = (msg?: unknown) => void msg;
    const origLog = console.log;
    console.log = logSpy;
    try {
      const report = await runConfigAdvisor(process.cwd(), {
        json: true,
        diff: false,
        apply: false
      });
      expect(report).toBeDefined();
      expect(report.totalChecked).toBeGreaterThan(0);
      expect(Array.isArray(report.recommendations)).toBe(true);
    } finally {
      console.log = origLog;
    }
  });

  it('evaluates project config asynchronously with auto-discovery', async () => {
    const { evaluateProjectConfigAsync } = await import('../src/core/configAdvisor.ts');
    const report = await evaluateProjectConfigAsync(process.cwd(), {
      targetSubsystem: 'fallow'
    });
    expect(report).toBeDefined();
    expect(report.projectRoot).toBe(process.cwd());
    expect(report.totalChecked).toBeGreaterThan(0);
  });
});

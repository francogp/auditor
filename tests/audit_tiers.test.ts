/**
 * tests/audit_tiers.test.ts
 *
 * Verification suite for the Capability-Driven Speed & Phase Architecture:
 * - auditor:lint (speed=light / preset=lint) -> Only speed <= light
 * - auditor (default speed=heavy) -> Excludes phase === 'post-build' and speed === 'full'-only suites
 * - auditor:full (speed=full / preset=full) -> All normal/post-run suites up to speed=full
 * - auditor:post-build (phase=post-build) -> Only capabilities.phase === 'post-build'
 */

import { describe, it, expect, afterEach } from 'vite-plus/test';
import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { BaseAuditor, resolveEffectiveSpeed } from '../src/core/auditorBase.ts';

describe('Capability-Driven Speed & Phase Architecture (auditor:lint, auditor, auditor:full, auditor:post-build)', () => {
  afterEach(() => {
    delete process.env.AUDITOR_SPEED;
    delete process.env.AUDITOR_ONLY_SPEED;
    delete process.env.AUDITOR_PRESET;
    delete process.env.AUDITOR_PHASE;
  });

  it('discovers light and critical suites when speed=light or preset=lint is specified', async () => {
    const tasks = await discoverAuditors({ speed: 'light' });
    const presetTasks = await discoverAuditors({ preset: 'lint' });
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.map((t) => t.id).sort()).toEqual(presetTasks.map((t) => t.id).sort());

    for (const task of tasks) {
      expect(task.id).not.toBe('validate_bundle_budget');
      expect(task.id).not.toBe('validate_package_distribution');
      if (!task.capabilities?.critical) {
        expect(resolveEffectiveSpeed(task.capabilities?.speed, { maxSpeed: 'light' })).toBe(
          'light'
        );
      }
    }

    const taskIds = tasks.map((t) => t.id);
    expect(taskIds).toContain('validate_stylelint');
    expect(taskIds).toContain('validate_fallow');
    expect(taskIds).toContain('validate_oxlint');
    expect(taskIds).toContain('validate_type_check');
    expect(taskIds).toContain('validate_domain_types');
    expect(taskIds).not.toContain('validate_similar_code');
    expect(taskIds).not.toContain('validate_type_coverage');
  });

  it('discovers exclusively critical suites when preset=critical or onlyCritical is specified', async () => {
    const criticalTasks = await discoverAuditors({ preset: 'critical' });
    const onlyCriticalTasks = await discoverAuditors({ onlyCritical: true });
    expect(criticalTasks.length).toBeGreaterThan(0);
    expect(criticalTasks.map((t) => t.id).sort()).toEqual(
      onlyCriticalTasks.map((t) => t.id).sort()
    );

    for (const task of criticalTasks) {
      expect(task.capabilities?.critical).toBe(true);
    }

    const taskIds = criticalTasks.map((t) => t.id);
    expect(taskIds).toContain('validate_oxlint');
    expect(taskIds).toContain('validate_type_check');
    expect(taskIds).toContain('validate_stylelint');
    expect(taskIds).toContain('validate_html_validate');
    expect(taskIds).toContain('validate_domain_types');
    expect(taskIds).not.toContain('validate_similar_code');
    expect(taskIds).not.toContain('validate_type_coverage');
    expect(taskIds).not.toContain('validate_bundle_budget');
  });

  it('excludes post-build suites (capabilities.phase === "post-build") in default general audit', async () => {
    const tasks = await discoverAuditors({});
    expect(tasks.length).toBeGreaterThan(30);

    const taskIds = tasks.map((t) => t.id);
    // Post-build suites must NOT be present in pre-build general audit
    expect(taskIds).not.toContain('validate_bundle_budget');
    expect(taskIds).not.toContain('validate_package_distribution');

    // Source suites (light + heavy) must be present
    expect(taskIds).toContain('validate_oxlint');
    expect(taskIds).toContain('validate_native_paths');
    expect(taskIds).toContain('audit_project');
    expect(taskIds).toContain('validate_similar_code');
  });

  it('includes full-speed suites when speed=full or preset=full is specified', async () => {
    const fullTasks = await discoverAuditors({ speed: 'full' });
    const presetFullTasks = await discoverAuditors({ preset: 'full' });
    expect(fullTasks.map((t) => t.id).sort()).toEqual(presetFullTasks.map((t) => t.id).sort());

    const taskIds = fullTasks.map((t) => t.id);
    expect(taskIds).toContain('validate_fallow');
    expect(taskIds).toContain('validate_oxlint');
    expect(taskIds).toContain('validate_similar_code');
    expect(taskIds).not.toContain('validate_bundle_budget');
  });

  it('filters strictly to exact speed when onlySpeed is specified', async () => {
    const onlyHeavy = await discoverAuditors({ onlySpeed: 'heavy' });
    expect(onlyHeavy.length).toBeGreaterThan(0);
    for (const task of onlyHeavy) {
      expect(resolveEffectiveSpeed(task.capabilities?.speed, { onlySpeed: 'heavy' })).toBe('heavy');
    }
    const heavyIds = onlyHeavy.map((t) => t.id);
    expect(heavyIds).toContain('validate_type_coverage');
    expect(heavyIds).toContain('validate_similar_code');
    expect(heavyIds).not.toContain('validate_stylelint');

    const onlyFull = await discoverAuditors({ onlySpeed: 'full' });
    expect(onlyFull.length).toBeGreaterThan(0);
    for (const task of onlyFull) {
      expect(resolveEffectiveSpeed(task.capabilities?.speed, { onlySpeed: 'full' })).toBe('full');
    }
    expect(onlyFull.map((t) => t.id)).toContain('validate_fallow');
  });

  it('discovers exclusively post-build suites when phase=post-build is specified', async () => {
    const tasks = await discoverAuditors({ phase: 'post-build' });
    expect(tasks.length).toBeGreaterThanOrEqual(2);

    const taskIds = tasks.map((t) => t.id);
    expect(taskIds).toContain('validate_bundle_budget');
    expect(taskIds).toContain('validate_package_distribution');

    // Source suites must NOT be present in post-build phase
    expect(taskIds).not.toContain('validate_oxlint');
    expect(taskIds).not.toContain('validate_stylelint');
    expect(taskIds).not.toContain('validate_native_paths');
    expect(taskIds).not.toContain('audit_project');
    expect(taskIds).not.toContain('validate_similar_code');
  });

  it('allows explicitly auditing a build suite directly via task option', async () => {
    const tasks = await discoverAuditors({ task: 'validate_bundle_budget' });
    expect(tasks.length).toBe(1);
    expect(tasks[0]?.id).toBe('validate_bundle_budget');
  });

  it('includes both source and build suites when withBuild=true is explicitly requested', async () => {
    const tasks = await discoverAuditors({ withBuild: true });
    const taskIds = tasks.map((t) => t.id);
    expect(taskIds).toContain('validate_bundle_budget');
    expect(taskIds).toContain('validate_package_distribution');
    expect(taskIds).toContain('validate_oxlint');
    expect(taskIds).toContain('validate_native_paths');
  });

  it('evaluates getExecutionTier, isFastMode, resolveRuleEffectiveSpeed, and resolveCommandArgs accurately on BaseAuditor', () => {
    class TierTestAuditor extends BaseAuditor<'r-light' | 'r-heavy' | 'r-multi'> {
      constructor() {
        super({
          id: 'test_tier_auditor',
          name: 'Tier Test Auditor',
          description: 'Verifies tier and speed resolution',
          family: 'architecture',
          packageName: 'TierTest',
          icon: '⚡',
          configKey: 'paths',
          defaultConfig: {},
          criticalConfig: {},
          usesThirdPartyTool: false,
          ruleIds: ['r-light', 'r-heavy', 'r-multi'],
          ruleDescriptions: {
            'r-light': 'Light rule',
            'r-heavy': 'Heavy rule',
            'r-multi': 'Multi-speed rule'
          },
          ruleRemediations: {
            'r-light': 'Remediacion light',
            'r-heavy': 'Remediacion heavy',
            'r-multi': 'Remediacion multi'
          },
          coverage: { include: ['src/**/*.ts'] },
          ruleCapabilities: {
            'r-light': {
              speed: 'light',
              phase: 'normal',
              fix: 'none',
              md: false,
              ast: false,
              changedOnly: false,
              critical: false
            },
            'r-heavy': {
              speed: 'heavy',
              phase: 'normal',
              fix: 'none',
              md: false,
              ast: false,
              changedOnly: false,
              critical: false
            },
            'r-multi': {
              speed: ['light', 'full'],
              phase: 'normal',
              fix: 'none',
              md: false,
              ast: false,
              changedOnly: false,
              critical: false
            }
          }
        });
      }
      public override async runAudit(): Promise<void> {}
    }

    // Default (heavy ceiling)
    const defaultAuditor = new TierTestAuditor();
    expect(defaultAuditor.getExecutionTier()).toBe('heavy');
    expect(defaultAuditor.isFastMode()).toBe(false);
    expect(defaultAuditor.resolveRuleEffectiveSpeed('r-light')).toBe('light');
    expect(defaultAuditor.resolveRuleEffectiveSpeed('r-heavy')).toBe('heavy');
    expect(defaultAuditor.resolveRuleEffectiveSpeed('r-multi')).toBe('light');

    // Light ceiling
    process.env.AUDITOR_SPEED = 'light';
    const lightAuditor = new TierTestAuditor();
    expect(lightAuditor.getExecutionTier()).toBe('light');
    expect(lightAuditor.isFastMode()).toBe(true);
    expect(lightAuditor.resolveRuleEffectiveSpeed('r-light')).toBe('light');
    expect(lightAuditor.resolveRuleEffectiveSpeed('r-heavy')).toBeNull();
    expect(lightAuditor.resolveRuleEffectiveSpeed('r-multi')).toBe('light');

    // Full ceiling
    process.env.AUDITOR_SPEED = 'full';
    const fullAuditor = new TierTestAuditor();
    expect(fullAuditor.getExecutionTier()).toBe('full');
    expect(fullAuditor.isFastMode()).toBe(false);
    expect(fullAuditor.resolveRuleEffectiveSpeed('r-multi')).toBe('full');

    // Post-build phase
    delete process.env.AUDITOR_SPEED;
    process.env.AUDITOR_PHASE = 'post-build';
    const postBuildAuditor = new TierTestAuditor();
    expect(postBuildAuditor.getExecutionTier()).toBe('post-build');
  });
});

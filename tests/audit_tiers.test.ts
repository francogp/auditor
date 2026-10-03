/**
 * tests/audit_tiers.test.ts
 *
 * Verification suite for the Three-Tier Capability-Driven Architecture:
 * - audit:lint (preset=lint) -> Only capabilities.lint === true
 * - audit (default general) -> Excludes capabilities.requiresBuild === true
 * - audit:build (preset=build) -> Only capabilities.requiresBuild === true
 */

import { describe, it, expect } from 'vitest';
import { discoverAuditors } from '../src/cli/auditScanner.ts';

describe('Three-Tier Capability-Driven Architecture (audit:lint, audit, audit:build)', () => {
  it('discovers only fast lint suites when preset=lint is specified', async () => {
    const tasks = await discoverAuditors({ preset: 'lint' });
    expect(tasks.length).toBeGreaterThan(0);

    for (const task of tasks) {
      expect(task.id).not.toBe('validate_bundle_budget');
      expect(task.id).not.toBe('validate_package_distribution');
    }

    const taskIds = tasks.map(t => t.id);
    expect(taskIds).toContain('validate_eslint');
    expect(taskIds).toContain('validate_stylelint');
    expect(taskIds).toContain('validate_type_check');
  });

  it('excludes post-build suites (capabilities.requiresBuild === true) in default general audit', async () => {
    const tasks = await discoverAuditors({});
    expect(tasks.length).toBeGreaterThan(30);

    const taskIds = tasks.map(t => t.id);
    // Post-build suites must NOT be present in pre-build general audit
    expect(taskIds).not.toContain('validate_bundle_budget');
    expect(taskIds).not.toContain('validate_package_distribution');

    // Source suites must be present
    expect(taskIds).toContain('validate_eslint');
    expect(taskIds).toContain('validate_native_paths');
    expect(taskIds).toContain('audit_project');
    expect(taskIds).toContain('validate_similar_code');
  });

  it('discovers exclusively post-build suites when preset=build is specified', async () => {
    const tasks = await discoverAuditors({ preset: 'build' });
    expect(tasks.length).toBeGreaterThanOrEqual(2);

    const taskIds = tasks.map(t => t.id);
    expect(taskIds).toContain('validate_bundle_budget');
    expect(taskIds).toContain('validate_package_distribution');

    // Source suites must NOT be present in build preset
    expect(taskIds).not.toContain('validate_eslint');
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
    const taskIds = tasks.map(t => t.id);
    expect(taskIds).toContain('validate_bundle_budget');
    expect(taskIds).toContain('validate_package_distribution');
    expect(taskIds).toContain('validate_eslint');
    expect(taskIds).toContain('validate_native_paths');
  });
});

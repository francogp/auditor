/**
 * tests/auditor_capabilities.test.ts
 *
 * SUB-AUDITOR CAPABILITIES & DYNAMIC MODES SPECIFICATION
 *
 * Verifies that:
 * 1. 100% of sub-auditors declare mandatory 6-field AuditorRuleCapabilities.
 * 2. Discovery with fixOnly: true filters strictly to the auto-repair suites.
 * 3. Speed ceiling (speed: 'light' / includeHeavy: false) excludes computationally heavy suites.
 * 4. AST requirements are derived dynamically from capabilities.ast (0 hardcoded suite lists).
 */

import { describe, it, expect } from 'vitest';
import { discoverAuditors, extractCapabilitiesFromFile, extractAuditorMetadataFromFile } from '../src/cli/auditScanner.ts';
import { resolveEffectiveSpeed } from '../src/core/auditorBase.ts';
import path from 'node:path';

describe('Sub-Auditor Capabilities & Dynamic Modes', () => {
  it('extracts capabilities dynamically from sub-auditor files', async () => {
    const stylelintPath = path.resolve('src/suites/architecture/validate_stylelint.ts');
    const stylelintCaps = await extractCapabilitiesFromFile(stylelintPath);
    expect(stylelintCaps).not.toBeNull();
    expect(stylelintCaps?.fix).toBe('normal');
    expect(stylelintCaps?.ast).toBe(false);
    expect(stylelintCaps?.speed).toBe('light');

    const similarCodePath = path.resolve('src/suites/architecture/validate_similar_code.ts');
    const similarCaps = await extractCapabilitiesFromFile(similarCodePath);
    expect(similarCaps).not.toBeNull();
    expect(similarCaps?.fix).toBe('normal');
    expect(similarCaps?.speed).toBe('heavy');

    const piniaPath = path.resolve('src/suites/architecture/validate_pinia_reactivity.ts');
    const piniaCaps = await extractCapabilitiesFromFile(piniaPath);
    expect(piniaCaps).not.toBeNull();
    expect(piniaCaps?.ast).toBe(true);
  });

  it('populates 6-field capabilities on 100% of discovered tasks', async () => {
    const allTasks = await discoverAuditors();
    expect(allTasks.length).toBeGreaterThanOrEqual(38);

    for (const task of allTasks) {
      expect(task.capabilities, `Task '${task.id}' missing capabilities`).toBeDefined();
      const speed = task.capabilities?.speed;
      expect(typeof speed === 'string' || Array.isArray(speed)).toBe(true);
      expect(['normal', 'post-run', 'post-build']).toContain(task.capabilities?.phase);
      expect(['none', 'normal', 'priority']).toContain(task.capabilities?.fix);
      expect(typeof task.capabilities?.md).toBe('boolean');
      expect(typeof task.capabilities?.ast).toBe('boolean');
      expect(typeof task.capabilities?.changedSince).toBe('boolean');
    }
  });

  it('filters to full-speed ceiling suites when speed: full or preset: full', async () => {
    const fullTasks = await discoverAuditors({ speed: 'full' });
    const presetFullTasks = await discoverAuditors({ preset: 'full' });

    expect(fullTasks.length).toBeGreaterThan(0);
    expect(fullTasks.map(t => t.id).sort()).toEqual(presetFullTasks.map(t => t.id).sort());

    for (const task of fullTasks) {
      expect(
        resolveEffectiveSpeed(task.capabilities?.speed, { maxSpeed: 'full' }),
        `Suite ${task.id} should resolve a valid speed under full ceiling`
      ).not.toBeNull();
    }

    const fullIds = fullTasks.map(t => t.id);
    expect(fullIds).toContain('validate_test_coverage');
    expect(fullIds).toContain('validate_similar_code');
    expect(fullIds).not.toContain('validate_bundle_budget');
  });

  it('filters strictly to light-capable suites when speed: light, lintOnly: true or preset: lint', async () => {
    const lintTasks = await discoverAuditors({ lintOnly: true });
    const presetLintTasks = await discoverAuditors({ preset: 'lint' });
    const speedLightTasks = await discoverAuditors({ speed: 'light' });

    expect(lintTasks.length).toBeGreaterThan(0);
    expect(lintTasks.map(t => t.id).sort()).toEqual(presetLintTasks.map(t => t.id).sort());
    expect(lintTasks.map(t => t.id).sort()).toEqual(speedLightTasks.map(t => t.id).sort());

    for (const task of lintTasks) {
      expect(
        resolveEffectiveSpeed(task.capabilities?.speed, { maxSpeed: 'light' }),
        `Suite ${task.id} should have light speed capability`
      ).toBe('light');
    }
  });

  it('filters strictly to md-capable suites when mdOnly: true or preset: md', async () => {
    const mdTasks = await discoverAuditors({ mdOnly: true });
    const presetMdTasks = await discoverAuditors({ preset: 'md' });

    expect(mdTasks.length).toBeGreaterThan(0);
    expect(mdTasks.map(t => t.id).sort()).toEqual(presetMdTasks.map(t => t.id).sort());

    for (const task of mdTasks) {
      expect(task.capabilities?.md, `Suite ${task.id} should have md capability`).toBe(true);
    }
  });

  it('filters strictly to the fix-capable suites when fixOnly: true', async () => {
    const fixTasks = await discoverAuditors({ fixOnly: true });
    const fixSuiteIds = fixTasks.map(t => t.id).sort();

    const EXPECTED_FIX_SUITES = [
      'audit_project',
      'validate_accessibility',
      'validate_agent_plugin',
      'validate_agents_config_mandate',
      'validate_audit_config',
      'validate_component_styles',
      'validate_documentation_language',
      'validate_eslint',
      'validate_eslint_config',
      'validate_fallow_config',
      'validate_git_config',
      'validate_html_validate',
      'validate_markdown_lint',
      'validate_mermaid_syntax',
      'validate_package_hygiene',
      'validate_package_scripts',
      'validate_script_extensions',
      'validate_similar_code',
      'validate_stylelint',
      'validate_stylelint_config',
      'validate_z_index'
    ].sort();

    expect(fixSuiteIds).toEqual(EXPECTED_FIX_SUITES);
    for (const task of fixTasks) {
      expect(task.capabilities?.fix).not.toBe('none');
    }
  });

  it('dynamically resolves requiresAst from capabilities.ast (0 hardcoded lists)', async () => {
    const allTasks = await discoverAuditors({ withBuild: true });
    const astTasks = allTasks.filter(t => t.requiresAst);
    const astSuiteIds = astTasks.map(t => t.id).sort();

    const EXPECTED_AST_SUITES = [
      'audit_project',
      'validate_bundle_budget',
      'validate_code_simplification',
      'validate_constant_hygiene',
      'validate_magic_numbers',
      'validate_pinia_reactivity',
      'validate_reactive_leaks',
      'validate_valibot_parity'
    ].sort();

    expect(astSuiteIds).toEqual(EXPECTED_AST_SUITES);
    for (const task of astTasks) {
      expect(task.capabilities?.ast).toBe(true);
    }
  });

  it('excludes heavy-only suites when includeHeavy: false or speed: light', async () => {
    const normalTasks = await discoverAuditors();
    const lightweightTasks = await discoverAuditors({ includeHeavy: false });

    const heavyOnlyIds = normalTasks
      .filter(t => resolveEffectiveSpeed(t.capabilities?.speed, { maxSpeed: 'light' }) === null)
      .map(t => t.id);
    expect(heavyOnlyIds).toContain('validate_similar_code');
    expect(heavyOnlyIds).toContain('validate_type_check');

    const lightweightIds = lightweightTasks.map(t => t.id);
    for (const heavyId of heavyOnlyIds) {
      expect(lightweightIds).not.toContain(heavyId);
    }
  });

  it('separates pre-build and post-build suites cleanly via withBuild, buildOnly, and phase: post-build', async () => {
    const defaultTasks = await discoverAuditors({ withBuild: false });
    const buildTasks = await discoverAuditors({ phase: 'post-build' });
    const allTasks = await discoverAuditors({ withBuild: true });

    // Pre-build tasks must never include post-build phase suites
    for (const task of defaultTasks) {
      expect(task.capabilities?.phase, `Suite ${task.id} should not be post-build in pre-build audit`).not.toBe('post-build');
    }

    // Post-build tasks must strictly have phase === 'post-build'
    expect(buildTasks.length).toBeGreaterThan(0);
    for (const task of buildTasks) {
      expect(task.capabilities?.phase, `Suite ${task.id} must have phase: post-build`).toBe('post-build');
    }

    // withBuild includes the union of both
    expect(allTasks.length).toBe(defaultTasks.length + buildTasks.length);
  });

  it('safely extracts metadata using self-import guard when scanning the currently executing script', async () => {
    const originalArgv = [...process.argv];
    const testAuditorPath = path.resolve('src/suites/architecture/validate_auditor_tests.ts');
    process.argv[1] = testAuditorPath;

    try {
      const meta = await extractAuditorMetadataFromFile(testAuditorPath);
      expect(meta).toBeDefined();
      expect(meta.capabilities).toBeDefined();
      expect(meta.icon).toBe('🧪');
    } finally {
      process.argv = originalArgv;
    }
  });
});

/**
 * tests/core_refactored_modules.test.ts
 *
 * Dedicated unit tests for modularized core components:
 * - auditConfigLayout.ts
 * - auditConfigSubsystems.ts
 * - satelliteGlobMatcher.ts
 * - streamingFormat.ts
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, vi } from 'vite-plus/test';

import { checkInfrastructureSubsystems as checkInfraDirect } from '../src/core/auditConfigInfra.ts';
import {
  assertNoLegacyRootConfig,
  isConfigRuleDisabled,
  AUDITOR_DIR,
  AUDIT_CONFIG_FILE,
  LEGACY_ROOT_CONFIG_FILES
} from '../src/core/auditConfigLayout.ts';
import {
  checkInfrastructureSubsystems,
  checkUiSubsystems
} from '../src/core/auditConfigSubsystems.ts';
import { type AuditEngineConfig, type DeepPartial } from '../src/core/auditConfigTypes.ts';
import { checkUiSubsystems as checkUiDirect } from '../src/core/auditConfigUi.ts';
import {
  isPatternContainedInGlobs as isPatternContainedDirect,
  stripGlobSuffix as stripGlobSuffixDirect
} from '../src/core/globContainment.ts';
import {
  stripGlobSuffix,
  isPatternContainedInGlobs,
  getAllowedSatellitePathExcludes,
  validateSatelliteUndeclaredEntries,
  type SatelliteGlobMatcherContext
} from '../src/core/satelliteGlobMatcher.ts';
import {
  formatFindingCountBadge,
  isSubAuditorFailed,
  isSubAuditorWarning,
  resolveEffectiveErrorsCount,
  resolveEffectiveWarningsCount,
  classifyExecutionSeverity,
  colorizeStreamSubLine
} from '../src/core/streamingFormat.ts';
import { TaskStreamCoordinator } from '../src/core/taskStreamCoordinator.ts';

describe('auditConfigLayout', () => {
  it('identifies disabled configuration rule values', () => {
    expect(isConfigRuleDisabled(false)).toBe(true);
    expect(isConfigRuleDisabled('off')).toBe(true);
    expect(isConfigRuleDisabled(0)).toBe(true);
    expect(isConfigRuleDisabled(['off', { option: 1 }])).toBe(true);
    expect(isConfigRuleDisabled([false])).toBe(true);
    expect(isConfigRuleDisabled([0])).toBe(true);

    expect(isConfigRuleDisabled(true)).toBe(false);
    expect(isConfigRuleDisabled('error')).toBe(false);
    expect(isConfigRuleDisabled('warn')).toBe(false);
    expect(isConfigRuleDisabled(1)).toBe(false);
    expect(isConfigRuleDisabled(2)).toBe(false);
    expect(isConfigRuleDisabled(['error'])).toBe(false);
    expect(isConfigRuleDisabled([])).toBe(false);
    expect(isConfigRuleDisabled(null)).toBe(false);
  });

  it('asserts no legacy root config files exist', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-layout-test-'));
    try {
      expect(() => assertNoLegacyRootConfig(tmpDir)).not.toThrow();

      fs.writeFileSync(path.join(tmpDir, 'audit.config.ts'), 'export default {}');
      expect(() => assertNoLegacyRootConfig(tmpDir)).toThrow(
        /Root-level audit\.config\.ts is no longer supported/
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('exports canonical layout constants', () => {
    expect(AUDITOR_DIR).toBe('.auditor');
    expect(AUDIT_CONFIG_FILE).toContain('.auditor');
    expect(LEGACY_ROOT_CONFIG_FILES.length).toBeGreaterThan(0);
  });
});

describe('auditConfigSubsystems', () => {
  it('detects missing infrastructure subsystems', () => {
    const missing = checkInfrastructureSubsystems({} as AuditEngineConfig);
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.some((m) => m.includes('persistence'))).toBe(true);
    expect(missing.some((m) => m.includes('bundle'))).toBe(true);
    expect(missing.some((m) => m.includes('packageDistribution'))).toBe(true);
  });

  it('detects missing UI subsystems and invalid priorities', () => {
    const missing = checkUiSubsystems({
      fallow: { maxTargetPriority: 'invalid' as unknown as number },
      runner: { maxStalenessMinutes: -5 }
    } as unknown as AuditEngineConfig);
    expect(missing.some((m) => m.includes('styles'))).toBe(true);
    expect(missing.some((m) => m.includes('templates'))).toBe(true);
    expect(missing.some((m) => m.includes('agentPlugin'))).toBe(true);
    expect(missing.some((m) => m.includes('fallow'))).toBe(true);
    expect(missing.some((m) => m.includes('runner'))).toBe(true);
  });

  it('accepts valid subsystem configurations', () => {
    const validConfig: DeepPartial<AuditEngineConfig> = {
      persistence: { enabled: true, engine: 'supabase', schemaQualified: false },
      bundle: { enabled: true },
      testCoverage: { enabled: true, enforceInAudit: true },
      packageDistribution: { enabled: true, level: 'suggestion' },
      packageScripts: { enabled: true, recommendedScripts: true, enforceBuildAudit: true },
      scriptExtensions: { enabled: true, enforceTypeScript: true },
      styles: { enabled: true, zLayersEnabled: true },
      templates: { enabled: true, requireInputIds: true },
      agentPlugin: { enabled: true },
      fallow: { enabled: true, maxTargetPriority: 25 },
      runner: { enabled: true, maxStalenessMinutes: 60 }
    };
    const infraMissing = checkInfrastructureSubsystems(validConfig as AuditEngineConfig);
    const uiMissing = checkUiSubsystems(validConfig as AuditEngineConfig);
    expect(infraMissing).toEqual([]);
    expect(uiMissing).toEqual([]);

    expect(checkInfraDirect(validConfig as AuditEngineConfig)).toEqual([]);
    expect(checkUiDirect(validConfig as AuditEngineConfig)).toEqual([]);
  });
});

describe('satelliteGlobMatcher', () => {
  it('strips glob suffix wildcards properly', () => {
    expect(stripGlobSuffix('src/**/*.ts')).toBe('src');
    expect(stripGlobSuffix('dist/*')).toBe('dist');
    expect(stripGlobSuffix('scratch/')).toBe('scratch');
    expect(stripGlobSuffix('**/*')).toBe('.');
    expect(stripGlobSuffix('')).toBe('');
  });

  it('evaluates pattern containment using SatelliteGlobMatcherContext object', () => {
    const context: SatelliteGlobMatcherContext = {
      allowedGlobs: new Set(['src/**', 'dist']),
      effectiveGlobs: ['scratch/**']
    };

    expect(isPatternContainedInGlobs('src/core', context)).toBe(true);
    expect(isPatternContainedInGlobs('dist', context)).toBe(true);
    expect(isPatternContainedInGlobs('scratch/cache', context)).toBe(true);
    expect(isPatternContainedInGlobs('secret/keys', context)).toBe(false);

    const undeclared: string[] = [];
    validateSatelliteUndeclaredEntries(['src/a', 'unknown/dir'], context, (entry) => {
      undeclared.push(entry);
    });
    expect(undeclared).toEqual(['unknown/dir']);
  });

  it('validates undeclared satellite entries and triggers callback', () => {
    const allowed = new Set(['src/**']);
    const undeclared: string[] = [];
    validateSatelliteUndeclaredEntries(['src/a', 'unknown/dir'], allowed, [], (entry) => {
      undeclared.push(entry);
    });
    expect(undeclared).toEqual(['unknown/dir']);
  });

  it('extracts allowed satellite path excludes from audit config', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-satellite-test-'));
    try {
      const config = {
        paths: {
          codeRoots: ['src'],
          ignoreGlobs: ['scratch/**']
        }
      } as unknown as AuditEngineConfig;
      const excludes = getAllowedSatellitePathExcludes(config, tmpDir);
      expect(excludes.size).toBeGreaterThan(0);
      expect(excludes.has('scratch/**')).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('streamingFormat', () => {
  it('formats finding count badges cleanly', () => {
    expect(formatFindingCountBadge(0, 0)).toBe('');
    expect(formatFindingCountBadge(1, 0)).toBe(' (1 error)');
    expect(formatFindingCountBadge(3, 0)).toBe(' (3 errors)');
    expect(formatFindingCountBadge(0, 1)).toBe(' (1 warning)');
    expect(formatFindingCountBadge(0, 2)).toBe(' (2 warnings)');
    expect(formatFindingCountBadge(2, 4)).toBe(' (2 errors, 4 warnings)');
  });

  it('classifies sub auditor severity targets', () => {
    expect(isSubAuditorFailed({ errorsCount: 1 })).toBe(true);
    expect(isSubAuditorFailed({ status: 'failed' })).toBe(true);
    expect(isSubAuditorFailed({ status: 'passed', errorsCount: 0 })).toBe(false);

    expect(isSubAuditorWarning({ warningsCount: 2 })).toBe(true);
    expect(isSubAuditorWarning({ status: 'warning' })).toBe(true);
    expect(isSubAuditorWarning({ status: 'passed', warningsCount: 0 })).toBe(false);

    expect(resolveEffectiveErrorsCount({ errorsCount: 5 }, 1)).toBe(5);
    expect(resolveEffectiveErrorsCount({ status: 'failed' }, 2)).toBe(2);
    expect(resolveEffectiveErrorsCount({ status: 'passed' }, 2)).toBe(0);

    expect(resolveEffectiveWarningsCount({ warningsCount: 3 }, 1)).toBe(3);
    expect(resolveEffectiveWarningsCount({ status: 'warning' }, 4)).toBe(4);
    expect(resolveEffectiveWarningsCount({ status: 'passed' }, 4)).toBe(0);
  });

  it('classifies execution severity and colorizes lines', () => {
    const errVerdict = classifyExecutionSeverity({ isSuccess: false, errorsCount: 2 });
    expect(errVerdict.isError).toBe(true);
    expect(errVerdict.isWarning).toBe(false);

    const warnVerdict = classifyExecutionSeverity({ isSuccess: true, warningsCount: 1 });
    expect(warnVerdict.isError).toBe(false);
    expect(warnVerdict.isWarning).toBe(true);

    const coloredErr = colorizeStreamSubLine('some line', { isSuccess: false, errorsCount: 1 });
    expect(coloredErr).toContain('some line');

    const coloredWarn = colorizeStreamSubLine('warning line', {
      isSuccess: true,
      warningsCount: 1
    });
    expect(coloredWarn).toContain('warning line');
  });

  it('coordinates streaming tasks in human and compact modes', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const coordinator = new TaskStreamCoordinator(2, { mode: 'compact' });
      await coordinator.onTaskComplete({
        taskName: 'Task A',
        taskId: 'task_a',
        subLines: [],
        durationMs: 100,
        isSuccess: true
      });
      // Compact mode skips successful tasks with 0 findings
      expect(consoleSpy).not.toHaveBeenCalled();

      await coordinator.onTaskComplete({
        taskName: 'Task B',
        taskId: 'task_b',
        subLines: ['Subline 1'],
        durationMs: 150,
        isSuccess: false,
        errorsCount: 1
      });
      expect(consoleSpy).toHaveBeenCalled();

      // Human mode test
      const humanCoordinator = new TaskStreamCoordinator(1, { mode: 'human' });
      await humanCoordinator.onTaskComplete({
        taskName: 'Task C',
        taskId: 'task_c',
        subLines: ['[01/01] Step 1'],
        durationMs: 50,
        isSuccess: true,
        warningsCount: 1
      });
      expect(consoleSpy).toHaveBeenCalled();
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it('verifies globContainment functions directly', () => {
    expect(stripGlobSuffixDirect('foo/**/*.ts')).toBe('foo');
    const ctx = { allowedGlobs: new Set(['src/**']), effectiveGlobs: ['dist/**'] };
    expect(isPatternContainedDirect('src/index.ts', ctx)).toBe(true);
    expect(isPatternContainedDirect('dist/bundle.js', ctx)).toBe(true);
    expect(isPatternContainedDirect('unknown/file.ts', ctx)).toBe(false);
  });
});

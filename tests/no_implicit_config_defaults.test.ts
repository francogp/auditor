/**
 * tests/no_implicit_config_defaults.test.ts
 *
 * Permanent architectural guardrails ensuring:
 * 1. Zero implicit runtime fallback literals in config consumers (e.g. `?? ['src/data']`).
 * 2. 100% of DEFAULT_AUDIT_CONFIG sections and active properties are enforced by `collectMissingSections`.
 * 3. `ValidateAuditConfigAuditor.fix()` materializes all active defaults + disk-aware `paths.*Roots`
 *    into `.auditor/audit.config.ts`, converging to zero missing sections on re-audit.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { resetAuditConfig } from '../src/core/auditConfig.ts';
import {
  DEFAULT_AUDIT_CONFIG,
  DEFAULT_AUDIT_PATHS_CONFIG,
  isConfigurableSectionEntry
} from '../src/core/auditConfigDefaults.ts';
import { toPosixPath } from '../src/core/safePath.ts';
import {
  ValidateAuditConfigAuditor,
  collectMissingSections,
  PATH_ROOT_KEYS
} from '../src/suites/architecture/validate_audit_config.ts';

const SRC_ROOT = path.resolve(import.meta.dirname, '../src');
const EXEMPT_DEFAULT_FILES = new Set([
  'src/core/auditConfigDefaults.ts',
  'src/core/auditConfigBuilders.ts',
  'src/core/auditConfigLoader.ts'
]);

function collectTsFilesNative(dir: string): string[] {
  const entries = fs.readdirSync(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter(
      (entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')
    )
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function collectActiveDefaultPaths(prefix: string, obj: Record<string, unknown>): string[] {
  const paths: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'object' && v !== null && !Array.isArray(v) && Object.keys(v).length === 0) {
      continue;
    }
    paths.push(`${prefix}.${k}`);
  }
  return paths;
}

describe('No Implicit Config Defaults Guardrails', () => {
  let tempDir: string;

  beforeEach(() => {
    resetAuditConfig();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-implicit-defaults-'));
  });

  afterEach(() => {
    resetAuditConfig();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('Invariant 1: zero runtime consumer files contain `?? DEFAULT_AUDIT_CONFIG.paths` or hardcoded config array fallbacks', () => {
    const targetDirs = ['core', 'suites', 'analyzers'].map((d) => path.join(SRC_ROOT, d));
    const files = targetDirs.flatMap((d) => collectTsFilesNative(d));
    const violations: string[] = [];

    for (const file of files) {
      const rel = toPosixPath(path.relative(path.resolve(SRC_ROOT, '..'), file));
      if (EXEMPT_DEFAULT_FILES.has(rel)) continue;

      const codeWithoutLineComments = fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('//'))
        .join('\n');

      if (/(?:\?\?|\|\|)\s*DEFAULT_AUDIT_CONFIG\.paths\b/.test(codeWithoutLineComments)) {
        violations.push(`${rel}: forbidden fallback to DEFAULT_AUDIT_CONFIG.paths`);
      }
      if (
        /(?:config|cfg|auditConfig|auditCfg)\??\.\w+(?:\??\.\w+)*\s*(?:\?\?|\|\|)\s*\[['"`]/.test(
          codeWithoutLineComments
        )
      ) {
        violations.push(`${rel}: forbidden hardcoded array fallback on config property`);
      }
    }

    expect(violations).toEqual([]);
  });

  it('Invariant 2: 100% of DEFAULT_AUDIT_CONFIG sections and active properties are enforced by collectMissingSections', async () => {
    const tasks = await discoverAuditors({
      projectRoot: path.resolve(SRC_ROOT, '..'),
      withBuild: true,
      speed: 'full'
    });

    const missing = collectMissingSections(tasks, {
      name: 'Bare App',
      paths: { enabled: true, srcRoots: ['src'] }
    });

    for (const [section, val] of Object.entries(DEFAULT_AUDIT_CONFIG)) {
      if (!isConfigurableSectionEntry(section, val)) continue;
      expect(missing.has(section), `Expected section '${section}' to be enforced`).toBe(true);

      if (section === 'paths') continue;
      const expectedPaths = collectActiveDefaultPaths(section, val);
      const detectedPaths = missing.get(section)?.missingPaths ?? [];
      for (const expectedPath of expectedPaths) {
        expect(
          detectedPaths,
          `Expected '${expectedPath}' to be detected when '${section}' is omitted`
        ).toContain(expectedPath);
      }
    }

    const missingPaths = missing.get('paths')?.missingPaths ?? [];
    for (const pathKey of Object.keys(DEFAULT_AUDIT_PATHS_CONFIG)) {
      if (pathKey === 'enabled' || pathKey === 'srcRoots') continue;
      expect(
        missingPaths,
        `Expected paths.${pathKey} to be detected when omitted from audit.config.ts`
      ).toContain(`paths.${pathKey}`);
    }
  });

  it('Invariant 3: ValidateAuditConfigAuditor.fix() materializes disk-aware paths and all active sections cleanly', async () => {
    fs.mkdirSync(path.join(tempDir, '.auditor'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'src/cli'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'src/data'), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'roundtrip-app', type: 'module' }, null, 2),
      'utf8'
    );

    const auditConfigModule = toPosixPath(path.resolve(SRC_ROOT, 'core/auditConfig.ts'));
    fs.writeFileSync(
      path.join(tempDir, '.auditor/audit.config.ts'),
      `import { defineAuditConfig } from '${auditConfigModule}';\n\nexport default defineAuditConfig({\n  name: 'RoundTrip App',\n  paths: {\n    srcRoots: ['src']\n  }\n});\n`,
      'utf8'
    );

    const fixAuditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    await fixAuditor.fix();

    const materialized = fs.readFileSync(path.join(tempDir, '.auditor/audit.config.ts'), 'utf8');
    expect(materialized).toContain("cliRoots: ['src/cli']");
    expect(materialized).toContain("dataRoots: ['src/data']");
    expect(materialized).toContain('demoRoots: []');
    expect(materialized).toContain('ratchet:');
    expect(materialized).toContain('runner:');
    expect(materialized).toContain('valibot:');
    expect(materialized).toContain('security:');

    // Every PATH_ROOT_KEYS entry must be explicitly present on disk
    for (const rootKey of PATH_ROOT_KEYS) {
      expect(materialized).toContain(`${rootKey}:`);
    }

    resetAuditConfig();
    const verifyAuditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    const verifyResult = await verifyAuditor.audit();
    const missingFindings = verifyResult.findings.filter(
      (f) => f.ruleId === 'audit-config-missing-section' || f.ruleId === 'audit-config-missing-path'
    );
    expect(missingFindings).toEqual([]);
  });
});

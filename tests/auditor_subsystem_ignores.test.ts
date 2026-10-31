/**
 * tests/auditor_subsystem_ignores.test.ts
 *
 * TDD Test Suite verifying:
 * - Subsystem ignoreGlobs, exemptPaths, and exemptFiles loading from dotted configKey ('htmlValidate.enabled', etc.)
 * - Universal elevation of exemptPaths and extraIgnorePatterns to BaseAuditor
 * - isPathScannable respecting both subauditor ignores and exemptions
 * - BaseAuditor.addViolation and importAuditFindings automatically dropping findings in ignored/exempt paths
 * - isPathExempt strict path/segment containment (no substring false matches)
 * - getEffectiveIgnoreDirs respecting target projectRoot
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { resetAuditConfig } from '../src/core/auditConfigLoader.ts';
import { BaseAuditor } from '../src/core/auditorBase.ts';
import { getEffectiveIgnoreDirs } from '../src/core/canonicalIgnoreRegistry.ts';
import { isPathExempt } from '../src/core/reportUtils.ts';

describe('Subsystem Ignores & Exemptions (Polymorphic BaseAuditor)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-subsystem-test-'));
    const auditorDir = path.join(tempDir, '.auditor');
    await fs.mkdir(auditorDir, { recursive: true });

    const configObj = {
      name: 'Test Project',
      paths: {
        srcRoots: ['src'],
        testRoots: ['tests'],
        e2eRoots: ['e2e'],
        integrationRoots: ['integration'],
        scriptsRoots: ['scripts'],
        codeRoots: ['src'],
        migrationsDir: 'migrations',
        dataRoots: ['src/data'],
        ignoreGlobs: ['src/global-ignored/**'],
        ignoredDirs: ['global-dir-ignored']
      },
      persistence: {
        enabled: true,
        engine: 'sqlite',
        schemaQualified: false
      },
      domain: {
        enabled: true
      },
      htmlValidate: {
        enabled: true,
        ignoreGlobs: ['src/legacy-html/**'],
        exemptPaths: ['src/vendor-templates'],
        exemptFiles: ['src/exempt-template.html']
      },
      oxlint: {
        enabled: true,
        ignoreGlobs: ['src/generated-code/**']
      }
    };
    await fs.writeFile(
      path.join(auditorDir, 'audit.config.json'),
      JSON.stringify(configObj, null, 2),
      'utf-8'
    );

    // Create fixture files
    await fs.mkdir(path.join(tempDir, 'src/legacy-html'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'src/vendor-templates'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'src/generated-code'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'src/active'), { recursive: true });

    await fs.writeFile(
      path.join(tempDir, 'src/legacy-html/bad.html'),
      '<div><span></div>',
      'utf-8'
    );
    await fs.writeFile(path.join(tempDir, 'src/vendor-templates/vendor.html'), '<div>', 'utf-8');
    await fs.writeFile(path.join(tempDir, 'src/exempt-template.html'), '<div>', 'utf-8');
    await fs.writeFile(
      path.join(tempDir, 'src/generated-code/gen.ts'),
      'export const a = 1;',
      'utf-8'
    );
    await fs.writeFile(path.join(tempDir, 'src/active/valid.ts'), 'export const b = 2;', 'utf-8');
  });

  afterEach(async () => {
    resetAuditConfig();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  class DottedKeyAuditor extends BaseAuditor<'html-rule'> {
    constructor(root: string) {
      super({
        id: 'validate_html_test',
        name: 'HTML Validate Test',
        description: 'Test subauditor with dotted configKey',
        family: 'architecture',
        packageName: 'Test',
        icon: '🌐',
        configKey: 'htmlValidate.enabled',
        defaultConfig: { enabled: true },
        requiredPermissions: [],
        criticalConfig: {},
        usesThirdPartyTool: false,
        ruleFixers: {},
        ruleIds: ['html-rule'],
        ruleCapabilities: {
          'html-rule': {
            speed: 'light',
            phase: 'normal',
            md: false,
            ast: false,
            changedOnly: false,
            critical: false
          }
        },
        ruleDescriptions: {
          'html-rule': 'Regla HTML'
        },
        ruleRemediations: {
          'html-rule': 'Guía HTML'
        },
        ruleRemediationPhases: {
          'html-rule': 'hygiene'
        },
        coverage: { include: ['src/**/*.html'] },
        roots: ['src'],
        allowedExtensions: new Set(['.html', '.ts']),
        projectRoot: root
      });
    }

    public override runAudit(): void {}
  }

  it('resolves subsystem ignoreGlobs and exemptPaths from dotted configKey', () => {
    const auditor = new DottedKeyAuditor(tempDir);

    expect(auditor.extraIgnorePatterns).toContain('src/legacy-html/**');
    expect(auditor.exemptPaths).toContain('src/vendor-templates');
    expect(auditor.exemptPaths).toContain('src/exempt-template.html');
  });

  it('evaluates isPathScannable as false for subsystem ignores and exemptions', () => {
    const auditor = new DottedKeyAuditor(tempDir);

    expect(auditor.isPathScannable('src/legacy-html/bad.html')).toBe(false);
    expect(auditor.isPathScannable('src/vendor-templates/vendor.html')).toBe(false);
    expect(auditor.isPathScannable('src/exempt-template.html')).toBe(false);
    expect(auditor.isPathScannable('src/active/valid.ts')).toBe(true);
  });

  it('addViolation automatically suppresses violations for ignored or exempt files', () => {
    const auditor = new DottedKeyAuditor(tempDir);

    // Violation in ignored path
    auditor.addViolation({
      ruleId: 'html-rule',
      severity: 'error',
      file: 'src/legacy-html/bad.html',
      message: 'Syntax error'
    });

    // Violation in exempt path
    auditor.addViolation({
      ruleId: 'html-rule',
      severity: 'error',
      file: 'src/vendor-templates/vendor.html',
      message: 'Syntax error'
    });

    // Violation in exempt file
    auditor.addViolation({
      ruleId: 'html-rule',
      severity: 'error',
      file: 'src/exempt-template.html',
      message: 'Syntax error'
    });

    expect(auditor.getCountsByRule().get('html-rule') ?? 0).toBe(0);
    expect(auditor.getErrorsByRule().get('html-rule') ?? 0).toBe(0);

    // Violation in active path
    auditor.addViolation({
      ruleId: 'html-rule',
      severity: 'error',
      file: 'src/active/valid.ts',
      message: 'Syntax error'
    });

    expect(auditor.getCountsByRule().get('html-rule')).toBe(1);
    expect(auditor.getErrorsByRule().get('html-rule')).toBe(1);
  });

  it('importAuditFindings automatically suppresses findings in ignored or exempt paths', () => {
    const auditor = new DottedKeyAuditor(tempDir);

    auditor.importAuditFindings(
      [
        {
          suiteId: 'validate_html_test',
          ruleId: 'html-rule',
          severity: 'error',
          file: 'src/legacy-html/bad.html',
          line: 1,
          message: 'Ignored finding'
        },
        {
          suiteId: 'validate_html_test',
          ruleId: 'html-rule',
          severity: 'error',
          file: 'src/active/valid.ts',
          line: 1,
          message: 'Valid finding'
        }
      ],
      'html-rule'
    );

    expect(auditor.getCountsByRule().get('html-rule')).toBe(1);
  });

  describe('isPathExempt path containment precision', () => {
    it('does not falsely match arbitrary substrings', () => {
      // 'app' should NOT match 'components/application.vue' or 'src/appliances/test.ts'
      expect(isPathExempt('components/application.vue', ['app'])).toBe(false);
      expect(isPathExempt('src/appliances/test.ts', ['app'])).toBe(false);
      expect(isPathExempt('src/happy-path.ts', ['app'])).toBe(false);
    });

    it('correctly matches exact path, prefix, and directory segments', () => {
      expect(isPathExempt('app', ['app'])).toBe(true);
      expect(isPathExempt('app/header.vue', ['app'])).toBe(true);
      expect(isPathExempt('src/app/header.vue', ['app'])).toBe(true);
      expect(isPathExempt('deep/nested/app/header.vue', ['app'])).toBe(true);
      expect(isPathExempt('src/vendor/**/lib.js', ['src/vendor/**'])).toBe(true);
    });
  });

  describe('getEffectiveIgnoreDirs remote project isolation', () => {
    it('evaluates paths.ignoredDirs from specified projectRoot', () => {
      const dirs = getEffectiveIgnoreDirs(tempDir);
      expect(dirs.has('global-dir-ignored')).toBe(true);
    });
  });
});

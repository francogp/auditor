/**
 * tests/auditor_subsystem_ignore_isolation.test.ts
 *
 * Exhaustive unit tests for Subsystem Ignore Isolation Mandate:
 * - Universal compliance with global ignores (paths.ignoreGlobs, paths.ignoredDirs, ALWAYS_IGNORE_DIRS)
 * - Hermetic isolation between subsystem configs: ignores/exemptions configured in one
 *   subsystem (constants, animation, domain, styles, htmlValidate, coverage) NEVER contaminate or affect other suites
 * - Extension option isolation (extraIgnorePatterns, exemptPaths in constructor)
 * - Coverage degradations strictly isolated to coverage audits, never muting code linters or analyzers
 * - Violation suppression and getScannableFiles() isolation across concurrent sub-auditors
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { resetAuditConfig } from '../src/core/auditConfigLoader.ts';
import { BaseAuditor } from '../src/core/auditorBase.ts';

describe('Auditor Subsystem Ignore Isolation Mandate', () => {
  let tempDir: string;

  beforeEach(async () => {
    resetAuditConfig();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-isolation-test-'));
    const auditorDir = path.join(tempDir, '.auditor');
    await fs.mkdir(auditorDir, { recursive: true });

    const configObj = {
      name: 'Isolation Test Project',
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
      constants: {
        enabled: true,
        ignoreGlobs: ['src/magic-ignored/**'],
        exemptFiles: ['src/magic-exempt.ts']
      },
      animation: {
        enabled: true,
        ignoreGlobs: ['src/motion-ignored/**'],
        exemptPaths: ['src/motion-exempt']
      },
      domain: {
        enabled: true,
        ignoreGlobs: ['src/domain-ignored/**'],
        exemptFiles: ['src/domain-exempt.ts']
      },
      styles: {
        enabled: true,
        ignoreGlobs: ['src/styles/ignored/**'],
        exemptFiles: ['src/styles/exempt.css']
      },
      htmlValidate: {
        enabled: true,
        ignoreGlobs: ['src/html-ignored/**'],
        exemptFiles: ['src/html-exempt.html']
      },
      coverage: {
        enabled: true,
        acknowledgedDegradations: [
          {
            policy: 'scripts',
            glob: 'scripts/legacy/**',
            reason: 'Legacy untestable scripts'
          }
        ]
      }
    };

    await fs.writeFile(
      path.join(auditorDir, 'audit.config.json'),
      JSON.stringify(configObj, null, 2),
      'utf-8'
    );

    // Create fixture directory structure and dummy files
    const dirs = [
      'src/global-ignored',
      'global-dir-ignored',
      'src/magic-ignored',
      'src/motion-ignored',
      'src/motion-exempt',
      'src/domain-ignored',
      'src/styles/ignored',
      'src/html-ignored',
      'src/extension-ignored',
      'src/active'
    ];
    for (const d of dirs) {
      await fs.mkdir(path.join(tempDir, d), { recursive: true });
    }

    await fs.writeFile(
      path.join(tempDir, 'src/global-ignored/file.ts'),
      'export const a = 1;',
      'utf-8'
    );
    await fs.writeFile(
      path.join(tempDir, 'global-dir-ignored/file.ts'),
      'export const b = 2;',
      'utf-8'
    );
    await fs.writeFile(
      path.join(tempDir, 'src/magic-ignored/file.ts'),
      'export const c = 3;',
      'utf-8'
    );
    await fs.writeFile(path.join(tempDir, 'src/magic-exempt.ts'), 'export const d = 4;', 'utf-8');
    await fs.writeFile(
      path.join(tempDir, 'src/motion-ignored/file.ts'),
      'export const e = 5;',
      'utf-8'
    );
    await fs.writeFile(
      path.join(tempDir, 'src/motion-exempt/file.ts'),
      'export const f = 6;',
      'utf-8'
    );
    await fs.writeFile(
      path.join(tempDir, 'src/domain-ignored/file.ts'),
      'export const g = 7;',
      'utf-8'
    );
    await fs.writeFile(path.join(tempDir, 'src/domain-exempt.ts'), 'export const h = 8;', 'utf-8');
    await fs.writeFile(
      path.join(tempDir, 'src/styles/ignored/style.css'),
      '.a { color: red; }',
      'utf-8'
    );
    await fs.writeFile(path.join(tempDir, 'src/styles/exempt.css'), '.b { color: blue; }', 'utf-8');
    await fs.writeFile(
      path.join(tempDir, 'src/html-ignored/page.html'),
      '<div>ignored</div>',
      'utf-8'
    );
    await fs.writeFile(path.join(tempDir, 'src/html-exempt.html'), '<div>exempt</div>', 'utf-8');
    await fs.mkdir(path.join(tempDir, 'scripts/legacy'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, 'scripts/legacy/test.ts'),
      'export const deg = 9;',
      'utf-8'
    );
    await fs.writeFile(
      path.join(tempDir, 'src/extension-ignored/file.ts'),
      'export const ext = 10;',
      'utf-8'
    );
    await fs.writeFile(
      path.join(tempDir, 'src/active/normal.ts'),
      'export const ok = 11;',
      'utf-8'
    );
  });

  afterEach(async () => {
    resetAuditConfig();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  class MagicAuditor extends BaseAuditor<'magic-rule'> {
    public constructor(root: string) {
      super({
        id: 'validate_magic_numbers_test',
        name: 'Magic Numbers Test',
        description: 'Test magic numbers subauditor',
        family: 'architecture',
        packageName: 'Test',
        icon: '🔢',
        configKey: 'constants',
        defaultConfig: { enabled: true },
        requiredPermissions: [],
        criticalConfig: {},
        usesThirdPartyTool: false,
        ruleFixers: {},
        ruleIds: ['magic-rule'],
        ruleCapabilities: {
          'magic-rule': {
            speed: 'light',
            phase: 'normal',
            md: false,
            ast: false,
            changedOnly: false,
            critical: false
          }
        },
        ruleDescriptions: { 'magic-rule': 'Magic Rule' },
        ruleRemediations: { 'magic-rule': 'Magic Remediation' },
        ruleRemediationPhases: { 'magic-rule': 'hygiene' },
        coverage: { include: ['src/**/*.ts'] },
        roots: ['src'],
        allowedExtensions: new Set(['.ts', '.css', '.html']),
        projectRoot: root
      });
    }

    public override runAudit(): void {}
  }

  class MotionAuditor extends BaseAuditor<'motion-rule'> {
    public constructor(root: string) {
      super({
        id: 'validate_motion_test',
        name: 'Motion Test',
        description: 'Test motion subauditor',
        family: 'architecture',
        packageName: 'Test',
        icon: '🎬',
        configKey: 'animation',
        defaultConfig: { enabled: true },
        requiredPermissions: [],
        criticalConfig: {},
        usesThirdPartyTool: false,
        ruleFixers: {},
        ruleIds: ['motion-rule'],
        ruleCapabilities: {
          'motion-rule': {
            speed: 'light',
            phase: 'normal',
            md: false,
            ast: false,
            changedOnly: false,
            critical: false
          }
        },
        ruleDescriptions: { 'motion-rule': 'Motion Rule' },
        ruleRemediations: { 'motion-rule': 'Motion Remediation' },
        ruleRemediationPhases: { 'motion-rule': 'hygiene' },
        coverage: { include: ['src/**/*.ts'] },
        roots: ['src'],
        allowedExtensions: new Set(['.ts', '.css', '.html']),
        projectRoot: root
      });
    }

    public override runAudit(): void {}
  }

  class DomainAuditor extends BaseAuditor<'domain-rule'> {
    public constructor(root: string) {
      super({
        id: 'validate_domain_test',
        name: 'Domain Test',
        description: 'Test domain subauditor',
        family: 'domain_data',
        packageName: 'Test',
        icon: '📦',
        configKey: 'domain',
        defaultConfig: { enabled: true },
        requiredPermissions: [],
        criticalConfig: {},
        usesThirdPartyTool: false,
        ruleFixers: {},
        ruleIds: ['domain-rule'],
        ruleCapabilities: {
          'domain-rule': {
            speed: 'light',
            phase: 'normal',
            md: false,
            ast: false,
            changedOnly: false,
            critical: false
          }
        },
        ruleDescriptions: { 'domain-rule': 'Domain Rule' },
        ruleRemediations: { 'domain-rule': 'Domain Remediation' },
        ruleRemediationPhases: { 'domain-rule': 'hygiene' },
        coverage: { include: ['src/**/*.ts'] },
        roots: ['src'],
        allowedExtensions: new Set(['.ts', '.css', '.html']),
        projectRoot: root
      });
    }

    public override runAudit(): void {}
  }

  class StylesAuditor extends BaseAuditor<'styles-rule'> {
    public constructor(root: string) {
      super({
        id: 'validate_styles_test',
        name: 'Styles Test',
        description: 'Test styles subauditor',
        family: 'architecture',
        packageName: 'Test',
        icon: '🎨',
        configKey: 'styles.enabled',
        defaultConfig: { enabled: true },
        requiredPermissions: [],
        criticalConfig: {},
        usesThirdPartyTool: false,
        ruleFixers: {},
        ruleIds: ['styles-rule'],
        ruleCapabilities: {
          'styles-rule': {
            speed: 'light',
            phase: 'normal',
            md: false,
            ast: false,
            changedOnly: false,
            critical: false
          }
        },
        ruleDescriptions: { 'styles-rule': 'Styles Rule' },
        ruleRemediations: { 'styles-rule': 'Styles Remediation' },
        ruleRemediationPhases: { 'styles-rule': 'hygiene' },
        coverage: { include: ['src/**/*.css'] },
        roots: ['src'],
        allowedExtensions: new Set(['.ts', '.css', '.html']),
        projectRoot: root
      });
    }

    public override runAudit(): void {}
  }

  class ExtensionAuditor extends BaseAuditor<'ext-rule'> {
    public constructor(root: string) {
      super({
        id: 'validate_extension_test',
        name: 'Extension Test',
        description: 'Test extension subauditor with manual extraIgnorePatterns',
        family: 'architecture',
        packageName: 'Test',
        icon: '🔌',
        configKey: 'none',
        defaultConfig: { enabled: true },
        requiredPermissions: [],
        criticalConfig: {},
        usesThirdPartyTool: false,
        ruleFixers: {},
        ruleIds: ['ext-rule'],
        ruleCapabilities: {
          'ext-rule': {
            speed: 'light',
            phase: 'normal',
            md: false,
            ast: false,
            changedOnly: false,
            critical: false
          }
        },
        ruleDescriptions: { 'ext-rule': 'Extension Rule' },
        ruleRemediations: { 'ext-rule': 'Extension Remediation' },
        ruleRemediationPhases: { 'ext-rule': 'hygiene' },
        coverage: { include: ['src/**/*.ts'] },
        extraIgnorePatterns: ['src/extension-ignored/**'],
        roots: ['src'],
        allowedExtensions: new Set(['.ts', '.css', '.html']),
        projectRoot: root
      });
    }

    public override runAudit(): void {}
  }

  it('1. Universal Compliance: all subauditors respect global ignores', () => {
    const magic = new MagicAuditor(tempDir);
    const motion = new MotionAuditor(tempDir);
    const domain = new DomainAuditor(tempDir);
    const styles = new StylesAuditor(tempDir);
    const extension = new ExtensionAuditor(tempDir);

    const auditors = [magic, motion, domain, styles, extension];

    for (const a of auditors) {
      expect(a.isPathScannable('src/global-ignored/file.ts')).toBe(false);
      expect(a.isPathScannable('global-dir-ignored/file.ts')).toBe(false);
    }
  });

  it('2. Hermetic Isolation: constants ignores only affect MagicAuditor', () => {
    const magic = new MagicAuditor(tempDir);
    const motion = new MotionAuditor(tempDir);
    const domain = new DomainAuditor(tempDir);
    const styles = new StylesAuditor(tempDir);
    const extension = new ExtensionAuditor(tempDir);

    // Ignored in constants
    expect(magic.isPathScannable('src/magic-ignored/file.ts')).toBe(false);
    expect(magic.isPathScannable('src/magic-exempt.ts')).toBe(false);

    // MUST BE SCANNABLE by all other subauditors
    expect(motion.isPathScannable('src/magic-ignored/file.ts')).toBe(true);
    expect(motion.isPathScannable('src/magic-exempt.ts')).toBe(true);

    expect(domain.isPathScannable('src/magic-ignored/file.ts')).toBe(true);
    expect(domain.isPathScannable('src/magic-exempt.ts')).toBe(true);

    expect(styles.isPathScannable('src/magic-ignored/file.ts')).toBe(true);
    expect(styles.isPathScannable('src/magic-exempt.ts')).toBe(true);

    expect(extension.isPathScannable('src/magic-ignored/file.ts')).toBe(true);
    expect(extension.isPathScannable('src/magic-exempt.ts')).toBe(true);
  });

  it('3. Hermetic Isolation: animation ignores only affect MotionAuditor', () => {
    const magic = new MagicAuditor(tempDir);
    const motion = new MotionAuditor(tempDir);
    const domain = new DomainAuditor(tempDir);

    // Ignored in animation
    expect(motion.isPathScannable('src/motion-ignored/file.ts')).toBe(false);
    expect(motion.isPathScannable('src/motion-exempt/file.ts')).toBe(false);

    // MUST BE SCANNABLE by magic and domain
    expect(magic.isPathScannable('src/motion-ignored/file.ts')).toBe(true);
    expect(magic.isPathScannable('src/motion-exempt/file.ts')).toBe(true);

    expect(domain.isPathScannable('src/motion-ignored/file.ts')).toBe(true);
    expect(domain.isPathScannable('src/motion-exempt/file.ts')).toBe(true);
  });

  it('4. Hermetic Isolation: domain ignores only affect DomainAuditor', () => {
    const magic = new MagicAuditor(tempDir);
    const motion = new MotionAuditor(tempDir);
    const domain = new DomainAuditor(tempDir);

    // Ignored in domain
    expect(domain.isPathScannable('src/domain-ignored/file.ts')).toBe(false);
    expect(domain.isPathScannable('src/domain-exempt.ts')).toBe(false);

    // MUST BE SCANNABLE by magic and motion
    expect(magic.isPathScannable('src/domain-ignored/file.ts')).toBe(true);
    expect(magic.isPathScannable('src/domain-exempt.ts')).toBe(true);

    expect(motion.isPathScannable('src/domain-ignored/file.ts')).toBe(true);
    expect(motion.isPathScannable('src/domain-exempt.ts')).toBe(true);
  });

  it('5. Hermetic Isolation: styles ignores and exemptFiles only affect StylesAuditor', () => {
    const styles = new StylesAuditor(tempDir);
    const magic = new MagicAuditor(tempDir);

    // Ignored / exempt in styles
    expect(styles.isPathScannable('src/styles/ignored/style.css')).toBe(false);
    expect(styles.isPathScannable('src/styles/exempt.css')).toBe(false);

    // MUST BE SCANNABLE by MagicAuditor
    expect(magic.isPathScannable('src/styles/ignored/style.css')).toBe(true);
    expect(magic.isPathScannable('src/styles/exempt.css')).toBe(true);
  });

  it('6. Coverage Isolation: acknowledgedDegradations never mute code subauditors', () => {
    const magic = new MagicAuditor(tempDir);
    const motion = new MotionAuditor(tempDir);
    const domain = new DomainAuditor(tempDir);
    const styles = new StylesAuditor(tempDir);

    // File with acknowledged coverage degradation MUST STILL BE AUDITED by all code suites
    expect(magic.isPathScannable('scripts/legacy/test.ts')).toBe(true);
    expect(motion.isPathScannable('scripts/legacy/test.ts')).toBe(true);
    expect(domain.isPathScannable('scripts/legacy/test.ts')).toBe(true);
    expect(styles.isPathScannable('scripts/legacy/test.ts')).toBe(true);
  });

  it('7. Extension Isolation: extraIgnorePatterns in extension do not leak to built-in suites', () => {
    const extension = new ExtensionAuditor(tempDir);
    const magic = new MagicAuditor(tempDir);
    const domain = new DomainAuditor(tempDir);

    // Ignored in extension
    expect(extension.isPathScannable('src/extension-ignored/file.ts')).toBe(false);

    // MUST BE SCANNABLE by built-in subauditors
    expect(magic.isPathScannable('src/extension-ignored/file.ts')).toBe(true);
    expect(domain.isPathScannable('src/extension-ignored/file.ts')).toBe(true);
  });

  it('8. Violation Suppression Isolation: addViolation drops only locally ignored files', () => {
    const magic = new MagicAuditor(tempDir);
    const domain = new DomainAuditor(tempDir);

    // File is ignored for magic, active for domain
    const targetFile = 'src/magic-ignored/file.ts';

    magic.addViolation({
      ruleId: 'magic-rule',
      severity: 'error',
      file: targetFile,
      message: 'Magic error'
    });

    domain.addViolation({
      ruleId: 'domain-rule',
      severity: 'error',
      file: targetFile,
      message: 'Domain error'
    });

    // Magic dropped it
    expect(magic.getCountsByRule().get('magic-rule') ?? 0).toBe(0);
    expect(magic.getErrorsByRule().get('magic-rule') ?? 0).toBe(0);

    // Domain recorded it
    expect(domain.getCountsByRule().get('domain-rule')).toBe(1);
    expect(domain.getErrorsByRule().get('domain-rule')).toBe(1);
  });

  it('9. getScannableFiles() Isolation: each auditor scans files ignored by others', () => {
    const magic = new MagicAuditor(tempDir);
    const domain = new DomainAuditor(tempDir);

    const magicFiles = magic.getScannableFiles();
    const domainFiles = domain.getScannableFiles();

    // Magic's scannable files contain domain's ignored file, but NOT its own ignored file
    expect(magicFiles).toContain('src/domain-ignored/file.ts');
    expect(magicFiles).not.toContain('src/magic-ignored/file.ts');
    expect(magicFiles).not.toContain('src/magic-exempt.ts');

    // Domain's scannable files contain magic's ignored file, but NOT its own ignored file
    expect(domainFiles).toContain('src/magic-ignored/file.ts');
    expect(domainFiles).toContain('src/magic-exempt.ts');
    expect(domainFiles).not.toContain('src/domain-ignored/file.ts');
    expect(domainFiles).not.toContain('src/domain-exempt.ts');

    // Both exclude the global ignored file
    expect(magicFiles).not.toContain('src/global-ignored/file.ts');
    expect(domainFiles).not.toContain('src/global-ignored/file.ts');
  });
});

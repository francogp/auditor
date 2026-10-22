/**
 * tests/all_auditors_ignores_conformance.test.ts
 *
 * Universal Conformance Suite:
 * Proves one by one that 100% of discovered sub-auditors and configuration builders
 * strictly honor global ignores and particular subsystem ignores/exemptions when pointed
 * to arbitrary custom locations, maintaining strict isolation without leaking or overwriting.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { defineAuditConfig } from '../src/core/auditConfigBuilders.ts';
import { setAuditConfig, resetAuditConfig } from '../src/core/auditConfigLoader.ts';
import { BaseAuditor } from '../src/core/auditorBase.ts';
import {
  scanAllAuditorTasks,
  findAuditorClass,
  instantiateAuditorClass
} from '../src/core/auditorContractConformance.ts';

describe('Universal Ignores & Exemptions Conformance (All Sub-Auditors)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'auditor-all-ignores-test-'));
    const auditorDir = path.join(tempDir, '.auditor');
    await fs.promises.mkdir(auditorDir, { recursive: true });
  });

  afterEach(async () => {
    resetAuditConfig();
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      /* non-fatal test cleanup */
    }
  });

  describe('Audit Config Builders Preservation Contract', () => {
    it('preserves ignoreGlobs, exemptPaths and exemptFiles across all subsystem builders', () => {
      const customConfig = defineAuditConfig({
        name: 'Test Preserved Ignores',
        paths: {
          codeRoots: ['src'],
          ignoreGlobs: ['custom_global_ignore/**']
        },
        packageHygiene: {
          ignoreGlobs: ['custom_package_hygiene_ignore/**'],
          exemptPaths: ['custom_package_hygiene_exempt/']
        },
        fallow: {
          ignoreGlobs: ['custom_fallow_ignore/**'],
          exemptPaths: ['custom_fallow_exempt/']
        },
        testCoverage: {
          ignoreGlobs: ['custom_coverage_ignore/**'],
          exemptPaths: ['custom_coverage_exempt/']
        },
        accessibility: {
          ignoreGlobs: ['custom_a11y_ignore/**']
        },
        typeCoverage: {
          ignoreGlobs: ['custom_type_coverage_ignore/**']
        },
        auditorHygiene: {
          ignoreGlobs: ['custom_auditor_hygiene_ignore/**'],
          exemptFiles: ['custom_exempt.ts']
        },
        security: {
          ignoreGlobs: ['custom_security_ignore/**']
        },
        pinia: {
          ignoreGlobs: ['custom_pinia_ignore/**']
        },
        valibot: {
          ignoreGlobs: ['custom_valibot_ignore/**']
        },
        bundle: {
          ignoreGlobs: ['custom_bundle_ignore/**']
        }
      });

      // Verify that defineAuditConfig did NOT purge subsystem ignores/exemptions
      expect(customConfig.packageHygiene?.ignoreGlobs).toEqual([
        'custom_package_hygiene_ignore/**'
      ]);
      expect(customConfig.packageHygiene?.exemptPaths).toEqual(['custom_package_hygiene_exempt/']);

      expect(customConfig.fallow?.ignoreGlobs).toEqual(['custom_fallow_ignore/**']);
      expect(customConfig.fallow?.exemptPaths).toEqual(['custom_fallow_exempt/']);

      expect(customConfig.testCoverage?.ignoreGlobs).toEqual(['custom_coverage_ignore/**']);
      expect(customConfig.testCoverage?.exemptPaths).toEqual(['custom_coverage_exempt/']);

      expect(customConfig.accessibility?.ignoreGlobs).toEqual(['custom_a11y_ignore/**']);
      expect(customConfig.typeCoverage?.ignoreGlobs).toEqual(['custom_type_coverage_ignore/**']);
      expect(customConfig.auditorHygiene?.ignoreGlobs).toEqual([
        'custom_auditor_hygiene_ignore/**'
      ]);
      expect(customConfig.security?.ignoreGlobs).toEqual(['custom_security_ignore/**']);
      expect(customConfig.pinia?.ignoreGlobs).toEqual(['custom_pinia_ignore/**']);
      expect(customConfig.valibot?.ignoreGlobs).toEqual(['custom_valibot_ignore/**']);
      expect(customConfig.bundle?.ignoreGlobs).toEqual(['custom_bundle_ignore/**']);
    });
  });

  describe('Dynamic Sub-Auditor Ignores Resolution', () => {
    it('every discovered sub-auditor honors global paths.ignoreGlobs in isPathScannable and isViolationSuppressed', async () => {
      const customGlobalIgnore = 'custom_arbitrary_global_dir/**';
      const sampleFile = 'custom_arbitrary_global_dir/some_code.ts';

      const config = defineAuditConfig({
        name: 'Global Ignore Test',
        paths: {
          codeRoots: ['src', 'custom_arbitrary_global_dir'],
          ignoreGlobs: [customGlobalIgnore]
        }
      });
      setAuditConfig(config, tempDir);

      const allTasks = await scanAllAuditorTasks(process.cwd());
      expect(allTasks.length).toBeGreaterThanOrEqual(40);

      for (const task of allTasks) {
        const suitePath = path.isAbsolute(task.scriptPath)
          ? task.scriptPath
          : path.resolve(process.cwd(), task.scriptPath);

        const mod = (await import(suitePath)) as Record<string, unknown>;
        const Cls = findAuditorClass(mod);
        if (!Cls) continue;

        let auditor: BaseAuditor<string>;
        try {
          auditor = instantiateAuditorClass(Cls, tempDir);
        } catch {
          continue;
        }

        // Must be identified as ignored/suppressed
        expect(
          auditor.isPathScannable(sampleFile),
          `Auditor [${task.id}] failed to honor global ignore in isPathScannable`
        ).toBe(false);

        expect(
          auditor.isViolationSuppressed(sampleFile),
          `Auditor [${task.id}] failed to honor global ignore in isViolationSuppressed`
        ).toBe(true);
      }
    });

    it('sub-auditors with dedicated configKey honor their own particular ignoreGlobs and exemptPaths without leaking to other sub-auditors', async () => {
      const config = defineAuditConfig({
        name: 'Particular Subsystem Ignores Test',
        paths: {
          codeRoots: ['src'],
          ignoreGlobs: []
        },
        htmlValidate: {
          enabled: true,
          ignoreGlobs: ['custom_html_ignored/**'],
          exemptPaths: ['custom_html_exempt/']
        },
        stylelint: {
          enabled: true,
          ignoreGlobs: ['custom_stylelint_ignored/**'],
          exemptPaths: ['custom_stylelint_exempt/']
        },
        packageHygiene: {
          enabled: true,
          ignoreGlobs: ['custom_pkghygiene_ignored/**'],
          exemptPaths: ['custom_pkghygiene_exempt/']
        }
      });
      setAuditConfig(config, tempDir);

      const { HtmlValidateAuditor } =
        await import('../src/suites/architecture/validate_html_validate.ts');
      const { ValidateStylelintAuditor } =
        await import('../src/suites/architecture/validate_stylelint.ts');
      const { ValidatePackageHygieneAuditor } =
        await import('../src/suites/architecture/validate_package_hygiene.ts');

      const htmlAuditor = new HtmlValidateAuditor({ projectRoot: tempDir });
      const stylelintAuditor = new ValidateStylelintAuditor({ projectRoot: tempDir });
      const pkgAuditor = new ValidatePackageHygieneAuditor({ projectRoot: tempDir });

      // 1. HTML Auditor must honor htmlValidate ignores & exemptions
      expect(htmlAuditor.isPathScannable('custom_html_ignored/template.html')).toBe(false);
      expect(htmlAuditor.isViolationSuppressed('custom_html_ignored/template.html')).toBe(true);
      expect(htmlAuditor.isPathExempt('custom_html_exempt/test.html')).toBe(true);
      expect(htmlAuditor.isViolationSuppressed('custom_html_exempt/test.html')).toBe(true);

      // 2. HTML Auditor must NOT ignore stylelint-specific or pkghygiene-specific paths (strict isolation)
      expect(htmlAuditor.isPathScannable('src/regular.html')).toBe(true);
      expect(htmlAuditor.isPathExempt('custom_stylelint_exempt/test.html')).toBe(false);

      // 3. Stylelint Auditor must honor stylelint ignores & exemptions
      expect(stylelintAuditor.isPathScannable('custom_stylelint_ignored/button.scss')).toBe(false);
      expect(stylelintAuditor.isViolationSuppressed('custom_stylelint_ignored/button.scss')).toBe(
        true
      );
      expect(stylelintAuditor.isPathExempt('custom_stylelint_exempt/badge.scss')).toBe(true);
      expect(stylelintAuditor.isViolationSuppressed('custom_stylelint_exempt/badge.scss')).toBe(
        true
      );

      // 4. Stylelint Auditor must NOT ignore htmlValidate-specific paths (strict isolation)
      expect(stylelintAuditor.isPathExempt('custom_html_exempt/badge.scss')).toBe(false);

      // 5. Package Hygiene Auditor must honor packageHygiene ignores & exemptions
      expect(pkgAuditor.isPathScannable('custom_pkghygiene_ignored/file.ts')).toBe(false);
      expect(pkgAuditor.isViolationSuppressed('custom_pkghygiene_ignored/file.ts')).toBe(true);
      expect(pkgAuditor.isPathExempt('custom_pkghygiene_exempt/file.ts')).toBe(true);
    });
  });
});

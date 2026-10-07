import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  ValidatePackageDistributionAuditor,
  PACKAGE_DISTRIBUTION_RULES,
  mapPublintCodeToRuleId,
  parsePublintMessages,
  type PublintMessageLike
} from '../src/suites/architecture/validate_package_distribution.ts';
import { setAuditConfig, resetAuditConfig, defineAuditConfig } from '../src/core/auditConfig.ts';

describe('ValidatePackageDistributionAuditor & parsePublintMessages', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-publint-test-'));
  });

  afterEach(() => {
    resetAuditConfig();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // catch-ok: cleanup temporary test directory
    }
  });

  describe('Rule Declarations & Metadata', () => {
    it('declares all expected rules in PACKAGE_DISTRIBUTION_RULES', () => {
      expect(PACKAGE_DISTRIBUTION_RULES).toContain('pkg-distribution-invalid-exports');
      expect(PACKAGE_DISTRIBUTION_RULES).toContain('pkg-distribution-missing-types');
      expect(PACKAGE_DISTRIBUTION_RULES).toContain('pkg-distribution-dual-package-hazard');
    });

    it('initializes with correct auditor metadata and Spanish rule descriptions', () => {
      const auditor = new ValidatePackageDistributionAuditor({ projectRoot: tempDir });
      expect(auditor.id).toBe('validate_package_distribution');
      expect(auditor.family).toBe('architecture');
      expect(auditor.packageName).toBe('Distribución');
      expect(auditor.ruleDescriptions['pkg-distribution-invalid-exports']).toBe('Export map de package.json inválido');
      expect(auditor.ruleDescriptions['pkg-distribution-missing-types']).toBe('Falta .d.ts para entrypoint público');
      expect(auditor.ruleDescriptions['pkg-distribution-dual-package-hazard']).toBe('Incompatibilidad dual ESM y CJS');
    });
  });

  describe('mapPublintCodeToRuleId rule mapping', () => {
    it('maps types-related codes to pkg-distribution-missing-types', () => {
      expect(mapPublintCodeToRuleId('EXPORTS_TYPES_SHOULD_BE_FIRST')).toBe('pkg-distribution-missing-types');
      expect(mapPublintCodeToRuleId('TYPES_NOT_EXPORTED')).toBe('pkg-distribution-missing-types');
    });

    it('maps dual-package and format codes to pkg-distribution-dual-package-hazard', () => {
      expect(mapPublintCodeToRuleId('DUAL_PACKAGE_HAZARD')).toBe('pkg-distribution-dual-package-hazard');
      expect(mapPublintCodeToRuleId('MODULE_SHOULD_BE_ESM')).toBe('pkg-distribution-dual-package-hazard');
      expect(mapPublintCodeToRuleId('CJS_INDEX_INVALID')).toBe('pkg-distribution-dual-package-hazard');
    });

    it('maps generic export and file issues to pkg-distribution-invalid-exports', () => {
      expect(mapPublintCodeToRuleId('FILE_DOES_NOT_EXIST')).toBe('pkg-distribution-invalid-exports');
      expect(mapPublintCodeToRuleId('INVALID_EXPORTS_FIELD')).toBe('pkg-distribution-invalid-exports');
    });
  });

  describe('parsePublintMessages parser', () => {
    it('returns empty findings for empty messages', () => {
      const findings = parsePublintMessages([], { name: 'pkg' }, tempDir);
      expect(findings).toEqual([]);
    });

    it('ignores suggestions and only includes errors and warnings', () => {
      const messages: PublintMessageLike[] = [
        { type: 'suggestion', code: 'USE_EXPORTS_BROWSER', path: [], args: {} }
      ];
      const findings = parsePublintMessages(messages, { name: 'pkg' }, tempDir);
      expect(findings).toHaveLength(0);
    });

    it('creates error findings for error type messages', () => {
      const messages: PublintMessageLike[] = [
        { type: 'error', code: 'FILE_DOES_NOT_EXIST', path: ['exports', '.'], args: {} }
      ];
      const findings = parsePublintMessages(messages, { name: 'test-pkg' }, tempDir);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.severity).toBe('error');
      expect(findings[0]!.ruleId).toBe('pkg-distribution-invalid-exports');
    });

    it('creates warning findings for warning type messages', () => {
      const messages: PublintMessageLike[] = [
        { type: 'warning', code: 'EXPORTS_MODULE_SHOULD_PRECEDE_REQUIRE', path: ['exports', '.'], args: {} }
      ];
      const findings = parsePublintMessages(messages, { name: 'test-pkg' }, tempDir);
      expect(findings).toHaveLength(1);
      expect(findings[0]!.severity).toBe('warning');
    });
  });

  describe('Clean Path Verification (StandardAuditResult)', () => {
    it('executes cleanly with zero errors when packageDistribution is disabled', async () => {
      setAuditConfig(
        defineAuditConfig({
          name: 'Package Distribution Disabled Project',
          packageDistribution: { enabled: false },
          persistence: { engine: 'none' },
          bundle: { enabled: false },
          styles: { zLayersEnabled: false },
          templates: { requireInputIds: false },
          agentPlugin: { enabled: false }
        })
      );

      const auditor = new ValidatePackageDistributionAuditor({ projectRoot: tempDir });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('skipped');
    });

    it('executes on valid package directory and reports zero errors', async () => {
      const distDir = path.join(tempDir, 'dist');
      fs.mkdirSync(distDir, { recursive: true });
      fs.writeFileSync(path.join(distDir, 'index.js'), 'export const v = 1;\n');
      fs.writeFileSync(path.join(distDir, 'index.d.ts'), 'export declare const v: number;\n');

      const pkg = {
        name: 'valid-lib',
        version: '1.0.0',
        type: 'module',
        exports: {
          '.': {
            types: './dist/index.d.ts',
            default: './dist/index.js'
          }
        }
      };
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2));

      setAuditConfig(
        defineAuditConfig({
          name: 'Valid Library Project',
          packageDistribution: { enabled: true },
          persistence: { engine: 'none' },
          bundle: { enabled: false },
          styles: { zLayersEnabled: false },
          templates: { requireInputIds: false },
          agentPlugin: { enabled: false }
        })
      );

      const auditor = new ValidatePackageDistributionAuditor({ projectRoot: tempDir });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});

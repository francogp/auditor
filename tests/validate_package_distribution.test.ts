import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  ValidatePackageDistributionAuditor,
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

    it('correctly maps error messages to canonical AuditFinding objects', () => {
      const messages: PublintMessageLike[] = [
        {
          type: 'error',
          code: 'FILE_DOES_NOT_EXIST',
          path: ['exports', '.'],
          args: { specifier: './dist/missing.js' }
        }
      ];
      const pkg = { name: 'test-pkg', exports: { '.': './dist/missing.js' } };
      const findings = parsePublintMessages(messages, pkg, tempDir);

      expect(findings).toHaveLength(1);
      const f = findings[0]!;
      expect(f.suiteId).toBe('validate_package_distribution');
      expect(f.ruleId).toBe('pkg-distribution-invalid-exports');
      expect(f.file).toBe('package.json');
      expect(f.severity).toBe('error');
      expect(f.context).toBe('FILE_DOES_NOT_EXIST');
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
      expect(result.status).toBe('passed');
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

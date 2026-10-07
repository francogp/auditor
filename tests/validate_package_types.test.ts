import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  ValidatePackageTypesAuditor,
  PACKAGE_TYPES_RULES,
  createPackageFromDirectory,
  parseAttwProblems
} from '../src/suites/architecture/validate_package_types.ts';
import { setAuditConfig, resetAuditConfig, defineAuditConfig } from '../src/core/auditConfig.ts';

describe('ValidatePackageTypesAuditor & parseAttwProblems', () => {
  let tempDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-types-test-'));
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // catch-ok: cleanup temporary test directory
    }
  });

  describe('Rule Declarations & Metadata', () => {
    it('declares all expected rules in PACKAGE_TYPES_RULES', () => {
      expect(PACKAGE_TYPES_RULES).toContain('pkg-types-resolution');
      expect(PACKAGE_TYPES_RULES).toContain('pkg-types-dual-hazard');
      expect(PACKAGE_TYPES_RULES).toContain('pkg-types-missing-dts');
    });

    it('initializes with correct auditor metadata and Spanish rule descriptions', () => {
      const auditor = new ValidatePackageTypesAuditor({ projectRoot: tempDir });
      expect(auditor.id).toBe('validate_package_types');
      expect(auditor.family).toBe('architecture');
      expect(auditor.packageName).toBe('Distribución');
      expect(auditor.ruleDescriptions['pkg-types-resolution']).toBe('Resolución de tipos inválida');
      expect(auditor.ruleDescriptions['pkg-types-dual-hazard']).toBe('Incompatibilidad dual ESM y CJS');
      expect(auditor.ruleDescriptions['pkg-types-missing-dts']).toBe('Entrypoint sin tipos declarados');
    });
  });

  describe('createPackageFromDirectory & ATTW parsing', () => {
    it('creates an in-memory Package representation from disk directory', () => {
      const distDir = path.join(tempDir, 'dist');
      fs.mkdirSync(distDir, { recursive: true });
      fs.writeFileSync(path.join(distDir, 'index.js'), 'export const v = 1;\n');
      fs.writeFileSync(path.join(distDir, 'index.d.ts'), 'export declare const v: number;\n');

      const pkg = {
        name: 'test-pkg',
        version: '1.0.0',
        type: 'module',
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } }
      };
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2));

      const packageObj = createPackageFromDirectory(tempDir);
      expect(packageObj.packageName).toBe('test-pkg');
      expect(packageObj.packageVersion).toBe('1.0.0');
      expect(packageObj.fileExists('/node_modules/test-pkg/package.json')).toBe(true);
      expect(packageObj.fileExists('/node_modules/test-pkg/dist/index.d.ts')).toBe(true);
      expect(packageObj.containsTypes()).toBe(true);
    });

    it('ignores node10 resolution failures and CJSResolvesToESM for ESM packages', () => {
      const problems = [
        { kind: 'NoResolution', entrypoint: '.', resolutionKind: 'node10' as const },
        { kind: 'CJSResolvesToESM', entrypoint: '.', resolutionKind: 'node16-cjs' as const }
      ];
      const pkg = { name: 'esm-pkg', type: 'module' };
      const findings = parseAttwProblems(problems as never, pkg);
      expect(findings).toHaveLength(0);
    });

    it('maps UntypedResolution to pkg-types-missing-dts', () => {
      const problems = [
        { kind: 'UntypedResolution', entrypoint: './sub', resolutionKind: 'node16-esm' as const }
      ];
      const findings = parseAttwProblems(problems as never, { name: 'pkg' });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.ruleId).toBe('pkg-types-missing-dts');
      expect(findings[0]!.severity).toBe('error');
    });

    it('maps NoResolution in node16 to pkg-types-resolution', () => {
      const problems = [
        { kind: 'NoResolution', entrypoint: './sub', resolutionKind: 'node16-esm' as const }
      ];
      const findings = parseAttwProblems(problems as never, { name: 'pkg' });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.ruleId).toBe('pkg-types-resolution');
      expect(findings[0]!.severity).toBe('error');
    });

    it('maps NamedExports to pkg-types-resolution with missing list', () => {
      const problems = [
        {
          kind: 'NamedExports',
          typesFileName: 'index.d.ts',
          implementationFileName: 'index.js',
          isMissingAllNamed: false,
          missing: ['helper', 'config']
        }
      ];
      const findings = parseAttwProblems(problems as never, { name: 'pkg' });
      expect(findings).toHaveLength(1);
      expect(findings[0]!.ruleId).toBe('pkg-types-resolution');
      expect(findings[0]!.message).toContain('helper, config');
    });
  });

  describe('Violation and Warning Detection in Sandbox', () => {
    it('reports status failed and severity error when package types has resolution problems under level: error', async () => {
      const distDir = path.join(tempDir, 'dist');
      fs.mkdirSync(distDir, { recursive: true });
      fs.writeFileSync(path.join(distDir, 'index.js'), 'export const v = 1;\n');
      fs.writeFileSync(path.join(distDir, 'index.d.ts'), 'export declare const v: number;\n');
      fs.writeFileSync(path.join(distDir, 'sub.js'), 'export const s = 2;\n');

      const pkg = {
        name: 'broken-types-lib',
        version: '1.0.0',
        type: 'module',
        exports: {
          '.': {
            types: './dist/index.d.ts',
            import: './dist/index.js'
          },
          './sub': {
            types: './dist/non-existent.d.ts',
            import: './dist/sub.js'
          }
        }
      };
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2));

      setAuditConfig(
        defineAuditConfig({
          name: 'Broken Types Error Project',
          packageDistribution: { enabled: true, level: 'error' },
          persistence: { engine: 'none' },
          bundle: { enabled: false },
          styles: { zLayersEnabled: false },
          templates: { requireInputIds: false },
          agentPlugin: { enabled: false }
        })
      );

      const auditor = new ValidatePackageTypesAuditor({ projectRoot: tempDir });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.status).toBe('failed');
      expect(result.summary.errors).toBeGreaterThan(0);

      const errorFinding = result.findings.find(f => f.severity === 'error');
      expect(errorFinding).toBeDefined();
      expect(PACKAGE_TYPES_RULES).toContain(errorFinding?.ruleId);
    });

    it('reports status passed and severity warning when package types has resolution problems under level: warning', async () => {
      const distDir = path.join(tempDir, 'dist');
      fs.mkdirSync(distDir, { recursive: true });
      fs.writeFileSync(path.join(distDir, 'index.js'), 'export const v = 1;\n');
      fs.writeFileSync(path.join(distDir, 'index.d.ts'), 'export declare const v: number;\n');
      fs.writeFileSync(path.join(distDir, 'sub.js'), 'export const s = 2;\n');

      const pkg = {
        name: 'broken-types-warn-lib',
        version: '1.0.0',
        type: 'module',
        exports: {
          '.': {
            types: './dist/index.d.ts',
            import: './dist/index.js'
          },
          './sub': {
            types: './dist/non-existent.d.ts',
            import: './dist/sub.js'
          }
        }
      };
      fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2));

      setAuditConfig(
        defineAuditConfig({
          name: 'Broken Types Warning Project',
          packageDistribution: { enabled: true, level: 'warning' },
          persistence: { engine: 'none' },
          bundle: { enabled: false },
          styles: { zLayersEnabled: false },
          templates: { requireInputIds: false },
          agentPlugin: { enabled: false }
        })
      );

      const auditor = new ValidatePackageTypesAuditor({ projectRoot: tempDir });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.status).toBe('passed');
      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBeGreaterThan(0);

      const warnFinding = result.findings.find(f => f.severity === 'warning');
      expect(warnFinding).toBeDefined();
      expect(PACKAGE_TYPES_RULES).toContain(warnFinding?.ruleId);
    });
  });

  describe('Clean Path Verification (StandardAuditResult)', () => {
    it('executes cleanly with status skipped when packageDistribution is disabled', async () => {
      setAuditConfig(
        defineAuditConfig({
          name: 'Package Types Disabled Project',
          packageDistribution: { enabled: false },
          persistence: { engine: 'none' },
          bundle: { enabled: false },
          styles: { zLayersEnabled: false },
          templates: { requireInputIds: false },
          agentPlugin: { enabled: false }
        })
      );

      const auditor = new ValidatePackageTypesAuditor({ projectRoot: tempDir });
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
        name: 'valid-types-lib',
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
          name: 'Valid Types Project',
          packageDistribution: { enabled: true },
          persistence: { engine: 'none' },
          bundle: { enabled: false },
          styles: { zLayersEnabled: false },
          templates: { requireInputIds: false },
          agentPlugin: { enabled: false }
        })
      );

      const auditor = new ValidatePackageTypesAuditor({ projectRoot: tempDir });
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});

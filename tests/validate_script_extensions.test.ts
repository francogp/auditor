/**
 * tests/validate_script_extensions.test.ts
 *
 * Unit tests for ValidateScriptExtensionsAuditor.
 * Validates detection of legacy .mjs and .cjs extensions, enforcement of TypeScript (.ts),
 * and automatic safe migration with import and package.json rewrites.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ValidateScriptExtensionsAuditor,
  SCRIPT_EXTENSIONS_RULES,
  isCanonicalConfigExempt,
  isExemptScriptFile
} from '../src/suites/architecture/validate_script_extensions.ts';

describe('ValidateScriptExtensionsAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('Instantiation & Metadata Contract', () => {
    it('instantiates with correct metadata conforming to BaseAuditor contracts', () => {
      const auditor = new ValidateScriptExtensionsAuditor();
      expect(auditor.id).toBe('validate_script_extensions');
      expect(auditor.family).toBe('architecture');
      expect(auditor.name).toBe('Script & Module Extensions Validator');
      expect(auditor.description.length).toBeLessThanOrEqual(60);
      expect(auditor.ruleIds).toEqual(SCRIPT_EXTENSIONS_RULES);
      expect(auditor.packageName).toBe('Extensiones');
      expect(auditor.capabilities.lint).toBe(true);
      expect(auditor.capabilities.fix).toBe(true);
    });

    it('declares all mandatory rules with valid descriptions', () => {
      expect(SCRIPT_EXTENSIONS_RULES).toContain('banned-mjs-extension');
      expect(SCRIPT_EXTENSIONS_RULES).toContain('banned-cjs-extension');
      expect(SCRIPT_EXTENSIONS_RULES).toContain('banned-raw-js-script');
      expect(SCRIPT_EXTENSIONS_RULES).toHaveLength(3);

      const auditor = new ValidateScriptExtensionsAuditor();
      expect(auditor.ruleDescriptions).toBeDefined();
      expect(auditor.ruleDescriptions?.['banned-mjs-extension']).toBe(
        'Archivo .mjs prohibido en TS'
      );
      expect(auditor.ruleDescriptions?.['banned-cjs-extension']).toBe(
        'Archivo .cjs prohibido en ESM'
      );
      expect(auditor.ruleDescriptions?.['banned-raw-js-script']).toBe(
        'Script .js sin tipar en scripts'
      );

      expect(auditor.formatRuleDescription('banned-mjs-extension')).toBe(
        'Extensiones: Archivo .mjs prohibido en TS'
      );
      expect(auditor.formatRuleDescription('banned-cjs-extension')).toBe(
        'Extensiones: Archivo .cjs prohibido en ESM'
      );
      expect(auditor.formatRuleDescription('banned-raw-js-script')).toBe(
        'Extensiones: Script .js sin tipar en scripts'
      );
    });
  });

  describe('Exemption Predicates', () => {
    it('exempts canonical root tool configurations', () => {
      expect(isCanonicalConfigExempt('eslint.config.js')).toBe(true);
      expect(isCanonicalConfigExempt('eslint.config.mjs')).toBe(true);
      expect(isCanonicalConfigExempt('postcss.config.js')).toBe(true);
      expect(isCanonicalConfigExempt('tailwind.config.js')).toBe(true);
      expect(isCanonicalConfigExempt('stylelint.config.js')).toBe(true);
      expect(isCanonicalConfigExempt('.config/eslint.config.js')).toBe(true);

      // Subdirectory scripts are not exempt canonical root configs
      expect(isCanonicalConfigExempt('scripts/eslint.config.js')).toBe(false);
      expect(isCanonicalConfigExempt('src/foo.mjs')).toBe(false);
    });

    it('honors user-configured exempt files', () => {
      const exemptions = ['scripts/special-runner.mjs', 'tools/legacy.cjs'];
      expect(isExemptScriptFile('scripts/special-runner.mjs', exemptions)).toBe(true);
      expect(isExemptScriptFile('tools/legacy.cjs', exemptions)).toBe(true);
      expect(isExemptScriptFile('scripts/other.mjs', exemptions)).toBe(false);
    });
  });

  describe('Clean Path Testing', () => {
    it('passes cleanly with zero violations on compliant TypeScript repositories', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-clean-ext-'));
      try {
        fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
        fs.mkdirSync(path.join(tempDir, 'scripts'), { recursive: true });
        fs.writeFileSync(path.join(tempDir, 'src', 'main.ts'), 'export const active = true;\n');
        fs.writeFileSync(path.join(tempDir, 'scripts', 'build.ts'), 'console.log("building");\n');
        fs.writeFileSync(path.join(tempDir, 'eslint.config.js'), 'export default [];\n');

        const auditor = new ValidateScriptExtensionsAuditor({ projectRoot: tempDir });
        const result = await auditor.execute();

        expect(result.findings).toHaveLength(0);
        expect(result.summary.errors).toBe(0);
        expect(result.summary.warnings).toBe(0);
        expect(result.status).toBe('passed');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('Violation Detection', () => {
    it('detects banned .mjs file extension', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-violation-mjs-'));
      try {
        fs.mkdirSync(path.join(tempDir, 'scripts'), { recursive: true });
        fs.writeFileSync(path.join(tempDir, 'scripts', 'export_map.mjs'), 'export const map = {};\n');

        const auditor = new ValidateScriptExtensionsAuditor({ projectRoot: tempDir });
        const result = await auditor.execute();

        expect(result.findings.length).toBeGreaterThan(0);
        const mjsViolation = result.findings.find(v => v.ruleId === 'banned-mjs-extension');
        expect(mjsViolation).toBeDefined();
        expect(mjsViolation?.file).toBe('scripts/export_map.mjs');
        expect(mjsViolation?.fixable).toBe(true);
        expect(result.summary.errors).toBe(1);
        expect(result.status).toBe('failed');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('detects banned .cjs file extension', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-violation-cjs-'));
      try {
        fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(tempDir, 'src', 'legacy.cjs'), 'module.exports = {};\n');

        const auditor = new ValidateScriptExtensionsAuditor({ projectRoot: tempDir });
        const result = await auditor.execute();

        expect(result.findings.length).toBeGreaterThan(0);
        const cjsViolation = result.findings.find(v => v.ruleId === 'banned-cjs-extension');
        expect(cjsViolation).toBeDefined();
        expect(cjsViolation?.file).toBe('src/legacy.cjs');
        expect(cjsViolation?.fixable).toBe(true);
        expect(result.summary.errors).toBe(1);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('detects untyped .js script inside scripts directory', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-violation-js-'));
      try {
        fs.mkdirSync(path.join(tempDir, 'scripts'), { recursive: true });
        fs.writeFileSync(path.join(tempDir, 'scripts', 'runner.js'), 'console.log("running");\n');

        const auditor = new ValidateScriptExtensionsAuditor({ projectRoot: tempDir });
        const result = await auditor.execute();

        expect(result.findings.length).toBeGreaterThan(0);
        const jsViolation = result.findings.find(v => v.ruleId === 'banned-raw-js-script');
        expect(jsViolation).toBeDefined();
        expect(jsViolation?.file).toBe('scripts/runner.js');
        expect(jsViolation?.fixable).toBe(true);
        expect(result.summary.errors).toBe(1);
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('Auto-Fix Migration Pipeline', () => {
    it('renames .mjs to .ts, rewrites imports, and updates package.json in fix mode', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-fix-pipeline-'));
      try {
        fs.mkdirSync(path.join(tempDir, 'scripts'), { recursive: true });
        fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });

        // Target .mjs file
        const mjsPath = path.join(tempDir, 'scripts', 'auto_tile_analyzer.mjs');
        fs.writeFileSync(mjsPath, 'export function analyze() { return true; }\n');

        // Dependent file importing the .mjs
        const srcPath = path.join(tempDir, 'src', 'importer.ts');
        fs.writeFileSync(
          srcPath,
          'import { analyze } from ' + '"../scripts/auto_tile_analyzer.mjs";\nconsole.log(analyze());\n'
        );

        // package.json referencing the .mjs
        const pkgPath = path.join(tempDir, 'package.json');
        fs.writeFileSync(
          pkgPath,
          JSON.stringify(
            {
              name: 'test-app',
              scripts: {
                analyze: 'node scripts/auto_tile_analyzer.mjs --all'
              }
            },
            null,
            2
          )
        );

        // Execute auditor in fix mode
        const auditor = new ValidateScriptExtensionsAuditor({ projectRoot: tempDir, fix: true });
        await auditor.execute();

        // 1. Old .mjs must be gone, new .ts must exist
        expect(fs.existsSync(mjsPath)).toBe(false);
        const expectedTsPath = path.join(tempDir, 'scripts', 'auto_tile_analyzer.ts');
        expect(fs.existsSync(expectedTsPath)).toBe(true);
        expect(fs.readFileSync(expectedTsPath, 'utf-8')).toBe('export function analyze() { return true; }\n');

        // 2. Import references must be rewritten
        const updatedSrc = fs.readFileSync(srcPath, 'utf-8');
        expect(updatedSrc).toContain('import { analyze } from ' + '"../scripts/auto_tile_analyzer.ts";');
        expect(updatedSrc).not.toContain('.mjs');

        // 3. package.json script must be rewritten
        const updatedPkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        expect(updatedPkg.scripts.analyze).toBe('node scripts/auto_tile_analyzer.ts --all');
        expect(updatedPkg.scripts.analyze).not.toContain('.mjs');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('safely refuses to overwrite pre-existing .ts file during fix mode', async () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-fix-conflict-'));
      try {
        fs.mkdirSync(path.join(tempDir, 'scripts'), { recursive: true });

        const mjsPath = path.join(tempDir, 'scripts', 'conflicting.mjs');
        const tsPath = path.join(tempDir, 'scripts', 'conflicting.ts');

        fs.writeFileSync(mjsPath, 'export const mjsContent = true;\n');
        fs.writeFileSync(tsPath, 'export const originalTsContent = true;\n');

        const auditor = new ValidateScriptExtensionsAuditor({ projectRoot: tempDir, fix: true });
        const result = await auditor.execute();

        // Original .ts must be preserved intact!
        expect(fs.existsSync(mjsPath)).toBe(true);
        expect(fs.existsSync(tsPath)).toBe(true);
        expect(fs.readFileSync(tsPath, 'utf-8')).toBe('export const originalTsContent = true;\n');

        // Violation reported explaining conflict
        expect(result.findings.length).toBeGreaterThan(0);
        expect(result.findings[0]?.message).toContain('ya existe en disco');
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  });
});

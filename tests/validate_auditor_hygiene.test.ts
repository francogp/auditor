/**
 * tests/validate_auditor_hygiene.test.ts
 *
 * Dedicated Vitest suite for AuditorHygieneAuditor:
 * - Metadata & Construction verification
 * - Dynamic registry extensibility (adding new detectors at runtime)
 * - Clean path execution on compliant auditors (0 errors, passed status)
 * - Violation detection covering 100% of declared homebrew rules
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  AuditorHygieneAuditor,
  AUDITOR_HOMEBREW_RULES,
  type AuditorHomebrewRuleId
} from '../src/suites/architecture/validate_auditor_hygiene.ts';
import {
  HomebrewDetectorRegistry,
  type HomebrewDetector
} from '../src/analyzers/homebrew/index.ts';

describe('AuditorHygieneAuditor', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-hygiene-test-'));
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Metadata & Construction', () => {
    it('initializes with correct id, family, icon and package name', () => {
      const auditor = new AuditorHygieneAuditor(tempDir);
      expect(auditor.id).toBe('validate_auditor_hygiene');
      expect(auditor.family).toBe('architecture');
      expect(auditor.packageName).toBe('Auditor');
      expect(auditor.icon).toBe('🧹');
      expect(auditor.name).toBe('Auditor Architecture & Homebrew Hygiene Validator');
    });

    it('declares all 10 canonical rules in AUDITOR_HOMEBREW_RULES', () => {
      expect(AUDITOR_HOMEBREW_RULES).toContain('auditor-manual-package-json');
      expect(AUDITOR_HOMEBREW_RULES).toContain('auditor-manual-vue-sfc-regex');
      expect(AUDITOR_HOMEBREW_RULES).toContain('auditor-manual-ts-ast');
      expect(AUDITOR_HOMEBREW_RULES).toContain('auditor-manual-path-normalize');
      expect(AUDITOR_HOMEBREW_RULES).toContain('auditor-raw-console');
      expect(AUDITOR_HOMEBREW_RULES).toContain('auditor-manual-comment-stripping');
      expect(AUDITOR_HOMEBREW_RULES).toContain('auditor-manual-brace-counting');
      expect(AUDITOR_HOMEBREW_RULES).toContain('auditor-manual-path-containment');
      expect(AUDITOR_HOMEBREW_RULES).toContain('auditor-manual-file-walker');
      expect(AUDITOR_HOMEBREW_RULES).toContain('auditor-homebrew-predicates');
    });

    it('enforces composed rule descriptions <= 50 characters', () => {
      const auditor = new AuditorHygieneAuditor(tempDir);
      const descriptions = HomebrewDetectorRegistry.getRuleDescriptions();
      for (const [ruleId, desc] of Object.entries(descriptions)) {
        const composed = `${auditor.packageName}: ${desc}`;
        expect(composed.length).toBeLessThanOrEqual(50);
      }
    });

    it('supports dynamic registration of future custom detectors at runtime', () => {
      const testDetector: HomebrewDetector = {
        id: 'test-custom-detector',
        ruleId: 'auditor-manual-package-json',
        ruleDescription: 'Custom dynamic test detector',
        detect: () => []
      };

      HomebrewDetectorRegistry.register(testDetector);
      expect(HomebrewDetectorRegistry.get('test-custom-detector')).toBe(testDetector);

      HomebrewDetectorRegistry.unregister('test-custom-detector');
      expect(HomebrewDetectorRegistry.get('test-custom-detector')).toBeUndefined();
    });
  });

  describe('Clean Path Verification', () => {
    it('passes with 0 errors and status passed on compliant auditor file', async () => {
      const suitesDir = path.join(tempDir, 'scripts', 'auditors');
      await fs.mkdir(suitesDir, { recursive: true });

      const cleanAuditorContent = [
        "import { BaseAuditor } from '@francogp/auditor';",
        "import { getPackageJson } from '@francogp/auditor';",
        "import { normalizePosixPath, isPathContained } from '@francogp/auditor';",
        '',
        "export class CleanAuditor extends BaseAuditor<'clean-rule'> {",
        '  public override async runAudit(): Promise<void> {',
        '    const pkg = getPackageJson(this.projectRoot);',
        "    const norm = normalizePosixPath('src/file.ts');",
        "    const isContained = isPathContained(this.projectRoot, 'src');",
        '    this.recordScanned(norm);',
        '  }',
        '}'
      ].join('\n');

      await fs.writeFile(path.join(suitesDir, 'clean_auditor.ts'), cleanAuditorContent, 'utf8');

      // Create dummy audit.config.ts in sandbox
      await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, '.auditor', 'audit.config.ts'),
        "export default { name: 'test-sandbox', paths: { srcRoots: ['src'] } };\n",
        'utf8'
      );

      const auditor = new AuditorHygieneAuditor(tempDir);
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
      expect(result.findings.length).toBe(0);
    });
  });

  describe('Violation Path & Complete Rule Coverage', () => {
    it('detects auditor-manual-package-json when reading package.json manually', async () => {
      const auditorsDir = path.join(tempDir, 'scripts', 'auditors');
      await fs.mkdir(auditorsDir, { recursive: true });

      // Fixture string split dynamically to avoid static scanner self-detection
      const snippet = 'const pkg = JSON.parse(fs.' + 'readFileSync("package.json", "utf8"));';
      await fs.writeFile(path.join(auditorsDir, 'bad_pkg.ts'), snippet, 'utf8');

      const auditor = new AuditorHygieneAuditor(tempDir);
      const result = await auditor.execute();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find(f => f.ruleId === ('auditor-manual-package-json' as AuditorHomebrewRuleId));
      expect(finding).toBeDefined();
    });

    it('detects auditor-manual-vue-sfc-regex when using homebrew template/script regex', async () => {
      const auditorsDir = path.join(tempDir, 'scripts', 'auditors');
      await fs.mkdir(auditorsDir, { recursive: true });

      const snippet = 'const m = /<temp' + 'late\\b[^>]*>([\\s\\S]*?)<\\/template>/i.exec(content);';
      await fs.writeFile(path.join(auditorsDir, 'bad_vue.ts'), snippet, 'utf8');

      const auditor = new AuditorHygieneAuditor(tempDir);
      const result = await auditor.execute();

      expect(result.summary.errors).toBeGreaterThan(0);
      const finding = result.findings.find(f => f.ruleId === ('auditor-manual-vue-sfc-regex' as AuditorHomebrewRuleId));
      expect(finding).toBeDefined();
    });

    it('detects auditor-manual-ts-ast when calling ts.createSourceFile directly', async () => {
      const auditorsDir = path.join(tempDir, 'scripts', 'auditors');
      await fs.mkdir(auditorsDir, { recursive: true });

      const snippet = 'const sf = ts.' + 'createSourceFile("file.ts", code, ts.ScriptTarget.Latest);';
      await fs.writeFile(path.join(auditorsDir, 'bad_ast.ts'), snippet, 'utf8');

      const auditor = new AuditorHygieneAuditor(tempDir);
      const result = await auditor.execute();

      expect(result.summary.errors).toBeGreaterThan(0);
      const finding = result.findings.find(f => f.ruleId === ('auditor-manual-ts-ast' as AuditorHomebrewRuleId));
      expect(finding).toBeDefined();
    });

    it('detects auditor-manual-path-normalize when using .split("\\\\").join("/")', async () => {
      const auditorsDir = path.join(tempDir, 'scripts', 'auditors');
      await fs.mkdir(auditorsDir, { recursive: true });

      const snippet = 'const norm = file.split(' + "'\\\\').join('/');";
      await fs.writeFile(path.join(auditorsDir, 'bad_norm.ts'), snippet, 'utf8');

      const auditor = new AuditorHygieneAuditor(tempDir);
      const result = await auditor.execute();

      expect(result.summary.errors).toBeGreaterThan(0);
      const finding = result.findings.find(f => f.ruleId === ('auditor-manual-path-normalize' as AuditorHomebrewRuleId));
      expect(finding).toBeDefined();
    });

    it('detects auditor-raw-console when calling console.log without coordination', async () => {
      const auditorsDir = path.join(tempDir, 'scripts', 'auditors');
      await fs.mkdir(auditorsDir, { recursive: true });

      const snippet = 'console.' + 'log("Running suite...");';
      await fs.writeFile(path.join(auditorsDir, 'bad_console.ts'), snippet, 'utf8');

      const auditor = new AuditorHygieneAuditor(tempDir);
      const result = await auditor.execute();

      expect(result.summary.errors).toBeGreaterThan(0);
      const finding = result.findings.find(f => f.ruleId === ('auditor-raw-console' as AuditorHomebrewRuleId));
      expect(finding).toBeDefined();
    });

    it('detects auditor-manual-comment-stripping when using regex to strip comments', async () => {
      const auditorsDir = path.join(tempDir, 'scripts', 'auditors');
      await fs.mkdir(auditorsDir, { recursive: true });

      const snippet = 'const clean = code.replace(' + '/\\/\\*[\\s\\S]*?\\*\\//g, "");';
      await fs.writeFile(path.join(auditorsDir, 'bad_comments.ts'), snippet, 'utf8');

      const auditor = new AuditorHygieneAuditor(tempDir);
      const result = await auditor.execute();

      expect(result.summary.errors).toBeGreaterThan(0);
      const finding = result.findings.find(f => f.ruleId === ('auditor-manual-comment-stripping' as AuditorHomebrewRuleId));
      expect(finding).toBeDefined();
    });

    it('detects auditor-manual-brace-counting when tracking braceDepth manually', async () => {
      const auditorsDir = path.join(tempDir, 'scripts', 'auditors');
      await fs.mkdir(auditorsDir, { recursive: true });

      const snippet = 'let brace' + 'Depth = 0; braceDepth++;';
      await fs.writeFile(path.join(auditorsDir, 'bad_brace.ts'), snippet, 'utf8');

      const auditor = new AuditorHygieneAuditor(tempDir);
      const result = await auditor.execute();

      expect(result.summary.errors).toBeGreaterThan(0);
      const finding = result.findings.find(f => f.ruleId === ('auditor-manual-brace-counting' as AuditorHomebrewRuleId));
      expect(finding).toBeDefined();
    });

    it('detects auditor-manual-path-containment when using manual startsWith("..")', async () => {
      const auditorsDir = path.join(tempDir, 'scripts', 'auditors');
      await fs.mkdir(auditorsDir, { recursive: true });

      const snippet = 'if (path.relative(root, file).starts' + 'With("..")) throw new Error();';
      await fs.writeFile(path.join(auditorsDir, 'bad_cwe22.ts'), snippet, 'utf8');

      const auditor = new AuditorHygieneAuditor(tempDir);
      const result = await auditor.execute();

      expect(result.summary.errors).toBeGreaterThan(0);
      const finding = result.findings.find(f => f.ruleId === ('auditor-manual-path-containment' as AuditorHomebrewRuleId));
      expect(finding).toBeDefined();
    });

    it('detects auditor-manual-file-walker when defining recursive directory walker', async () => {
      const auditorsDir = path.join(tempDir, 'scripts', 'auditors');
      await fs.mkdir(auditorsDir, { recursive: true });

      const snippet = 'function walk' + 'Files(dir: string): string[] { return []; }';
      await fs.writeFile(path.join(auditorsDir, 'bad_walker.ts'), snippet, 'utf8');

      const auditor = new AuditorHygieneAuditor(tempDir);
      const result = await auditor.execute();

      expect(result.summary.errors).toBeGreaterThan(0);
      const finding = result.findings.find(f => f.ruleId === ('auditor-manual-file-walker' as AuditorHomebrewRuleId));
      expect(finding).toBeDefined();
    });

    it('detects auditor-homebrew-predicates when using ad-hoc test or self-repo checks', async () => {
      const auditorsDir = path.join(tempDir, 'scripts', 'auditors');
      await fs.mkdir(auditorsDir, { recursive: true });

      const snippet = 'const isTest = filePath.in' + 'cludes(".spec.");';
      await fs.writeFile(path.join(auditorsDir, 'bad_predicate.ts'), snippet, 'utf8');

      const auditor = new AuditorHygieneAuditor(tempDir);
      const result = await auditor.execute();

      expect(result.summary.errors).toBeGreaterThan(0);
      const finding = result.findings.find(f => f.ruleId === ('auditor-homebrew-predicates' as AuditorHomebrewRuleId));
      expect(finding).toBeDefined();
    });

    it('respects inline // homebrew-ok: exemption annotations', async () => {
      const auditorsDir = path.join(tempDir, 'scripts', 'auditors');
      await fs.mkdir(auditorsDir, { recursive: true });

      const snippet = 'const norm = file.split(' + "'\\\\').join('/'); // homebrew-ok: benchmark test";
      await fs.writeFile(path.join(auditorsDir, 'exempt_file.ts'), snippet, 'utf8');

      const auditor = new AuditorHygieneAuditor(tempDir);
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});

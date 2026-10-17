/**
 * tests/validate_auditor_hygiene.test.ts
 *
 * Dedicated Vitest suite for AuditorHygieneAuditor:
 * - Metadata & Construction verification
 * - Dynamic registry extensibility (adding new detectors at runtime)
 * - Clean path execution on compliant auditors (0 errors, passed status)
 * - Violation detection covering 100% of declared homebrew rules
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import {
  HomebrewDetectorRegistry,
  type HomebrewDetector
} from '../src/analyzers/homebrew/index.ts';
import { resetAuditConfig } from '../src/core/auditConfig.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import {
  AuditorHygieneAuditor,
  AUDITOR_HOMEBREW_RULES,
  type AuditorHomebrewRuleId
} from '../src/suites/architecture/validate_auditor_hygiene.ts';

describe('AuditorHygieneAuditor', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    resetAuditConfig();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-hygiene-test-'));
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Metadata & Construction', () => {
    it('initializes with correct id, family, icon and package name and fulfills contract', () => {
      const auditor = new AuditorHygieneAuditor(tempDir);
      expect(auditor.id).toBe('validate_auditor_hygiene');
      expect(auditor.family).toBe('architecture');
      expect(auditor.packageName).toBe('Auditor');
      expect(auditor.icon).toBe('🧹');
      expect(auditor.name).toBe('Auditor Architecture & Homebrew Hygiene Validator');
      validateAuditorConstruction(auditor);
    });

    it('declares all canonical rules in AUDITOR_HOMEBREW_RULES', () => {
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
      expect(AUDITOR_HOMEBREW_RULES).toContain('auditor-manual-rule-timing');
      expect(AUDITOR_HOMEBREW_RULES).toContain('auditor-hardcoded-config');
      expect(AUDITOR_HOMEBREW_RULES).toContain('auditor-manual-step-logging');
      expect(AUDITOR_HOMEBREW_RULES).toContain('auditor-unmeasured-rule');
      expect(AUDITOR_HOMEBREW_RULES).toContain('auditor-redundant-rule-evaluated');
      expect(AUDITOR_HOMEBREW_RULES).toContain('auditor-third-party-tool-contract');
      expect(AUDITOR_HOMEBREW_RULES).toContain('auditor-inefficient-file-scan');
    });

    it('enforces composed rule descriptions <= 50 characters', () => {
      const auditor = new AuditorHygieneAuditor(tempDir);
      const descriptions = HomebrewDetectorRegistry.getRuleDescriptions();
      for (const [, desc] of Object.entries(descriptions)) {
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
      const finding = result.findings.find(
        (f) => f.ruleId === ('auditor-manual-package-json' as AuditorHomebrewRuleId)
      );
      expect(finding).toBeDefined();
    });

    it('detects auditor-manual-vue-sfc-regex when using homebrew template/script regex', async () => {
      const auditorsDir = path.join(tempDir, 'scripts', 'auditors');
      await fs.mkdir(auditorsDir, { recursive: true });

      const snippet =
        'const m = /<temp' + 'late\\b[^>]*>([\\s\\S]*?)<\\/template>/i.exec(content);';
      await fs.writeFile(path.join(auditorsDir, 'bad_vue.ts'), snippet, 'utf8');

      const auditor = new AuditorHygieneAuditor(tempDir);
      const result = await auditor.execute();

      expect(result.summary.errors).toBeGreaterThan(0);
      const finding = result.findings.find(
        (f) => f.ruleId === ('auditor-manual-vue-sfc-regex' as AuditorHomebrewRuleId)
      );
      expect(finding).toBeDefined();
    });

    it('detects auditor-manual-ts-ast when calling ts.createSourceFile directly', async () => {
      const auditorsDir = path.join(tempDir, 'scripts', 'auditors');
      await fs.mkdir(auditorsDir, { recursive: true });

      const snippet =
        'const sf = ts.' + 'createSourceFile("file.ts", code, ts.ScriptTarget.Latest);';
      await fs.writeFile(path.join(auditorsDir, 'bad_ast.ts'), snippet, 'utf8');

      const auditor = new AuditorHygieneAuditor(tempDir);
      const result = await auditor.execute();

      expect(result.summary.errors).toBeGreaterThan(0);
      const finding = result.findings.find(
        (f) => f.ruleId === ('auditor-manual-ts-ast' as AuditorHomebrewRuleId)
      );
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
      const finding = result.findings.find(
        (f) => f.ruleId === ('auditor-manual-path-normalize' as AuditorHomebrewRuleId)
      );
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
      const finding = result.findings.find(
        (f) => f.ruleId === ('auditor-raw-console' as AuditorHomebrewRuleId)
      );
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
      const finding = result.findings.find(
        (f) => f.ruleId === ('auditor-manual-comment-stripping' as AuditorHomebrewRuleId)
      );
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
      const finding = result.findings.find(
        (f) => f.ruleId === ('auditor-manual-brace-counting' as AuditorHomebrewRuleId)
      );
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
      const finding = result.findings.find(
        (f) => f.ruleId === ('auditor-manual-path-containment' as AuditorHomebrewRuleId)
      );
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
      const finding = result.findings.find(
        (f) => f.ruleId === ('auditor-manual-file-walker' as AuditorHomebrewRuleId)
      );
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
      const finding = result.findings.find(
        (f) => f.ruleId === ('auditor-homebrew-predicates' as AuditorHomebrewRuleId)
      );
      expect(finding).toBeDefined();
    });

    it('detects auditor-manual-rule-timing when measuring rule duration manually', async () => {
      const auditorsDir = path.join(tempDir, 'scripts', 'auditors');
      await fs.mkdir(auditorsDir, { recursive: true });

      const snippet =
        'const start = performance.' +
        'now();\n' +
        'doWork();\n' +
        'const elapsed = performance.' +
        'now() - start;\n' +
        'this.recordDuration("rule-1", elapsed);';
      await fs.writeFile(path.join(auditorsDir, 'bad_timing.ts'), snippet, 'utf8');

      const auditor = new AuditorHygieneAuditor(tempDir);
      const result = await auditor.execute();

      expect(result.summary.errors).toBeGreaterThan(0);
      const finding = result.findings.find(
        (f) => f.ruleId === ('auditor-manual-rule-timing' as AuditorHomebrewRuleId)
      );
      expect(finding).toBeDefined();
    });

    it('detects auditor-hardcoded-config when hardcoding candidate path arrays or ignores', async () => {
      const auditorsDir = path.join(tempDir, 'scripts', 'auditors');
      await fs.mkdir(auditorsDir, { recursive: true });

      const snippet = "const dirs = ['migra" + "tions', 'supabase/migrations'];";
      await fs.writeFile(path.join(auditorsDir, 'bad_config.ts'), snippet, 'utf8');

      const auditor = new AuditorHygieneAuditor(tempDir);
      const result = await auditor.execute();

      expect(result.summary.errors).toBeGreaterThan(0);
      const finding = result.findings.find(
        (f) => f.ruleId === ('auditor-hardcoded-config' as AuditorHomebrewRuleId)
      );
      expect(finding).toBeDefined();
    });

    it('detects auditor-third-party-tool-contract when external tools are invoked without declaring policy', async () => {
      const auditorsDir = path.join(tempDir, 'scripts', 'auditors');
      await fs.mkdir(auditorsDir, { recursive: true });

      const snippet = `
import { BaseAuditor } from '@francogp/auditor';
export class MissingPolicyAuditor extends BaseAuditor {
  constructor() {
    super({
      usesThirdPartyTool: false
    });
  }
  public override async runAudit(): Promise<void> {
    executeNodeCli('some-bin', []);
  }
}
      `;
      await fs.writeFile(path.join(auditorsDir, 'bad_third_party.ts'), snippet, 'utf8');

      const auditor = new AuditorHygieneAuditor(tempDir);
      const result = await auditor.execute();

      expect(result.summary.errors).toBeGreaterThan(0);
      const finding = result.findings.find(
        (f) => f.ruleId === ('auditor-third-party-tool-contract' as AuditorHomebrewRuleId)
      );
      expect(finding).toBeDefined();
      expect(finding?.context).toBe('missing-third-party-tool-policy');
    });

    it('respects inline // homebrew-ok: exemption annotations', async () => {
      const auditorsDir = path.join(tempDir, 'scripts', 'auditors');
      await fs.mkdir(auditorsDir, { recursive: true });

      const snippet =
        'const norm = file.split(' + "'\\\\').join('/'); // homebrew-ok: benchmark test";
      await fs.writeFile(path.join(auditorsDir, 'exempt_file.ts'), snippet, 'utf8');

      const auditor = new AuditorHygieneAuditor(tempDir);
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('scans self-provider repo suites and analyzers while skipping ignored patterns', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: '@francogp/auditor', version: '1.0.0' }),
        'utf-8'
      );
      await fs.writeFile(
        path.join(tempDir, 'plugin.json'),
        JSON.stringify({ name: 'auditor' }),
        'utf-8'
      );
      await fs.mkdir(path.join(tempDir, 'skills/auditor'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'skills/auditor/SKILL.md'), '# Auditor Skill', 'utf-8');

      await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, '.auditor/audit.config.json'),
        JSON.stringify({ name: '@francogp/auditor' }),
        'utf-8'
      );

      const suitesDir = path.join(tempDir, 'src/suites');
      const analyzersDir = path.join(tempDir, 'src/analyzers');
      const homebrewDir = path.join(tempDir, 'src/analyzers/homebrew');
      await fs.mkdir(suitesDir, { recursive: true });
      await fs.mkdir(analyzersDir, { recursive: true });
      await fs.mkdir(homebrewDir, { recursive: true });

      // Clean files
      await fs.writeFile(
        path.join(suitesDir, 'clean_suite.ts'),
        'export const SUITE = 1;\n',
        'utf-8'
      );
      await fs.writeFile(
        path.join(analyzersDir, 'clean_analyzer.ts'),
        'export const ANALYZER = 2;\n',
        'utf-8'
      );

      // Ignored patterns: .d.ts, test file, _private, and analyzers/homebrew/
      await fs.writeFile(
        path.join(suitesDir, 'types.d.ts'),
        'export type Foo = string;\n',
        'utf-8'
      );
      await fs.writeFile(
        path.join(suitesDir, 'suite.test.ts'),
        'console.' + 'log("test");\n',
        'utf-8'
      );
      await fs.writeFile(
        path.join(suitesDir, '_private.ts'),
        'console.' + 'log("private");\n',
        'utf-8'
      );
      await fs.writeFile(
        path.join(homebrewDir, 'detector.ts'),
        'console.' + 'log("homebrew");\n',
        'utf-8'
      );

      const auditor = new AuditorHygieneAuditor(tempDir);
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('handles configured extensions, exemptFiles, and disabledDetectors', async () => {
      await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, '.auditor/audit.config.json'),
        JSON.stringify({
          name: 'ext-project',
          extensions: ['scripts/custom/my_extension.ts'],
          auditorHygiene: {
            exemptFiles: ['scripts/auditors/exempted.ts'],
            disabledDetectors: ['raw-console']
          }
        }),
        'utf-8'
      );

      const customDir = path.join(tempDir, 'scripts/custom');
      const auditorsDir = path.join(tempDir, 'scripts/auditors');
      await fs.mkdir(customDir, { recursive: true });
      await fs.mkdir(auditorsDir, { recursive: true });

      // Extension file
      await fs.writeFile(
        path.join(customDir, 'my_extension.ts'),
        'export const EXT = 1;\n',
        'utf-8'
      );

      // Exempt file has raw console but is exempt
      await fs.writeFile(
        path.join(auditorsDir, 'exempted.ts'),
        'console.' + 'log("exempt");\n',
        'utf-8'
      );

      // File with raw console, but detector is disabled
      await fs.writeFile(
        path.join(auditorsDir, 'runner.ts'),
        'console.' + 'log("disabled detector");\n',
        'utf-8'
      );

      const auditor = new AuditorHygieneAuditor(tempDir);
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('marks rules not applicable when targetFiles is empty', async () => {
      const emptyDir = path.join(tempDir, 'empty-auditor-project');
      await fs.mkdir(emptyDir, { recursive: true });
      await fs.mkdir(path.join(emptyDir, '.auditor'), { recursive: true });
      await fs.writeFile(
        path.join(emptyDir, '.auditor/audit.config.json'),
        JSON.stringify({ name: 'empty-project' }),
        'utf-8'
      );

      const auditor = new AuditorHygieneAuditor(emptyDir);
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});

/**
 * Regression corpus extracted from the PokeBorrador extension migration
 * (conversation "Activar Auditoría en Test Aventura"). Every fixture below is a
 * pre-migration (legacy v6-style) extension body that the hygiene auditor MUST reject,
 * paired with the post-migration form it MUST accept. Fixtures concatenate banned
 * API names so whole-project scanners never mistake them for real workspace violations.
 */
describe('AuditorHygieneAuditor — extension migration regression corpus', () => {
  let tempDir: string;
  let auditorsDir: string;

  const STEP_LOG = 'this.context.log' + 'Step';
  const MARK_EVALUATED = 'this.mark' + 'RuleEvaluated';

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    resetAuditConfig();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-hygiene-migration-'));
    auditorsDir = path.join(tempDir, 'scripts', 'auditors');
    await fs.mkdir(auditorsDir, { recursive: true });
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function audit(fileName: string, lines: readonly string[]) {
    await fs.writeFile(path.join(auditorsDir, fileName), lines.join('\n'), 'utf8');
    const auditor = new AuditorHygieneAuditor(tempDir);
    return auditor.execute();
  }

  function findingsFor(result: Awaited<ReturnType<typeof audit>>, ruleId: AuditorHomebrewRuleId) {
    return result.findings.filter((f) => f.ruleId === ruleId);
  }

  describe('auditor-manual-step-logging', () => {
    it('rejects legacy manual step logging (validate_fsm_diagrams / validate_schema_parity style)', async () => {
      const result = await audit('legacy_steps.ts', [
        "export class LegacyStepsAuditor extends BaseAuditor<'fsm-state-missing'> {",
        '  public override async runAudit(): Promise<void> {',
        `    ${STEP_LOG}(1, 2, 'Comparando estados Mermaid del manual contra constantes JS...');`,
        "    this.runSubAuditorSync('fsm-state-missing', () => {});",
        `    ${STEP_LOG}(2, 2, 'Auditando transiciones Mermaid...');`,
        '  }',
        '}'
      ]);

      const stepFindings = findingsFor(result, 'auditor-manual-step-logging');
      expect(result.status).toBe('failed');
      expect(result.summary.errors).toBeGreaterThan(0);
      expect(stepFindings).toHaveLength(2);
      expect(stepFindings.every((f) => f.severity === 'error')).toBe(true);
    });

    it('rejects dynamic step logging with template literals and loop counters', async () => {
      const result = await audit('legacy_dynamic_steps.ts', [
        "export class DynamicStepsAuditor extends BaseAuditor<'sql-migration-drift'> {",
        '  public override async runAudit(): Promise<void> {',
        `    ${STEP_LOG}(1, 2, \`Validating timestamps across \${files.length} migrations...\`);`,
        '  }',
        '}'
      ]);

      expect(findingsFor(result, 'auditor-manual-step-logging')).toHaveLength(1);
    });

    it('accepts the migrated form without any manual step logging', async () => {
      const result = await audit('migrated_steps.ts', [
        "export class MigratedStepsAuditor extends BaseAuditor<'fsm-state-missing'> {",
        '  public override async runAudit(): Promise<void> {',
        "    this.runSubAuditorSync('fsm-state-missing', () => {});",
        '  }',
        '}'
      ]);

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
      expect(result.findings).toHaveLength(0);
    });

    it('respects inline // homebrew-ok: exemption on a step log line', async () => {
      const result = await audit('exempt_step.ts', [
        "export class ExemptStepAuditor extends BaseAuditor<'fsm-state-missing'> {",
        '  public override async runAudit(): Promise<void> {',
        `    ${STEP_LOG}(1, 1, 'x'); // homebrew-ok: legacy migration pending`,
        "    this.runSubAuditorSync('fsm-state-missing', () => {});",
        '  }',
        '}'
      ]);

      expect(findingsFor(result, 'auditor-manual-step-logging')).toHaveLength(0);
    });
  });

  describe('auditor-unmeasured-rule', () => {
    it('rejects validate_sprites pre-migration: mark + violations emitted outside any timing wrapper', async () => {
      const result = await audit('legacy_sprites.ts', [
        "export class LegacySpritesAuditor extends BaseAuditor<'sprite-missing-asset'> {",
        '  public override async runAudit(): Promise<void> {',
        `    ${MARK_EVALUATED}('sprite-missing-asset');`,
        '    const itemsToValidate = this.collectItemsToValidate();',
        '    let missingCount = 0;',
        '    for (const item of itemsToValidate) {',
        '      const isValid = await this.validateSingleSpriteSet(item);',
        '      if (!isValid) missingCount++;',
        '    }',
        "    this.context.setMetric('Incomplete sprite sets', missingCount);",
        '  }',
        '',
        '  private async validateSingleSpriteSet(item: string): Promise<boolean> {',
        "    this.addViolation({ ruleId: 'sprite-missing-asset', severity: 'error', file: item, line: 1, message: 'missing', context: item });",
        '    return false;',
        '  }',
        '}'
      ]);

      const unmeasured = findingsFor(result, 'auditor-unmeasured-rule');
      expect(result.status).toBe('failed');
      expect(unmeasured).toHaveLength(1);
      expect(unmeasured[0]!.context).toBe('sprite-missing-asset');
    });

    it('rejects validate_combat_invariants pre-migration: helper rule invoked directly from scanFile', async () => {
      const result = await audit('legacy_combat.ts', [
        "export class LegacyCombatAuditor extends FileScanAuditor<'showdown-healthy-status-null-prohibition' | 'battle-multi-seat-hardcoding'> {",
        '  protected override scanFile(relPath: string, content: string): void {',
        "    this.runSubAuditorSync('showdown-healthy-status-null-prohibition', () => {",
        '      this.auditStatusNull(relPath, content);',
        '    });',
        '',
        '    this.auditBinarySeats(relPath, content);',
        '  }',
        '',
        '  private auditStatusNull(relPath: string, content: string): void {',
        "    this.addViolation({ ruleId: 'showdown-healthy-status-null-prohibition', severity: 'error', file: relPath, line: 1, message: 'null status', context: content });",
        '  }',
        '',
        '  private auditBinarySeats(relPath: string, content: string): void {',
        "    this.addViolation({ ruleId: 'battle-multi-seat-hardcoding', severity: 'error', file: relPath, line: 1, message: 'seats', context: content });",
        '  }',
        '}'
      ]);

      const unmeasured = findingsFor(result, 'auditor-unmeasured-rule');
      expect(unmeasured).toHaveLength(1);
      expect(unmeasured[0]!.context).toBe('battle-multi-seat-hardcoding');
    });

    it('rejects validate_showdown_parity pre-migration: mark + loop violations without wrapper', async () => {
      const result = await audit('legacy_showdown.ts', [
        "export class LegacyShowdownAuditor extends BaseAuditor<'missing-protocol-token'> {",
        '  public override async runAudit(): Promise<void> {',
        `    ${MARK_EVALUATED}('missing-protocol-token');`,
        '    let totalTokensAudited = 0;',
        '    for (const [category, tokens] of Object.entries(CANONICAL_TOKENS)) {',
        '      for (const token of tokens) {',
        '        totalTokensAudited++;',
        '        if (!handledTokens.has(token)) {',
        "          this.addViolation({ ruleId: 'missing-protocol-token', severity: 'error', file: 'bridge.ts', line: 1, message: category, context: token });",
        '        }',
        '      }',
        '    }',
        "    this.context.setMetric('Tokens Audited', totalTokensAudited);",
        '  }',
        '}'
      ]);

      const unmeasured = findingsFor(result, 'auditor-unmeasured-rule');
      expect(unmeasured).toHaveLength(1);
      expect(unmeasured[0]!.context).toBe('missing-protocol-token');
    });

    it('reports each unmeasured rule once even with several violation sites', async () => {
      const result = await audit('legacy_many_sites.ts', [
        "export class ManySitesAuditor extends BaseAuditor<'rule-a'> {",
        '  public override async runAudit(): Promise<void> {',
        "    this.addViolation({ ruleId: 'rule-a', severity: 'error', file: 'a.ts', line: 1, message: 'a' });",
        "    this.addViolation({ ruleId: 'rule-a', severity: 'error', file: 'b.ts', line: 2, message: 'b' });",
        '  }',
        '}'
      ]);

      expect(findingsFor(result, 'auditor-unmeasured-rule')).toHaveLength(1);
    });

    it('accepts validate_fsm_flow_parity post-migration: async wrapper encloses all violations', async () => {
      const result = await audit('migrated_flow.ts', [
        "export class MigratedFlowAuditor extends BaseAuditor<'fsm-flow-sequence-missing'> {",
        '  public override async runAudit(): Promise<void> {',
        "    await this.runSubAuditor('fsm-flow-sequence-missing', async () => {",
        '      const manual = await readManual();',
        '      if (manual.length === 0) {',
        "        this.addViolation({ ruleId: 'fsm-flow-sequence-missing', severity: 'error', file: 'manual.md', line: 1, message: 'm' });",
        '      }',
        '    });',
        '  }',
        '}'
      ]);

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
      expect(result.findings).toHaveLength(0);
    });

    it('accepts post-migration helper violations when the call site wraps the same rule literal', async () => {
      const result = await audit('migrated_combat.ts', [
        "export class MigratedCombatAuditor extends FileScanAuditor<'battle-multi-seat-hardcoding'> {",
        '  protected override scanFile(relPath: string, content: string): void {',
        "    this.runSubAuditorSync('battle-multi-seat-hardcoding', () => {",
        '      this.auditBinarySeats(relPath, content);',
        '    });',
        '  }',
        '',
        '  private auditBinarySeats(relPath: string, content: string): void {',
        "    this.addViolation({ ruleId: 'battle-multi-seat-hardcoding', severity: 'error', file: relPath, line: 1, message: 's', context: content });",
        '  }',
        '}'
      ]);

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('accepts external-tool pattern: mark + reportRuleDuration provide measurement', async () => {
      const result = await audit('external_tool.ts', [
        "export class ExternalToolAuditor extends BaseAuditor<'tool-issue'> {",
        '  public override async runAudit(): Promise<void> {',
        `    ${MARK_EVALUATED}('tool-issue');`,
        "    this.reportRuleDuration('tool-issue', 12);",
        "    this.addViolation({ ruleId: 'tool-issue', severity: 'error', file: 'a.ts', line: 1, message: 'm' });",
        '  }',
        '}'
      ]);

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('does not guess when rule ids are measured dynamically (no false positives)', async () => {
      const result = await audit('dynamic_wrapper.ts', [
        "export class DynamicWrapperAuditor extends BaseAuditor<'rule-a' | 'rule-b'> {",
        '  public override async runAudit(): Promise<void> {',
        '    for (const r of this.ruleIds) {',
        '      this.runSubAuditorSync(r, () => {',
        "        this.addViolation({ ruleId: 'rule-a', severity: 'error', file: 'a.ts', line: 1, message: 'm' });",
        '      });',
        '    }',
        '  }',
        '}'
      ]);

      expect(findingsFor(result, 'auditor-unmeasured-rule')).toHaveLength(0);
      expect(result.status).toBe('passed');
    });

    it('ignores violations whose ruleId is not a string literal', async () => {
      const result = await audit('dynamic_violation.ts', [
        "export class DynamicViolationAuditor extends BaseAuditor<'rule-a'> {",
        '  public override async runAudit(): Promise<void> {',
        '    for (const finding of findings) {',
        '      this.addViolation({ ruleId: finding.ruleId, severity: finding.severity, file: finding.file, line: 1, message: finding.message });',
        '    }',
        '  }',
        '}'
      ]);

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('respects inline // homebrew-ok: exemption on the violation line', async () => {
      const result = await audit('exempt_unmeasured.ts', [
        "export class ExemptUnmeasuredAuditor extends BaseAuditor<'rule-a'> {",
        '  public override async runAudit(): Promise<void> {',
        "    this.addViolation({ ruleId: 'rule-a', severity: 'error', file: 'a.ts', line: 1, message: 'm' }); // homebrew-ok: measured by parent",
        '  }',
        '}'
      ]);

      expect(findingsFor(result, 'auditor-unmeasured-rule')).toHaveLength(0);
    });
  });

  describe('auditor-redundant-rule-evaluated', () => {
    it('rejects explicit mark immediately redundant with a measuring wrapper for the same rule', async () => {
      const result = await audit('redundant_mark.ts', [
        "export class RedundantMarkAuditor extends BaseAuditor<'my-rule'> {",
        '  public override async runAudit(): Promise<void> {',
        `    ${MARK_EVALUATED}('my-rule');`,
        "    this.runSubAuditorSync('my-rule', () => {});",
        '  }',
        '}'
      ]);

      const redundant = findingsFor(result, 'auditor-redundant-rule-evaluated');
      expect(result.status).toBe('failed');
      expect(redundant).toHaveLength(1);
      expect(redundant[0]!.context).toBe('my-rule');
    });

    it('rejects redundant mark in front of async and declared wrappers', async () => {
      const result = await audit('redundant_async.ts', [
        "export class RedundantAsyncAuditor extends BaseAuditor<'rule-a' | 'rule-b'> {",
        '  public override async runAudit(): Promise<void> {',
        `    ${MARK_EVALUATED}('rule-a');`,
        `    ${MARK_EVALUATED}('rule-b');`,
        "    await this.runSubAuditor('rule-a', async () => {});",
        "    this.declareFileSubAuditor('rule-b', () => {});",
        '  }',
        '}'
      ]);

      expect(findingsFor(result, 'auditor-redundant-rule-evaluated')).toHaveLength(2);
    });

    it('accepts a mark for a rule that is not wrapped (explicit external evaluation)', async () => {
      const result = await audit('single_mark.ts', [
        "export class SingleMarkAuditor extends BaseAuditor<'rule-a'> {",
        '  public override async runAudit(): Promise<void> {',
        `    ${MARK_EVALUATED}('rule-a');`,
        '  }',
        '}'
      ]);

      expect(findingsFor(result, 'auditor-redundant-rule-evaluated')).toHaveLength(0);
    });

    it('accepts markRuleNotApplicable alongside the measuring wrapper', async () => {
      const result = await audit('not_applicable.ts', [
        "export class NotApplicableAuditor extends BaseAuditor<'rule-a'> {",
        '  public override async runAudit(): Promise<void> {',
        "    this.runSubAuditorSync('rule-a', () => {",
        "      this.markRuleNotApplicable('rule-a', 'vite.config.ts no existe');",
        '    });',
        '  }',
        '}'
      ]);

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });

  describe('auditor-inefficient-file-scan', () => {
    it('detects nested rule loop over file iteration', async () => {
      const result = await audit('nested_rule_files.ts', [
        "export class NestedLoopAuditor extends BaseAuditor<'rule-a'> {",
        '  public override async runAudit(): Promise<void> {',
        '    for (const ruleId of this.ruleIds) {',
        '      for (const filePath of filePaths) {',
        '        const content = fs.readFileSync(filePath, "utf-8");',
        '      }',
        '    }',
        '  }',
        '}'
      ]);

      const findings = findingsFor(result, 'auditor-inefficient-file-scan');
      expect(result.status).toBe('failed');
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0]!.severity).toBe('error');
    });

    it('detects blind wildcards passed to external CLI tools', async () => {
      const result = await audit('blind_wildcard.ts', [
        "export class BlindWildcardAuditor extends BaseAuditor<'rule-a'> {",
        '  public override async runAudit(): Promise<void> {',
        '    const args = ["**/*.md", "--dot"];',
        '    executeNodeCli(binPath, args);',
        '  }',
        '}'
      ]);

      const findings = findingsFor(result, 'auditor-inefficient-file-scan');
      expect(result.status).toBe('failed');
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings[0]!.severity).toBe('error');
    });

    it('accepts clean single pass scanning', async () => {
      const result = await audit('single_pass_clean.ts', [
        "export class SinglePassAuditor extends BaseAuditor<'rule-a'> {",
        '  public override async runAudit(): Promise<void> {',
        '    await this.scanFilesSinglePass(filePaths, [',
        '      { ruleId: "rule-a", scan: () => {} }',
        '    ]);',
        '  }',
        '}'
      ]);

      expect(findingsFor(result, 'auditor-inefficient-file-scan')).toHaveLength(0);
    });
  });

  it('flags a full pre-migration extension with every legacy defect at once', async () => {
    const result = await audit('legacy_everything.ts', [
      "export class LegacyEverythingAuditor extends BaseAuditor<'rule-a' | 'rule-b'> {",
      '  public override async runAudit(): Promise<void> {',
      `    ${STEP_LOG}(1, 2, 'Loading...');`,
      `    ${MARK_EVALUATED}('rule-a');`,
      "    this.runSubAuditorSync('rule-a', () => {});",
      `    ${STEP_LOG}(2, 2, 'Validating...');`,
      "    this.addViolation({ ruleId: 'rule-b', severity: 'error', file: 'a.ts', line: 1, message: 'm' });",
      '  }',
      '}'
    ]);

    expect(result.status).toBe('failed');
    expect(findingsFor(result, 'auditor-manual-step-logging')).toHaveLength(2);
    expect(findingsFor(result, 'auditor-redundant-rule-evaluated')).toHaveLength(1);
    expect(findingsFor(result, 'auditor-unmeasured-rule')).toHaveLength(1);
  });
});

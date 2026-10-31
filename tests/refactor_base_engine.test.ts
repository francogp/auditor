/**
 * tests/refactor_base_engine.test.ts
 *
 * Exhaustive unit tests for BaseRefactorEngine and inherited refactor engines.
 * Validates dynamic configuration-driven file resolution, anti-hardcoding mandates,
 * test path gating, dataRoots exemption, section ignore rules, and tool gating.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { isInCodeRoots, isScriptPath, isSrcPath, isCliPath } from '../src/core/auditCodeRoots.ts';
import { resetAuditConfig, setAuditConfig, defineAuditConfig } from '../src/core/auditConfig.ts';
import type { AuditEngineConfig, DeepPartial } from '../src/core/auditConfigTypes.ts';
import { FileScanAuditor, createRuleCapabilities } from '../src/core/auditorBase.ts';
import { isDataPath, isDemoPath, isExemptFile } from '../src/core/auditPathPredicates.ts';
import {
  BaseRefactorEngine,
  assertValidRefactorEngineOptions,
  type RefactorEngineOptions
} from '../src/core/refactor/baseRefactorEngine.ts';
import { DomainRefactorEngine } from '../src/core/refactor/domainRefactorEngine.ts';
import { DupesRefactorEngine } from '../src/core/refactor/dupesRefactorEngine.ts';
import { MagicNumberExtractor } from '../src/core/refactor/magicNumberExtractor.ts';
import { MotionRefactorEngine } from '../src/core/refactor/motionRefactorEngine.ts';
import { O1RefactorEngine } from '../src/core/refactor/o1RefactorEngine.ts';
import { TypesRefactorEngine } from '../src/core/refactor/typesRefactorEngine.ts';
import { toPosixRelative } from '../src/core/safePath.ts';

class DummyAuditor extends FileScanAuditor<'dummy-rule'> {
  public constructor(options: { projectRoot?: string } = {}) {
    super({
      usesThirdPartyTool: false,
      ruleFixers: {},
      id: 'dummy_auditor',
      name: 'Dummy Auditor',
      description: 'Dummy',
      family: 'architecture',
      ruleIds: ['dummy-rule'],
      ruleDescriptions: { 'dummy-rule': 'Dummy' },
      ruleRemediations: {
        'dummy-rule':
          'Causa Raíz:\nDummy.\n\nDiagnóstico:\nDummy.\n\nSolución Canónica:\nDummy.\n\nEjemplo / Comando de auto-fix:\nDummy.'
      },
      ruleRemediationPhases: { 'dummy-rule': 'hygiene' },
      ruleCapabilities: createRuleCapabilities(['dummy-rule'], {
        speed: 'light',
        phase: 'normal',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      packageName: 'Dummy',
      icon: '🧪',
      configKey: 'codeSimplification',
      defaultConfig: { enabled: true },
      requiredPermissions: [],
      criticalConfig: {},
      projectRoot: options.projectRoot ?? process.cwd()
    });
  }
}

class DummyTestEngine extends BaseRefactorEngine<
  { id: string },
  { steps: string[] },
  DummyAuditor
> {
  public override readonly toolId = 'dummy';
  public override readonly configSectionKey = 'codeSimplification';

  public constructor(options: RefactorEngineOptions<DummyAuditor> = {}) {
    const opts = assertValidRefactorEngineOptions<DummyAuditor>(options);
    const auditor = opts.auditor ?? new DummyAuditor({ projectRoot: opts.projectRoot });
    super(auditor);
  }

  public override discoverInFile(_filePath: string): readonly { id: string }[] {
    return [{ id: 'found' }];
  }

  public override createPlan(
    _id: string,
    _findings: readonly { id: string }[]
  ): { steps: string[] } {
    return { steps: ['step1'] };
  }

  public override applyPlan(
    _projectRoot: string,
    _plan: { steps: string[] }
  ): { readonly modifiedFiles: readonly string[] } {
    return { modifiedFiles: [] };
  }
}

describe('BaseRefactorEngine & Inherited Refactor Engines', () => {
  let tempDir: string;
  let srcDir: string;
  let testsDir: string;
  let dataDir: string;
  let scriptsDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'base-refactor-engine-test-'));
    srcDir = path.join(tempDir, 'src');
    testsDir = path.join(tempDir, 'tests');
    dataDir = path.join(srcDir, 'data');
    scriptsDir = path.join(tempDir, 'scripts');

    await fs.mkdir(srcDir, { recursive: true });
    await fs.mkdir(testsDir, { recursive: true });
    await fs.mkdir(dataDir, { recursive: true });
    await fs.mkdir(scriptsDir, { recursive: true });

    // Populate files in various directories
    await fs.writeFile(path.join(srcDir, 'main.ts'), 'export const val = 42;\n');
    await fs.writeFile(path.join(srcDir, 'component.vue'), '<template><div>42</div></template>\n');
    await fs.writeFile(path.join(testsDir, 'main.test.ts'), 'expect(42).toBe(42);\n');
    await fs.writeFile(path.join(srcDir, 'main.spec.ts'), 'expect(42).toBe(42);\n');
    await fs.writeFile(path.join(dataDir, 'catalog.ts'), 'export const CATALOG = [1, 2, 3];\n');
    await fs.writeFile(path.join(scriptsDir, 'deploy.ts'), 'export const PORT = 3000;\n');
  });

  afterEach(async () => {
    resetAuditConfig();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  function configure(partial: DeepPartial<AuditEngineConfig>): AuditEngineConfig {
    const cfg = defineAuditConfig({
      name: 'test-project',
      ...partial
    });
    setAuditConfig(cfg, tempDir);
    return cfg;
  }

  describe('Inheritance & Type Contract', () => {
    it('all 6 refactor engines inherit from BaseRefactorEngine and bind subauditor', () => {
      configure({});
      const dummy = new DummyTestEngine({ projectRoot: tempDir });
      const magic = new MagicNumberExtractor({ projectRoot: tempDir });
      const domain = new DomainRefactorEngine({ projectRoot: tempDir });
      const motion = new MotionRefactorEngine({ projectRoot: tempDir });
      const o1 = new O1RefactorEngine({ projectRoot: tempDir });
      const types = new TypesRefactorEngine({ projectRoot: tempDir });
      const dupes = new DupesRefactorEngine({ projectRoot: tempDir });

      expect(dummy).toBeInstanceOf(BaseRefactorEngine);
      expect(magic).toBeInstanceOf(BaseRefactorEngine);
      expect(domain).toBeInstanceOf(BaseRefactorEngine);
      expect(motion).toBeInstanceOf(BaseRefactorEngine);
      expect(o1).toBeInstanceOf(BaseRefactorEngine);
      expect(types).toBeInstanceOf(BaseRefactorEngine);
      expect(dupes).toBeInstanceOf(BaseRefactorEngine);

      expect(dummy.getAuditor()).toBeDefined();
      expect(magic.getAuditor()).toBeDefined();
      expect(domain.getAuditor()).toBeDefined();
      expect(motion.getAuditor()).toBeDefined();
      expect(o1.getAuditor()).toBeDefined();
      expect(types.getAuditor()).toBeDefined();
      expect(dupes.getAuditor()).toBeDefined();
    });

    it('throws loud error when any refactor engine receives a string instead of options', () => {
      configure({});
      const badArg = tempDir as unknown;

      expect(() => new DummyTestEngine(badArg as never)).toThrow(
        '[BaseRefactorEngine Contract Violation]'
      );
      expect(() => new MagicNumberExtractor(badArg as never)).toThrow(
        '[BaseRefactorEngine Contract Violation]'
      );
      expect(() => new DomainRefactorEngine(badArg as never)).toThrow(
        '[BaseRefactorEngine Contract Violation]'
      );
      expect(() => new MotionRefactorEngine(badArg as never)).toThrow(
        '[BaseRefactorEngine Contract Violation]'
      );
      expect(() => new O1RefactorEngine(badArg as never)).toThrow(
        '[BaseRefactorEngine Contract Violation]'
      );
      expect(() => new TypesRefactorEngine(badArg as never)).toThrow(
        '[BaseRefactorEngine Contract Violation]'
      );
      expect(() => new DupesRefactorEngine(badArg as never)).toThrow(
        '[BaseRefactorEngine Contract Violation]'
      );
    });
  });

  describe('Dynamic Target Roots & Code Roots Resolution', () => {
    it('restricts scanned files strictly to config.paths.codeRoots', () => {
      configure({
        paths: {
          codeRoots: ['src']
        }
      });

      const engine = new DummyTestEngine({ projectRoot: tempDir });
      const files = engine.getScannableFiles();
      const relativeFiles = files;

      expect(relativeFiles).toContain('src/main.ts');
      expect(relativeFiles).toContain('src/component.vue');
      expect(relativeFiles).not.toContain('scripts/deploy.ts');
    });

    it('includes multiple declared codeRoots dynamically', () => {
      configure({
        paths: {
          codeRoots: ['src', 'scripts']
        }
      });

      const engine = new DummyTestEngine({ projectRoot: tempDir });
      const files = engine.getScannableFiles();
      const relativeFiles = files;

      expect(relativeFiles).toContain('src/main.ts');
      expect(relativeFiles).toContain('scripts/deploy.ts');
    });

    it('does not falsely include directory prefix homonyms like src-backup when codeRoot is src', async () => {
      const backupDir = path.join(tempDir, 'src-backup');
      await fs.mkdir(backupDir, { recursive: true });
      await fs.writeFile(path.join(backupDir, 'backup.ts'), 'export const old = 1;\n');

      configure({
        paths: {
          codeRoots: ['src']
        }
      });

      const engine = new DummyTestEngine({ projectRoot: tempDir });
      const files = engine.getScannableFiles();

      expect(files).toContain('src/main.ts');
      expect(files).not.toContain('src-backup/backup.ts');
      expect(engine.isPathScannable('src-backup/backup.ts')).toBe(false);
    });
  });

  describe('Test Path Exclusion & includeTestsInCodeAudit Gating', () => {
    it('excludes tests by default when includeTestsInCodeAudit is false/undefined', () => {
      configure({
        paths: {
          codeRoots: ['src', 'tests'],
          testRoots: ['tests'],
          includeTestsInCodeAudit: false
        }
      });

      const engine = new DummyTestEngine({ projectRoot: tempDir });
      const files = engine.getScannableFiles();
      const relativeFiles = files;

      expect(relativeFiles).toContain('src/main.ts');
      expect(relativeFiles).not.toContain('tests/main.test.ts');
      expect(relativeFiles).not.toContain('src/main.spec.ts');
    });

    it('includes tests when includeTestsInCodeAudit is explicitly true', () => {
      configure({
        paths: {
          codeRoots: ['src', 'tests'],
          testRoots: ['tests'],
          includeTestsInCodeAudit: true
        }
      });

      const engine = new DummyTestEngine({ projectRoot: tempDir });
      const files = engine.getScannableFiles();
      const relativeFiles = files;

      expect(relativeFiles).toContain('src/main.ts');
      expect(relativeFiles).toContain('tests/main.test.ts');
      expect(relativeFiles).toContain('src/main.spec.ts');
    });
  });

  describe('Data Roots Exemption in MagicNumberExtractor', () => {
    it('excludes paths.dataRoots in MagicNumberExtractor by contract', () => {
      configure({
        paths: {
          codeRoots: ['src'],
          dataRoots: ['src/data']
        }
      });

      const extractor = new MagicNumberExtractor({ projectRoot: tempDir });
      const files = extractor.getScannableFiles();
      const relativeFiles = files;

      expect(relativeFiles).toContain('src/main.ts');
      expect(relativeFiles).not.toContain('src/data/catalog.ts');
    });

    it('DummyTestEngine includes dataRoots when shouldIncludeDataPaths returns true', () => {
      configure({
        paths: {
          codeRoots: ['src'],
          dataRoots: ['src/data']
        }
      });

      const dummy = new DummyTestEngine({ projectRoot: tempDir });
      const files = dummy.getScannableFiles();
      const relativeFiles = files;

      expect(relativeFiles).toContain('src/data/catalog.ts');
    });
  });

  describe('Section-Specific Ignores & Exemptions', () => {
    it('respects constants.ignoreGlobs and constants.exemptPaths in MagicNumberExtractor', () => {
      configure({
        paths: {
          codeRoots: ['src']
        },
        constants: {
          ignoreGlobs: ['src/main.ts'],
          exemptPaths: ['src/component.vue']
        }
      });

      const extractor = new MagicNumberExtractor({ projectRoot: tempDir });
      const files = extractor.getScannableFiles();
      const relativeFiles = files;

      expect(relativeFiles).not.toContain('src/main.ts');
      expect(relativeFiles).not.toContain('src/component.vue');
    });

    it('respects global paths.ignoreGlobs across all engines', () => {
      configure({
        paths: {
          codeRoots: ['src'],
          ignoreGlobs: ['**/component.vue']
        }
      });

      const dummy = new DummyTestEngine({ projectRoot: tempDir });
      const files = dummy.getScannableFiles();
      const relativeFiles = files;

      expect(relativeFiles).toContain('src/main.ts');
      expect(relativeFiles).not.toContain('src/component.vue');
    });

    it('respects exemptPaths with glob suffixes and exemptCssFiles', () => {
      configure({
        paths: {
          codeRoots: ['src']
        },
        constants: {
          exemptPaths: ['src/**'],
          exemptFiles: ['src/main.ts']
        },
        styles: {
          exemptCssFiles: ['src/style.scss']
        }
      });

      const extractor = new MagicNumberExtractor({ projectRoot: tempDir });
      const files = extractor.getScannableFiles();
      expect(files).toHaveLength(0);

      const motion = new MotionRefactorEngine({ projectRoot: tempDir });
      const motionExempts = motion.resolveSectionExemptPaths();
      expect(motionExempts).toContain('src/style.scss');
    });

    it('handles engines without a configSectionKey gracefully', () => {
      class NoSectionEngine extends BaseRefactorEngine<
        { id: string },
        { steps: string[] },
        DummyAuditor
      > {
        public override readonly toolId = 'nosection';
        public override readonly configSectionKey = undefined;

        public constructor(options: RefactorEngineOptions<DummyAuditor> = {}) {
          const opts = assertValidRefactorEngineOptions<DummyAuditor>(options);
          const auditor = opts.auditor ?? new DummyAuditor({ projectRoot: opts.projectRoot });
          super(auditor);
        }

        public discoverInFile() {
          return [];
        }
        public createPlan() {
          return { steps: [] };
        }
        public applyPlan(_projectRoot: string, _plan: { steps: string[] }) {
          return { modifiedFiles: [] };
        }
      }

      const noSection = new NoSectionEngine({ projectRoot: tempDir });
      expect(noSection.resolveSectionIgnorePatterns()).toEqual([]);
      expect(noSection.resolveSectionExemptPaths()).toEqual([]);
      expect(noSection.isToolEnabled()).toBe(true);
    });

    it('actively excludes files matching ignoredPatterns and exemptPaths in both getScannableFiles and isPathScannable', () => {
      configure({
        paths: {
          codeRoots: ['src'],
          ignoredPatterns: ['src/component.vue']
        },
        constants: {
          exemptPaths: ['src/main.ts']
        }
      });

      const extractor = new MagicNumberExtractor({ projectRoot: tempDir });
      const files = extractor.getScannableFiles();

      expect(files).not.toContain('src/main.ts');
      expect(files).not.toContain('src/component.vue');
      expect(extractor.isPathScannable('src/main.ts')).toBe(false);
      expect(extractor.isPathScannable('src/component.vue')).toBe(false);
    });
  });

  describe('Tool Gating & isToolEnabled', () => {
    it('returns true when section is not disabled', () => {
      configure({
        codeSimplification: {
          enabled: true
        }
      });

      const dummy = new DummyTestEngine({ projectRoot: tempDir });
      expect(dummy.isToolEnabled()).toBe(true);
    });

    it('returns false when section is explicitly disabled', () => {
      configure({
        codeSimplification: {
          enabled: false
        }
      });

      const dummy = new DummyTestEngine({ projectRoot: tempDir });
      expect(dummy.isToolEnabled()).toBe(false);
    });
  });

  describe('Engine Execution & Plan Lifecycle', () => {
    it('executes discoverAll, createPlan and applyPlan through BaseRefactorEngine contract', async () => {
      configure({});
      const dummy = new DummyTestEngine({ projectRoot: tempDir });
      const allFindings = dummy.discoverAll();
      expect(allFindings.length).toBeGreaterThan(0);

      const flatFindings = allFindings.flatMap((item) => item.findings);
      const plan = dummy.createPlan('test-plan', flatFindings);
      expect(plan.steps).toEqual(['step1']);

      const applied = dummy.applyPlan(tempDir, plan);
      expect(applied.modifiedFiles).toBeDefined();
    });

    it('DomainRefactorEngine creates and applies domain hygiene plan', async () => {
      configure({});
      const domainFile = path.join(srcDir, 'domain.ts');
      await fs.writeFile(
        domainFile,
        'export const STATUSES = ["open", "closed"];\nexport type UserId = string;\n',
        'utf-8'
      );

      const engine = new DomainRefactorEngine({ projectRoot: tempDir });
      const findings = engine.discoverInFile(domainFile);
      expect(findings.length).toBeGreaterThan(0);

      const plan = engine.createPlan('domain-plan', findings);
      expect(plan.planId).toBe('domain-plan');

      const res = await engine.applyPlan(tempDir, plan);
      const normalizedModified = res.modifiedFiles.map((f) => toPosixRelative(tempDir, f));
      expect(normalizedModified).toContain('src/domain.ts');
    });

    it('O1RefactorEngine creates and applies optimization plan', async () => {
      configure({});
      const o1File = path.join(srcDir, 'o1.ts');
      await fs.writeFile(
        o1File,
        'export const ALLOWED_IDS = [1, 2, 3];\nfunction check(x: number) { return ALLOWED_IDS.includes(x); }\n',
        'utf-8'
      );

      const engine = new O1RefactorEngine({ projectRoot: tempDir });
      const findings = engine.discoverInFile(o1File);
      expect(findings.length).toBeGreaterThan(0);

      const plan = engine.createPlan('o1-plan', findings);
      expect(plan.planId).toBe('o1-plan');

      const res = await engine.applyPlan(tempDir, plan);
      expect(res.modifiedFiles).toBeDefined();
    });

    it('TypesRefactorEngine creates and applies type assertion plan', async () => {
      configure({});
      const typesFile = path.join(srcDir, 'types.ts');
      await fs.writeFile(
        typesFile,
        'export function calc(x: number) { const y = x as any; return y; }\n',
        'utf-8'
      );

      const engine = new TypesRefactorEngine({ projectRoot: tempDir });
      const findings = engine.discoverInFile(typesFile);
      expect(findings.length).toBeGreaterThan(0);

      const plan = engine.createPlan('types-plan', findings);
      expect(plan.planId).toBe('types-plan');

      const res = await engine.applyPlan(tempDir, plan);
      expect(res.modifiedFiles).toBeDefined();
    });

    it('MotionRefactorEngine creates and applies animation plan', async () => {
      configure({});
      const motionFile = path.join(srcDir, 'motion.ts');
      await fs.writeFile(
        motionFile,
        'export function animate() { setTimeout(() => {}, 100); }\n',
        'utf-8'
      );

      const engine = new MotionRefactorEngine({ projectRoot: tempDir });
      const findings = engine.discoverInFile(motionFile);
      expect(findings.length).toBeGreaterThan(0);

      const plan = engine.createPlan('motion-plan', findings);
      expect(plan.planId).toBe('motion-plan');

      const res = await engine.applyPlan(tempDir, plan);
      expect(res.modifiedFiles).toBeDefined();
    });

    it('MagicNumberExtractor creates and applies magic refactor plan', async () => {
      configure({});
      const magicFile = path.join(srcDir, 'magic.ts');
      await fs.writeFile(
        magicFile,
        'export function calc(val: number) { if (val > 4200) return val; return 0; }\n',
        'utf-8'
      );

      const engine = new MagicNumberExtractor({ projectRoot: tempDir });
      const findings = engine.discoverInFile(magicFile);
      expect(findings.length).toBeGreaterThan(0);

      const plan = engine.createPlan('magic-plan', findings);
      expect(plan.planId).toBe('magic-plan');

      const res = await engine.applyPlan(tempDir, plan);
      expect(res.modifiedFiles).toBeDefined();
    });

    it('MagicNumberExtractor scans SCSS and Vue files with style variables', async () => {
      configure({});
      const scssFile = path.join(srcDir, 'style.scss');
      await fs.writeFile(scssFile, '.modal { z-index: 9999; color: #1e293b; }\n', 'utf-8');

      const vueFile = path.join(srcDir, 'Widget.vue');
      await fs.writeFile(
        vueFile,
        '<template><div>Hello</div></template>\n<script setup>\nexport function calc(x: number) { return x + 8888; }\n</script>\n<style scoped>\n.box { z-index: 5000; }\n</style>\n',
        'utf-8'
      );

      const engine = new MagicNumberExtractor({ projectRoot: tempDir });
      const scssFindings = engine.discoverInFile(scssFile);
      expect(scssFindings.length).toBeGreaterThan(0);

      const vueFindings = engine.discoverInFile(vueFile);
      expect(vueFindings.length).toBeGreaterThan(0);

      const packet = engine.generateSuperDiracPacket(tempDir, 'Widget.vue', vueFindings);
      expect(packet.file).toBe('Widget.vue');
      expect(packet.items.length).toBeGreaterThan(0);
    });
  });

  describe('auditCodeRoots & auditPathPredicates Predicates', () => {
    it('evaluates isInCodeRoots correctly with tests and roots', () => {
      const cfg = defineAuditConfig({
        name: 'test',
        paths: {
          codeRoots: ['src', 'scripts'],
          testRoots: ['tests'],
          includeTestsInCodeAudit: false
        }
      });
      expect(isInCodeRoots('src/core/main.ts', cfg)).toBe(true);
      expect(isInCodeRoots('scripts/build.ts', cfg)).toBe(true);
      expect(isInCodeRoots('tests/main.test.ts', cfg)).toBe(false);
      expect(isInCodeRoots('node_modules/pkg/index.ts', cfg)).toBe(false);
      expect(isInCodeRoots('', cfg)).toBe(false);

      const cfgWithTests = defineAuditConfig({
        name: 'test-with-tests',
        paths: {
          codeRoots: ['src', 'tests'],
          includeTestsInCodeAudit: true
        }
      });
      expect(isInCodeRoots('tests/main.test.ts', cfgWithTests)).toBe(true);
    });

    it('evaluates isScriptPath, isSrcPath, and isCliPath correctly', () => {
      const cfg = defineAuditConfig({
        name: 'test-scripts',
        paths: {
          scriptsRoots: ['scripts', 'tools'],
          srcRoots: ['src', 'lib'],
          cliRoots: ['src/cli', 'bin']
        }
      });
      expect(isScriptPath('scripts/deploy.ts', cfg)).toBe(true);
      expect(isScriptPath('tools/run.js', cfg)).toBe(true);
      expect(isScriptPath('src/main.ts', cfg)).toBe(false);
      expect(isScriptPath('', cfg)).toBe(false);

      expect(isSrcPath('src/main.ts', cfg)).toBe(true);
      expect(isSrcPath('lib/helper.ts', cfg)).toBe(true);
      expect(isSrcPath('docs/readme.md', cfg)).toBe(false);
      expect(isSrcPath('', cfg)).toBe(false);

      expect(isCliPath('src/cli/report.ts', cfg)).toBe(true);
      expect(isCliPath('bin/auditor.js', cfg)).toBe(true);
      expect(isCliPath('src/core/base.ts', cfg)).toBe(false);
      expect(isCliPath('', cfg)).toBe(false);
    });

    it('evaluates isDataPath, isDemoPath, and isExemptFile correctly', () => {
      const cfg = defineAuditConfig({
        name: 'test-data',
        paths: {
          dataRoots: ['src/data', 'game_data'],
          demoRoots: ['demo', 'playground'],
          exemptFiles: ['src/generated/types.ts', 'constants.ts']
        }
      });
      expect(isDataPath('src/data/items.json', cfg)).toBe(true);
      expect(isDataPath('game_data/levels.ts', cfg)).toBe(true);
      expect(isDataPath('src/main.ts', cfg)).toBe(false);
      expect(isDataPath('', cfg)).toBe(false);

      expect(isDemoPath('demo/index.html', cfg)).toBe(true);
      expect(isDemoPath('playground/test.vue', cfg)).toBe(true);
      expect(isDemoPath('src/app.vue', cfg)).toBe(false);
      expect(isDemoPath('', cfg)).toBe(false);

      expect(isExemptFile('src/generated/types.ts', cfg)).toBe(true);
      expect(isExemptFile('src/constants.ts', cfg)).toBe(true);
      expect(isExemptFile('src/other.ts', cfg)).toBe(false);
      expect(isExemptFile('', cfg)).toBe(false);
    });
  });
});

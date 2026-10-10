/**
 * tests/node/auditors/auditor_base.test.ts
 *
 * Dedicated unit test suite for auditorBase.ts core infrastructure:
 * - CANONICAL_IGNORE_DIRS, ALWAYS_IGNORE_DIRS, and CODE_ONLY_IGNORE_DIRS integrity
 * - isPathIgnored behavior with unignoreDirs and wildcard extraIgnorePatterns
 * - collectRepositoryFiles single-file support and directory unignoring
 * - BaseAuditor projectRoot isolation for safe, reproducible testing
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  ALWAYS_IGNORE_DIRS,
  CODE_ONLY_IGNORE_DIRS,
  CANONICAL_IGNORE_DIRS,
  isPathIgnored,
  collectRepositoryFiles,
  BaseAuditor,
  type AuditorOptions
} from '../src/core/auditorBase.ts';
import { deriveCoverageFromRequiredFiles } from '../src/core/auditCoverage.ts';
import type { AuditorCapabilities } from '../src/core/auditContract.ts';

describe('auditorBase infrastructure', () => {
  describe('SSoT Ignore Sets Integrity', () => {
    it('defines ALWAYS_IGNORE_DIRS with build artifacts, logs, and caches', () => {
      expect(ALWAYS_IGNORE_DIRS.has('node_modules')).toBe(true);
      expect(ALWAYS_IGNORE_DIRS.has('.git')).toBe(true);
      expect(ALWAYS_IGNORE_DIRS.has('dist')).toBe(true);
      expect(ALWAYS_IGNORE_DIRS.has('coverage')).toBe(true);
      expect(ALWAYS_IGNORE_DIRS.has('scratch')).toBe(true);
      expect(ALWAYS_IGNORE_DIRS.has('tmp')).toBe(true);
      expect(ALWAYS_IGNORE_DIRS.has('volumes')).toBe(true);
    });

    it('defines CODE_ONLY_IGNORE_DIRS for agents and static assets', () => {
      expect(CODE_ONLY_IGNORE_DIRS.has('.agents')).toBe(true);
      expect(CODE_ONLY_IGNORE_DIRS.has('public')).toBe(true);
    });

    it('unifies all sets into CANONICAL_IGNORE_DIRS', () => {
      for (const dir of ALWAYS_IGNORE_DIRS) {
        expect(CANONICAL_IGNORE_DIRS.has(dir)).toBe(true);
      }
      for (const dir of CODE_ONLY_IGNORE_DIRS) {
        expect(CANONICAL_IGNORE_DIRS.has(dir)).toBe(true);
      }
    });
  });

  describe('isPathIgnored', () => {
    it('ignores default canonical directories in paths', () => {
      expect(isPathIgnored('node_modules/foo/bar.js')).toBe(true);
      expect(isPathIgnored('dist/bundle.js')).toBe(true);
      expect(isPathIgnored('coverage/lcov.info')).toBe(true);
      expect(isPathIgnored('scratch/temp.json')).toBe(true);
      expect(isPathIgnored('tmp/build.json')).toBe(true);
    });

    it('ignores .agents and public by default for standard code auditors', () => {
      expect(isPathIgnored('.agents/skills/fallow/SKILL.md')).toBe(true);
      expect(isPathIgnored('public/favicon.ico')).toBe(true);
    });

    it('allows documentation auditors to unignore specific directories via unignoreDirs', () => {
      const unignores = ['.agents'];
      expect(isPathIgnored('.agents/skills/auditor/SKILL.md', [], unignores)).toBe(false);

      // But still strictly ignores node_modules and scratch
      expect(isPathIgnored('node_modules/foo/.agents/index.md', [], unignores)).toBe(true);
      expect(isPathIgnored('scratch/docs.md', [], unignores)).toBe(true);
    });

    it('supports glob wildcard extraIgnorePatterns', () => {
      expect(isPathIgnored('src/components/temp.vue', ['**/temp.vue'])).toBe(true);
      expect(isPathIgnored('scripts/auditors/sample.ts', ['scripts/auditors/**'])).toBe(true);
      expect(isPathIgnored('src/components/Real.vue', ['scripts/auditors/**'])).toBe(false);
    });
  });

  describe('collectRepositoryFiles & projectRoot isolation', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-base-test-'));
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.mkdir(path.join(tempDir, '.agents/skills/demo'), { recursive: true });
      await fs.mkdir(path.join(tempDir, 'node_modules/some-pkg'), { recursive: true });

      await fs.writeFile(path.join(tempDir, 'src/main.ts'), 'console.log("hello");');
      await fs.writeFile(path.join(tempDir, '.agents/skills/demo/SKILL.md'), '# Skill');
      await fs.writeFile(path.join(tempDir, 'node_modules/some-pkg/index.js'), 'module.exports = {};');
      await fs.writeFile(path.join(tempDir, 'AGENTS.md'), '# Global Rules');
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('scans single file without throwing ENOTDIR', () => {
      const singleFilePath = path.join(tempDir, 'AGENTS.md');
      const files = collectRepositoryFiles(
        singleFilePath,
        tempDir,
        [],
        new Set(['.md']),
        ['.agents']
      );
      expect(files).toHaveLength(1);
      expect(files[0]).toBe(singleFilePath);
    });

    it('skips ignored directories and respects unignoreDirs in file discovery', () => {
      const codeFiles = collectRepositoryFiles(
        tempDir,
        tempDir,
        [],
        new Set(['.ts', '.js', '.md'])
      );
      // node_modules and .agents should be ignored by default
      const relPaths = codeFiles.map(f => path.relative(tempDir, f).replace(/\\/g, '/'));
      expect(relPaths).toContain('src/main.ts');
      expect(relPaths).toContain('AGENTS.md');
      expect(relPaths).not.toContain('.agents/skills/demo/SKILL.md');
      expect(relPaths.some(p => p.includes('node_modules'))).toBe(false);

      // With .agents unignored
      const docFiles = collectRepositoryFiles(
        tempDir,
        tempDir,
        [],
        new Set(['.md']),
        ['.agents']
      );
      const docRelPaths = docFiles.map(f => path.relative(tempDir, f).replace(/\\/g, '/'));
      expect(docRelPaths).toContain('.agents/skills/demo/SKILL.md');
      expect(docRelPaths).toContain('AGENTS.md');
    });

    it('BaseAuditor scopes collection to custom projectRoot', async () => {
      class TestAuditor extends BaseAuditor<'test-rule'> {
        constructor(root: string) {
          super({
            id: 'test_auditor',
            name: 'Test Auditor',
            description: 'Test auditor for projectRoot verification',
            family: 'architecture',
            packageName: 'Test',
            icon: '🧪',
            configKey: 'paths',
            defaultConfig: {},
            criticalConfig: {},
            ruleIds: ['test-rule'],
            capabilities: {
              fix: false,
              fixPriority: false,
              lint: false,
              md: false,
              ast: false,
              changedSince: false,
              heavy: false,
              requiresBuild: false,
              postRun: false
            },
            ruleDescriptions: {
              'test-rule': 'Regla de test'
            },
            coverage: { include: ['src/**/*.ts'] },
            roots: ['src'],
            allowedExtensions: new Set(['.ts']),
            projectRoot: root
          });
        }

        public override async runAudit(): Promise<void> {
          const files = this.context.collectFiles(this.roots, this.allowedExtensions);
          for (const f of files) {
            this.recordScanned(f);
          }
          this.markRuleEvaluated('test-rule', files.length);
          this.context.setMetric('Total Files Scanned', files.length);
        }
      }

      process.env.AUDIT_SUBPROCESS = 'true';
      const auditor = new TestAuditor(tempDir);
      const result = await auditor.execute();
      delete process.env.AUDIT_SUBPROCESS;

      expect(result.metrics?.['Total Files Scanned']).toBe(1);
      expect(auditor.getFilesScanned()).toBe(1);
    });
  });

  describe('AuditorCapabilities Contract & Runtime Validation', () => {
    class MinimalAuditor extends BaseAuditor<'dummy'> {
      constructor(options: Partial<AuditorOptions<'dummy'>>) {
        super(options as AuditorOptions<'dummy'>);
      }
      public override async runAudit(): Promise<void> {}
    }

    const validBaseOptions = {
      id: 'test_cap_validation',
      name: 'Capabilities Validation Tester',
      description: 'Valida capacidades operacionales estrictas',
      family: 'architecture' as const,
      packageName: 'Test',
      icon: '🧪',
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
      ruleIds: ['dummy' as const],
      ruleDescriptions: { dummy: 'Regla dummy' },
      coverage: { include: ['src/**/*.ts'] },
      capabilities: {
        fix: false,
        fixPriority: false,
        lint: false,
        md: false,
        ast: false,
        changedSince: false,
        heavy: false,
        requiresBuild: false,
        postRun: false
      }
    };

    it('enforces mandatory thematic icon/emoji during instantiation', () => {
      expect(() => {
        new MinimalAuditor({
          ...validBaseOptions,
          icon: ''
        });
      }).toThrow(/must define a mandatory thematic icon\/emoji/);

      expect(() => {
        new MinimalAuditor({
          ...validBaseOptions,
          icon: undefined
        });
      }).toThrow(/must define a mandatory thematic icon\/emoji/);
    });

    it('enforces mandatory configKey during instantiation', () => {
      expect(() => {
        new MinimalAuditor({
          ...validBaseOptions,
          configKey: ''
        });
      }).toThrow(/must define a mandatory 'configKey'/);

      expect(() => {
        new MinimalAuditor({
          ...validBaseOptions,
          configKey: undefined as unknown as string
        });
      }).toThrow(/must define a mandatory 'configKey'/);
    });

    it('enforces mandatory defaultConfig during instantiation', () => {
      expect(() => {
        new MinimalAuditor({
          ...validBaseOptions,
          defaultConfig: undefined as unknown as Record<string, unknown>
        });
      }).toThrow(/must define a mandatory 'defaultConfig'/);
    });

    it('enforces explicit defaultConfig.enabled boolean for subsystem suites', () => {
      expect(() => {
        new MinimalAuditor({
          ...validBaseOptions,
          configKey: 'mySubsystem.enabled',
          defaultConfig: {}
        });
      }).toThrow(/must explicitly define 'defaultConfig.enabled' as a boolean/);

      expect(() => {
        new MinimalAuditor({
          ...validBaseOptions,
          configKey: 'mySubsystem.enabled',
          defaultConfig: { enabled: true }
        });
      }).not.toThrow();
    });

    it('throws when capabilities is omitted from constructor options', () => {
      const { capabilities: _, ...withoutCaps } = validBaseOptions;
      expect(() => {
        new MinimalAuditor(withoutCaps);
      }).toThrow(/must define mandatory 'capabilities'/);
    });

    it('throws when capabilities has missing sub-fields (partial capabilities rejected)', () => {
      expect(() => {
        new MinimalAuditor({
          ...validBaseOptions,
          capabilities: { fix: false } as unknown as AuditorCapabilities
        });
      }).toThrow(/must explicitly define sub-capability 'capabilities.fixPriority' as a boolean/);
    });

    it('throws when declared capability is not a boolean or unknown', () => {
      expect(() => {
        new MinimalAuditor({
          ...validBaseOptions,
          capabilities: {
            ...validBaseOptions.capabilities,
            fix: 'true' as unknown as boolean
          }
        });
      }).toThrow(/must explicitly define sub-capability 'capabilities.fix' as a boolean/);

      expect(() => {
        new MinimalAuditor({
          ...validBaseOptions,
          capabilities: {
            ...validBaseOptions.capabilities,
            unknownFlag: true
          } as unknown as AuditorCapabilities
        });
      }).toThrow(/declared unknown capability 'unknownFlag'/);
    });

    it('successfully exposes capabilities and auto-derives requiresAst on BaseAuditor instance', () => {
      const expectedCaps = {
        fix: false,
        lint: false,
        md: false,
        ast: true,
        changedSince: false,
        heavy: true,
        requiresBuild: false,
        postRun: false,
        fixPriority: false
      };
      const auditor = new MinimalAuditor({
        ...validBaseOptions,
        capabilities: {
          ...validBaseOptions.capabilities,
          ast: true,
          heavy: true
        }
      });
      expect(auditor.capabilities).toEqual(expectedCaps);
      expect(auditor.requiresAst).toBe(true);
    });
  });

  describe('Assertion and Collection Ergonomics', () => {
    class AssertionAuditor extends BaseAuditor<'rule-a' | 'rule-b'> {
      constructor(projectRoot: string) {
        super({
          id: 'test_assertion_auditor',
          name: 'Assertion Tester',
          description: 'Valida ergonomia de asercion y coleccion',
          family: 'architecture',
          packageName: 'Assert',
          icon: '✅',
          configKey: 'paths',
          defaultConfig: {},
          criticalConfig: {},
          capabilities: {
            fix: false,
            fixPriority: false,
            lint: false,
            md: false,
            ast: false,
            changedSince: false,
            heavy: false,
            requiresBuild: false,
            postRun: false
          },
          ruleIds: ['rule-a', 'rule-b'],
          ruleDescriptions: {
            'rule-a': 'Regla de asercion A',
            'rule-b': 'Regla de asercion B'
          },
          coverage: { include: ['src/**/*.ts'] },
          projectRoot
        });
      }

      public override async runAudit(): Promise<void> {
        this.evaluateRuleSync('rule-a', () => {
          // Sync check passing
        });

        this.assertRule('rule-b', false, {
          message: 'Fallo intencional de asercion B',
          severity: 'error'
        });
      }

      public testCollect(roots: readonly string[]): string[] {
        return this.context.collectFiles(roots);
      }
    }

    it('records rule evaluations via evaluateRuleSync and assertRule, and reports violations', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-assert-'));
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'src/index.ts'), 'export const x = 1;');

      try {
        process.env.AUDIT_SUBPROCESS = 'true';
        const auditor = new AssertionAuditor(tempDir);
        const result = await auditor.execute();

        expect(auditor.getCoverageRecorder().getEvaluations('rule-a')).toBe(1);
        expect(auditor.getCoverageRecorder().getEvaluations('rule-b')).toBe(1);
        expect(result.summary.errors).toBe(1);
        expect(result.findings[0]?.message).toBe('Fallo intencional de asercion B');
      } finally {
        delete process.env.AUDIT_SUBPROCESS;
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('automatically records scanned files when context.collectFiles is called', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-collect-'));
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'src/a.ts'), 'export const a = 1;');
      await fs.writeFile(path.join(tempDir, 'src/b.ts'), 'export const b = 2;');

      try {
        const auditor = new AssertionAuditor(tempDir);
        expect(auditor.getCoverageRecorder().scannedCount).toBe(0);

        const collected = auditor.testCollect(['src']);
        expect(collected.length).toBe(2);
        expect(auditor.getCoverageRecorder().scannedCount).toBe(2);
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('derives coverage with allowedExtensions from directory requiredFiles correctly', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-req-files-'));
      await fs.mkdir(path.join(tempDir, 'migrations'), { recursive: true });

      try {
        const withoutExts = deriveCoverageFromRequiredFiles(['migrations'], tempDir);
        expect(withoutExts.include).toEqual(['migrations/**']);

        const withExts = deriveCoverageFromRequiredFiles(['migrations'], tempDir, new Set(['.sql']));
        expect(withExts.include).toEqual(['migrations/**/*.sql']);
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });
  });
});


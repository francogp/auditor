/**
 * packages/auditor/tests/validate_fallow_config.test.ts
 *
 * Dedicated unit test suite for ValidateFallowConfigAuditor:
 * - Missing config (fallow-config-missing)
 * - JSON syntax error (fallow-config-syntax)
 * - Banned entry globs (fallow-banned-entry-glob)
 * - Stale file in ignoreExports (fallow-stale-file)
 * - Empty export list (fallow-empty-export-list)
 * - Duplicate entries (fallow-duplicate-entry)
 * - Stale export not in file (fallow-stale-export)
 * - Clean execution verification (0 errors, passed status)
 */

import fs from 'node:fs';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import {
  ValidateFallowConfigAuditor,
  FALLOW_CONFIG_RULES,
  isSymbolExportedInContent,
  validateFallowWorkspaceDiagnostics,
  validateUndeclaredFallowEntries
} from '../src/suites/architecture/validate_fallow_config.ts';

describe('ValidateFallowConfigAuditor', () => {
  const scratchDir = path.resolve(
    process.cwd(),
    'scratch/test_fallow_config_' + crypto.randomUUID()
  );

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    fs.mkdirSync(scratchDir, { recursive: true });
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    if (fs.existsSync(scratchDir)) {
      fs.rmSync(scratchDir, { recursive: true, force: true });
    }
  });

  describe('Metadata & Rules', () => {
    it('declares all expected canonical rules', () => {
      expect(FALLOW_CONFIG_RULES).toContain('fallow-config-missing');
      expect(FALLOW_CONFIG_RULES).toContain('fallow-config-syntax');
      expect(FALLOW_CONFIG_RULES).toContain('fallow-banned-entry-glob');
      expect(FALLOW_CONFIG_RULES).toContain('fallow-stale-file');
      expect(FALLOW_CONFIG_RULES).toContain('fallow-stale-export');
      expect(FALLOW_CONFIG_RULES).toContain('fallow-empty-export-list');
      expect(FALLOW_CONFIG_RULES).toContain('fallow-duplicate-entry');
      expect(FALLOW_CONFIG_RULES).toContain('fallow-config-workspace-diagnostic');
    });

    it('initializes with correct id and family', () => {
      const auditor = new ValidateFallowConfigAuditor({ projectRoot: scratchDir });
      expect(auditor.id).toBe('validate_fallow_config');
      expect(auditor.family).toBe('architecture');
    });
  });

  describe('Symbol Export Helper', () => {
    it('detects named and default exports', () => {
      const code = `
        export const MY_CONST = 10;
        export function computeTotal() { return 1; }
        export default class Engine {}
      `;
      expect(isSymbolExportedInContent(code, 'MY_CONST')).toBe(true);
      expect(isSymbolExportedInContent(code, 'computeTotal')).toBe(true);
      expect(isSymbolExportedInContent(code, 'default')).toBe(true);
      expect(isSymbolExportedInContent(code, 'nonExistent')).toBe(false);
    });
  });

  describe('Violation Detection', () => {
    it('flags fallow-config-missing when .fallowrc.json does not exist', async () => {
      const auditor = new ValidateFallowConfigAuditor({ projectRoot: scratchDir });
      const result = await auditor.audit();
      expect(result.summary.errors).toBeGreaterThan(0);
      const violation = result.findings.find((f) => f.ruleId === 'fallow-config-missing');
      expect(violation).toBeDefined();
    });

    it('flags fallow-config-syntax when .fallowrc.json has invalid JSON', async () => {
      fs.writeFileSync(
        path.join(scratchDir, '.fallowrc.json'),
        '{ "entry": [invalid, ] }',
        'utf-8'
      );
      const auditor = new ValidateFallowConfigAuditor({ projectRoot: scratchDir });
      const result = await auditor.audit();
      const violation = result.findings.find((f) => f.ruleId === 'fallow-config-syntax');
      expect(violation).toBeDefined();
    });

    it('flags fallow-banned-entry-glob when banned glob pattern is used in entry', async () => {
      const config = {
        entry: ['src/components/**/*.vue']
      };
      fs.writeFileSync(path.join(scratchDir, '.fallowrc.json'), JSON.stringify(config), 'utf-8');
      const auditor = new ValidateFallowConfigAuditor({ projectRoot: scratchDir });
      const result = await auditor.audit();
      const violation = result.findings.find((f) => f.ruleId === 'fallow-banned-entry-glob');
      expect(violation).toBeDefined();
    });

    it('flags fallow-stale-file when ignored file does not exist on disk', async () => {
      const config = {
        ignoreExports: [{ file: 'src/logic/non_existent.ts', exports: ['foo'] }]
      };
      fs.writeFileSync(path.join(scratchDir, '.fallowrc.json'), JSON.stringify(config), 'utf-8');
      const auditor = new ValidateFallowConfigAuditor({ projectRoot: scratchDir });
      const result = await auditor.audit();
      const violation = result.findings.find((f) => f.ruleId === 'fallow-stale-file');
      expect(violation).toBeDefined();
    });

    it('flags fallow-empty-export-list when exports array is empty', async () => {
      const config = {
        ignoreExports: [{ file: 'src/logic/existing.ts', exports: [] }]
      };
      fs.writeFileSync(path.join(scratchDir, '.fallowrc.json'), JSON.stringify(config), 'utf-8');
      const auditor = new ValidateFallowConfigAuditor({ projectRoot: scratchDir });
      const result = await auditor.audit();
      const violation = result.findings.find((f) => f.ruleId === 'fallow-empty-export-list');
      expect(violation).toBeDefined();
    });

    it('flags fallow-duplicate-entry when files or exports are duplicated', async () => {
      const targetFile = path.join(scratchDir, 'src/logic/math.ts');
      fs.mkdirSync(path.dirname(targetFile), { recursive: true });
      fs.writeFileSync(targetFile, 'export const PI = 3.14;\n', 'utf-8');

      const config = {
        ignoreExports: [
          { file: 'src/logic/math.ts', exports: ['PI', 'PI'] },
          { file: 'src/logic/math.ts', exports: ['PI'] }
        ]
      };
      fs.writeFileSync(path.join(scratchDir, '.fallowrc.json'), JSON.stringify(config), 'utf-8');
      const auditor = new ValidateFallowConfigAuditor({ projectRoot: scratchDir });
      const result = await auditor.audit();
      const dupes = result.findings.filter((f) => f.ruleId === 'fallow-duplicate-entry');
      expect(dupes.length).toBeGreaterThan(0);
    });

    it('flags fallow-stale-export when symbol is not exported in file', async () => {
      const targetFile = path.join(scratchDir, 'src/logic/data.ts');
      fs.mkdirSync(path.dirname(targetFile), { recursive: true });
      fs.writeFileSync(targetFile, 'export const VALID = 1;\n', 'utf-8');

      const config = {
        ignoreExports: [{ file: 'src/logic/data.ts', exports: ['GHOST_EXPORT'] }]
      };
      fs.writeFileSync(path.join(scratchDir, '.fallowrc.json'), JSON.stringify(config), 'utf-8');
      const auditor = new ValidateFallowConfigAuditor({ projectRoot: scratchDir });
      const result = await auditor.audit();
      const violation = result.findings.find((f) => f.ruleId === 'fallow-stale-export');
      expect(violation).toBeDefined();
    });

    it('flags fallow-config-workspace-diagnostic when actionable workspace diagnostic is reported', async () => {
      const auditor = new ValidateFallowConfigAuditor({ projectRoot: scratchDir });
      const diagnostics = [
        {
          path: 'packages/core',
          kind: 'undeclared-workspace',
          message: 'Workspace packages/core is not declared in package.json'
        },
        { path: '.', kind: 'boundaries-not-configured', message: 'Ignored informational notice' }
      ];
      validateFallowWorkspaceDiagnostics(diagnostics, auditor);
      const result = await auditor.finishAudit();
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0]?.ruleId).toBe('fallow-config-workspace-diagnostic');
      expect(result.findings[0]?.message).toContain('undeclared-workspace');
    });

    it('validates mutation.runnerConfig as a non-empty relative path string and rejects objects', async () => {
      fs.writeFileSync(
        path.join(scratchDir, '.fallowrc.json'),
        JSON.stringify({ mutation: { runnerConfig: {} } }),
        'utf-8'
      );
      const badAuditor = new ValidateFallowConfigAuditor({ projectRoot: scratchDir });
      const badResult = await badAuditor.audit();
      expect(badResult.findings.some((f) => f.ruleId === 'fallow-config-syntax')).toBe(true);

      fs.writeFileSync(
        path.join(scratchDir, '.fallowrc.json'),
        JSON.stringify({
          mutation: { runnerConfig: 'vitest.unit.config.ts' },
          health: { maxCrap: 0, cyclomaticPolicy: 'literal-membership' },
          markupExtensions: ['.astro', '.mdx']
        }),
        'utf-8'
      );
      const goodAuditor = new ValidateFallowConfigAuditor({ projectRoot: scratchDir });
      const goodResult = await goodAuditor.audit();
      expect(goodResult.findings.filter((f) => f.ruleId === 'fallow-config-syntax')).toHaveLength(
        0
      );
    });
  });

  describe('Clean Execution', () => {
    it('passes with zero errors on a valid, synchronized configuration', async () => {
      const targetFile = path.join(scratchDir, 'src/logic/calc.ts');
      fs.mkdirSync(path.dirname(targetFile), { recursive: true });
      fs.writeFileSync(
        targetFile,
        'export const ADD = (a: number, b: number) => a + b;\n',
        'utf-8'
      );

      const config = {
        entry: ['src/main.ts'],
        ignoreExports: [{ file: 'src/logic/calc.ts', exports: ['ADD'] }]
      };
      fs.writeFileSync(path.join(scratchDir, '.fallowrc.json'), JSON.stringify(config), 'utf-8');

      const auditor = new ValidateFallowConfigAuditor({ projectRoot: scratchDir });
      const result = await auditor.audit();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('skips fallow binary execution during workspace diagnostics when FALLOW_SKIP_BINARY_VERIFY is active', async () => {
      process.env.FALLOW_SKIP_BINARY_VERIFY = '1';
      try {
        const config = {
          entry: ['src/main.ts']
        };
        fs.writeFileSync(path.join(scratchDir, '.fallowrc.json'), JSON.stringify(config), 'utf-8');

        const auditor = new ValidateFallowConfigAuditor({ projectRoot: scratchDir });
        const result = await auditor.audit();
        expect(result.findings.some((f) => f.ruleId === 'fallow-config-workspace-diagnostic')).toBe(
          false
        );
      } finally {
        delete process.env.FALLOW_SKIP_BINARY_VERIFY;
      }
    });
  });

  describe('Auto-Fix Verification', () => {
    it('scaffolds canonical .fallowrc.json when missing and fix: true is set', async () => {
      const configPath = path.join(scratchDir, '.fallowrc.json');
      expect(fs.existsSync(configPath)).toBe(false);

      const auditor = new ValidateFallowConfigAuditor({ projectRoot: scratchDir });
      const result = await auditor.fix();

      expect(fs.existsSync(configPath)).toBe(true);
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');

      const createdContent = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      expect(createdContent.entry).toContain('src/index.ts');
      expect(createdContent.ignorePatterns).toContain('dist/**');
      expect(createdContent.typeAware).toBeUndefined();
      expect(createdContent.duplicates?.nearMiss).toBe(true);
      expect(createdContent.duplicates?.mode).toBe('strict');
    });

    it('auto-prunes redundant entry, ignoreDependencies, and ignorePatterns diagnostics when fix: true is active', async () => {
      const auditor = new ValidateFallowConfigAuditor({ projectRoot: scratchDir });
      Reflect.set(auditor, 'currentFixActive', true);
      const config = {
        entry: ['src/index.ts', '.auditor/audit.config.ts'],
        ignoreDependencies: ['fallow', 'knip'],
        ignorePatterns: ['dist/**', 'tests/**']
      };
      const diagnostics = [
        {
          path: '.',
          kind: 'entry-pattern-redundant',
          pattern: 'src/index.ts',
          message: 'redundant entry'
        },
        {
          path: '.',
          kind: 'ignore-dependencies-entry-redundant',
          pattern: 'fallow',
          message: 'redundant dep'
        },
        {
          path: '.',
          kind: 'ignore-patterns-entry-redundant',
          pattern: 'dist/**',
          message: 'redundant pattern'
        }
      ];
      const modified = validateFallowWorkspaceDiagnostics(diagnostics, auditor, config);
      const result = await auditor.finishAudit();
      expect(modified).toBe(true);
      expect(result.findings).toHaveLength(0);
      expect(config.entry).toEqual(['.auditor/audit.config.ts']);
      expect(config.ignoreDependencies).toEqual(['knip']);
      expect(config.ignorePatterns).toEqual(['tests/**']);
    });

    it('flags fallow-undeclared-config-entry when .fallowrc.json contains undeclared entries', async () => {
      const auditor = new ValidateFallowConfigAuditor({ projectRoot: scratchDir });
      const config = {
        entry: ['.auditor/audit.config.ts'],
        ignorePatterns: ['unauthorized-glob/**'],
        ignoreDependencies: ['unauthorized-dep']
      };
      validateUndeclaredFallowEntries(config, auditor);
      const result = await auditor.finishAudit();
      const violations = result.findings.filter(
        (f) => f.ruleId === 'fallow-undeclared-config-entry'
      );
      expect(violations).toHaveLength(2);
      expect(violations[0]?.message).toContain('unauthorized-glob/**');
      expect(violations[1]?.message).toContain('unauthorized-dep');
    });

    it('flags fallow-undeclared-config-entry when .fallowrc.json contains unapproved subconfigurations in duplicates or health', async () => {
      const auditor = new ValidateFallowConfigAuditor({ projectRoot: scratchDir });
      const config = {
        entry: ['.auditor/audit.config.ts'],
        duplicates: {
          nearMiss: true,
          mode: 'strict',
          minLines: 20,
          minTokens: 120
        },
        health: {
          maxCrap: 500
        }
      };

      validateUndeclaredFallowEntries(config, auditor);
      const result = await auditor.finishAudit();
      const violations = result.findings.filter(
        (f) => f.ruleId === 'fallow-undeclared-config-entry'
      );

      // Expecting violations for minLines, minTokens and maxCrap
      expect(violations.length).toBeGreaterThanOrEqual(3);
      expect(violations.some((v) => v.message.includes('duplicates.minLines'))).toBe(true);
      expect(violations.some((v) => v.message.includes('duplicates.minTokens'))).toBe(true);
      expect(violations.some((v) => v.message.includes('health.maxCrap'))).toBe(true);
    });

    it('auto-synchronizes duplicates and health subconfigurations when fix: true is active', async () => {
      const auditor = new ValidateFallowConfigAuditor({ projectRoot: scratchDir });
      Reflect.set(auditor, 'currentFixActive', true);

      const config: Record<string, unknown> & {
        duplicates: { nearMiss?: boolean; mode?: string; minLines?: number };
        health: { maxCrap?: number };
      } = {
        $schema: 'https://fallow.tools/schema/config.json',
        duplicates: {
          nearMiss: true,
          mode: 'lenient',
          minLines: 20
        },
        health: {
          maxCrap: 500
        }
      };

      const modified = validateUndeclaredFallowEntries(config, auditor);
      expect(modified).toBe(true);
      // Canonical defaults in auditor: nearMiss: true, mode: 'strict', maxCrap: 0, minLines removed
      expect(config.duplicates.mode).toBe('strict');
      expect(config.duplicates.minLines).toBeUndefined();
      expect(config.health.maxCrap).toBe(0);
    });

    it('flags and automatically deletes prohibited typeAware from .fallowrc.json when fix: true is active', async () => {
      const auditor = new ValidateFallowConfigAuditor({ projectRoot: scratchDir });
      Reflect.set(auditor, 'currentFixActive', true);

      const config: Record<string, unknown> = {
        $schema: 'https://fallow.tools/schema/config.json',
        entry: ['.auditor/audit.config.ts'],
        typeAware: {
          enabled: true
        }
      };

      const modified = validateUndeclaredFallowEntries(config, auditor);
      expect(modified).toBe(true);
      expect(config.typeAware).toBeUndefined();
    });
  });
});

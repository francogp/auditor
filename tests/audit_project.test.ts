/**
 * packages/auditor/tests/audit_project.test.ts
 *
 * Exhaustive unit tests for ProjectArchitectureAuditor, mapFallowJson,
 * getViolationCategory, and architecture rules.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  ProjectArchitectureAuditor,
  mapFallowJson,
  getViolationCategory
} from '../src/suites/architecture/audit_project.ts';
import {
  setAuditConfig,
  defineAuditConfig,
  resetAuditConfig
} from '../src/core/auditConfig.ts';
import { zeroTimerLogic, magicNumbers } from '../src/suites/architecture/audit_rules.ts';

describe('ProjectArchitectureAuditor & Fallow Integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-project-test-'));
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Metadata & Configuration', () => {
    it('initializes with correct auditor metadata', () => {
      const auditor = new ProjectArchitectureAuditor();
      expect(auditor.id).toBe('audit_project');
      expect(auditor.family).toBe('architecture');
      expect(auditor.name).toBe('Project Architecture & Style Rules');
    });

    it('declares human-friendly descriptions for core architecture rules', () => {
      const auditor = new ProjectArchitectureAuditor();
      expect(auditor.ruleDescriptions).toBeDefined();
      expect(auditor.ruleDescriptions?.['banned-ts-suppression']).toBeDefined();
      expect(auditor.ruleDescriptions?.['domain-type-violation']).toBeDefined();
      expect(auditor.ruleDescriptions?.['strict-null-violation']).toBeDefined();
      expect(auditor.ruleDescriptions?.['no-tautological-integration-mocks']).toBeDefined();
      expect(auditor.ruleDescriptions?.['playwright-id-locators-only']).toBeDefined();
      expect(auditor.ruleDescriptions?.['no-playwright-force-click']).toBeDefined();
      expect(auditor.ruleDescriptions?.['fallow-duplicate-code']).toBeDefined();
      expect(auditor.ruleDescriptions?.['fallow-triplicate-code']).toBeDefined();
      expect(auditor.ruleDescriptions?.['fallow-complexity']).toBeDefined();
      expect(auditor.ruleDescriptions?.['fallow-cognitive-complexity']).toBeDefined();
      expect(auditor.ruleDescriptions?.['fallow-cyclomatic-complexity']).toBeDefined();
      expect(auditor.ruleDescriptions?.['fallow-unused-export']).toBeDefined();
      expect(auditor.ruleDescriptions?.['fallow-unresolved-imports']).toBeDefined();
      expect(auditor.ruleDescriptions?.['fallow-circular-dependencies']).toBeDefined();
      expect(auditor.ruleDescriptions?.['fallow-unlisted-dependencies']).toBeDefined();
      expect(auditor.ruleDescriptions?.['fallow-boundary-violations']).toBeDefined();
      expect(auditor.ruleDescriptions?.['fallow-stale-suppressions']).toBeDefined();
    });
  });

  describe('mapFallowJson - dupes', () => {
    it('maps duplicate code clone groups as error severity', () => {
      const data = {
        clone_groups: [
          {
            instances: [
              { file: 'src/moduleA.ts', start_line: 10 },
              { file: 'src/moduleB.ts', start_line: 25 }
            ],
            duplicated_tokens: 120
          }
        ]
      };
      const violations = mapFallowJson('dupes', data);
      expect(violations).toHaveLength(1);
      expect(violations[0]!.severity).toBe('error');
      expect(violations[0]!.message).toContain('Código duplicado crítico');
      expect(getViolationCategory(violations[0]!)).toBe('Fallow: Código duplicado');
    });

    it('maps triplicate code clone groups as error severity', () => {
      const data = {
        clone_groups: [
          {
            instances: [
              { file: 'src/a.ts', start_line: 1 },
              { file: 'src/b.ts', start_line: 1 },
              { file: 'src/c.ts', start_line: 1 }
            ],
            duplicated_tokens: 200
          }
        ]
      };
      const violations = mapFallowJson('dupes', data);
      expect(violations).toHaveLength(1);
      expect(violations[0]!.severity).toBe('error');
      expect(violations[0]!.message).toContain('Código triplicado crítico');
      expect(getViolationCategory(violations[0]!)).toBe('Fallow: Código triplicado');
    });
  });

  describe('mapFallowJson - security', () => {
    it('maps security findings with CWE code as warning severity', () => {
      const data = {
        security_findings: [
          {
            path: 'src/utils/calc.ts',
            line: 42,
            cwe: 79,
            evidence: 'Dangerous eval-like expression',
            kind: 'SecurityCandidate'
          }
        ]
      };
      const violations = mapFallowJson('security', data);
      expect(violations).toHaveLength(1);
      expect(violations[0]!.severity).toBe('error');
      expect(violations[0]!.message).toContain('CWE-79');
      expect(getViolationCategory(violations[0]!)).toBe('Fallow: Seguridad (CWE)');
    });
  });

  describe('mapFallowJson - dead-code & audit', () => {
    it('maps circular dependencies as error severity', () => {
      const data = {
        circular_dependencies: [
          {
            files: ['src/a.ts', 'src/b.ts', 'src/a.ts']
          }
        ]
      };
      const violations = mapFallowJson('dead-code', data);
      expect(violations).toHaveLength(1);
      expect(violations[0]!.severity).toBe('error');
      expect(violations[0]!.message).toContain('Dependencia circular');
      expect(getViolationCategory(violations[0]!)).toBe('Fallow: Dependencias circulares');
    });

    it('maps architecture boundary violations as error severity', () => {
      const data = {
        boundary_violations: [
          {
            from_path: 'src/domain/calc.ts',
            to_path: 'src/components/Btn.vue',
            from_zone: 'domain',
            to_zone: 'ui',
            line: 5,
            message: 'Domain module importing UI component'
          }
        ]
      };
      const violations = mapFallowJson('dead-code', data);
      expect(violations).toHaveLength(1);
      expect(violations[0]!.severity).toBe('error');
      expect(violations[0]!.message).toContain('Violación de límite arquitectónico');
      expect(getViolationCategory(violations[0]!)).toBe('Fallow: Límites arquitectónicos');
    });

    it('maps unused files, exports, and unresolved imports as error severity', () => {
      const data = {
        unused_files: [
          { path: 'src/legacy/oldHelper.ts', line: 1 }
        ],
        unused_exports: [
          { path: 'src/services/billing.ts', line: 88, export_name: 'computeLegacyDiscount' }
        ],
        unresolved_imports: [
          { path: 'src/app.ts', line: 2, specifier: '@/missing' }
        ]
      };
      const violations = mapFallowJson('dead-code', data);
      expect(violations).toHaveLength(3);

      const fileV = violations.find(v => v.message.includes('Archivo huérfano'));
      expect(fileV).toBeDefined();
      expect(fileV!.severity).toBe('error');
      expect(getViolationCategory(fileV!)).toBe('Fallow: Archivos huérfanos / Dead Code');

      const expV = violations.find(v => v.message.includes('Export no usado'));
      expect(expV).toBeDefined();
      expect(expV!.severity).toBe('error');
      expect(getViolationCategory(expV!)).toBe('Fallow: Exports no usados');

      const impV = violations.find(v => v.message.includes('Import no resuelto'));
      expect(impV).toBeDefined();
      expect(impV!.severity).toBe('error');
      expect(getViolationCategory(impV!)).toBe('Fallow: Imports no resueltos');
    });

    it('maps workspace diagnostics as error severity while skipping unconfigured notices', () => {
      const data = {
        workspace_diagnostics: [
          { path: 'src/bad.ts', kind: 'source-parse-degraded', message: 'Failed to parse cleanly' },
          { path: '.', kind: 'boundaries-not-configured', message: 'Ignored notice' }
        ]
      };
      const violations = mapFallowJson('dead-code', data);
      expect(violations).toHaveLength(1);
      expect(violations[0]!.severity).toBe('error');
      expect(violations[0]!.ruleId).toBe('fallow-workspace-diagnostic');
      expect(violations[0]!.message).toContain('source-parse-degraded');
      expect(getViolationCategory(violations[0]!)).toBe('Fallow: Diagnóstico de workspace');
    });

    it('enforces refactoring targets when config.fallow.enforceTargets is true', () => {
      setAuditConfig(defineAuditConfig({
        name: 'Targets Enforced Project',
        persistence: { engine: 'none' },
        bundle: { enabled: false },
        styles: { zLayersEnabled: false },
        templates: { requireInputIds: false },
        agentPlugin: { enabled: false },
        fallow: {
          enabled: true,
          enforceTargets: true,
          maxTargetPriority: 'critical'
        }
      }));

      const data = {
        targets: [
          { path: 'src/critical.ts', priority: 35.0, recommendation: 'Split 1400 LOC file' },
          { path: 'src/low.ts', priority: 12.0, recommendation: 'Minor split' }
        ]
      };

      const violations = mapFallowJson('dead-code', data);
      expect(violations).toHaveLength(1);
      expect(violations[0]!.severity).toBe('error');
      expect(violations[0]!.ruleId).toBe('fallow-refactoring-targets');
      expect(violations[0]!.message).toContain('Split 1400 LOC file');
      expect(getViolationCategory(violations[0]!)).toBe('Fallow: Objetivo de refactor');
    });

    it('ignores refactoring targets when config.fallow.enforceTargets is false', () => {
      setAuditConfig(defineAuditConfig({
        name: 'Targets Ignored Project',
        persistence: { engine: 'none' },
        bundle: { enabled: false },
        styles: { zLayersEnabled: false },
        templates: { requireInputIds: false },
        agentPlugin: { enabled: false },
        fallow: {
          enabled: true,
          enforceTargets: false
        }
      }));

      const data = {
        targets: [
          { path: 'src/critical.ts', priority: 50.0, recommendation: 'Split 2000 LOC file' }
        ]
      };

      const violations = mapFallowJson('dead-code', data);
      expect(violations).toHaveLength(0);
    });
  });

  describe('mapFallowJson - health', () => {
    it('maps complexity findings, large functions, and refactor targets as error severity', () => {
      const data = {
        findings: [
          {
            path: 'src/calc.ts',
            line: 12,
            function_name: 'complexCalculation',
            cognitive_complexity: 25,
            cyclomatic_complexity: 18,
            recommendation: 'Break into smaller pure functions'
          }
        ],
        large_functions: [
          {
            path: 'src/heavy.ts',
            line: 100,
            name: 'heavyRunner',
            line_count: 145
          }
        ],
        targets: [
          {
            path: 'src/target.ts',
            priority: 4.8,
            category: 'refactor',
            recommendation: 'Simplify deep branching'
          }
        ]
      };

      const violations = mapFallowJson('health', data);
      expect(violations).toHaveLength(1);

      const compV = violations.find(v => v.message.includes('Sugerencia de complejidad'));
      expect(compV).toBeDefined();
      expect(compV!.severity).toBe('error');
      expect(getViolationCategory(compV!)).toBe('Fallow: Complejidad');
    });

    it('exempts non-production script files from complexity findings', () => {
      const data = {
        findings: [
          {
            path: 'scripts/maintenance/run_migrations.ts',
            line: 45,
            function_name: 'executeComplexMigrationScript',
            cognitive_complexity: 40,
            cyclomatic_complexity: 25,
            recommendation: 'Break into smaller functions'
          }
        ],
        large_functions: [],
        targets: []
      };

      const violations = mapFallowJson('health', data);
      expect(violations).toHaveLength(0);
    });
  });

  describe('zeroTimerLogic Rule', () => {
    it('does not flag gsap.ticker.sleep() while detecting standalone sleep() calls', () => {
      const validTickerSleep = 'gsap.ticker.sleep();';
      const invalidStandaloneSleep = 'await sleep(500);';
      const invalidDirectSleep = 'sleep(100);';

      zeroTimerLogic.regex.lastIndex = 0;
      expect(zeroTimerLogic.regex.test(validTickerSleep)).toBe(false);

      zeroTimerLogic.regex.lastIndex = 0;
      expect(zeroTimerLogic.regex.test(invalidStandaloneSleep)).toBe(true);

      zeroTimerLogic.regex.lastIndex = 0;
      expect(zeroTimerLogic.regex.test(invalidDirectSleep)).toBe(true);
    });
  });

  describe('magicNumbers Rule', () => {
    const fakeFilePath = 'src/services/sampleService.ts';

    function checkCode(code: string): boolean {
      const regex = new RegExp(magicNumbers.regex.source, magicNumbers.regex.flags);
      let match;
      while ((match = regex.exec(code)) !== null) {
        if (magicNumbers.check?.(code, match, fakeFilePath)) {
          return true;
        }
      }
      return false;
    }

    it('flags inline literals assigned to lowerCamelCase const variables', () => {
      expect(checkCode('const timeout = 60000;')).toBe(true);
      expect(checkCode('const maxRetries = 45;')).toBe(true);
    });

    it('flags inline literals in function calls or fallback expressions previously masked by const keyword', () => {
      const snippet = 'const errorMsg = extractSubprocessErrorMessage(proc, task.timeoutMs ?? 60000, task);';
      expect(checkCode(snippet)).toBe(true);
    });

    it('flags inline literals in object literal properties', () => {
      const snippet = 'const opts = {\n  timeout: 60000\n};';
      expect(checkCode(snippet)).toBe(true);
    });

    it('does NOT flag declared UPPER_SNAKE_CASE named constants', () => {
      expect(checkCode('const DEFAULT_TIMEOUT_MS = 60000;')).toBe(false);
      expect(checkCode('export const MAX_RETRY_COUNT = 45;')).toBe(false);
      expect(checkCode('readonly POLLING_INTERVAL_MS = 5000;')).toBe(false);
      expect(checkCode('export const CONFIG = {\n  DEFAULT_TIMEOUT_MS: 60000\n};')).toBe(false);
    });

    it('does NOT flag exempt numeric values (0, 1, 100, 200, 404, 500)', () => {
      expect(checkCode('const count = 100;')).toBe(false);
      expect(checkCode('const status = 404;')).toBe(false);
    });

    it('strictly prohibits inline comments from bypassing magic numbers', () => {
      expect(checkCode('const delay = 555; /' + '/ number-ok: animation step duration')).toBe(true);
      expect(checkCode('const delay = 555; /' + '/ magic-ok: bypass')).toBe(true);
    });

    it('does NOT flag files matching patterns configured in constants.exemptGlobs', () => {
      const config = defineAuditConfig({
        name: 'test-app',
        paths: { srcRoots: ['src'] },
        persistence: { engine: 'none', schemaQualified: false },
        styles: { zLayersEnabled: false },
        constants: {
          exemptGlobs: ['scripts/database/seeds/**', 'ui-demo/**']
        }
      });
      setAuditConfig(config);

      const seedPath = 'scripts/database/seeds/seed_test_users.ts';
      const demoPath = 'ui-demo/src/components/Card.vue';
      const prodPath = 'src/logic/battle/calc.ts';

      const regex = new RegExp(magicNumbers.regex.source, magicNumbers.regex.flags);
      const code = 'const level = 50;';

      let match;
      let seedFlagged = false;
      while ((match = regex.exec(code)) !== null) {
        if (magicNumbers.check?.(code, match, seedPath)) seedFlagged = true;
      }
      expect(seedFlagged).toBe(false);

      regex.lastIndex = 0;
      let demoFlagged = false;
      while ((match = regex.exec(code)) !== null) {
        if (magicNumbers.check?.(code, match, demoPath)) demoFlagged = true;
      }
      expect(demoFlagged).toBe(false);

      regex.lastIndex = 0;
      let prodFlagged = false;
      while ((match = regex.exec(code)) !== null) {
        if (magicNumbers.check?.(code, match, prodPath)) prodFlagged = true;
      }
      expect(prodFlagged).toBe(true);

      resetAuditConfig();
    });
  });

  describe('Clean execution', () => {
    it('returns empty violations when fallow returns zero findings', async () => {
      const emptyData = {
        clone_groups: [],
        security_findings: [],
        circular_dependencies: [],
        unused_files: [],
        unused_exports: [],
        findings: [],
        large_functions: [],
        targets: []
      };

      const dupes = mapFallowJson('dupes', emptyData);
      const sec = mapFallowJson('security', emptyData);
      const dead = mapFallowJson('dead-code', emptyData);
      const health = mapFallowJson('health', emptyData);

      expect(dupes).toHaveLength(0);
      expect(sec).toHaveLength(0);
      expect(dead).toHaveLength(0);
      expect(health).toHaveLength(0);

      const auditor = new ProjectArchitectureAuditor();
      const res = await auditor.finishAudit();
      expect(res.summary.errors).toBe(0);
      expect(res.status).toBe('passed');
    });
  });
});

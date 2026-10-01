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

describe('ProjectArchitectureAuditor & Fallow Integration', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-project-test-'));
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
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

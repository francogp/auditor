/**
 * packages/auditor/tests/validate_fallow.test.ts
 *
 * Exhaustive unit tests for FallowArchitectureAuditor (validate_fallow)
 * and mapFallowJson mapping engine.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  FallowArchitectureAuditor,
  FALLOW_RULES,
  FALLOW_RULE_DESCRIPTIONS,
  mapFallowJson
} from '../src/suites/architecture/validate_fallow.ts';
import {
  resetAuditConfig,
  setAuditConfig,
  defineAuditConfig
} from '../src/core/auditConfig.ts';

describe('FallowArchitectureAuditor (validate_fallow)', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'validate-fallow-test-'));
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Metadata & Catalog', () => {
    it('initializes with canonical metadata and capabilities', () => {
      const auditor = new FallowArchitectureAuditor(tempDir);
      expect(auditor.id).toBe('validate_fallow');
      expect(auditor.name).toBe('Fallow Architecture & Refactoring Targets');
      expect(auditor.family).toBe('architecture');
      expect(auditor.capabilities.heavy).toBe(true);
      expect(auditor.capabilities.lint).toBe(true);
      expect(auditor.capabilities.changedSince).toBe(true);
    });

    it('declares 100% of rules in ruleDescriptions matching FALLOW_RULES', () => {
      const auditor = new FallowArchitectureAuditor(tempDir);
      for (const ruleId of FALLOW_RULES) {
        expect(auditor.ruleDescriptions?.[ruleId]).toBeDefined();
        expect(FALLOW_RULE_DESCRIPTIONS[ruleId]).toBeDefined();
      }
    });

    it('runs cleanly with zero errors when Fallow is disabled in config', async () => {
      setAuditConfig(defineAuditConfig({
        name: 'validate-fallow-test',
        fallow: {
          enabled: false
        }
      }));

      const auditor = new FallowArchitectureAuditor(tempDir);
      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('skipped');
    });
  });

  describe('mapFallowJson - Clone Groups', () => {
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
      const violations = mapFallowJson('dupes', data, tempDir);
      expect(violations).toHaveLength(2);
      expect(violations[0]!.severity).toBe('error');
      expect(violations[0]!.ruleId).toBe('fallow-duplicate-code');
      expect(violations[0]!.message).toContain('Código duplicado detectado');
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
      const violations = mapFallowJson('triplets', data, tempDir);
      expect(violations).toHaveLength(3);
      expect(violations[0]!.severity).toBe('error');
      expect(violations[0]!.ruleId).toBe('fallow-triplicate-code');
      expect(violations[0]!.message).toContain('Código triplicado crítico');
    });

    it('extracts token_count from modern Fallow clone groups schema', () => {
      const data = {
        clone_groups: [
          {
            instances: [
              { file: 'src/moduleA.ts', start_line: 10 },
              { file: 'src/moduleB.ts', start_line: 25 }
            ],
            token_count: 85
          }
        ]
      };
      const violations = mapFallowJson('dupes', data as unknown as Parameters<typeof mapFallowJson>[1], tempDir);
      expect(violations).toHaveLength(2);
      expect(violations[0]!.message).toContain('(85 tokens)');
    });

    it('executes runFallowSubCommand with triplets command for triplicate detection', async () => {
      const auditor = new FallowArchitectureAuditor(tempDir);
      const calls: string[] = [];
      (auditor as unknown as { runFallowSubCommand: (cmd: string, args?: string[]) => unknown }).runFallowSubCommand = (cmd: string) => {
        calls.push(cmd);
        return [];
      };
      await auditor.runAudit();
      expect(calls).toContain('triplets');
    });
  });

  describe('mapFallowJson - Security CWE Sinks', () => {
    it('maps security findings while ignoring CLI paths', () => {
      const data = {
        findings: [
          { path: 'src/server.ts', line: 42, rule_id: 'cwe-022', message: 'Path traversal' },
          { path: 'src/cli/tool.ts', line: 10, rule_id: 'cwe-078', message: 'Command injection in CLI' }
        ]
      };
      const violations = mapFallowJson('security', data as unknown as Parameters<typeof mapFallowJson>[1], tempDir);
      expect(violations).toHaveLength(1);
      expect(violations[0]!.ruleId).toBe('fallow-security-cwe');
      expect(violations[0]!.message).toContain('Path traversal');
    });
  });

  describe('mapFallowJson - Dead Code, Exports & Dependencies', () => {
    it('maps unused files and unused exports', () => {
      const data = {
        unused_files: [{ path: 'src/legacy.ts' }],
        unused_exports: [{ path: 'src/math.ts', export_name: 'oldCalc', line: 15 }]
      };
      const violations = mapFallowJson('dead-code', data, tempDir);
      expect(violations.some(v => v.ruleId === 'fallow-unused-files')).toBe(true);
      expect(violations.some(v => v.ruleId === 'fallow-unused-exports')).toBe(true);
    });

    it('maps circular dependencies and boundary violations', () => {
      const data = {
        circular_dependencies: [{ cycle: ['src/a.ts', 'src/b.ts', 'src/a.ts'], line: 1 }],
        boundary_violations: [{ path: 'src/core/a.ts', line: 10, message: 'Cross-boundary import' }]
      };
      const violations = mapFallowJson('dead-code', data, tempDir);
      expect(violations.some(v => v.ruleId === 'fallow-circular-dependencies')).toBe(true);
      expect(violations.some(v => v.ruleId === 'fallow-boundary-violations')).toBe(true);
    });

    it('maps unused package dependencies and workspace diagnostics', () => {
      const data = {
        unused_dependencies: [{ package_name: 'lodash', line: 1 }],
        workspace_diagnostics: [{ kind: 'unresolved-package', message: 'Missing type definition' }]
      };
      const violations = mapFallowJson('dead-code', data, tempDir);
      expect(violations.some(v => v.ruleId === 'fallow-unused-dependencies')).toBe(true);
      expect(violations.some(v => v.ruleId === 'fallow-workspace-diagnostic')).toBe(true);
    });

    it('maps stale suppressions as error severity', () => {
      const data = {
        stale_suppressions: [{ path: 'src/old.ts', line: 10, message: 'Unneeded suppression' }]
      };
      const violations = mapFallowJson('dead-code', data, tempDir);
      expect(violations.some(v => v.ruleId === 'fallow-stale-suppressions')).toBe(true);
    });
  });

  describe('mapFallowJson - Health, Complexity & Targets', () => {
    it('maps function complexity findings (cognitive and cyclomatic)', () => {
      const data = {
        findings: [
          { path: 'src/complex.ts', line: 20, name: 'heavyFunc', exceeded: 'cognitive', cognitive: 25 },
          { path: 'src/branchy.ts', line: 50, name: 'switchFunc', exceeded: 'cyclomatic', cyclomatic: 30 },
          { path: 'src/large.ts', line: 80, name: 'largeFunc', line_count: 120 }
        ]
      };
      const violations = mapFallowJson('health', data, tempDir);
      expect(violations.some(v => v.ruleId === 'fallow-cognitive-complexity')).toBe(true);
      expect(violations.some(v => v.ruleId === 'fallow-cyclomatic-complexity')).toBe(true);
      expect(violations.some(v => v.ruleId === 'fallow-complexity')).toBe(true);
    });

    it('enforces refactoring targets when config.fallow.enforceTargets is true', () => {
      setAuditConfig(defineAuditConfig({
        name: 'validate-fallow-test',
        fallow: {
          enforceTargets: true,
          maxTargetPriority: 'high'
        }
      }));

      const data = {
        targets: [
          { path: 'src/monolith.ts', priority: 25, recommendation: 'Extract submodules' },
          { path: 'src/lowDebt.ts', priority: 10, recommendation: 'Minor cleanup' }
        ]
      };
      const violations = mapFallowJson('health', data, tempDir);
      const targetViolations = violations.filter(v => v.ruleId === 'fallow-refactoring-targets');
      expect(targetViolations).toHaveLength(1);
      expect(targetViolations[0]!.message).toContain('Extract submodules');
    });

    it('bypasses refactoring targets when config.fallow.enforceTargets is false', () => {
      setAuditConfig(defineAuditConfig({
        name: 'validate-fallow-test',
        fallow: {
          enforceTargets: false
        }
      }));

      const data = {
        targets: [
          { path: 'src/monolith.ts', priority: 35, recommendation: 'Major rewrite' }
        ]
      };
      const violations = mapFallowJson('health', data, tempDir);
      expect(violations.filter(v => v.ruleId === 'fallow-refactoring-targets')).toHaveLength(0);
    });
  });
});

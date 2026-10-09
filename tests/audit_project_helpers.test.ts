/**
 * tests/audit_project_helpers.test.ts
 *
 * Dedicated unit tests for audit_project.ts report helpers and ProjectArchitectureAuditor.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildProjectTopFiles,
  getProjectArchitectureRuleDescriptions,
  ProjectArchitectureAuditor
} from '../src/suites/architecture/audit_project.ts';
import type { Violation } from '../src/analyzers/auditRuleTypes.ts';

describe('Project Architecture Helpers', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  describe('buildProjectTopFiles', () => {
    it('sorts files by violation count and respects topLimit', () => {
      const fileGroups: Record<string, Violation[]> = {
        'src/fileA.ts': [
          { file: 'src/fileA.ts', line: 10, severity: 'error', message: 'err1', context: '' },
          { file: 'src/fileA.ts', line: 20, severity: 'warning', message: 'warn1', context: '' }
        ],
        'src/fileB.ts': [
          { file: 'src/fileB.ts', line: 5, severity: 'error', message: 'err2', context: '' }
        ],
        'src/fileC.ts': [
          { file: 'src/fileC.ts', line: 1, severity: 'error', message: 'err3', context: '' },
          { file: 'src/fileC.ts', line: 2, severity: 'error', message: 'err4', context: '' },
          { file: 'src/fileC.ts', line: 3, severity: 'error', message: 'err5', context: '' }
        ]
      };

      const topFiles = buildProjectTopFiles(fileGroups, 2);
      expect(topFiles).toHaveLength(2);
      expect(topFiles[0]?.file).toBe('src/fileC.ts');
      expect(topFiles[0]?.total).toBe(3);
      expect(topFiles[0]?.errors).toBe(3);
      expect(topFiles[0]?.warnings).toBe(0);

      expect(topFiles[1]?.file).toBe('src/fileA.ts');
      expect(topFiles[1]?.total).toBe(2);
      expect(topFiles[1]?.errors).toBe(1);
      expect(topFiles[1]?.warnings).toBe(1);
    });

    it('handles empty fileGroups gracefully', () => {
      const topFiles = buildProjectTopFiles({}, 10);
      expect(topFiles).toEqual([]);
    });
  });

  describe('getProjectArchitectureRuleDescriptions', () => {
    it('returns a populated dictionary of rule descriptions', () => {
      const descriptions = getProjectArchitectureRuleDescriptions();
      expect(descriptions).toBeDefined();
      expect(typeof descriptions).toBe('object');
      expect(Object.keys(descriptions).length).toBeGreaterThan(0);
      expect(descriptions['viewport']).toBeDefined();
      expect(descriptions['nodePrefix']).toBeDefined();
    });
  });

  describe('ProjectArchitectureAuditor', () => {
    it('instantiates with expected framework metadata and capabilities', () => {
      const auditor = new ProjectArchitectureAuditor();
      expect(auditor.id).toBe('audit_project');
      expect(auditor.family).toBe('architecture');
      expect(auditor.packageName).toBe('Arquitectura');
      expect(auditor.capabilities.fix).toBe(true);
      expect(auditor.capabilities.ast).toBe(true);
      expect(auditor.capabilities.heavy).toBe(true);
    });
  });
});

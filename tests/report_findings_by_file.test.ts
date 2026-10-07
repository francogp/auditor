import { describe, it, expect } from 'vitest';
import { stripVTControlCharacters } from 'node:util';
import {
  sortFindingsByFileAndLine,
  groupFindingsByFileMap,
  normalizeFindingPath,
  type AuditFinding,
  type AuditFileSummary,
  type AuditByFileReport
} from '../src/core/auditContract.ts';
import { renderFindingsByFileTree } from '../src/core/unifiedTheme.ts';

describe('Audit Findings Grouped By File and Line Contract', () => {
  const dummyFindings: AuditFinding[] = [
    {
      severity: 'error',
      message: 'Second error in b.ts',
      file: 'src/b.ts',
      line: 45,
      ruleId: 'rule-b',
      ruleDescription: 'Rule B'
    },
    {
      severity: 'warning',
      message: 'First warning in b.ts',
      file: 'src/b.ts',
      line: 12,
      ruleId: 'rule-b',
      ruleDescription: 'Rule B'
    },
    {
      severity: 'error',
      message: 'Global error in b.ts',
      file: 'src/b.ts',
      ruleId: 'rule-global',
      ruleDescription: 'Global Rule'
    },
    {
      severity: 'error',
      message: 'Error in a.ts',
      file: 'src/a.ts',
      line: 100,
      ruleId: 'rule-a',
      ruleDescription: 'Rule A'
    }
  ];

  it('normalizes finding path consistently across platforms', () => {
    expect(normalizeFindingPath('src\\components\\Button.vue')).toBe('src/components/Button.vue');
    expect(normalizeFindingPath('src/components/Button.vue')).toBe('src/components/Button.vue');
    expect(normalizeFindingPath(undefined)).toBe('General');
    expect(normalizeFindingPath('')).toBe('General');
  });

  it('sorts findings by file ascending, then missing lines first, then line ascending', () => {
    const sorted = sortFindingsByFileAndLine(dummyFindings);
    expect(sorted).toHaveLength(4);

    // a.ts comes before b.ts
    expect(sorted[0]!.file).toBe('src/a.ts');
    expect(sorted[0]!.line).toBe(100);

    // b.ts findings: missing line (line: undefined, treated as 0), then L12, then L45
    expect(sorted[1]!.file).toBe('src/b.ts');
    expect(sorted[1]!.line).toBeUndefined();

    expect(sorted[2]!.file).toBe('src/b.ts');
    expect(sorted[2]!.line).toBe(12);

    expect(sorted[3]!.file).toBe('src/b.ts');
    expect(sorted[3]!.line).toBe(45);
  });

  it('breaks ties using column number and severity', () => {
    const tieFindings: AuditFinding[] = [
      { severity: 'warning', message: 'Warn at col 10', file: 'src/x.ts', line: 10, col: 10, ruleId: 'r2' },
      { severity: 'error', message: 'Err at col 5', file: 'src/x.ts', line: 10, col: 5, ruleId: 'r1' },
      { severity: 'warning', message: 'Warn at col 5', file: 'src/x.ts', line: 10, col: 5, ruleId: 'r3' },
      { severity: 'error', message: 'Err at col 10', file: 'src/x.ts', line: 10, col: 10, ruleId: 'r4' }
    ];

    const sorted = sortFindingsByFileAndLine(tieFindings);
    // col 5 comes before col 10
    // at col 5: error comes before warning
    expect(sorted[0]!.message).toBe('Err at col 5');
    expect(sorted[1]!.message).toBe('Warn at col 5');
    // at col 10: error comes before warning
    expect(sorted[2]!.message).toBe('Err at col 10');
    expect(sorted[3]!.message).toBe('Warn at col 10');
  });

  it('groups findings into AuditFileSummary map with accurate counts', () => {
    const map = groupFindingsByFileMap(dummyFindings);
    const keys = Object.keys(map);
    expect(keys).toEqual(['src/a.ts', 'src/b.ts']);

    const aSummary = map['src/a.ts']!;
    expect(aSummary.file).toBe('src/a.ts');
    expect(aSummary.errors).toBe(1);
    expect(aSummary.warnings).toBe(0);
    expect(aSummary.findings).toHaveLength(1);

    const bSummary = map['src/b.ts']!;
    expect(bSummary.file).toBe('src/b.ts');
    expect(bSummary.errors).toBe(2);
    expect(bSummary.warnings).toBe(1);
    expect(bSummary.findings).toHaveLength(3);
    expect(bSummary.findings[0]!.line).toBeUndefined();
    expect(bSummary.findings[1]!.line).toBe(12);
    expect(bSummary.findings[2]!.line).toBe(45);
  });

  it('renders findings in Box-Drawing tree hierarchy', () => {
    const map = groupFindingsByFileMap(dummyFindings);
    const summaries: AuditFileSummary[] = Object.values(map);
    const rendered = renderFindingsByFileTree(summaries);
    const plain = stripVTControlCharacters(rendered);

    expect(plain).toContain('📄 src/a.ts (1 error)');
    expect(plain).toContain('📄 src/b.ts (2 errores, 1 advertencia)');
    expect(plain).toContain('[GLOBAL]');
    expect(plain).toContain('L12');
    expect(plain).toContain('L45');
    expect(plain).toContain('L100');
    expect(plain).toContain('├── ');
    expect(plain).toContain('└── ');
  });

  it('respects maxFiles and maxFindingsPerFile options in tree rendering', () => {
    const map = groupFindingsByFileMap(dummyFindings);
    const summaries: AuditFileSummary[] = Object.values(map);

    // Limit to 1 file
    const oneFileRender = renderFindingsByFileTree(summaries, { maxFiles: 1 });
    expect(oneFileRender).toContain('src/a.ts');
    expect(oneFileRender).not.toContain('src/b.ts');
    expect(oneFileRender).toContain('... y 1 archivo(s) más con incidencias');

    // Limit to 1 finding per file
    const oneFindingRender = renderFindingsByFileTree(summaries, { maxFindingsPerFile: 1 });
    expect(oneFindingRender).toContain('... y 2 incidencia(s) más en este archivo');
  });

  it('handles clean files without throwing or producing corrupt output', () => {
    expect(renderFindingsByFileTree([])).toBe('');
  });

  it('conforms to AuditByFileReport contract structure for JSON persistence', () => {
    const map = groupFindingsByFileMap(dummyFindings);
    const report: AuditByFileReport = {
      meta: {
        version: '3.3.0',
        timestamp: Temporal.Now.instant().toString(),
        isFullAudit: true,
        runMode: 'full',
        preset: null,
        targetFamily: null,
        totalDiscoveredSuites: 39,
        executedSuiteCount: 39,
        executedSuites: ['audit_project'],
        omittedSuites: [],
        environment: {
          nodeVersion: process.version,
          platform: process.platform,
          cwd: process.cwd()
        }
      },
      status: 'failed',
      summary: {
        totalViolations: 4,
        errors: 3,
        warnings: 1,
        suitesTotal: 39,
        suitesPassed: 38,
        suitesFailed: 1,
        durationMs: 1500
      },
      totalAffectedFiles: Object.keys(map).length,
      files: map
    };

    expect(report.totalAffectedFiles).toBe(2);
    expect(report.files['src/a.ts']!.errors).toBe(1);
    expect(report.files['src/b.ts']!.findings).toHaveLength(3);

    const serialized = JSON.stringify(report);
    const parsed = JSON.parse(serialized) as AuditByFileReport;
    expect(parsed.totalAffectedFiles).toBe(2);
    expect(parsed.files['src/b.ts']!.findings[1]!.line).toBe(12);
  });
});

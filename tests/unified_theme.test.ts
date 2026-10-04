/**
 * tests/unified_theme.test.ts
 *
 * Unit tests for unifiedTheme box-drawing, banners, tables, and markdown report generators.
 */

import { describe, it, expect } from 'vitest';
import {
  renderBanner,
  renderBoxTable,
  renderMarkdownReport,
  renderAuditTaskRow,
  renderConsolidatedFooter,
  renderSimilarCodeWarningBanner,
  renderFindingsDetail,
  renderFindingsBreakdownTable,
  getVisualWidth,
  padVisual,
  truncateVisual,
  formatDuration,
  formatStatusBadge,
  type TableColumn
} from '../src/core/unifiedTheme.ts';
import type { StandardAuditResult, AuditFinding } from '../src/core/auditContract.ts';

describe('unifiedTheme Terminal & Reporting Engine', () => {
  describe('renderBanner', () => {
    it('renders 80-column banner with title and subtitle', () => {
      const banner = renderBanner('AUDITOR ENGINE', 'Static Analysis & Quality Verification');
      expect(banner).toContain('AUDITOR ENGINE');
      expect(banner).toContain('Static Analysis');
      expect(banner).toContain('╔');
      expect(banner).toContain('╚');
    });

    it('renders banner with title only', () => {
      const banner = renderBanner('TITLE ONLY');
      expect(banner).toContain('TITLE ONLY');
    });
  });

  describe('renderBoxTable', () => {
    interface TestRow {
      id: string;
      name: string;
      count: string;
    }

    const columns: readonly TableColumn<TestRow>[] = [
      { header: '#', width: 5, align: 'center', key: 'id' },
      { header: 'NAME', width: 20, align: 'left', key: 'name' },
      { header: 'COUNT', width: 10, align: 'right', key: 'count' }
    ];

    it('renders box table with headers, rows, and borders', () => {
      const rows: TestRow[] = [
        { id: '1', name: 'Item A', count: '10' },
        { id: '2', name: 'Item B with long name', count: '999' }
      ];

      const table = renderBoxTable(columns, rows);
      expect(table).toContain('Item A');
      expect(table).toContain('┌');
      expect(table).toContain('└');
      expect(table).toContain('COUNT');
    });

    it('handles empty rows gracefully', () => {
      const table = renderBoxTable(columns, []);
      expect(table).toContain('┌');
      expect(table).toContain('└');
    });
  });

  describe('getVisualWidth & visual helpers', () => {
    it('calculates visual width accounting for emojis and wide characters', () => {
      expect(getVisualWidth('hello')).toBe(5);
      expect(getVisualWidth('🛡️')).toBeGreaterThanOrEqual(1);
    });

    it('pads and truncates strings visually', () => {
      expect(padVisual('hi', 5, 'left')).toBe('hi   ');
      expect(padVisual('hi', 5, 'right')).toBe('   hi');
      expect(truncateVisual('hello world', 5)).toBe('hell…');
      expect(formatDuration(1500).trim()).toBe('1500ms');
    });

    it('formats status badges correctly', () => {
      expect(formatStatusBadge('passed')).toContain('PASS');
      expect(formatStatusBadge('warning')).toContain('WARN');
      expect(formatStatusBadge('failed')).toContain('FAIL');
      expect(formatStatusBadge('skipped')).toContain('SKIP');
    });
  });

  describe('renderAuditTaskRow', () => {
    it('renders task row for passed result', () => {
      const passedResult: StandardAuditResult = {
        id: 'test_suite',
        name: 'Test Suite',
        family: 'architecture',
        packageName: 'Test',
        icon: '🧪',
        description: 'Test description',
        status: 'passed',
        durationMs: 42,
        metrics: { 'Items': 15 },
        findings: [],
        summary: { errors: 0, warnings: 0, info: 0, totalFilesScanned: 5 }
      };

      const row = renderAuditTaskRow(passedResult);
      expect(row).toContain('Test Suite');
      expect(row).toContain('42ms');
      expect(row).toContain('15 Items');
    });
  });

  describe('renderConsolidatedFooter', () => {
    it('renders footer for 100% passed execution', () => {
      const footer = renderConsolidatedFooter(10, 10, 0, 0, 1500, undefined, 0);
      expect(footer).toContain('¡SUITE DE AUDITORÍA GLOBAL APROBADA!');
      expect(footer).toContain('1500ms');
    });

    it('renders footer for failed execution with sample error lines', () => {
      const errors: AuditFinding[] = [
        {
          severity: 'error',
          file: 'src/app.ts',
          line: 42,
          ruleId: 'no-any',
          ruleDescription: 'Dominio: Tipo any prohibido',
          message: 'Explicit any is prohibited'
        }
      ];

      const footer = renderConsolidatedFooter(10, 8, 1, 0, 2300, errors, 2);
      expect(footer).toContain('AUDITORÍA GLOBAL CON ERRORES CRÍTICOS');
      expect(footer).toContain('2 Omitidas');
      expect(footer).toContain('src');
    });
  });

  describe('renderFindingsDetail & renderSimilarCodeWarningBanner', () => {
    it('renders findings detail list', () => {
      const findings: AuditFinding[] = [
        {
          severity: 'error',
          file: 'src/main.ts',
          line: 12,
          ruleId: 'syntax-error',
          ruleDescription: 'Syntax Error',
          message: 'Invalid token'
        }
      ];

      const detail = renderFindingsDetail(findings);
      expect(detail).toContain('main.ts');
      expect(detail).toContain('Invalid token');
    });

    it('renders similar code warning banner', () => {
      const banner = renderSimilarCodeWarningBanner();
      expect(banner).toContain('CÓDIGO SIMILAR VECTORIAL');
      expect(banner).toContain('fallow similar-code setup');
    });
  });

  describe('renderFindingsBreakdownTable', () => {
    it('renders breakdown table with total consolidated row', () => {
      const counts: [string, { errors: number; warnings: number }][] = [
        ['validate_eslint', { errors: 2, warnings: 1 }],
        ['validate_stylelint', { errors: 0, warnings: 3 }]
      ];

      const table = renderFindingsBreakdownTable(counts);
      expect(table).toContain('validate_eslint');
      expect(table).toContain('validate_stylelint');
      expect(table).toContain('TOTAL CONSOLIDADO');
    });
  });

  describe('renderMarkdownReport', () => {
    it('renders comprehensive markdown report including family and findings tables', () => {
      const findings: AuditFinding[] = Array.from({ length: 105 }, (_, i) => ({
        severity: i % 2 === 0 ? 'error' : 'warning',
        file: `src/file_${i}.ts`,
        line: i + 1,
        ruleId: 'test-rule',
        ruleDescription: 'Test rule description',
        message: `Finding message ${i + 1}`
      }));

      const results: StandardAuditResult[] = [
        {
          id: 'suite_arch',
          name: 'Architecture Suite',
          family: 'architecture',
          packageName: 'Architecture',
          icon: '🏛️',
          description: 'Architecture description',
          status: 'failed',
          durationMs: 350,
          metrics: { Tests: 10 },
          findings,
          summary: { errors: 53, warnings: 52, info: 0, totalFilesScanned: 105 }
        },
        {
          id: 'suite_skipped',
          name: 'Skipped Suite',
          family: 'domain_data',
          packageName: 'Domain',
          icon: '🔒',
          description: 'Domain description',
          status: 'skipped',
          durationMs: 2,
          metrics: {},
          findings: [],
          summary: { errors: 0, warnings: 0, info: 0 }
        }
      ];

      const md = renderMarkdownReport(results, 0, 352);
      expect(md).toContain('# 🛡️ Reporte Consolidado de Auditoría Global');
      expect(md).toContain('Architecture Suite');
      expect(md).toContain('## 📋 Detalle de Incidencias');
      // Truncation over 100 items test
      expect(md).toContain('truncadas por longitud');
    });
  });
});

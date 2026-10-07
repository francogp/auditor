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
  renderAuditorsRegistryTable,
  renderAuditorDetailCard,
  renderCliHelp,
  renderAutoFixNoticeBanner,
  renderFamilyHeader,
  getVisualWidth,
  padVisual,
  truncateVisual,
  formatDuration,
  formatStatusBadge,
  type TableColumn
} from '../src/core/unifiedTheme.ts';
import type { StandardAuditResult, AuditFinding, AuditTaskDefinition } from '../src/core/auditContract.ts';

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

  describe('renderAutoFixNoticeBanner', () => {
    it('renders notice banner with error and warning counts', () => {
      const banner = renderAutoFixNoticeBanner(5, 2);
      expect(banner).toContain('INCIDENCIAS REPARABLES AUTOMÁTICAMENTE');
      expect(banner).toContain('5 error(es) y 2 advertencia(s)');
      expect(banner).toContain('npm run audit:fix');
    });

    it('renders notice banner with only errors', () => {
      const banner = renderAutoFixNoticeBanner(3, 0);
      expect(banner).toContain('3 error(es)');
      expect(banner).not.toContain('advertencia(s)');
    });
  });

  describe('renderFamilyHeader', () => {
    it('renders clean family header with box drawing formatting', () => {
      const header = renderFamilyHeader({
        key: 'architecture',
        order: 1,
        icon: '🏛️',
        title: 'ESTÁNDARES ESTÁTICOS, AST Y ARQUITECTURA',
        description: 'Reglas de arquitectura y calidad'
      });
      expect(header).toContain('ESTÁNDARES ESTÁTICOS, AST Y ARQUITECTURA');
    });
  });

  describe('renderAuditorDetailCard', () => {
    it('renders inspection detail card with capabilities and rule list', () => {
      const task: AuditTaskDefinition = {
        id: 'validate_eslint',
        name: 'ESLint Hygiene',
        family: 'architecture',
        icon: '📜',
        scriptPath: 'src/suites/architecture/validate_eslint.ts',
        command: 'node',
        args: [],
        description: 'Audits code hygiene with ESLint flat config',
        capabilities: {
          fix: true,
          lint: true,
          md: false,
          heavy: true,
          ast: true,
          changedSince: true,
          requiresBuild: false,
          postRun: false
        },
        ruleDescriptions: {
          'eslint-violation': 'Sintaxis o regla de lint violada'
        },
        configKey: 'eslint'
      };

      const card = renderAuditorDetailCard(task);
      expect(card).toContain('ESLint Hygiene');
      expect(card).toContain('Auto-reparación (--fix)');
      expect(card).toContain('Preset Lint');
      expect(card).toContain('eslint-violation');
      expect(card).toContain('Clave configurable:');
      expect(card).toContain('eslint');
    });

    it('renders fallback card when no capabilities or config are declared', () => {
      const task: AuditTaskDefinition = {
        id: 'simple_task',
        name: 'Simple Task',
        family: 'documentation',
        scriptPath: 'src/simple.ts',
        command: 'node',
        args: []
      };

      const card = renderAuditorDetailCard(task);
      expect(card).toContain('Simple Task');
      expect(card).toContain('(Ejecución estándar general)');
      expect(card).toContain('Sin configuración requerida');
    });
  });

  describe('renderAuditorsRegistryTable', () => {
    const sampleTasks: readonly AuditTaskDefinition[] = [
      {
        id: 'suite_a',
        name: 'Suite A',
        family: 'architecture',
        icon: '🏛️',
        description: 'First suite',
        capabilities: { fix: true, lint: true, md: false, heavy: false, ast: false, changedSince: false, requiresBuild: false, postRun: false },
        scriptPath: 'src/a.ts',
        command: 'node',
        args: []
      },
      {
        id: 'suite_b',
        name: 'Suite B',
        family: 'domain_data',
        icon: '🔒',
        description: 'Second suite',
        capabilities: { fix: false, lint: false, md: true, heavy: true, ast: false, changedSince: false, requiresBuild: false, postRun: false },
        scriptPath: 'src/b.ts',
        command: 'node',
        args: []
      }
    ];

    it('renders all suites with dynamic headers and flags', () => {
      const table = renderAuditorsRegistryTable(sampleTasks, ['architecture', 'domain_data']);
      expect(table).toContain('CATÁLOGO DINÁMICO DE AUDITORES');
      expect(table).toContain('suite_a');
      expect(table).toContain('suite_b');
      expect(table).toContain('FIX LINT');
      expect(table).toContain('MD HVY');
    });

    it('renders enabled filter correctly', () => {
      const table = renderAuditorsRegistryTable(sampleTasks, ['architecture'], { filter: 'enabled' });
      expect(table).toContain('CATÁLOGO DE AUDITORES ACTIVOS / ENCENDIDOS');
      expect(table).toContain('suite_a');
    });

    it('renders disabled filter correctly with reasons map', () => {
      const reasons = new Map([['suite_a', 'Desactivado por config']]);
      const table = renderAuditorsRegistryTable(sampleTasks, ['architecture'], {
        filter: 'disabled',
        disabledReasons: reasons
      });
      expect(table).toContain('CATÁLOGO DE AUDITORES DESACTIVADOS / APAGADOS');
      expect(table).toContain('suite_a');
      expect(table).toContain('Desactivado por config');
    });

    it('handles empty task list gracefully for both enabled and disabled filters', () => {
      const emptyEnabled = renderAuditorsRegistryTable([], ['architecture'], { filter: 'enabled' });
      expect(emptyEnabled).toContain('No se encontraron auditores');

      const emptyDisabled = renderAuditorsRegistryTable([], ['architecture'], { filter: 'disabled' });
      expect(emptyDisabled).toContain('¡No hay auditores desactivados!');
    });
  });

  describe('renderCliHelp', () => {
    it('renders CLI help card with active families and usage examples', () => {
      const help = renderCliHelp(['architecture', 'documentation']);
      expect(help).toContain('USO:');
      expect(help).toContain('MODOS Y PRESETS DE EJECUCIÓN:');
      expect(help).toContain('COMANDOS DE DESCUBRIMIENTO E INTROSPECCIÓN:');
      expect(help).toContain('FILTROS Y SELECCIÓN:');
      expect(help).toContain('architecture');
      expect(help).toContain('documentation');
    });
  });
});

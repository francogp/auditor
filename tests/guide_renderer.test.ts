/**
 * tests/guide_renderer.test.ts
 *
 * Unit tests for the on-demand diagnostic and remediation guide renderer.
 */

import { describe, it, expect } from 'vite-plus/test';
import {
  findRuleGuide,
  renderRuleGuideCard,
  renderSuiteGuideCards,
  renderFamilyGuideIndex,
  renderGlobalGuideIndex
} from '../src/cli/guideRenderer.ts';
import type { AuditTaskDefinition } from '../src/core/auditContract.ts';

describe('guideRenderer', () => {
  const sampleTask: AuditTaskDefinition = {
    id: 'validate_sample_task',
    name: 'Sample Suite',
    description: 'Valida reglas de prueba',
    family: 'architecture',
    icon: '🧪',
    scriptPath: 'src/suites/architecture/sample.ts',
    command: 'node',
    args: [],
    ruleDescriptions: {
      'sample-rule-1': 'Primera regla',
      'sample-rule-2': 'Segunda regla'
    },
    ruleRemediations: {
      'sample-rule-1': 'Pasos para solucionar regla 1.',
      'sample-rule-2': 'Pasos para solucionar regla 2.'
    },
    configKey: 'sample.enabled'
  };

  it('finds rule guide by exact rule ID', () => {
    const match = findRuleGuide([sampleTask], 'sample-rule-1');
    expect(match).toBeDefined();
    expect(match?.ruleId).toBe('sample-rule-1');
    expect(match?.remediation).toBe('Pasos para solucionar regla 1.');
  });

  it('returns undefined when rule is not found', () => {
    const match = findRuleGuide([sampleTask], 'non-existent-rule');
    expect(match).toBeUndefined();
  });

  it('renders a formatted rule guide card with Box-Drawing border', () => {
    const match = findRuleGuide([sampleTask], 'sample-rule-1')!;
    const output = renderRuleGuideCard(match);
    expect(output).toContain('GUÍA DE REMEDIACIÓN: sample-rule-1');
    expect(output).toContain('Pasos para solucionar regla 1.');
    expect(output).toContain('npm run auditor suite=validate_sample_task');
    expect(output).toContain('sample.enabled');
  });

  it('renders all guide cards for a suite', () => {
    const output = renderSuiteGuideCards(sampleTask);
    expect(output).toContain('sample-rule-1');
    expect(output).toContain('sample-rule-2');
    expect(output).toContain('Pasos para solucionar regla 1.');
    expect(output).toContain('Pasos para solucionar regla 2.');
  });

  it('renders notice when a suite has no rules declared', () => {
    const taskWithoutRules: AuditTaskDefinition = {
      ...sampleTask,
      ruleDescriptions: {}
    };
    const output = renderSuiteGuideCards(taskWithoutRules);
    expect(output).toContain('no declara reglas evaluables');
  });

  it('renders family guide index', () => {
    const output = renderFamilyGuideIndex('architecture', [sampleTask]);
    expect(output).toContain('CATÁLOGO DE REGLAS Y GUÍAS PARA LA FAMILIA: ARCHITECTURE');
    expect(output).toContain('Sample Suite');
    expect(output).toContain('sample-rule-1');
  });

  it('renders global guide index with command examples', () => {
    const output = renderGlobalGuideIndex([sampleTask]);
    expect(output).toContain('SISTEMA DE GUÍAS Y MANUALES A PEDIDO');
    expect(output).toContain('auditor guide <ruleId>');
    expect(output).toContain('Total de reglas documentadas');
  });
});

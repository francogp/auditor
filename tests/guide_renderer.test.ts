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
import type { AuditTaskDefinition, AuditorManifestDTO } from '../src/core/auditContract.ts';

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

  it('finds rule guide with normalized hyphens and underscores', () => {
    const match = findRuleGuide([sampleTask], 'sample_rule_1');
    expect(match).toBeDefined();
    expect(match?.ruleId).toBe('sample-rule-1');
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

  it('renders a formatted rule guide card without linked config when configKey is omitted', () => {
    const taskNoConfig: AuditTaskDefinition = {
      ...sampleTask,
      configKey: undefined
    };
    const match = findRuleGuide([taskNoConfig], 'sample-rule-1')!;
    const output = renderRuleGuideCard(match);
    expect(output).toContain('GUÍA DE REMEDIACIÓN: sample-rule-1');
    expect(output).not.toContain('CONFIGURACIÓN VINCULADA:');
  });

  it('renders family guide index with default puzzle icon when icon is omitted', () => {
    const taskNoIcon: AuditTaskDefinition = {
      ...sampleTask,
      icon: undefined
    };
    const output = renderFamilyGuideIndex('architecture', [taskNoIcon]);
    expect(output).toContain('🧩');
    expect(output).toContain('Sample Suite');
  });

  it('finds rule guide from manifest fallback when ruleDescriptions is omitted', () => {
    const taskWithManifest: AuditTaskDefinition = {
      ...sampleTask,
      ruleDescriptions: undefined as any,
      ruleRemediations: undefined as any,
      manifest: {
        rules: { 'manifest-rule': 'Regla desde manifest' },
        remediations: { 'manifest-rule': 'Solución manifest' }
      } as unknown as AuditorManifestDTO
    };
    const match = findRuleGuide([taskWithManifest], 'manifest-rule');
    expect(match).toBeDefined();
    expect(match?.ruleDescription).toBe('Regla desde manifest');
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

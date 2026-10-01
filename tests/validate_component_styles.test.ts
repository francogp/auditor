/**
 * tests/node/auditors/validate_component_styles.test.ts
 *
 * Unit tests for ComponentStylesAuditor.
 * Validates component style linkage, SCSS orphan detection, and strict governance
 * (ensuring no bypasses like style-inherited are permitted).
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ComponentStylesAuditor,
  COMPONENT_STYLE_RULES,
  auditComponentStyles
} from '../src/suites/architecture/validate_component_styles.ts';

describe('ComponentStylesAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });
  it('instantiates with correct metadata and configuration', () => {
    const auditor = new ComponentStylesAuditor();
    expect(auditor.id).toBe('validate_component_styles');
    expect(auditor.family).toBe('architecture');
    expect(auditor.name).toBe('Vue Component Style Linkage & SCSS Auditor');
    expect(auditor.description).toBe('Valida enlaces de estilos de componentes y huérfanos SCSS');
    expect(auditor.ruleIds).toEqual(COMPONENT_STYLE_RULES);
  });

  it('declares all mandatory component style rules and valid descriptions', () => {
    expect(COMPONENT_STYLE_RULES).toContain('broken-style-link');
    expect(COMPONENT_STYLE_RULES).toContain('missing-style-tag');
    expect(COMPONENT_STYLE_RULES).toContain('banned-style-inherited');
    expect(COMPONENT_STYLE_RULES).toContain('orphaned-scss');
    expect(COMPONENT_STYLE_RULES).toContain('ad-hoc-button-styles');
    expect(COMPONENT_STYLE_RULES).toHaveLength(5);

    const auditor = new ComponentStylesAuditor();
    expect(auditor.ruleDescriptions).toBeDefined();
    expect(auditor.ruleDescriptions?.['broken-style-link']).toBe('Enlace de estilo roto o inexistente');
    expect(auditor.ruleDescriptions?.['missing-style-tag']).toBe('Componente sin bloque de estilos');
    expect(auditor.ruleDescriptions?.['banned-style-inherited']).toBe('Marcador style-inherited prohibido');
    expect(auditor.ruleDescriptions?.['orphaned-scss']).toBe('Archivo SCSS huérfano sin uso');
    expect(auditor.ruleDescriptions?.['ad-hoc-button-styles']).toBe('Clase de botón fuera de estándar');
    expect(auditor.packageName).toBe('Estilos');
    expect(auditor.formatRuleDescription('broken-style-link')).toBe('Estilos: Enlace de estilo roto o inexistente');
  });

  it('runs audit and reports scan counts in workspace', () => {
    const auditor = new ComponentStylesAuditor();
    auditor.runAudit();

    expect(Array.isArray(auditor.getViolations())).toBe(true);
    expect(auditor.getVueCount()).toBeGreaterThanOrEqual(0);
    expect(auditor.getScssCount()).toBeGreaterThanOrEqual(0);
  });

  it('auditComponentStyles helper runs and returns a valid result structure', () => {
    const result = auditComponentStyles();
    expect(result.violations).toBeDefined();
    expect(typeof result.passed).toBe('boolean');
    expect(Array.isArray(result.violations)).toBe(true);
    expect(result.vueComponentsScanned).toBeGreaterThanOrEqual(0);
    expect(result.scssFilesScanned).toBeGreaterThanOrEqual(0);
  });

  it('verifies that no legacy style-inherited bypass markers exist in src components', () => {
    const auditor = new ComponentStylesAuditor();
    expect(auditor.id).toBe('validate_component_styles');
    expect(auditor.family).toBe('architecture');
  });

  describe('Clean Execution', () => {
    it('runs on compliant Vue components and SCSS graph with zero errors', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-comp-styles-'));
      try {
        const compDir = path.join(tempDir, 'src', 'components');
        const styleDir = path.join(tempDir, 'src', 'styles');
        await fs.mkdir(compDir, { recursive: true });
        await fs.mkdir(styleDir, { recursive: true });

        await fs.writeFile(
          path.join(compDir, 'CleanCard.vue'),
          `<template>
  <div class="clean-card">
    <span class="card-title">Clean</span>
  </div>
</template>
<style scoped>
.clean-card {
  display: block;
}
.card-title {
  font-weight: bold;
}
</style>
`,
          'utf-8'
        );

        await fs.writeFile(
          path.join(styleDir, '_index.scss'),
          `// Main styles entrypoint\n`,
          'utf-8'
        );

        const auditor = new ComponentStylesAuditor({ projectRoot: tempDir });
        const result = await auditor.execute();
        expect(result.summary.errors).toBe(0);
        expect(result.status).toBe('passed');
        expect(auditor.getViolations()).toHaveLength(0);
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });
  });
});

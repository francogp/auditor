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
    expect(COMPONENT_STYLE_RULES).toContain('banned-plain-css-style');
    expect(COMPONENT_STYLE_RULES).toContain('banned-raw-css-file');
    expect(COMPONENT_STYLE_RULES).toHaveLength(7);

    const auditor = new ComponentStylesAuditor();
    expect(auditor.ruleDescriptions).toBeDefined();
    expect(auditor.ruleDescriptions?.['broken-style-link']).toBe('Enlace de estilo roto o inexistente');
    expect(auditor.ruleDescriptions?.['missing-style-tag']).toBe('Componente sin bloque de estilos');
    expect(auditor.ruleDescriptions?.['banned-style-inherited']).toBe('Marcador style-inherited prohibido');
    expect(auditor.ruleDescriptions?.['orphaned-scss']).toBe('Archivo SCSS huérfano sin uso');
    expect(auditor.ruleDescriptions?.['ad-hoc-button-styles']).toBe('Clase de botón fuera de estándar');
    expect(auditor.ruleDescriptions?.['banned-plain-css-style']).toBe('Bloque <style> sin lang="scss"');
    expect(auditor.ruleDescriptions?.['banned-raw-css-file']).toBe('Archivo CSS plano sin SCSS');
    expect(auditor.packageName).toBe('Estilos');
    expect(auditor.formatRuleDescription('broken-style-link')).toBe('Estilos: Enlace de estilo roto o inexistente');
    expect(auditor.formatRuleDescription('banned-plain-css-style')).toBe('Estilos: Bloque <style> sin lang="scss"');
    expect(auditor.formatRuleDescription('banned-raw-css-file')).toBe('Estilos: Archivo CSS plano sin SCSS');
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

    it('detects broken-style-link, banned-style-inherited, missing-style-tag, and orphaned-scss', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-comp-styles-err-'));
      try {
        const compDir = path.join(tempDir, 'src', 'components');
        const styleDir = path.join(tempDir, 'src', 'styles', 'components');
        await fs.mkdir(compDir, { recursive: true });
        await fs.mkdir(styleDir, { recursive: true });

        // Broken style link
        await fs.writeFile(
          path.join(compDir, 'BrokenLink.vue'),
          `<template><div class="card">Broken</div></template>\n<style src="./missing.scss"></style>\n`,
          'utf-8'
        );

        // Banned style-inherited
        await fs.writeFile(
          path.join(compDir, 'Inherited.vue'),
          `<template><div class="box">Text</div></template>\n<!-- style-inherited: legacy -->\n`,
          'utf-8'
        );

        // Missing style tag with custom classes
        await fs.writeFile(
          path.join(compDir, 'NoStyle.vue'),
          `<template><div class="custom-card-container"><p class="custom-label">Hi</p></div></template>\n`,
          'utf-8'
        );

        // Orphaned SCSS
        await fs.writeFile(
          path.join(styleDir, '_orphan.scss'),
          `.orphan-style { color: red; }\n`,
          'utf-8'
        );

        // Ad-hoc button style override
        await fs.writeFile(
          path.join(compDir, 'BadButton.vue'),
          `<template><button class="btn btn-primary">Click</button></template>\n<style>\n.btn.custom { color: red; }\n</style>\n`,
          'utf-8'
        );

        const auditorDir = path.join(tempDir, '.auditor');
        await fs.mkdir(auditorDir, { recursive: true });
        await fs.writeFile(
          path.join(auditorDir, 'audit.config.json'),
          JSON.stringify({ styles: { buttonGovernance: { enabled: true } } }),
          'utf-8'
        );

        const auditor = new ComponentStylesAuditor({ projectRoot: tempDir });
        const result = await auditor.execute();

        expect(result.summary.errors).toBeGreaterThanOrEqual(4);
        const ruleIds = result.findings.map(f => f.ruleId);
        expect(ruleIds).toContain('broken-style-link');
        expect(ruleIds).toContain('banned-style-inherited');
        expect(ruleIds).toContain('orphaned-scss');
        expect(ruleIds).toContain('missing-style-tag');
        expect(ruleIds).toContain('ad-hoc-button-styles');
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });
  });

  describe('SCSS Enforcement & Auto-Fix', () => {
    it('passes cleanly when enforceScss is true and all SFCs use lang="scss"', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-comp-scss-clean-'));
      try {
        const compDir = path.join(tempDir, 'src', 'components');
        const styleDir = path.join(tempDir, 'src', 'styles');
        await fs.mkdir(compDir, { recursive: true });
        await fs.mkdir(styleDir, { recursive: true });

        await fs.writeFile(
          path.join(compDir, 'ScssCard.vue'),
          `<template><div class="scss-card">Card</div></template>\n<style scoped lang="scss">\n.scss-card { display: flex; }\n</style>\n`,
          'utf-8'
        );
        await fs.writeFile(
          path.join(styleDir, '_index.scss'),
          `// Main styles entrypoint\n`,
          'utf-8'
        );

        const auditorDir = path.join(tempDir, '.auditor');
        await fs.mkdir(auditorDir, { recursive: true });
        await fs.writeFile(
          path.join(auditorDir, 'audit.config.json'),
          JSON.stringify({ styles: { enforceScss: true } }),
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

    it('detects banned-plain-css-style when component uses plain style tags without lang="scss"', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-comp-scss-violation-'));
      try {
        const compDir = path.join(tempDir, 'src', 'components');
        const styleDir = path.join(tempDir, 'src', 'styles');
        await fs.mkdir(compDir, { recursive: true });
        await fs.mkdir(styleDir, { recursive: true });

        await fs.writeFile(
          path.join(compDir, 'PlainCss.vue'),
          `<template><div class="plain-box">Text</div></template>\n<style scoped>\n.plain-box { color: blue; }\n</style>\n`,
          'utf-8'
        );
        await fs.writeFile(
          path.join(compDir, 'ExplicitCss.vue'),
          `<template><div class="explicit-box">Text</div></template>\n<style lang="css">\n.explicit-box { color: green; }\n</style>\n`,
          'utf-8'
        );
        await fs.writeFile(
          path.join(styleDir, '_index.scss'),
          `// Main styles entrypoint\n`,
          'utf-8'
        );

        const auditorDir = path.join(tempDir, '.auditor');
        await fs.mkdir(auditorDir, { recursive: true });
        await fs.writeFile(
          path.join(auditorDir, 'audit.config.json'),
          JSON.stringify({ styles: { enforceScss: true } }),
          'utf-8'
        );

        const auditor = new ComponentStylesAuditor({ projectRoot: tempDir });
        const result = await auditor.execute();
        expect(result.summary.errors).toBe(2);
        expect(result.status).toBe('failed');
        const violations = auditor.getViolations();
        expect(violations.filter(v => v.type === 'banned_plain_css_style')).toHaveLength(2);
        expect(auditor.getFixableErrors()).toBe(2);
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('detects banned-raw-css-file when standalone .css file exists and exempts configured files', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-comp-raw-css-'));
      try {
        const styleDir = path.join(tempDir, 'src', 'styles');
        await fs.mkdir(styleDir, { recursive: true });

        await fs.writeFile(path.join(styleDir, '_index.scss'), '// root\n', 'utf-8');
        await fs.writeFile(path.join(styleDir, 'legacy.css'), 'body { margin: 0; }\n', 'utf-8');
        await fs.writeFile(path.join(styleDir, 'vendor.css'), '/* vendor */\n', 'utf-8');

        const auditorDir = path.join(tempDir, '.auditor');
        await fs.mkdir(auditorDir, { recursive: true });
        await fs.writeFile(
          path.join(auditorDir, 'audit.config.json'),
          JSON.stringify({
            styles: {
              enforceScss: true,
              exemptCssFiles: ['vendor.css']
            }
          }),
          'utf-8'
        );

        const auditor = new ComponentStylesAuditor({ projectRoot: tempDir });
        const result = await auditor.execute();
        expect(result.summary.errors).toBe(1);
        const violations = auditor.getViolations();
        expect(violations[0]?.type).toBe('banned_raw_css_file');
        expect(violations[0]?.file).toContain('legacy.css');
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('auto-fixes plain <style> and <style scoped> and <style lang="css"> by adding lang="scss" in fix mode', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-comp-fix-'));
      try {
        const compDir = path.join(tempDir, 'src', 'components');
        const styleDir = path.join(tempDir, 'src', 'styles');
        await fs.mkdir(compDir, { recursive: true });
        await fs.mkdir(styleDir, { recursive: true });

        const testSfcPath = path.join(compDir, 'MultiStyle.vue');
        await fs.writeFile(
          testSfcPath,
          `<template>\n  <div class="test">Hello</div>\n</template>\n\n<style scoped>\n.test { color: red; }\n</style>\n\n<style lang="css">\n.global { font-size: 14px; }\n</style>\n`,
          'utf-8'
        );
        await fs.writeFile(path.join(styleDir, '_index.scss'), '// root\n', 'utf-8');

        const auditorDir = path.join(tempDir, '.auditor');
        await fs.mkdir(auditorDir, { recursive: true });
        await fs.writeFile(
          path.join(auditorDir, 'audit.config.json'),
          JSON.stringify({ styles: { enforceScss: true } }),
          'utf-8'
        );

        // 1. Audit in lint mode: reports 2 fixable errors
        const lintAuditor = new ComponentStylesAuditor({ projectRoot: tempDir });
        const lintResult = await lintAuditor.execute();
        expect(lintResult.summary.errors).toBe(2);
        expect(lintAuditor.getFixableErrors()).toBe(2);

        // 2. Audit in fix mode: applies the fix on disk
        const fixAuditor = new ComponentStylesAuditor({ projectRoot: tempDir, fix: true });
        const fixResult = await fixAuditor.execute();
        expect(fixResult.summary.errors).toBe(0);
        expect(fixResult.status).toBe('passed');

        // 3. Verify file content on disk has both style tags updated to lang="scss"
        const fixedContent = await fs.readFile(testSfcPath, 'utf-8');
        expect(fixedContent).toContain('<style scoped lang="scss">');
        expect(fixedContent).toContain('<style lang="scss">');
        expect(fixedContent).not.toContain('<style scoped>');
        expect(fixedContent).not.toContain('<style lang="css">');

        // 4. Re-run in lint mode: completely clean
        const recheckAuditor = new ComponentStylesAuditor({ projectRoot: tempDir });
        const recheckResult = await recheckAuditor.execute();
        expect(recheckResult.summary.errors).toBe(0);
        expect(recheckResult.status).toBe('passed');
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });

    it('bypasses SCSS checks when enforceScss: false', async () => {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-comp-scss-disabled-'));
      try {
        const compDir = path.join(tempDir, 'src', 'components');
        const styleDir = path.join(tempDir, 'src', 'styles');
        await fs.mkdir(compDir, { recursive: true });
        await fs.mkdir(styleDir, { recursive: true });

        await fs.writeFile(
          path.join(compDir, 'PlainStyle.vue'),
          `<template><div class="plain">Test</div></template>\n<style scoped>\n.plain { color: black; }\n</style>\n`,
          'utf-8'
        );
        await fs.writeFile(path.join(styleDir, 'plain.css'), 'body { margin: 0; }\n', 'utf-8');
        await fs.writeFile(path.join(styleDir, '_index.scss'), '// root\n', 'utf-8');

        const auditorDir = path.join(tempDir, '.auditor');
        await fs.mkdir(auditorDir, { recursive: true });
        await fs.writeFile(
          path.join(auditorDir, 'audit.config.json'),
          JSON.stringify({ styles: { enforceScss: false } }),
          'utf-8'
        );

        const auditor = new ComponentStylesAuditor({ projectRoot: tempDir });
        const result = await auditor.execute();
        expect(result.summary.errors).toBe(0);
        expect(result.status).toBe('passed');
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    });
  });
});

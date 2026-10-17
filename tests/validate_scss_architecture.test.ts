import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { resetAuditConfig } from '../src/core/auditConfig.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import {
  ValidateScssArchitectureAuditor,
  SCSS_ARCHITECTURE_RULES
} from '../src/suites/architecture/validate_scss_architecture.ts';

describe('ValidateScssArchitectureAuditor Conformance & Rule Detection', () => {
  let tempDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scss-arch-test-'));
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // catch-ok: cleanup temporary test directory
    }
  });

  describe('Point 1: Construction & Metadata Conformance', () => {
    it('initializes with correct auditor metadata and Spanish rule descriptions', () => {
      const auditor = new ValidateScssArchitectureAuditor({ projectRoot: tempDir });
      expect(auditor.id).toBe('validate_scss_architecture');
      expect(auditor.name).toBe('SCSS Architecture & Distinctive Design Validator');
      expect(auditor.family).toBe('architecture');
      expect(auditor.packageName).toBe('SCSSArch');
      expect(auditor.icon).toBe('🎨');
      expect(auditor.ruleIds).toEqual([...SCSS_ARCHITECTURE_RULES]);
      expect(auditor.ruleDescriptions['raw-css-in-sfc']).toBe('<style> sin atributo lang="scss"');
      expect(auditor.ruleDescriptions['scss-deep-selector-abuse']).toBe(
        'Abuso o anidamiento de :deep()'
      );
      expect(auditor.ruleDescriptions['non-standard-spacing-unit']).toBe(
        'Espaciado arbitrario sin escala'
      );
      expect(auditor.ruleDescriptions['missing-theme-token-usage']).toBe(
        'Color hardcodeado sin token de tema'
      );
      expect(auditor.ruleDescriptions['excessive-scss-nesting']).toBe(
        'Anidamiento SCSS superior a 3 niveles'
      );

      const constructionErrors = validateAuditorConstruction(auditor);
      expect(constructionErrors).toHaveLength(0);
    });
  });

  describe('Point 2: Clean Path Verification', () => {
    it('passes cleanly reporting zero errors on tokenized SCSS with flat BEM selectors', async () => {
      const auditor = new ValidateScssArchitectureAuditor({ projectRoot: tempDir });
      const cleanSnippet = [
        '<template>',
        '  <div class="user-card">',
        '    <span class="user-card__name">User</span>',
        '  </div>',
        '</template>',
        '<style lang="scss" scoped>',
        '.user-card {',
        '  padding: var(--spacing-4);',
        '  margin-bottom: var(--spacing-2);',
        '  background-color: var(--color-surface);',
        '  color: var(--color-text-primary);',
        '',
        '  &__name {',
        '    font-size: var(--font-size-sm);',
        '  }',
        '}',
        '</style>'
      ].join('\n');

      auditor.testScanFile('src/components/UserCard.vue', cleanSnippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('passed');
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('Point 3: Violation Detection Path for All 5 Rules', () => {
    it('detects raw-css-in-sfc when SFC style tag lacks lang="scss"', async () => {
      const auditor = new ValidateScssArchitectureAuditor({ projectRoot: tempDir });
      const snippet =
        '<template><div>Hello</div></template><style scoped>.box { margin: 8px; }</style>';

      auditor.testScanFile('src/components/RawBox.vue', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'raw-css-in-sfc');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects scss-deep-selector-abuse when nested :deep or deep chain is used', async () => {
      const auditor = new ValidateScssArchitectureAuditor({ projectRoot: tempDir });
      const snippet = '<style lang="scss">.card { :deep(.a .b .c .d) { color: red; } }</style>';

      auditor.testScanFile('src/components/DeepCard.vue', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'scss-deep-selector-abuse');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects non-standard-spacing-unit when arbitrary odd pixel value is used', async () => {
      const auditor = new ValidateScssArchitectureAuditor({ projectRoot: tempDir });
      const snippet = '.panel { margin: 13px; padding: 27px; }';

      auditor.testScanFile('src/styles/panel.scss', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'non-standard-spacing-unit');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects missing-theme-token-usage when hardcoded hex colors are used', async () => {
      const auditor = new ValidateScssArchitectureAuditor({ projectRoot: tempDir });
      const snippet = '.button { background-color: #3b82f6; border-color: #1d4ed8; }';

      auditor.testScanFile('src/styles/button.scss', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'missing-theme-token-usage');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects excessive-scss-nesting when selector nesting depth exceeds 3 levels', async () => {
      const auditor = new ValidateScssArchitectureAuditor({ projectRoot: tempDir });
      const snippet = [
        '.level1 {',
        '  .level2 {',
        '    .level3 {',
        '      .level4 {',
        '        font-size: 14px;',
        '      }',
        '    }',
        '  }',
        '}'
      ].join('\n');

      auditor.testScanFile('src/styles/nested.scss', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'excessive-scss-nesting');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('handles @media queries symmetrically without brace count desynchronization', async () => {
      const auditor = new ValidateScssArchitectureAuditor({ projectRoot: tempDir });
      const snippet = [
        '.container {',
        '  color: var(--primary);',
        '  @media (min-width: 600px) {',
        '    .inner {',
        '      color: var(--secondary);',
        '    }',
        '  }',
        '  .sibling {',
        '    color: var(--accent);',
        '  }',
        '}'
      ].join('\n');

      auditor.testScanFile('src/styles/responsive.scss', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('allows up to 4 nesting levels in scoped SFC styles (scopedMaxNestingDepth: 4)', async () => {
      const auditor = new ValidateScssArchitectureAuditor({ projectRoot: tempDir });
      const snippet = [
        '<template><div /></template>',
        '<style lang="scss" scoped>',
        '.root {',
        '  .section {',
        '    .item {',
        '      .badge {',
        '        color: var(--badge-color);',
        '      }',
        '    }',
        '  }',
        '}',
        '</style>'
      ].join('\n');

      auditor.testScanFile('src/components/ScopedCard.vue', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('permits retro/pixel-art odd spacing units when allowPixelArtSpacing is enabled', async () => {
      const auditorDir = path.join(tempDir, '.auditor');
      fs.mkdirSync(auditorDir, { recursive: true });
      fs.writeFileSync(
        path.join(auditorDir, 'audit.config.json'),
        JSON.stringify({
          scssArchitecture: {
            allowPixelArtSpacing: true
          }
        })
      );

      const auditor = new ValidateScssArchitectureAuditor({ projectRoot: tempDir });
      const snippet = '.retro-sprite { margin: 11px; padding: 13px; gap: 7px; }';

      auditor.testScanFile('src/styles/retro.scss', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('permits component-scoped colors when allowScopedColors is enabled in scoped SFC', async () => {
      const auditorDir = path.join(tempDir, '.auditor');
      fs.mkdirSync(auditorDir, { recursive: true });
      fs.writeFileSync(
        path.join(auditorDir, 'audit.config.json'),
        JSON.stringify({
          scssArchitecture: {
            allowScopedColors: true
          }
        })
      );

      const auditor = new ValidateScssArchitectureAuditor({ projectRoot: tempDir });
      const snippet = [
        '<template><div /></template>',
        '<style lang="scss" scoped>',
        '.custom-widget {',
        '  color: #ff3366;',
        '}',
        '</style>'
      ].join('\n');

      auditor.testScanFile('src/components/CustomWidget.vue', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('honors exemptPaths dynamically configured in audit.config.json', async () => {
      const auditorDir = path.join(tempDir, '.auditor');
      fs.mkdirSync(auditorDir, { recursive: true });
      fs.writeFileSync(
        path.join(auditorDir, 'audit.config.json'),
        JSON.stringify({
          scssArchitecture: {
            exemptPaths: ['src/legacy/**']
          }
        })
      );

      const auditor = new ValidateScssArchitectureAuditor({ projectRoot: tempDir });
      const snippet = '.legacy { margin: 13px; background-color: #ff0000; }';

      auditor.testScanFile('src/legacy/old.scss', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });

  describe('Point 4 & 5: Duration Invariants & 100% Rule Coverage', () => {
    it('measures real empirical durations for 100% of declared rules', () => {
      const auditor = new ValidateScssArchitectureAuditor({ projectRoot: tempDir });
      auditor.testScanFile('src/clean.scss', '.clean { display: block; }');

      for (const rule of SCSS_ARCHITECTURE_RULES) {
        const duration = auditor.getRuleDuration(rule);
        expect(duration).toBeDefined();
        expect(duration!).toBeGreaterThanOrEqual(0);
      }
    });
  });
});

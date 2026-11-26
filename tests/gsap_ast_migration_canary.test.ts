/**
 * tests/gsap_ast_migration_canary.test.ts
 *
 * HERMETIC CANARY SUITE FOR SCSS/DOM TO GSAP AST RULES & SETUP STYLE-ROOT GUARD
 * Verifies:
 * 1. Positive Canaries: Zero missed/ignored cases across all 8 SCSS/CSS AST rules,
 *    all 3 @francogp/domain-type/* DOM-to-GSAP Oxlint rules, Vite+ conditional projection,
 *    and audit-config-untracked-style-root.
 * 2. Negative / Clean Canaries: Zero false positives on legitimate CSS/SCSS/TS patterns,
 *    exempted media queries, lazy-loading observers, rAF-throttled listeners, and tracked style roots.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import {
  GSAP_SCSS_ANIMATION_RULES,
  SCSS_ANIMATION_RULES,
  UNIVERSAL_SCSS_ANIMATION_RULES
} from '../src/analyzers/scssModernAnalyzer.ts';
import { resetAuditConfig, defineAuditConfig } from '../src/core/auditConfig.ts';
import { CANONICAL_GSAP_DOM_RULES } from '../src/core/auditConfigDefaults.ts';
import {
  domainTypeOxlintPlugin,
  type OxlintReportDescriptor,
  type OxlintRuleContext
} from '../src/core/domainTypeOxlintPlugin.ts';
import { clearPackageJsonCache } from '../src/core/packageJson.ts';
import { buildCanonicalVitePlusConfig } from '../src/core/vitePlusConfigSync.ts';
import { ValidateAuditConfigAuditor } from '../src/suites/architecture/validate_audit_config.ts';
import { ValidateScssArchitectureAuditor } from '../src/suites/architecture/validate_scss_architecture.ts';

function createOxlintMockContext(): {
  reports: OxlintReportDescriptor[];
  context: OxlintRuleContext;
} {
  const reports: OxlintReportDescriptor[] = [];
  const context: OxlintRuleContext = {
    report: (descriptor: OxlintReportDescriptor): void => {
      reports.push(descriptor);
    }
  };
  return { reports, context };
}

describe('GSAP AST Migration & Setup Guard Canaries (Zero False Positives / Zero Blind Spots)', () => {
  let sandboxDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    vi.spyOn(process, 'exit').mockImplementation((): never => undefined as never);
    resetAuditConfig();
    clearPackageJsonCache();
    sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gsap-ast-canary-'));
    await fs.mkdir(path.join(sandboxDir, '.auditor'), { recursive: true });
    await fs.mkdir(path.join(sandboxDir, 'src', 'styles'), { recursive: true });
    await fs.mkdir(path.join(sandboxDir, 'src', 'components'), { recursive: true });
    await fs.writeFile(
      path.join(sandboxDir, '.auditor', 'audit.config.ts'),
      `export default {
        name: 'canary-app',
        paths: {
          srcRoots: ['src'],
          stylesRoots: ['src/styles'],
          testRoots: ['tests'],
          demoRoots: ['demos']
        }
      };`,
      'utf-8'
    );
  });

  afterEach(async () => {
    resetAuditConfig();
    clearPackageJsonCache();
    vi.restoreAllMocks();
    await fs.rm(sandboxDir, { recursive: true, force: true });
  });

  it('Positive Canary (GSAP enabled): fires severity=error for all 8 SCSS/CSS/Vue AST rules', async () => {
    await fs.writeFile(
      path.join(sandboxDir, 'package.json'),
      JSON.stringify({ name: 'canary-gsap', dependencies: { gsap: '^3.13.0' } }),
      'utf-8'
    );

    const brokenScss = [
      'html { scroll-behavior: smooth; }',
      '.card { transition: all 0.3s ease; }',
      '.card-rev { transition: 0.3s all ease; }',
      '.panel { transition: 0.3s left ease; }',
      '@keyframes pop { 0% { will-change: transform; width: 10px; } 100% { width: 100px; } }',
      '.drawer { transform: translateX(0) !important; }',
      '@for $i from 1 through 3 { .item-#{$i} { transition-delay: #{$i * 40}ms; } }',
      '.modal { opacity: 0; visibility: hidden; transition: opacity 0.2s, visibility 0.2s; }',
      '.line { transition: stroke-dashoffset 0.5s linear; }'
    ].join('\n');

    await fs.writeFile(path.join(sandboxDir, 'src', 'styles', 'broken.scss'), brokenScss, 'utf-8');
    await fs.writeFile(
      path.join(sandboxDir, 'src', 'components', 'Card.vue'),
      '<template><div class="card" /></template>\n<style lang="scss" scoped>\n.box { transition: all 0.2s; }\n</style>\n',
      'utf-8'
    );

    const auditor = new ValidateScssArchitectureAuditor({
      projectRoot: sandboxDir,
      roots: ['src']
    });
    const res = await auditor.audit();
    const ruleIds = new Set(res.findings.map((f) => f.ruleId));

    for (const rule of [...UNIVERSAL_SCSS_ANIMATION_RULES, ...GSAP_SCSS_ANIMATION_RULES]) {
      expect(ruleIds.has(rule), `Expected canary to trigger rule ${rule}`).toBe(true);
      const matching = res.findings.filter((f) => f.ruleId === rule);
      expect(matching.every((f) => f.severity === 'error' && f.fixable === false)).toBe(true);
    }
    expect(res.findings.some((f) => Boolean(f.file?.endsWith('Card.vue')))).toBe(true);
  });

  it('Positive Canary (Non-GSAP project): universal rules fire while GSAP-only SCSS rules mark non-applicable', async () => {
    await fs.writeFile(
      path.join(sandboxDir, 'package.json'),
      JSON.stringify({ name: 'canary-no-gsap', dependencies: { vue: '^3.5.0' } }),
      'utf-8'
    );

    const mixedCss = [
      'html { scroll-behavior: smooth; }',
      '.card { transition: all 0.3s ease; }',
      '.panel { transition: width 0.2s ease; }',
      '@keyframes flash { 0% { will-change: opacity; } }'
    ].join('\n');
    await fs.writeFile(path.join(sandboxDir, 'src', 'styles', 'mixed.css'), mixedCss, 'utf-8');

    const auditor = new ValidateScssArchitectureAuditor({
      projectRoot: sandboxDir,
      roots: ['src/styles']
    });
    const res = await auditor.audit();
    const ruleIds = new Set(res.findings.map((f) => f.ruleId));

    for (const uRule of UNIVERSAL_SCSS_ANIMATION_RULES) {
      expect(ruleIds.has(uRule)).toBe(true);
    }
    for (const gRule of GSAP_SCSS_ANIMATION_RULES) {
      expect(ruleIds.has(gRule)).toBe(false);
      expect(auditor.getRuleDuration(gRule)).toBeGreaterThanOrEqual(0);
    }
  });

  it('Clean Canary (GSAP enabled): zero false positives on safe CSS/SCSS patterns', async () => {
    await fs.writeFile(
      path.join(sandboxDir, 'package.json'),
      JSON.stringify({ name: 'canary-clean-gsap', dependencies: { gsap: '^3.13.0' } }),
      'utf-8'
    );

    const cleanScss = [
      '.carousel { scroll-behavior: smooth; }',
      '.btn { transition: color 0.2s ease, background-color 0.2s ease; }',
      '@media (prefers-reduced-motion: reduce) {',
      '  .drawer { transform: none !important; }',
      '  @for $i from 1 through 3 { .item-#{$i} { transition-delay: 0.1s; } }',
      '}',
      '@for $i from 1 through 3 { .reset-#{$i} { transition-delay: 0s; } }',
      '.static-hidden { opacity: 0; visibility: hidden; }',
      '.sr-only { opacity: 0; pointer-events: none; transition: opacity 0.2s; }',
      '.dashed { stroke-dasharray: 6; stroke-dashoffset: 12; }'
    ].join('\n');
    await fs.writeFile(path.join(sandboxDir, 'src', 'styles', 'clean.scss'), cleanScss, 'utf-8');

    const auditor = new ValidateScssArchitectureAuditor({
      projectRoot: sandboxDir,
      roots: ['src/styles']
    });
    const res = await auditor.audit();
    const animationRuleSet = new Set<string>(SCSS_ANIMATION_RULES);
    const animationFindings = res.findings.filter((f) =>
      Boolean(f.ruleId && animationRuleSet.has(f.ruleId))
    );
    expect(animationFindings).toHaveLength(0);
  });

  it('Positive & Clean Canaries: Oxlint GSAP DOM AST rules catch real patterns and avoid false positives', () => {
    const ioRule = domainTypeOxlintPlugin.rules['no-dom-intersection-reveal'];
    const { reports: ioBad, context: ioBadCtx } = createOxlintMockContext();
    ioRule.create(ioBadCtx).NewExpression?.({
      type: 'NewExpression',
      callee: { type: 'Identifier', name: 'IntersectionObserver' },
      arguments: [
        {
          type: 'ArrowFunctionExpression',
          body: {
            type: 'CallExpression',
            callee: {
              type: 'MemberExpression',
              object: {
                type: 'MemberExpression',
                object: { type: 'Identifier', name: 'el' },
                property: { type: 'Identifier', name: 'classList' }
              },
              property: { type: 'Identifier', name: 'add' }
            },
            arguments: [{ type: 'Literal', value: 'is-visible' }]
          }
        }
      ]
    });
    expect(ioBad).toHaveLength(1);

    const { reports: ioClean, context: ioCleanCtx } = createOxlintMockContext();
    ioRule.create(ioCleanCtx).NewExpression?.({
      type: 'NewExpression',
      callee: { type: 'Identifier', name: 'IntersectionObserver' },
      arguments: [
        {
          type: 'ArrowFunctionExpression',
          body: {
            type: 'AssignmentExpression',
            operator: '=',
            left: {
              type: 'MemberExpression',
              object: {
                type: 'MemberExpression',
                object: { type: 'Identifier', name: 'img' },
                property: { type: 'Identifier', name: 'dataset' }
              },
              property: { type: 'Identifier', name: 'loaded' }
            },
            right: { type: 'Literal', value: 'true' }
          }
        }
      ]
    });
    expect(ioClean).toHaveLength(0);

    const scrollRule = domainTypeOxlintPlugin.rules['no-scroll-mousemove-style-mutation'];
    const { reports: scrollBad, context: scrollBadCtx } = createOxlintMockContext();
    scrollRule.create(scrollBadCtx).CallExpression?.({
      type: 'CallExpression',
      callee: {
        type: 'MemberExpression',
        object: { type: 'Identifier', name: 'window' },
        property: { type: 'Identifier', name: 'addEventListener' }
      },
      arguments: [
        { type: 'Literal', value: 'mousemove' },
        {
          type: 'ArrowFunctionExpression',
          body: {
            type: 'AssignmentExpression',
            operator: '=',
            left: {
              type: 'MemberExpression',
              object: {
                type: 'MemberExpression',
                object: { type: 'Identifier', name: 'cursor' },
                property: { type: 'Identifier', name: 'style' }
              },
              property: { type: 'Identifier', name: 'transform' }
            },
            right: { type: 'Literal', value: 'translateX(10px)' }
          }
        }
      ]
    });
    expect(scrollBad).toHaveLength(1);

    const { reports: scrollRafClean, context: scrollRafCtx } = createOxlintMockContext();
    scrollRule.create(scrollRafCtx).CallExpression?.({
      type: 'CallExpression',
      callee: {
        type: 'MemberExpression',
        object: { type: 'Identifier', name: 'window' },
        property: { type: 'Identifier', name: 'addEventListener' }
      },
      arguments: [
        { type: 'Literal', value: 'scroll' },
        {
          type: 'ArrowFunctionExpression',
          body: {
            type: 'CallExpression',
            callee: { type: 'Identifier', name: 'requestAnimationFrame' },
            arguments: [
              {
                type: 'ArrowFunctionExpression',
                body: {
                  type: 'AssignmentExpression',
                  operator: '=',
                  left: {
                    type: 'MemberExpression',
                    object: {
                      type: 'MemberExpression',
                      object: { type: 'Identifier', name: 'bar' },
                      property: { type: 'Identifier', name: 'style' }
                    },
                    property: { type: 'Identifier', name: 'width' }
                  },
                  right: { type: 'Literal', value: '50%' }
                }
              }
            ]
          }
        }
      ]
    });
    expect(scrollRafClean).toHaveLength(0);

    for (const rafHost of ['window', 'globalThis'] as const) {
      const { reports: memberRafClean, context: memberRafCtx } = createOxlintMockContext();
      scrollRule.create(memberRafCtx).CallExpression?.({
        type: 'CallExpression',
        callee: {
          type: 'MemberExpression',
          object: { type: 'Identifier', name: 'window' },
          property: { type: 'Identifier', name: 'addEventListener' }
        },
        arguments: [
          { type: 'Literal', value: 'scroll' },
          {
            type: 'ArrowFunctionExpression',
            body: {
              type: 'CallExpression',
              callee: {
                type: 'MemberExpression',
                object: { type: 'Identifier', name: rafHost },
                property: { type: 'Identifier', name: 'requestAnimationFrame' }
              },
              arguments: [
                {
                  type: 'ArrowFunctionExpression',
                  body: {
                    type: 'AssignmentExpression',
                    operator: '=',
                    left: {
                      type: 'MemberExpression',
                      object: {
                        type: 'MemberExpression',
                        object: { type: 'Identifier', name: 'bar' },
                        property: { type: 'Identifier', name: 'style' }
                      },
                      property: { type: 'Identifier', name: 'width' }
                    },
                    right: { type: 'Literal', value: '50%' }
                  }
                }
              ]
            }
          }
        ]
      });
      expect(memberRafClean).toHaveLength(0);
    }

    const intoViewRule = domainTypeOxlintPlugin.rules['no-smooth-scroll-into-view'];
    const { reports: intoViewBad, context: intoViewBadCtx } = createOxlintMockContext();
    intoViewRule.create(intoViewBadCtx).CallExpression?.({
      type: 'CallExpression',
      callee: {
        type: 'MemberExpression',
        object: { type: 'Identifier', name: 'el' },
        property: { type: 'Identifier', name: 'scrollIntoView' }
      },
      arguments: [
        {
          type: 'ObjectExpression',
          properties: [
            {
              type: 'Property',
              key: { type: 'Identifier', name: 'behavior' },
              value: { type: 'Literal', value: 'smooth' }
            }
          ]
        }
      ]
    });
    expect(intoViewBad).toHaveLength(1);

    const { reports: intoViewClean, context: intoViewCleanCtx } = createOxlintMockContext();
    const intoViewVisitor = intoViewRule.create(intoViewCleanCtx);
    intoViewVisitor.CallExpression?.({
      type: 'CallExpression',
      callee: {
        type: 'MemberExpression',
        object: { type: 'Identifier', name: 'el' },
        property: { type: 'Identifier', name: 'scrollIntoView' }
      },
      arguments: [
        {
          type: 'ObjectExpression',
          properties: [
            {
              type: 'Property',
              key: { type: 'Identifier', name: 'behavior' },
              value: { type: 'Literal', value: 'auto' }
            }
          ]
        }
      ]
    });
    expect(intoViewClean).toHaveLength(0);
  });

  it('Canary: vite.config.ts projects CANONICAL_GSAP_DOM_RULES only when gsap is declared', async () => {
    await fs.writeFile(
      path.join(sandboxDir, 'package.json'),
      JSON.stringify({ name: 'canary-vite-gsap', dependencies: { gsap: '^3.13.0' } }),
      'utf-8'
    );
    const config = defineAuditConfig({
      name: 'canary-vite-gsap',
      paths: { srcRoots: ['src'], testRoots: ['tests'], demoRoots: ['demos'] }
    });
    const withGsapSource = buildCanonicalVitePlusConfig(config, sandboxDir);
    for (const rule of Object.keys(CANONICAL_GSAP_DOM_RULES)) {
      expect(withGsapSource).toContain(rule);
    }

    await fs.writeFile(
      path.join(sandboxDir, 'package.json'),
      JSON.stringify({ name: 'canary-vite-no-gsap', dependencies: { vue: '^3.5.0' } }),
      'utf-8'
    );
    clearPackageJsonCache();
    const withoutGsapSource = buildCanonicalVitePlusConfig(config, sandboxDir);
    for (const rule of Object.keys(CANONICAL_GSAP_DOM_RULES)) {
      expect(withoutGsapSource).not.toContain(rule);
    }
  });

  it('Canary: phase setup catches forgotten untracked stylesheet roots even when stylesRoots is empty', async () => {
    await fs.writeFile(
      path.join(sandboxDir, 'package.json'),
      JSON.stringify({ name: 'canary-setup', dependencies: {} }),
      'utf-8'
    );
    await fs.writeFile(
      path.join(sandboxDir, '.auditor', 'audit.config.ts'),
      `export default {
        name: 'canary-setup',
        paths: {
          srcRoots: ['src'],
          stylesRoots: [],
          testRoots: ['tests'],
          demoRoots: ['demos']
        }
      };`,
      'utf-8'
    );
    await fs.mkdir(path.join(sandboxDir, 'public', 'css'), { recursive: true });
    await fs.writeFile(
      path.join(sandboxDir, 'public', 'css', 'forgotten.scss'),
      '.x { color: red; }\n',
      'utf-8'
    );
    await fs.mkdir(path.join(sandboxDir, 'tests'), { recursive: true });
    await fs.writeFile(
      path.join(sandboxDir, 'tests', 'fixture.scss'),
      '.t { color: blue; }\n',
      'utf-8'
    );

    const auditor = new ValidateAuditConfigAuditor({ projectRoot: sandboxDir });
    const res = await auditor.audit();
    const styleRootFindings = res.findings.filter(
      (f) => f.ruleId === 'audit-config-untracked-style-root'
    );
    expect(styleRootFindings).toHaveLength(1);
    expect(styleRootFindings[0]?.context).toBe('public/css');
    expect(styleRootFindings[0]?.severity).toBe('error');
  });

  it('Clean Canary: phase setup emits zero audit-config-untracked-style-root when styles are tracked or exempted', async () => {
    await fs.writeFile(
      path.join(sandboxDir, 'package.json'),
      JSON.stringify({ name: 'canary-setup-clean', dependencies: {} }),
      'utf-8'
    );
    await fs.writeFile(
      path.join(sandboxDir, '.auditor', 'audit.config.ts'),
      `export default {
        name: 'canary-setup-clean',
        paths: {
          srcRoots: ['src'],
          stylesRoots: ['theme'],
          testRoots: ['tests'],
          demoRoots: ['demos'],
          ignoreGlobs: ['vendor/css/**']
        },
        coverage: {
          enabled: true,
          exemptGlobs: [{ glob: 'legacy/styles/**', reason: 'Legacy vendor CSS pending removal' }]
        }
      };`,
      'utf-8'
    );
    await fs.mkdir(path.join(sandboxDir, 'theme'), { recursive: true });
    await fs.mkdir(path.join(sandboxDir, 'demos'), { recursive: true });
    await fs.mkdir(path.join(sandboxDir, 'vendor', 'css'), { recursive: true });
    await fs.mkdir(path.join(sandboxDir, 'legacy', 'styles'), { recursive: true });
    await fs.writeFile(
      path.join(sandboxDir, 'theme', 'base.scss'),
      '.a { color: red; }\n',
      'utf-8'
    );
    await fs.writeFile(
      path.join(sandboxDir, 'demos', 'demo.css'),
      '.b { color: blue; }\n',
      'utf-8'
    );
    await fs.writeFile(
      path.join(sandboxDir, 'vendor', 'css', 'lib.css'),
      '.c { color: green; }\n',
      'utf-8'
    );
    await fs.writeFile(
      path.join(sandboxDir, 'legacy', 'styles', 'old.scss'),
      '.d { color: gray; }\n',
      'utf-8'
    );

    const auditor = new ValidateAuditConfigAuditor({ projectRoot: sandboxDir });
    const res = await auditor.audit();
    const styleRootFindings = res.findings.filter(
      (f) => f.ruleId === 'audit-config-untracked-style-root'
    );
    expect(styleRootFindings).toHaveLength(0);
  });
});

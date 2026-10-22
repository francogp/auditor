import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { resetAuditConfig } from '../src/core/auditConfig.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import {
  ValidateWebPerformanceAuditor,
  WEB_PERFORMANCE_RULES
} from '../src/suites/performance/validate_web_performance.ts';

describe('ValidateWebPerformanceAuditor Conformance & Rule Detection', () => {
  let tempDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-perf-test-'));
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* non-fatal test cleanup */
    }
  });

  describe('Point 1: Construction & Metadata Conformance', () => {
    it('initializes with correct auditor metadata and rule descriptions', () => {
      const auditor = new ValidateWebPerformanceAuditor({ projectRoot: tempDir });
      expect(auditor.id).toBe('validate_web_performance');
      expect(auditor.name).toBe('Web Performance & Core Web Vitals Auditor');
      expect(auditor.family).toBe('performance');
      expect(auditor.packageName).toBe('WebPerf');
      expect(auditor.icon).toBe('⚡');
      expect(auditor.ruleIds).toEqual([...WEB_PERFORMANCE_RULES]);
      expect(auditor.ruleDescriptions['unoptimized-images']).toBe(
        'Image without modern WebP compression'
      );
      expect(auditor.ruleDescriptions['font-display-missing']).toBe(
        '@font-face without font-display swap'
      );
      expect(auditor.ruleDescriptions['inline-svg-bloat']).toBe('Inline SVG exceeding 2KB');
      expect(auditor.ruleDescriptions['css-render-blocking']).toBe(
        'Render-blocking CSS or script in head'
      );
      expect(auditor.ruleDescriptions['excessive-dom-depth']).toBe(
        'Excessive DOM depth > 16 levels'
      );
      expect(auditor.ruleDescriptions['layout-shift-dimensions']).toBe(
        'Media element missing width/height'
      );
      expect(auditor.ruleDescriptions['uncompressed-video']).toBe(
        'Video missing preload="none" or webm'
      );

      const constructionErrors = validateAuditorConstruction(auditor);
      expect(constructionErrors).toHaveLength(0);
    });
  });

  describe('Point 2: Clean Path Verification', () => {
    it('passes cleanly reporting zero errors on optimized assets and modern markup', async () => {
      const auditor = new ValidateWebPerformanceAuditor({ projectRoot: tempDir });
      const cleanSnippet = [
        '<div class="hero">',
        '  <img src="/hero.webp" width="1200" height="600" decoding="async" alt="Hero banner" />',
        '  <video preload="none" width="800" height="450">',
        '    <source src="/intro.webm" type="video/webm" />',
        '  </video>',
        '  <style>',
        '    @font-face {',
        '      font-family: "Geist";',
        '      src: url("/fonts/geist.woff2") format("woff2");',
        '      font-display: swap;',
        '    }',
        '  </style>',
        '</div>'
      ].join('\n');

      auditor.testScanFile('src/views/HomeView.vue', cleanSnippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('passed');
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('Point 3: Violation Detection Path for All 7 Rules', () => {
    it('detects unoptimized-images when legacy raster formats lack async decoding', async () => {
      const auditor = new ValidateWebPerformanceAuditor({ projectRoot: tempDir });
      const snippet = '<' + 'img src="/banner.png" width="800" height="400" alt="Banner" />';

      auditor.testScanFile('src/components/Banner.vue', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'unoptimized-images');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects font-display-missing when @font-face omits swap or optional', async () => {
      const auditor = new ValidateWebPerformanceAuditor({ projectRoot: tempDir });
      const snippet = '@' + 'font-face { font-family: "Legacy"; src: url("/legacy.ttf"); }';

      auditor.testScanFile('src/styles/fonts.css', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'font-display-missing');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects inline-svg-bloat when SVG contains excessive markup (> 2KB)', async () => {
      const auditor = new ValidateWebPerformanceAuditor({ projectRoot: tempDir });
      const largePath = 'M0 0 L10 10 '.repeat(300);
      const snippet = '<' + 'svg viewBox="0 0 100 100"><path d="' + largePath + '" /></svg>';

      auditor.testScanFile('src/components/HugeIcon.vue', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'inline-svg-bloat');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects css-render-blocking for synchronous external scripts without defer', async () => {
      const auditor = new ValidateWebPerformanceAuditor({ projectRoot: tempDir });
      const snippet = '<' + 'script src="https://cdn.example.com/analytics.js"></script>';

      auditor.testScanFile('index.html', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'css-render-blocking');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects excessive-dom-depth when DOM exceeds 16 nesting levels', async () => {
      const auditor = new ValidateWebPerformanceAuditor({ projectRoot: tempDir });
      const openTags = '<div>'.repeat(20);
      const closeTags = '</div>'.repeat(20);
      const snippet = openTags + 'Deep Content' + closeTags;

      auditor.testScanFile('src/views/DeepView.vue', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'excessive-dom-depth');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects layout-shift-dimensions when img lacks width and height', async () => {
      const auditor = new ValidateWebPerformanceAuditor({ projectRoot: tempDir });
      const snippet = '<' + 'img src="/thumb.webp" alt="Thumbnail" decoding="async" />';

      auditor.testScanFile('src/components/Thumb.vue', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'layout-shift-dimensions');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects uncompressed-video when video uses uncompressed codec or lacks preload none', async () => {
      const auditor = new ValidateWebPerformanceAuditor({ projectRoot: tempDir });
      const snippet = '<' + 'video src="/movie.mov" width="640" height="360"></video>';

      auditor.testScanFile('src/views/Player.vue', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'uncompressed-video');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects css-render-blocking for synchronous stylesheets inside head', async () => {
      const auditor = new ValidateWebPerformanceAuditor({ projectRoot: tempDir });
      const snippet = [
        '<!DOCTYPE html>',
        '<html>',
        '<head>',
        '  <title>Test</title>',
        '  <link rel="stylesheet" href="/assets/main.css">',
        '</head>',
        '<body><p>Content</p></body>',
        '</html>'
      ].join('\n');

      auditor.testScanFile('index.html', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      const finding = result.findings.find((f) => f.ruleId === 'css-render-blocking');
      expect(finding).toBeDefined();
      expect(finding?.message).toContain('Synchronous external stylesheet');
    });

    it('detects inline-svg-bloat when SVG contains > 30 paths even under 2KB', async () => {
      const auditor = new ValidateWebPerformanceAuditor({ projectRoot: tempDir });
      const paths = '<path d="M0 0" />'.repeat(35);
      const snippet = `<svg viewBox="0 0 10 10">${paths}</svg>`;

      auditor.testScanFile('src/components/ComplexIcon.vue', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      const finding = result.findings.find((f) => f.ruleId === 'inline-svg-bloat');
      expect(finding).toBeDefined();
    });

    it('detects uncompressed-video when inner source tag contains uncompressed formats or lacks preload/webm', async () => {
      const auditor = new ValidateWebPerformanceAuditor({ projectRoot: tempDir });
      const uncompressedSourceSnippet = [
        '<video width="640" height="360">',
        '  <source src="/clip.avi" type="video/x-msvideo" />',
        '</video>'
      ].join('\n');

      auditor.testScanFile('src/views/AviPlayer.vue', uncompressedSourceSnippet);

      const noPreloadSnippet = [
        '<video width="640" height="360">',
        '  <source src="/clip.mp4" type="video/mp4" />',
        '</video>'
      ].join('\n');
      auditor.testScanFile('src/views/NoPreload.vue', noPreloadSnippet);

      const result = await auditor.finishAudit();
      const findings = result.findings.filter((f) => f.ruleId === 'uncompressed-video');
      expect(findings.length).toBe(2);
      expect(findings[0]?.message).toContain('uncompressed container');
      expect(findings[1]?.message).toContain('without preload="none" or optimized WebM source');
    });

    it('flags violations regardless of escape comments (Zero-Ignore Mandate)', async () => {
      const auditor = new ValidateWebPerformanceAuditor({ projectRoot: tempDir });

      const snippet = [
        '<!-- unoptimized-img-ok -->',
        '<img src="/legacy.png" alt="legacy" />',
        '<!-- font-display-ok -->',
        '@font-face { font-family: "Foo"; src: url("/foo.ttf"); }',
        '<!-- svg-bloat-ok -->',
        `<svg>${'<path d="M0 0"/>'.repeat(40)}</svg>`,
        '<!-- render-blocking-ok -->',
        '<link rel="stylesheet" href="/blocking.css">',
        '<script src="/sync.js"></script>',
        '<!-- dom-depth-ok -->',
        '<div>'.repeat(20) + 'Deep' + '</div>'.repeat(20),
        '<!-- layout-dimensions-ok -->',
        '<img src="/auto.webp" alt="auto" decoding="async" />',
        '<!-- uncompressed-video-ok -->',
        '<video src="/legacy.mov"></video>'
      ].join('\n');

      auditor.testScanFile('src/views/Exempt.vue', snippet);

      const result = await auditor.finishAudit();
      expect(result.summary.errors).toBeGreaterThanOrEqual(6);
      expect(result.status).toBe('failed');
    });

    it('allows compliant modern alternatives', async () => {
      const auditor = new ValidateWebPerformanceAuditor({ projectRoot: tempDir });

      // Compliant alternatives: media="print", disabled, type="module", aspect-ratio, void tags, preload="metadata"
      const compliantSnippet = [
        '<head>',
        '  <link rel="stylesheet" href="/print.css" media="print">',
        '  <link rel="stylesheet" href="/alt.css" disabled>',
        '  <link rel="preload" href="/font.woff2" as="font">',
        '  <script src="/mod.js" type="module"></script>',
        '</head>',
        '<img src="/aspect.webp" style="aspect-ratio: 16/9" alt="aspect" decoding="async" />',
        '<img width="100" height="100" alt="no src attribute" />',
        '<video width="640" height="360" preload="metadata">',
        '  <source src="/clip.mp4" type="video/mp4" />',
        '</video>',
        '<div />' // self-closing tag
      ].join('\n');

      auditor.testScanFile('src/views/Compliant.vue', compliantSnippet);

      // Non-html/vue file should be ignored for dom depth and css render blocking
      auditor.testScanFile(
        'src/styles/theme.css',
        '<head><link rel="stylesheet" href="/x.css"></head>' + '<div>'.repeat(20)
      );

      const result = await auditor.finishAudit();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('does not falsely count TypeScript generics or comparisons in <script> as DOM depth', async () => {
      const auditor = new ValidateWebPerformanceAuditor({ projectRoot: tempDir });
      const snippet = [
        '<template>',
        '  <div class="container">',
        '    <span>Hello</span>',
        '  </div>',
        '</template>',
        '<script setup lang="ts">',
        'const items: Array<Record<string, Array<number>>> = [];',
        'for (let i = 0; i < 100; i++) {',
        '  if (i < 50) {',
        '    console.log(i);',
        '  }',
        '}',
        '</script>'
      ].join('\n');

      auditor.testScanFile('src/views/GenericsView.vue', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('honors exemptSvgPaths for interactive SVG canvas/overlay components', async () => {
      const auditorDir = path.join(tempDir, '.auditor');
      fs.mkdirSync(auditorDir, { recursive: true });
      fs.writeFileSync(
        path.join(auditorDir, 'audit.config.json'),
        JSON.stringify({
          webPerformance: {
            exemptSvgPaths: ['src/components/NetworkOverlay.vue']
          }
        })
      );

      const auditor = new ValidateWebPerformanceAuditor({ projectRoot: tempDir });
      const largeSvg =
        '<svg viewBox="0 0 1000 1000">' + '<path d="M0,0 L10,10" />'.repeat(50) + '</svg>';
      const snippet = `<template><div>${largeSvg}</div></template>`;

      auditor.testScanFile('src/components/NetworkOverlay.vue', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('honors exemptImgClasses for pixelated and sprite classes', async () => {
      const auditorDir = path.join(tempDir, '.auditor');
      fs.mkdirSync(auditorDir, { recursive: true });
      fs.writeFileSync(
        path.join(auditorDir, 'audit.config.json'),
        JSON.stringify({
          webPerformance: {
            exemptImgClasses: ['pixelated', 'tile-sprite']
          }
        })
      );

      const auditor = new ValidateWebPerformanceAuditor({ projectRoot: tempDir });
      const snippet =
        '<template><img src="/tiles.webp" class="pixelated" alt="tile" decoding="async" /></template>';

      auditor.testScanFile('src/components/Tile.vue', snippet);
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
          webPerformance: {
            exemptPaths: ['src/legacy/**']
          }
        })
      );

      const auditor = new ValidateWebPerformanceAuditor({ projectRoot: tempDir });
      const snippet = '<img src="/legacy.png" alt="legacy" />';

      auditor.testScanFile('src/legacy/LegacyImg.vue', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });

  describe('Point 4 & 5: Warning Path & 100% Rule Coverage', () => {
    it('measures real empirical durations for 100% of declared rules', () => {
      const auditor = new ValidateWebPerformanceAuditor({ projectRoot: tempDir });
      auditor.testScanFile('src/views/Clean.vue', '<div>Clean</div>');

      for (const rule of WEB_PERFORMANCE_RULES) {
        const duration = auditor.getRuleDuration(rule);
        expect(duration).toBeDefined();
        expect(duration!).toBeGreaterThanOrEqual(0);
      }
    });
  });
});

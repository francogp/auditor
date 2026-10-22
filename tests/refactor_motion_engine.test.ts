/**
 * tests/refactor_motion_engine.test.ts
 *
 * Exhaustive unit tests for MotionRefactorEngine using pure TypeScript Compiler AST.
 * Verifies:
 * - Complete exclusion of stylesheets (.scss, .css, .sass)
 * - Zero false positives on regular objects with { left: 10, top: 20 }
 * - Accurate detection of GSAP tween layout properties (left, top, right, bottom)
 * - Accurate detection of GSAP legacy ease names (Power1.easeOut, etc.)
 * - Accurate detection of UI timers (setTimeout, setInterval, clearTimeout)
 * - Escape hatches (// layout-ok:, // timer-ok:)
 * - Vue SFC script block parsing
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { MotionRefactorEngine } from '../src/core/refactor/motionRefactorEngine.ts';

describe('MotionRefactorEngine (AST-driven)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-motion-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('completely ignores SCSS and CSS stylesheet files', async () => {
    const scssPath = path.join(tempDir, 'modal.scss');
    await fs.writeFile(
      scssPath,
      `.modal {
        position: absolute;
        left: 20px;
        top: 40px;
        right: 0;
        bottom: 0;
      }`,
      'utf-8'
    );

    const findings = MotionRefactorEngine.discoverInFile(scssPath);
    expect(findings).toEqual([]);
  });

  it('does not flag normal TypeScript objects with left/top coordinates', async () => {
    const tsPath = path.join(tempDir, 'coordinates.ts');
    await fs.writeFile(
      tsPath,
      `export interface Position {
        left: number;
        top: number;
      }
      export const defaultCoords = {
        left: 10,
        top: 25,
        right: 100,
        bottom: 200
      };`,
      'utf-8'
    );

    const findings = MotionRefactorEngine.discoverInFile(tsPath);
    expect(findings).toEqual([]);
  });

  it('detects GSAP tween layout properties and legacy ease', async () => {
    const tsPath = path.join(tempDir, 'animation.ts');
    await fs.writeFile(
      tsPath,
      `import gsap from 'gsap';

      export function animateModal(el: HTMLElement) {
        gsap.to(el, {
          left: 100,
          top: 50,
          ease: Power1.easeOut,
          duration: 0.5
        });
      }`,
      'utf-8'
    );

    const findings = MotionRefactorEngine.discoverInFile(tsPath);
    expect(findings.length).toBe(3);

    const layoutFindings = findings.filter((f) => f.kind === 'layout-property');
    expect(layoutFindings.length).toBe(2);
    expect(layoutFindings.map((f) => f.originalSnippet)).toEqual(['left:', 'top:']);
    expect(layoutFindings.map((f) => f.suggestedReplacement)).toEqual(['x:', 'y:']);

    const easeFindings = findings.filter((f) => f.kind === 'legacy-ease');
    expect(easeFindings.length).toBe(1);
    expect(easeFindings[0]?.originalSnippet).toBe('Power1.easeOut');
    expect(easeFindings[0]?.suggestedReplacement).toBe("'power1.out'");
  });

  it('flags layout and timer issues regardless of comments (Zero-Ignore Mandate)', async () => {
    const tsPath = path.join(tempDir, 'escaped.ts');
    await fs.writeFile(
      tsPath,
      `import gsap from 'gsap';

      export function animate(el: HTMLElement) {
        gsap.to(el, {
          left: 100, // layout-ok: Required for fixed container layout
          duration: 0.5
        });
        setTimeout(() => {}, 500); // timer-ok: Non-UI background sync
      }`,
      'utf-8'
    );

    const findings = MotionRefactorEngine.discoverInFile(tsPath);
    expect(findings.length).toBeGreaterThanOrEqual(2);
  });

  it('detects banned UI timers and clearTimeout in scripts and Vue SFCs', async () => {
    const vuePath = path.join(tempDir, 'Widget.vue');
    await fs.writeFile(
      vuePath,
      `<template>
        <div class="box">Widget</div>
      </template>
      <script setup lang="ts">
      import gsap from 'gsap';

      const timer = setTimeout(() => {
        console.log('done');
      }, 300);

      function cancel() {
        clearTimeout(timer);
      }
      </script>
      <style scoped>
      .box {
        left: 0;
        top: 0;
      }
      </style>`,
      'utf-8'
    );

    const findings = MotionRefactorEngine.discoverInFile(vuePath);
    const timerFindings = findings.filter((f) => f.kind === 'banned-ui-timer');
    expect(timerFindings.length).toBe(2);
    expect(timerFindings.some((f) => f.suggestedReplacement.includes('gsap.delayedCall(0.3'))).toBe(
      true
    );
    expect(timerFindings.some((f) => f.suggestedReplacement === 'timer?.kill()')).toBe(true);

    // Style section left: 0; top: 0; must not be flagged
    expect(findings.some((f) => f.kind === 'layout-property')).toBe(false);
  });

  it('eradicates false positives from Codex-RPG SCSS and non-GSAP DOM calls', async () => {
    // 1. Complex nested SCSS matching Codex HUD patterns
    const scssPath = path.join(tempDir, 'HeroProgressionPanel.scss');
    await fs.writeFile(
      scssPath,
      `.hero-progression-panel {
        position: relative;
        .badge {
          position: absolute;
          top: 0;
          left: 12px;
          right: 0;
          bottom: 24px;
        }
        .tooltip {
          left: 50%;
          top: 100%;
        }
      }`,
      'utf-8'
    );
    expect(MotionRefactorEngine.discoverInFile(scssPath)).toEqual([]);

    // 2. Non-GSAP DOM method calls like scrollTo or computeBoundingBox
    const domTsPath = path.join(tempDir, 'viewport.ts');
    await fs.writeFile(
      domTsPath,
      `export function scrollToTop(container: HTMLElement) {
        container.scrollTo({
          top: 0,
          left: 0,
          behavior: 'smooth'
        });
        const rect = container.getBoundingClientRect();
        return {
          top: rect.top,
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom
        };
      }`,
      'utf-8'
    );
    expect(MotionRefactorEngine.discoverInFile(domTsPath)).toEqual([]);
  });
});

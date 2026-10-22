/**
 * tests/core/refactor/motionRefactorEngine.test.ts
 *
 * Unit tests for MotionRefactorEngine (UI Animation & GSAP Governance).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { MotionRefactorEngine } from '../../../src/core/refactor/motionRefactorEngine.ts';

describe('MotionRefactorEngine', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'motion-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('discoverInFile', () => {
    it('discovers banned setTimeout and clearTimeout in TypeScript file', () => {
      const tsFile = path.join(tmpDir, 'timerTest.ts');
      fs.writeFileSync(
        tsFile,
        `
export function schedulePopup(): void {
  const timerId = setTimeout(() => {
    console.log('popup');
  }, 500);

  clearTimeout(timerId);
}
        `.trim()
      );

      const findings = MotionRefactorEngine.discoverInFile(tsFile);
      expect(findings.length).toBe(2);

      const setT = findings.find((f) => f.originalSnippet.includes('setTimeout'));
      expect(setT).toBeDefined();
      expect(setT?.suggestedReplacement).toContain('gsap.delayedCall(0.5');

      const clearT = findings.find((f) => f.originalSnippet.includes('clearTimeout'));
      expect(clearT).toBeDefined();
      expect(clearT?.suggestedReplacement).toBe('timerId?.kill()');
    });

    it('detects findings even when escape comments are present (Zero-Ignore Mandate)', () => {
      const tsFile = path.join(tmpDir, 'escapeTest.ts');
      fs.writeFileSync(
        tsFile,
        `
export function safeSchedule(): void {
  setTimeout(() => {}, 100); // timer-ok: debouncing native input
}
        `.trim()
      );

      const findings = MotionRefactorEngine.discoverInFile(tsFile);
      expect(findings.length).toBeGreaterThan(0);
    });

    it('discovers legacy ease names and layout properties in Vue SFC', () => {
      const vueFile = path.join(tmpDir, 'Modal.vue');
      fs.writeFileSync(
        vueFile,
        `
<template>
  <div class="modal">Hello</div>
</template>

<script setup lang="ts">
import gsap from 'gsap';

function open(): void {
  gsap.to('.modal', {
    left: 100,
    ease: Power2.easeOut
  });
}
</script>
        `.trim()
      );

      const findings = MotionRefactorEngine.discoverInFile(vueFile);
      expect(findings.length).toBe(2);

      const layoutFinding = findings.find((f) => f.kind === 'layout-property');
      expect(layoutFinding).toBeDefined();
      expect(layoutFinding?.suggestedReplacement).toBe('x:');

      const easeFinding = findings.find((f) => f.kind === 'legacy-ease');
      expect(easeFinding).toBeDefined();
      expect(easeFinding?.suggestedReplacement).toBe("'power2.out'");
    });
  });

  describe('createPlan & applyPlan', () => {
    it('creates and applies plan deterministically with import injection', () => {
      const tsFile = path.join(tmpDir, 'animate.ts');
      fs.writeFileSync(
        tsFile,
        `
export function run(): void {
  setTimeout(show, 400);
}
        `.trim()
      );

      const findings = MotionRefactorEngine.discoverInFile(tsFile);
      expect(findings.length).toBe(1);

      const plan = MotionRefactorEngine.createPlan('test-plan-1', findings);
      expect(plan.timerReplacements?.length).toBe(1);
      expect(plan.importInjections?.length).toBe(1);

      const result = MotionRefactorEngine.applyPlan(tmpDir, plan);
      expect(result.filesChanged).toBe(1);
      expect(result.changesApplied).toBeGreaterThanOrEqual(2);

      const updated = fs.readFileSync(tsFile, 'utf8');
      expect(updated).toContain("import gsap from 'gsap';");
      expect(updated).toContain('gsap.delayedCall(0.4, show)');
      expect(updated).not.toContain('setTimeout');
    });
  });
});

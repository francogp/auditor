/**
 * tests/core/refactor/realWorldIntegration.test.ts
 *
 * Integration test suite subjecting all refactoring engines
 * (auditor-dupes, auditor-magic, auditor-motion, auditor-o1)
 * to complex, real-world patterns extracted from host projects
 * (pokeborrador and codex-rpg).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Project } from 'ts-morph';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { ClassHierarchyHoister } from '../../../src/core/refactor/classHierarchyHoister.ts';
import { MagicNumberExtractor } from '../../../src/core/refactor/magicNumberExtractor.ts';
import { MotionRefactorEngine } from '../../../src/core/refactor/motionRefactorEngine.ts';
import { O1RefactorEngine } from '../../../src/core/refactor/o1RefactorEngine.ts';
import { ParamPermutationMapper } from '../../../src/core/refactor/paramPermutationMapper.ts';

describe('Real-World Integration Test Suite (pokeborrador & codex-rpg patterns)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'real-world-integration-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('1. auditor-dupes Real-World Patterns', () => {
    it('handles combat damage parameter permutation extracted from codex-rpg', () => {
      // Real-world pattern from codex-rpg/src/engine/damage.ts:
      // Function signature has evolved over time with multiple permutations of arguments:
      // Canonical: [rawDamage, targetArmor, magicResist, isSpell]
      // Legacy caller A: calls with [targetArmor, rawDamage, isSpell, magicResist]
      // Legacy caller B: calls with [rawDamage, targetArmor] (omits optional params)
      const canonicalParams = ['rawDamage', 'targetArmor', 'magicResist', 'isSpell'];

      const callerABindings = {
        targetArmor: 'defender.stats.armor',
        rawDamage: 'attacker.stats.attack * 1.5',
        isSpell: 'false',
        magicResist: 'defender.stats.magicResist'
      };

      const alignedCallA = ParamPermutationMapper.generateAlignedCall(
        'calculateMitigatedDamage',
        canonicalParams,
        callerABindings
      );

      expect(alignedCallA.isPermuted).toBe(true);
      expect(alignedCallA.alignedArguments).toEqual([
        'attacker.stats.attack * 1.5',
        'defender.stats.armor',
        'defender.stats.magicResist',
        'false'
      ]);
      expect(alignedCallA.callExpressionCode).toBe(
        'calculateMitigatedDamage(attacker.stats.attack * 1.5, defender.stats.armor, defender.stats.magicResist, false)'
      );

      // Caller B: Partial arguments with fallback
      const callerBBindings = {
        rawDamage: '100',
        targetArmor: '50'
      };
      const alignedCallB = ParamPermutationMapper.alignArguments(
        canonicalParams,
        callerBBindings,
        '0'
      );
      expect(alignedCallB).toEqual(['100', '50', '0', '0']);
    });

    it('identifies and hoists shared procedural dungeon generator logic to common base class', () => {
      // Real-world pattern from codex-rpg/src/engine/dungeon-generator.ts and abyss-dungeon-generator.ts
      const project = new Project({ useInMemoryFileSystem: true });

      const baseCode = `
export abstract class BaseDungeonGenerator {
  protected seed: number = 0;
  abstract generateFloor(level: number): any;
}
      `.trim();

      const campaignGenCode = `
import { BaseDungeonGenerator } from './base-dungeon.ts';

export class CampaignDungeonGenerator extends BaseDungeonGenerator {
  generateFloor(level: number): any {
    const dc = Math.round(8 + 1.25 * level);
    return { dc };
  }
}
      `.trim();

      const abyssGenCode = `
import { BaseDungeonGenerator } from './base-dungeon.ts';

export class AbyssDungeonGenerator extends BaseDungeonGenerator {
  generateFloor(level: number): any {
    const dc = Math.round(8 + 1.25 * level);
    return { dc, abyssAffix: true };
  }
}
      `.trim();

      project.createSourceFile('base-dungeon.ts', baseCode);
      const f1 = project.createSourceFile('campaign-dungeon.ts', campaignGenCode);
      const f2 = project.createSourceFile('abyss-dungeon.ts', abyssGenCode);

      const target = ClassHierarchyHoister.findCommonBaseClass(project, [
        f1.getFilePath(),
        f2.getFilePath()
      ]);

      expect(target).not.toBeNull();
      expect(target?.baseClassName).toBe('BaseDungeonGenerator');
      expect(target?.canHoist).toBe(true);
      expect(target?.derivedClassNames).toContain('CampaignDungeonGenerator');
      expect(target?.derivedClassNames).toContain('AbyssDungeonGenerator');
    });
  });

  describe('2. auditor-magic Real-World Patterns', () => {
    it('extracts and clusters combat formula constants from codex-rpg damage calculator', () => {
      // Real-world pattern from codex-rpg/src/engine/damage.ts:
      // Grade multipliers (0.7, 0.5, 1.6, 2.25) and mitigation divisor (100)
      const damageCalcSnippet = `
export function calculateGradeMultiplier(grade: string): number {
  switch (grade) {
    case 'partial_success': return 0.7;
    case 'crit': return 1.5;
    case 'critical_success': return 1.6;
    case 'devastating': return 2.25;
    default: return 1.0;
  }
}
      `.trim();

      const relPath = 'src/engine/damage.ts';
      const absPath = path.join(tmpDir, relPath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, damageCalcSnippet);

      const extractor = new MagicNumberExtractor();
      const findings = extractor.scanFile(tmpDir, relPath);

      expect(findings.length).toBeGreaterThanOrEqual(4);

      // Verify that float multipliers are detected
      const values = findings.map((f) => f.rawValue);
      expect(values).toContain('0.7');
      expect(values).toContain('1.5');
      expect(values).toContain('1.6');
      expect(values).toContain('2.25');
    });
  });

  describe('3. auditor-motion Real-World Patterns', () => {
    it('remediates complex Vue SFC setup hooks with debounce timers and layout animations', () => {
      // Real-world pattern from pokeborrador/src/stores/pvp.ts & UI battle components:
      // A Vue component with setTimeout debounce and GSAP tween with layout properties (left/top)
      const sfcCode = `
<template>
  <div class="battle-hud" :style="{ opacity: hudOpacity }">
    <div ref="targetBox" class="target-box"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import gsap from 'gsap';

const hudOpacity = ref(1);
const targetBox = ref<HTMLElement | null>(null);

onMounted(() => {
  // Banned UI timer in component setup
  const timer = setTimeout(() => {
    hudOpacity.value = 0.8;
  }, 1500);

  // Layout property tween with legacy ease
  if (targetBox.value) {
    gsap.to(targetBox.value, {
      left: 120,
      top: 60,
      duration: 0.6,
      ease: 'Power2.easeOut'
    });
  }
});
</script>
      `.trim();

      const sfcFile = path.join(tmpDir, 'BattleHud.vue');
      fs.writeFileSync(sfcFile, sfcCode);

      const findings = MotionRefactorEngine.discoverInFile(sfcFile);
      expect(findings.length).toBeGreaterThanOrEqual(2);

      // Verify timer conversion
      const timerFinding = findings.find((f) => f.originalSnippet.includes('setTimeout'));
      expect(timerFinding).toBeDefined();
      expect(timerFinding?.suggestedReplacement).toContain('gsap.delayedCall(1.5');

      // Verify layout transform suggestions
      const layoutFindings = findings.filter((f) => f.ruleId === 'gsap-no-layout-properties');
      expect(layoutFindings.length).toBe(2);
      expect(layoutFindings.some((f) => f.suggestedReplacement === 'x:')).toBe(true);
      expect(layoutFindings.some((f) => f.suggestedReplacement === 'y:')).toBe(true);

      // Apply the refactor plan automatically generated from findings
      const plan = MotionRefactorEngine.createPlan('real-world-motion-plan', findings);
      const result = MotionRefactorEngine.applyPlan(tmpDir, plan);
      expect(result.filesChanged).toBeGreaterThan(0);
      expect(result.changesApplied).toBeGreaterThan(0);

      const mutated = fs.readFileSync(sfcFile, 'utf8');
      expect(mutated).toContain('gsap.delayedCall(1.5');
      expect(mutated).toContain('x: 120');
      expect(mutated).toContain('y: 60');
      expect(mutated).not.toContain('left: 120');
    });
  });

  describe('4. auditor-o1 Real-World Patterns', () => {
    it('optimizes linear catalog find, string includes, structuredClone and redundant return spreads', () => {
      // Real-world pattern from pokeborrador/src/stores/events.ts & errorStore.ts:
      // 1. JSON.parse(JSON.stringify(gameState)) for state snapshots
      // 2. return [...list] redundant spread
      // 3. repeated array.includes() check
      const tsCode = `
export interface GameEvent {
  id: string;
  name: string;
}

export const KNOWN_MODULE_ERRORS = [
  'Failed to fetch dynamically imported module',
  'Unable to preload CSS',
  'Load chunk'
];

export function isRecoverableChunkError(message: string): boolean {
  return KNOWN_MODULE_ERRORS.includes(message);
}

export function duplicateGameState(state: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(state));
}

export function getEventsCopy(events: GameEvent[]): GameEvent[] {
  return [...events];
}
      `.trim();

      const tsFile = path.join(tmpDir, 'eventsStore.ts');
      fs.writeFileSync(tsFile, tsCode);

      const findings = O1RefactorEngine.discoverInFile(tsFile);
      expect(findings.length).toBeGreaterThanOrEqual(3);

      // Verify structuredClone detection
      const jsonFinding = findings.find((f) => f.ruleId === 'o1-json-clone');
      expect(jsonFinding).toBeDefined();
      expect(jsonFinding?.suggestedReplacement).toContain('structuredClone(state)');

      // Verify redundant spread detection
      const spreadFinding = findings.find((f) => f.ruleId === 'o1-redundant-spread-return');
      expect(spreadFinding).toBeDefined();
      expect(spreadFinding?.suggestedReplacement).toBe('return events;');

      // Verify linear membership detection
      const membershipFinding = findings.find((f) => f.ruleId === 'o1-linear-membership');
      expect(membershipFinding).toBeDefined();
      expect(membershipFinding?.suggestedReplacement).toContain('.has(');

      // Apply the O1 refactor plan automatically generated from findings
      const plan = O1RefactorEngine.createPlan('real-world-o1-plan', findings);
      const result = O1RefactorEngine.applyPlan(tmpDir, plan);
      expect(result.filesChanged).toBeGreaterThan(0);
      expect(result.changesApplied).toBeGreaterThan(0);

      const mutated = fs.readFileSync(tsFile, 'utf8');
      expect(mutated).toContain('structuredClone(state)');
      expect(mutated).toContain('return events;');
      expect(mutated).toContain('KNOWN_MODULE_ERRORS_SET');
      expect(mutated).toContain('.has(message)');
    });
  });
});

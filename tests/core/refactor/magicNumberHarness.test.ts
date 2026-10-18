/**
 * tests/core/refactor/magicNumberHarness.test.ts
 *
 * Hermetic unit tests for MagicNumberExtractor, ConstantHygieneGate, and MagicNumberHarness.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import type { MagicRefactorPlan } from '../../../src/core/refactor/magicContracts.ts';
import { MagicNumberExtractor } from '../../../src/core/refactor/magicNumberExtractor.ts';
import {
  ConstantHygieneGate,
  MagicNumberHarness
} from '../../../src/core/refactor/magicNumberHarness.ts';

describe('MagicNumber Refactoring Engine', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-magic-harness-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('ConstantHygieneGate', () => {
    it('strips illegal trailing numeric literals from constant names', () => {
      expect(ConstantHygieneGate.validateOrSanitize('RETRY_DELAY_500', 500)).toBe('RETRY_DELAY');
      expect(ConstantHygieneGate.validateOrSanitize('BUFFER_SIZE_1024', 1024)).toBe('BUFFER_SIZE');
    });

    it('prefixes forbidden generic names to avoid hygiene violations', () => {
      expect(ConstantHygieneGate.validateOrSanitize('MAX', 100)).toBe('DOMAIN_MAX');
      expect(ConstantHygieneGate.validateOrSanitize('VALUE', 42)).toBe('DOMAIN_VALUE');
      expect(ConstantHygieneGate.validateOrSanitize('A', 1)).toBe('DOMAIN_A');
    });

    it('formats arbitrary strings into valid uppercase SCREAMING_SNAKE_CASE', () => {
      expect(ConstantHygieneGate.validateOrSanitize('anim-delay-ms', 300)).toBe('ANIM_DELAY_MS');
      expect(ConstantHygieneGate.validateOrSanitize('card__border--radius', 8)).toBe(
        'CARD_BORDER_RADIUS'
      );
    });
  });

  describe('MagicNumberExtractor', () => {
    it('discovers magic literals and performs zero-token semantic inference in TypeScript', () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      const relFile = 'src/service.ts';
      const absFile = path.join(tmpDir, relFile);

      fs.writeFileSync(
        absFile,
        [
          '/**',
          ' * Enterprise Service implementation with multiple configuration parameters',
          ' * and business logic calculations for transaction processing.',
          ' */',
          'export function execute(): void {',
          '  // Set connection timeouts and thresholds',
          '  setTimeout(() => {}, 2500);',
          '  const threshold = 85;',
          '  if (threshold > 75) {',
          '    console.log(threshold);',
          '  }',
          '}',
          '',
          'export function handleEventProcessing(): void {',
          '  const retryCount = 10;',
          '  for (let i = 0; i < retryCount; i++) {',
          '    console.log("Processing batch item", i);',
          '  }',
          '  console.log("Batch complete, status code:", 200);',
          '  console.log("Maximum latency allowed:", 500);',
          '}',
          '',
          'export function formatDisplayOutput(): string {',
          '  return "Result formatted with spacing: " + 42;',
          '}',
          ''
        ].join('\n'),
        'utf-8'
      );

      const extractor = new MagicNumberExtractor();
      const items = extractor.scanFile(tmpDir, relFile);

      expect(items.length).toBeGreaterThanOrEqual(2);

      // Verify timer inference
      const timerItem = items.find((i) => i.rawValue === '2500');
      expect(timerItem).toBeDefined();
      expect(timerItem?.semanticRole).toBe('timer-delay');
      expect(timerItem?.isZeroTokenResolvable).toBe(true);

      // Verify Super-Dirac batch packet generation
      const packet = extractor.generateSuperDiracPacket(tmpDir, relFile, items);
      expect(packet.totalItems).toBe(items.length);
      expect(packet.items.length).toBeGreaterThan(0);
      expect(packet.superDiracBatchTokens).toBeGreaterThan(0);
      expect(packet.fullFileTokensBaseline).toBeGreaterThan(0);
    });
  });

  describe('MagicNumberHarness', () => {
    it('applies span replacements and injects header constants in TypeScript files', async () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      const relFile = 'src/combat.ts';
      const absFile = path.join(tmpDir, relFile);

      const initialCode = [
        'export function calculateDamage(base: number): number {',
        '  return base * 1.75;',
        '}',
        ''
      ].join('\n');

      fs.writeFileSync(absFile, initialCode, 'utf-8');

      const startIdx = initialCode.indexOf('1.75');
      const endIdx = startIdx + '1.75'.length;

      const plan: MagicRefactorPlan = {
        version: 1,
        planId: 'plan-magic-ts-001',
        targetFiles: [relFile],
        declarations: [
          {
            name: 'CRITICAL_MULTIPLIER',
            value: 1.75,
            targetLocation: 'local-file-header'
          }
        ],
        fileReplacements: {
          [relFile]: [
            {
              startOffset: startIdx,
              endOffset: endIdx,
              replacement: 'CRITICAL_MULTIPLIER',
              originalSnippet: '1.75'
            }
          ]
        }
      };

      await MagicNumberHarness.execute(tmpDir, plan);

      const modified = fs.readFileSync(absFile, 'utf-8');
      expect(modified).toContain('const CRITICAL_MULTIPLIER = 1.75;');
      expect(modified).toContain('return base * CRITICAL_MULTIPLIER;');
      expect(modified).not.toContain('base * 1.75;');
    });

    it('applies span replacements inside Vue SFC script setup preserving templates and styles', async () => {
      const compDir = path.join(tmpDir, 'src', 'components');
      fs.mkdirSync(compDir, { recursive: true });

      const relFile = 'src/components/CooldownTimer.vue';
      const absFile = path.join(tmpDir, relFile);

      const initialVue = [
        '<template>',
        '  <div class="timer">Cooldown: {{ remaining }}</div>',
        '</template>',
        '',
        '<script setup lang="ts">',
        "import { ref } from 'vue';",
        'const remaining = ref(100);',
        'setTimeout(() => {}, 5000);',
        '</script>',
        '',
        '<style scoped>',
        '.timer { color: red; }',
        '</style>',
        ''
      ].join('\n');

      fs.writeFileSync(absFile, initialVue, 'utf-8');

      const startIdx = initialVue.indexOf('5000');
      const endIdx = startIdx + '5000'.length;

      const plan: MagicRefactorPlan = {
        version: 1,
        planId: 'plan-magic-vue-001',
        targetFiles: [relFile],
        declarations: [
          {
            name: 'COOLDOWN_DELAY_MS',
            value: 5000,
            targetLocation: 'local-file-header'
          }
        ],
        fileReplacements: {
          [relFile]: [
            {
              startOffset: startIdx,
              endOffset: endIdx,
              replacement: 'COOLDOWN_DELAY_MS',
              originalSnippet: '5000'
            }
          ]
        }
      };

      await MagicNumberHarness.execute(tmpDir, plan);

      const modifiedVue = fs.readFileSync(absFile, 'utf-8');
      expect(modifiedVue).toContain('<template>');
      expect(modifiedVue).toContain('<style scoped>');
      expect(modifiedVue).toContain('const COOLDOWN_DELAY_MS = 5000;');
      expect(modifiedVue).toContain('setTimeout(() => {}, COOLDOWN_DELAY_MS);');
    });

    it('creates shared constants module when targetLocation is shared-constants-module', async () => {
      const srcDir = path.join(tmpDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      const relFile = 'src/api.ts';
      const absFile = path.join(tmpDir, relFile);
      const relShared = 'src/constants/apiConstants.ts';
      const absShared = path.join(tmpDir, relShared);

      const initialCode =
        'export const endpoint = "https://api.example.com";\nconst timeout = 3000;\n';
      fs.writeFileSync(absFile, initialCode, 'utf-8');

      const startIdx = initialCode.indexOf('3000');
      const endIdx = startIdx + '3000'.length;

      const plan: MagicRefactorPlan = {
        version: 1,
        planId: 'plan-magic-shared-001',
        targetFiles: [relFile],
        declarations: [
          {
            name: 'API_TIMEOUT_MS',
            value: 3000,
            targetLocation: 'shared-constants-module',
            destinationFile: relShared
          }
        ],
        fileReplacements: {
          [relFile]: [
            {
              startOffset: startIdx,
              endOffset: endIdx,
              replacement: 'API_TIMEOUT_MS',
              originalSnippet: '3000'
            }
          ]
        }
      };

      await MagicNumberHarness.execute(tmpDir, plan);

      expect(fs.existsSync(absShared)).toBe(true);
      const sharedContent = fs.readFileSync(absShared, 'utf-8');
      expect(sharedContent).toContain('export const API_TIMEOUT_MS = 3000;');

      const modifiedCode = fs.readFileSync(absFile, 'utf-8');
      expect(modifiedCode).toContain('const timeout = API_TIMEOUT_MS;');
    });
  });
});

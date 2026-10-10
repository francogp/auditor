/**
 * tests/validate_magic_numbers.test.ts
 *
 * Exhaustive unit tests for ValidateMagicNumbersAuditor conforming to BaseAuditor 5-point contract.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ValidateMagicNumbersAuditor, MAGIC_NUMBERS_RULES } from '../src/suites/architecture/validate_magic_numbers.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import { resetAuditConfig } from '../src/core/auditConfig.ts';

describe('ValidateMagicNumbersAuditor', () => {
  let tempDir: string;
  let srcDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'magic-numbers-test-'));
    srcDir = path.join(tempDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Contract & Metadata Conformance', () => {
    it('fulfills BaseAuditor metadata and construction contracts', () => {
      const auditor = new ValidateMagicNumbersAuditor();
      validateAuditorConstruction(auditor);
      expect(auditor.id).toBe('validate_magic_numbers');
      expect(auditor.packageName).toBe('MagicNumbers');
      expect(auditor.family).toBe('architecture');
      expect(auditor.requiresAst).toBe(true);
      expect(auditor.ruleIds).toEqual(MAGIC_NUMBERS_RULES);
      expect(auditor.ruleDescriptions).toBeDefined();
      expect(Object.keys(auditor.ruleDescriptions!)).toHaveLength(1);
    });
  });

  describe('Clean Path: Recognized Constants & Sentinels', () => {
    it('accepts primitive top-level const declarations', async () => {
      await fs.writeFile(
        path.join(srcDir, 'constants.ts'),
        `export const TIMEOUT = 5000;\nexport const MAX_RETRY = 3;\n`,
        'utf-8'
      );
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('accepts negative numbers in top-level const declarations', async () => {
      await fs.writeFile(
        path.join(srcDir, 'offsets.ts'),
        `export const Y_OFFSET = -15;\nexport const Z_OFFSET = -999 as const;\n`,
        'utf-8'
      );
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('accepts const declarations with "as const" assertion', async () => {
      await fs.writeFile(
        path.join(srcDir, 'status.ts'),
        `export const STATUS_CODE = 404 as const;\nexport const MAX_LEVEL = 100 as const;\n`,
        'utf-8'
      );
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('accepts array literals and tuples in const declarations', async () => {
      await fs.writeFile(
        path.join(srcDir, 'primes.ts'),
        `export const PRIMES = [2, 3, 5, 7, 11];\nexport const CODES = [100, 200, 300] as const;\n`,
        'utf-8'
      );
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('accepts nested matrices in const declarations', async () => {
      await fs.writeFile(
        path.join(srcDir, 'grid.ts'),
        `export const MATRIX = [[10, 20], [30, 40]] as const;\n`,
        'utf-8'
      );
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('accepts object dictionaries and nested dictionaries in const declarations', async () => {
      await fs.writeFile(
        path.join(srcDir, 'config.ts'),
        `export const DIMENSIONS = { WIDTH: 1920, HEIGHT: 1080 } as const;\n` +
        `export const THEMES = { dark: { bg: 24, fg: 250 } };\n`,
        'utf-8'
      );
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('accepts mathematical unit conversion formulas in const declarations', async () => {
      await fs.writeFile(
        path.join(srcDir, 'time.ts'),
        `export const ONE_HOUR_MS = 1000 * 60 * 60;\nexport const HALF_DAY_SEC = 12 * 60 * 60;\n`,
        'utf-8'
      );
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('accepts enum declarations', async () => {
      await fs.writeFile(
        path.join(srcDir, 'enums.ts'),
        `export enum HttpStatus { OK = 200, CREATED = 201, NOT_FOUND = 404 }\n`,
        'utf-8'
      );
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('accepts type alias literal unions and interface property literals', async () => {
      await fs.writeFile(
        path.join(srcDir, 'types.ts'),
        `export type AllowedPort = 8080 | 3000 | 9000;\n` +
        `export interface ServerConfig { readonly defaultPort: 8080; }\n`,
        'utf-8'
      );
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('accepts class readonly and static readonly properties', async () => {
      await fs.writeFile(
        path.join(srcDir, 'service.ts'),
        `export class ApiService {\n` +
        `  static readonly MAX_RETRIES = 5;\n` +
        `  readonly defaultTimeout = 3000;\n` +
        `}\n`,
        'utf-8'
      );
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('accepts universal sentinels (0, 1, -1, 100) anywhere in logic', async () => {
      await fs.writeFile(
        path.join(srcDir, 'logic.ts'),
        `export function checkStatus(index: number, total: number): boolean {\n` +
        `  if (index === 0 || index === 1 || index === -1) return true;\n` +
        `  return total === 100;\n` +
        `}\n`,
        'utf-8'
      );
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('honors user custom exemptions via config.constants.exemptMagicNumbers', async () => {
      const configDir = path.join(tempDir, '.auditor');
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        path.join(configDir, 'audit.config.json'),
        JSON.stringify({
          name: 'CustomExemptTest',
          constants: {
            exemptMagicNumbers: [21, 10.5, 9999]
          }
        }),
        'utf-8'
      );
      await fs.writeFile(
        path.join(srcDir, 'rates.ts'),
        `export function calculateTax(subtotal: number): number {\n` +
        `  return subtotal * 21 + 10.5;\n` +
        `}\n`,
        'utf-8'
      );
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('accepts calendar and geometry sentinels (24, 60, 360) anywhere in logic', async () => {
      await fs.writeFile(
        path.join(srcDir, 'angles.ts'),
        `export function normalizeAngle(deg: number, hours: number, min: number): number {\n` +
        `  const normalized = deg % 360;\n` +
        `  const dayHours = hours % 24;\n` +
        `  const hourMin = min % 60;\n` +
        `  return normalized + dayHours + hourMin;\n` +
        `}\n`,
        'utf-8'
      );
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('accepts tick delay 0 in setTimeout, setInterval, and delayedCall', async () => {
      await fs.writeFile(
        path.join(srcDir, 'tick.ts'),
        `export function nextTick(cb: () => void) {\n` +
        `  setTimeout(cb, 0);\n` +
        `  setInterval(cb, 0);\n` +
        `  delayedCall(0, cb);\n` +
        `}\n`,
        'utf-8'
      );
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('accepts standard radix arguments in parseInt and toString', async () => {
      await fs.writeFile(
        path.join(srcDir, 'radix.ts'),
        `export function parseValues(raw: string, num: number) {\n` +
        `  const a = parseInt(raw, 10);\n` +
        `  const b = Number.parseInt(raw, 16);\n` +
        `  const c = num.toString(36);\n` +
        `  const d = num.toString(2);\n` +
        `  return { a, b, c, d };\n` +
        `}\n`,
        'utf-8'
      );
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('accepts JSON indentation arguments', async () => {
      await fs.writeFile(
        path.join(srcDir, 'format.ts'),
        `export function formatOutput(data: unknown): string {\n` +
        `  return JSON.stringify(data, null, 2);\n` +
        `}\n`,
        'utf-8'
      );
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('accepts numeric keys in object literals', async () => {
      await fs.writeFile(
        path.join(srcDir, 'codes.ts'),
        `export const STATUS_TEXT = {\n` +
        `  200: 'OK',\n` +
        `  404: 'Not Found',\n` +
        `  500: 'Internal Error'\n` +
        `};\n`,
        'utf-8'
      );
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('accepts line-level escape hatch comment // const-ok:', async () => {
      const escapeComment = '// ' + 'const-ok: standard polynomial rolling hash constants';
      await fs.writeFile(
        path.join(srcDir, 'algorithm.ts'),
        `export function computeHash(val: number): number {\n` +
        `  return (val * 31) ^ 7; ${escapeComment}\n` +
        `}\n`,
        'utf-8'
      );
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('accepts constants declared inside Vue SFC <script> and <script setup>', async () => {
      const vueContent = `
<template>
  <div>{{ MESSAGE }}</div>
</template>

<script setup lang="ts">
const DELAY = 500;
const OPTIONS = [10, 20] as const;
const format = (v: number) => v === 0;
</script>

<script lang="ts">
export const COMPONENT_ID = 42;
</script>
`;
      await fs.writeFile(path.join(srcDir, 'TestComponent.vue'), vueContent, 'utf-8');
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });

  describe('Violation Path: 100% Rule ID Verification', () => {
    it('detects naked number in if condition (magic-number-naked)', async () => {
      await fs.writeFile(
        path.join(srcDir, 'condition.ts'),
        `export function isHighPrice(price: number): boolean {\n` +
        `  if (price > 50) return true;\n` +
        `  return false;\n` +
        `}\n`,
        'utf-8'
      );
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.status).toBe('failed');
      const finding = result.findings.find(f => f.ruleId === 'magic-number-naked');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
      expect(finding?.message).toContain('50');
      expect(finding?.line).toBe(2);
    });

    it('detects naked number in return statement', async () => {
      await fs.writeFile(
        path.join(srcDir, 'ret.ts'),
        `export function getDefaultCode(): number {\n` +
        `  return 999;\n` +
        `}\n`,
        'utf-8'
      );
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.status).toBe('failed');
      const finding = result.findings.find(f => f.ruleId === 'magic-number-naked');
      expect(finding).toBeDefined();
      expect(finding?.message).toContain('999');
      expect(finding?.line).toBe(2);
    });

    it('detects naked number in arithmetic expression', async () => {
      await fs.writeFile(
        path.join(srcDir, 'tax.ts'),
        `export function calculateTax(amount: number): number {\n` +
        `  return amount * 1.21;\n` +
        `}\n`,
        'utf-8'
      );
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.status).toBe('failed');
      const finding = result.findings.find(f => f.ruleId === 'magic-number-naked');
      expect(finding).toBeDefined();
      expect(finding?.message).toContain('1.21');
    });

    it('detects naked negative number in return statement', async () => {
      await fs.writeFile(
        path.join(srcDir, 'neg.ts'),
        `export function getFallback(): number {\n` +
        `  return -999;\n` +
        `}\n`,
        'utf-8'
      );
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.status).toBe('failed');
      const finding = result.findings.find(f => f.ruleId === 'magic-number-naked');
      expect(finding).toBeDefined();
      expect(finding?.message).toContain('-999');
    });

    it('detects naked number in function call argument', async () => {
      await fs.writeFile(
        path.join(srcDir, 'call.ts'),
        `export function schedule(fn: (val: number) => void) {\n` +
        `  fn(5000);\n` +
        `}\n`,
        'utf-8'
      );
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.status).toBe('failed');
      const finding = result.findings.find(f => f.ruleId === 'magic-number-naked');
      expect(finding).toBeDefined();
      expect(finding?.message).toContain('5000');
      expect(finding?.message).toContain('Número mágico no declarado');
    });

    it('detects naked timer delays in setTimeout, setInterval, and delayedCall with tailored remediation message', async () => {
      await fs.writeFile(
        path.join(srcDir, 'timers.ts'),
        `export function runTimers(cb: () => void) {\n` +
        `  setTimeout(cb, 1000);\n` +
        `  setInterval(cb, 500);\n` +
        `  delayedCall(2, cb);\n` +
        `}\n`,
        'utf-8'
      );
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.status).toBe('failed');
      const timerFindings = result.findings.filter(
        f => f.ruleId === 'magic-number-naked' && f.message.includes('Retardo de temporizador numérico desnudo')
      );
      expect(timerFindings).toHaveLength(3);
      expect(timerFindings[0]?.message).toContain('1000');
      expect(timerFindings[1]?.message).toContain('500');
      expect(timerFindings[2]?.message).toContain('2');
    });

    it('detects naked number in mutable variable assignment (let)', async () => {
      await fs.writeFile(
        path.join(srcDir, 'mutate.ts'),
        `export function count() {\n` +
        `  let total = 42;\n` +
        `  return total;\n` +
        `}\n`,
        'utf-8'
      );
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.status).toBe('failed');
      const finding = result.findings.find(f => f.ruleId === 'magic-number-naked');
      expect(finding).toBeDefined();
      expect(finding?.message).toContain('42');
    });

    it('detects naked number in Vue SFC <script setup>', async () => {
      const vueContent = `
<template>
  <div>Count</div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
const count = ref(25);
if (count.value > 99) {
  console.log('High');
}
</script>
`;
      await fs.writeFile(path.join(srcDir, 'BadComponent.vue'), vueContent, 'utf-8');
      const auditor = new ValidateMagicNumbersAuditor([srcDir], tempDir);
      const result = await auditor.execute();
      expect(result.status).toBe('failed');
      const findings = result.findings.filter(f => f.ruleId === 'magic-number-naked');
      expect(findings.length).toBeGreaterThanOrEqual(1);
      expect(findings.some(f => f.message.includes('99') || f.message.includes('25'))).toBe(true);
    });
  });
});

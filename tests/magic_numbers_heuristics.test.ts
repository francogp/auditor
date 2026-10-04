/**
 * tests/magic_numbers_heuristics.test.ts
 *
 * Comprehensive tests for magicNumbers rule enhancements:
 * 1. Standard radices in parseInt, Number.parseInt, and toString(radix).
 * 2. Properties in named constant configuration objects (const UPPER_CASE = { ... } / as const).
 * 3. Deterministic PRNG and trigonometric formulas (Math.sin(...) * N, seed * N).
 * 4. Universal upper-bound sentinel (9999).
 * 5. Negative tests ensuring arbitrary magic numbers in business logic are strictly flagged.
 */

import { describe, it, expect } from 'vitest';
import { magicNumbers } from '../src/suites/architecture/audit_rules.ts';

function checkViolations(content: string, filePath = 'src/services/testService.ts'): string[] {
  const regex = new RegExp(magicNumbers.regex.source, magicNumbers.regex.flags);
  const violations: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (magicNumbers.check?.(content, match, filePath)) {
      violations.push(match[2] ?? match[0]);
    }
  }

  return violations;
}

describe('Magic Numbers Rule Heuristics & Ergonomics', () => {
  it('does not flag standard radices (10, 16, 36) in parseInt, Number.parseInt, and toString()', () => {
    const code = `
      const dec = parseInt(str, 10);
      const hex = parseInt(hexStr, 16);
      const tok = Number.parseInt(rawTok, 36);
      const binStr = val.toString(2);
      const hexStr = val.toString(16);
      const alphaStr = val.toString(36);
    `;

    const violations = checkViolations(code);
    expect(violations).toEqual([]);
  });

  it('does not flag properties defined inside multi-line named constant objects', () => {
    const code = `
      export const DEFAULT_HOVER_OPTIONS = {
        y: -3,
        scale: 1.02,
        brightness: 1.18,
        duration: 0.22
      } as const;

      const MAP_SETTINGS: Record<string, number> = {
        zoomLevel: 15,
        maxRetries: 50,
        timeoutMs: 3000
      };
    `;

    const violations = checkViolations(code);
    expect(violations).toEqual([]);
  });

  it('does not flag deterministic PRNG formulas and seed multipliers', () => {
    const code = `
      function pseudoRandom(seed: number): number {
        const val = Math.sin(seed) * 10000;
        return val - Math.floor(val);
      }

      function lcgStep(seed: number): number {
        return (seed * 1664525) % 4294967296;
      }
    `;

    const violations = checkViolations(code);
    expect(violations).toEqual([]);
  });

  it('does not flag universal upper-bound sentinel 9999', () => {
    const code = `
      export const UNBOUNDED_SENTINEL = 9999;
      const infiniteCap = 9999;
    `;

    const violations = checkViolations(code);
    expect(violations).toEqual([]);
  });

  it('strictly flags naked magic numbers in functions and business logic (negative testing)', () => {
    const code = `
      function processOrder(amount: number) {
        const taxRate = 42;
        if (amount > 15) {
          return amount * 88;
        }
        return amount;
      }
    `;

    const violations = checkViolations(code);
    expect(violations.length).toBeGreaterThanOrEqual(3);
    expect(violations).toContain('42');
    expect(violations).toContain('15');
    expect(violations).toContain('88');
  });

  it('strictly flags properties in local/unnamed objects and return statements (negative testing)', () => {
    const code = `
      function getLocalOptions() {
        const localConfig = {
          retries: 50
        };
        return {
          limit: 75
        };
      }
    `;

    const violations = checkViolations(code);
    expect(violations.length).toBe(2);
    expect(violations).toContain('50');
    expect(violations).toContain('75');
  });
});

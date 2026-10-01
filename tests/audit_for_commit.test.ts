/**
 * packages/auditor/tests/audit_for_commit.test.ts
 *
 * Dedicated unit test suite for filterNewWarnings in audit_for_commit.ts.
 */

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { filterNewWarnings } from '../src/cli/audit_for_commit.ts';
import type { Violation } from '../src/cli/audit_for_commit.ts';

describe('Warnings Diff Logic (audit_for_commit.ts)', () => {
  const filePath = 'src/components/TestComponent.vue';

  it('debe marcar todas las advertencias como nuevas si el archivo no existe en origin/main (originContent es null)', () => {
    const localWarnings: Violation[] = [
      {
        file: filePath,
        line: 10,
        message: 'Unused variable x',
        context: 'const x = 1;',
        severity: 'warning',
        ruleId: 'no-unused-vars'
      }
    ];

    const result = filterNewWarnings(localWarnings, [], null, filePath);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]?.isNew, true);
  });

  it('debe marcar una advertencia como heredada (isNew: boolean) si ya existía en origin/main para ESLint', () => {
    const localWarnings: Violation[] = [
      {
        file: filePath,
        line: 10,
        message: 'Unused variable x',
        context: 'const x = 1;',
        severity: 'warning',
        ruleId: 'no-unused-vars'
      }
    ];

    const originWarnings: Violation[] = [
      {
        file: filePath,
        line: 10,
        message: 'Unused variable x',
        context: 'const x = 1;',
        severity: 'warning',
        ruleId: 'no-unused-vars'
      }
    ];

    const originContent = 'const a = 0;\nconst x = 1;\n';
    const result = filterNewWarnings(localWarnings, originWarnings, originContent, filePath);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]?.isNew, false);
  });

  it('debe marcar una advertencia de ESLint como NUEVA si no existía en origin/main', () => {
    const localWarnings: Violation[] = [
      {
        file: filePath,
        line: 15,
        message: 'New unused variable y',
        context: 'const y = 2;',
        severity: 'warning',
        ruleId: 'no-unused-vars'
      }
    ];

    const originWarnings: Violation[] = [
      {
        file: filePath,
        line: 10,
        message: 'Unused variable x',
        context: 'const x = 1;',
        severity: 'warning',
        ruleId: 'no-unused-vars'
      }
    ];

    const originContent = 'const a = 0;\nconst x = 1;\n';
    const result = filterNewWarnings(localWarnings, originWarnings, originContent, filePath);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]?.isNew, true);
  });

  it('debe marcar una advertencia de sub-auditor como heredada si el snippet de contexto existía idéntico en origin/main', () => {
    const localWarnings: Violation[] = [
      {
        file: filePath,
        line: 5,
        message: 'Non-optimal data structure',
        context: 'items.find(x => x.id === 1)',
        severity: 'warning',
        ruleId: 'o1-lookup'
      }
    ];

    const originContent = 'const items = [];\nitems.find(x => x.id === 1);\n';
    const result = filterNewWarnings(localWarnings, [], originContent, filePath);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]?.isNew, false);
  });

  it('debe marcar una advertencia de sub-auditor como NUEVA si el snippet no existía en origin/main', () => {
    const localWarnings: Violation[] = [
      {
        file: filePath,
        line: 5,
        message: 'Non-optimal data structure',
        context: 'newArray.includes(targetId)',
        severity: 'warning',
        ruleId: 'o1-lookup'
      }
    ];

    const originContent = 'const items = [];\nitems.find(x => x.id === 1);\n';
    const result = filterNewWarnings(localWarnings, [], originContent, filePath);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0]?.isNew, true);
  });
});

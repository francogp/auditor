/**
 * tests/core/refactor/microContextExtractor.test.ts
 *
 * Hermetic unit tests for MicroContextExtractor.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { MicroContextExtractor } from '../../../src/core/refactor/microContextExtractor.ts';
import type { FallowCloneGroup } from '../../../src/core/refactor/refactorContracts.ts';

describe('MicroContextExtractor', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-micro-ctx-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('extracts focused micro-context from TypeScript files with local context', () => {
    const relFile = 'mathHelpers.ts';
    const filePath = path.join(tmpDir, relFile);
    const fillerLines = Array.from(
      { length: 40 },
      (_, i) => `// Padding utility line ${i} to simulate realistic file`
    );
    const content = [
      "import { round } from 'node:math';",
      ...fillerLines,
      'export function calculateArea(radius: number): number {',
      '  const pi = 3.14159;',
      '  // duplicated start',
      '  const factor = 2;',
      '  const intermediate = radius * factor;',
      '  const result = intermediate * pi;',
      '  // duplicated end',
      '  return result;',
      '}',
      ''
    ].join('\n');

    fs.writeFileSync(filePath, content, 'utf-8');

    const group: FallowCloneGroup = {
      fingerprint: 'fingerprint-abc',
      token_count: 35,
      line_count: 3,
      instances: [
        {
          file: relFile,
          start_line: 46,
          end_line: 48
        }
      ]
    };

    const extractor = new MicroContextExtractor();
    const packet = extractor.extract(tmpDir, group);

    expect(packet.fingerprint).toBe('fingerprint-abc');
    expect(packet.instances).toHaveLength(1);
    const firstInstance = packet.instances[0];
    expect(firstInstance).toBeDefined();
    if (!firstInstance) return;
    expect(firstInstance.file).toBe(relFile);
    expect(firstInstance.contextSnippet).toContain('intermediate');
    expect(firstInstance.sha256).toBeDefined();
    expect(packet.microContextTokensEstimate).toBeGreaterThan(0);
    expect(packet.tokenSavingsPercent).toBeGreaterThan(0);
  });

  it('computes dataflow variables and return status', () => {
    const relFile = 'logic.ts';
    const filePath = path.join(tmpDir, relFile);
    const content = [
      'export function doWork(inputVal: number): number {',
      '  const factor = 10;',
      '  const scaled = inputVal * factor;',
      '  return scaled;',
      '}',
      ''
    ].join('\n');

    fs.writeFileSync(filePath, content, 'utf-8');

    const group: FallowCloneGroup = {
      fingerprint: 'fingerprint-dataflow',
      token_count: 20,
      line_count: 3,
      instances: [
        {
          file: relFile,
          start_line: 2,
          end_line: 4
        }
      ]
    };

    const extractor = new MicroContextExtractor();
    const packet = extractor.extract(tmpDir, group);

    expect(packet.instances).toHaveLength(1);
    const instance = packet.instances[0];
    expect(instance).toBeDefined();
    if (!instance) return;
    expect(instance.hasReturnOrControlBreak).toBe(true);
    expect(instance.assignedVariables).toContain('scaled');
  });
});

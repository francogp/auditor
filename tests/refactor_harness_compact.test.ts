/**
 * tests/refactor_harness_compact.test.ts
 *
 * Unit tests verifying compact vs verbose discover output in refactor CLI harness.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vite-plus/test';

import {
  runRefactorCliHarness,
  type RefactorCliDefinition
} from '../src/core/refactor/refactorCliHarness.ts';

interface DummyFinding {
  file: string;
  line: number;
  val: string;
}

interface DummyPlan {
  id: string;
  items: DummyFinding[];
}

describe('refactorCliHarness Compact vs Verbose Mode', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;

  const dummyDef: RefactorCliDefinition<DummyFinding, DummyPlan> = {
    toolName: 'auditor:dummy',
    toolDescription: 'Dummy Refactor',
    bannerTitle: 'DUMMY REFACTOR',
    bannerSubtitle: 'Testing Harness Subtitle',
    scanningMessage: 'Scanning for dummies',
    zeroFindingsMessage: 'Zero dummies found',
    tableColumns: [
      { key: 'file', header: 'ARCHIVO', align: 'left', width: 20 },
      { key: 'count', header: 'TOTAL', align: 'right', width: 10 }
    ],
    discoverInFile: (filePath: string) => {
      if (filePath.includes('test.ts')) {
        return [{ file: filePath, line: 10, val: 'foo' }];
      }
      return [];
    },
    engineFactory: () =>
      ({
        getScannableFiles: () => ['src/test.ts'],
        isToolEnabled: () => true
      }) as any,
    buildTableRow: (relFile: string, findings: readonly DummyFinding[]) => ({
      file: relFile,
      count: String(findings.length)
    }),
    buildSummaryMessage: (filesCount: number, allFindings: readonly DummyFinding[]) =>
      `Total: ${allFindings.length} in ${filesCount} files`,
    toDiracItem: (f: DummyFinding) => ({
      file: f.file,
      line: f.line,
      kind: 'dummy',
      originalSnippet: f.val,
      suggestedReplacement: 'bar',
      explanation: 'explanation'
    }),
    createPlan: (id: string, findings: readonly DummyFinding[]) => ({
      id,
      items: [...findings]
    }),
    applyPlan: () => ({ filesChanged: 1, changesApplied: 1 })
  };

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('renders single-line file summaries without Box-Drawing frames in compact discover mode', async () => {
    await runRefactorCliHarness(dummyDef, ['discover', 'file=test.ts']);

    const allLogs = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(allLogs).toContain('auditor:dummy discover:');
    expect(allLogs).toContain('Next Action: npm run auditor:dummy inspect <file>');
    expect(allLogs).not.toContain('┌─');
    expect(allLogs).not.toContain('│ ARCHIVO');
  });

  it('renders full Box-Drawing table when human is passed to discover', async () => {
    await runRefactorCliHarness(dummyDef, ['discover', 'file=test.ts', 'human']);

    const allLogs = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(allLogs).toContain('Scanning for dummies');
    expect(allLogs).toContain('┌─');
    expect(allLogs).toContain('Total: 1 in 1 files');
  });
});

#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/refactor_motion.ts
 *
 * CANONICAL MOTION & UI ANIMATION REFACTORING CLI (Node.js 26+ Native)
 * Provides interactive discovery, Dirac micro-context inspection, and safe worktree application
 * for UI timers, GPU transforms, and GSAP animation hygiene.
 */

import { styleText } from 'node:util';

import { MotionRefactorEngine } from '../core/refactor/motionRefactorEngine.ts';
import {
  runRefactorCliHarness,
  formatCliRelativeFilePath,
  type RefactorCliDefinition
} from '../core/refactor/refactorCliHarness.ts';
import type { MotionFindingItem, MotionRefactorPlan } from '../core/refactor/refactorContracts.ts';
import type { TableColumn } from '../core/unifiedTheme.ts';
import { isMainModule } from './cliUtils.ts';

const TABLE_COLUMNS: readonly TableColumn[] = [
  { key: 'file', header: 'File', width: 46, align: 'left' },
  { key: 'timers', header: 'Timers', width: 8, align: 'right' },
  { key: 'layout', header: 'Layout', width: 8, align: 'right' },
  { key: 'eases', header: 'Eases', width: 8, align: 'right' },
  { key: 'total', header: 'Total', width: 7, align: 'right' }
];

const motionCliDef: RefactorCliDefinition<MotionFindingItem, MotionRefactorPlan> = {
  toolName: 'auditor-motion',
  toolDescription: 'UI animations and banned timers',
  bannerTitle: 'AUDITOR MOTION: UI ANIMATION & GSAP GOVERNANCE',
  bannerSubtitle: 'Deterministic auto-remediation of UI timers and GPU transform optimization',
  scanningMessage: 'Scanning UI animations and timers in',
  zeroFindingsMessage: 'Zero UI animation violations or timers detected!',
  tableColumns: TABLE_COLUMNS,
  engineFactory: (projectRoot) => new MotionRefactorEngine({ projectRoot }),
  discoverInFile: (filePath) => MotionRefactorEngine.discoverInFile(filePath),
  buildTableRow: (relFile, findings) => {
    const timers = findings.filter((f) => f.kind === 'banned-ui-timer').length;
    const layout = findings.filter((f) => f.kind === 'layout-property').length;
    const eases = findings.filter((f) => f.kind === 'legacy-ease').length;
    return {
      file: formatCliRelativeFilePath(relFile),
      timers: String(timers),
      layout: String(layout),
      eases: String(eases),
      total: String(findings.length)
    };
  },
  buildSummaryMessage: (filesCount, allFindings) => {
    const timers = allFindings.filter((f) => f.kind === 'banned-ui-timer').length;
    const layout = allFindings.filter((f) => f.kind === 'layout-property').length;
    const eases = allFindings.filter((f) => f.kind === 'legacy-ease').length;
    return `Summary: ${filesCount} file(s) with ${allFindings.length} findings (${timers} timers, ${layout} layout props, ${eases} eases).`;
  },
  toDiracItem: (f) => ({
    line: f.line,
    kind: f.kind,
    originalSnippet: f.originalSnippet,
    suggestedReplacement: f.suggestedReplacement,
    explanation: f.explanation
  }),
  createPlan: (id, findings) => MotionRefactorEngine.createPlan(id, findings),
  applyPlan: (dir, plan) => MotionRefactorEngine.applyPlan(dir, plan)
};

export async function runRefactorMotionCli(argv?: readonly string[]): Promise<void> {
  await runRefactorCliHarness(motionCliDef, argv);
}

if (isMainModule(import.meta.url, ['auditor-motion', 'refactor_motion'])) {
  runRefactorMotionCli().catch((err) => {
    console.error(styleText('red', `\n[Error] Fatal error in auditor-motion: ${err.message}`));
    process.exit(1);
  });
}

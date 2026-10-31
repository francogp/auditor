#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/refactor_hygiene.ts
 *
 * CANONICAL CODEBASE HYGIENE REFACTORING CLI (Node.js 26+ Native)
 * Provides interactive discovery, Dirac micro-context inspection, and safe worktree application
 * for member accessibility, globalThis references, and void expressions.
 */

import { HygieneRefactorEngine } from '../core/refactor/hygieneRefactorEngine.ts';
import {
  runRefactorCliHarness,
  formatCliRelativeFilePath,
  type RefactorCliDefinition
} from '../core/refactor/refactorCliHarness.ts';
import type {
  HygieneFindingItem,
  HygieneRefactorPlan
} from '../core/refactor/refactorContracts.ts';
import type { TableColumn } from '../core/unifiedTheme.ts';
import { isMainModule } from './cliUtils.ts';

const TABLE_COLUMNS: readonly TableColumn[] = [
  { key: 'file', header: 'File', width: 44, align: 'left' },
  { key: 'access', header: 'Access', width: 8, align: 'right' },
  { key: 'globalThis', header: 'Globals', width: 9, align: 'right' },
  { key: 'noVoid', header: 'NoVoid', width: 8, align: 'right' },
  { key: 'total', header: 'Total', width: 7, align: 'right' }
];

const hygieneCliDef: RefactorCliDefinition<HygieneFindingItem, HygieneRefactorPlan> = {
  toolName: 'auditor-hygiene',
  toolDescription: 'member accessibility, globalThis references, or redundant void expressions',
  bannerTitle: 'AUDITOR HYGIENE: CODE ACCESSIBILITY & STANDARDS REFACTORING',
  bannerSubtitle:
    'Deterministic auto-remediation of public modifiers, globalThis, and void statements',
  scanningMessage: 'Scanning accessibility, globals, and void expressions in',
  zeroFindingsMessage: 'Zero accessibility, legacy global, or void operator issues detected!',
  tableColumns: TABLE_COLUMNS,
  engineFactory: (projectRoot) => new HygieneRefactorEngine({ projectRoot }),
  discoverInFile: (filePath) => HygieneRefactorEngine.discoverInFile(filePath),
  buildTableRow: (relFile, findings) => {
    const access = findings.filter((f) => f.kind === 'member-accessibility').length;
    const globalThisCount = findings.filter((f) => f.kind === 'prefer-global-this').length;
    const noVoid = findings.filter((f) => f.kind === 'no-void').length;
    return {
      file: formatCliRelativeFilePath(relFile),
      access: String(access),
      globalThis: String(globalThisCount),
      noVoid: String(noVoid),
      total: String(findings.length)
    };
  },
  buildSummaryMessage: (filesCount, allFindings) => {
    const access = allFindings.filter((f) => f.kind === 'member-accessibility').length;
    const globalThisCount = allFindings.filter((f) => f.kind === 'prefer-global-this').length;
    const noVoid = allFindings.filter((f) => f.kind === 'no-void').length;
    return `Summary: ${filesCount} file(s) with ${allFindings.length} hygiene opportunities (${access} member accessibility, ${globalThisCount} globals -> globalThis, ${noVoid} void expressions).`;
  },
  toDiracItem: (f) => ({
    line: f.line,
    kind: f.kind,
    originalSnippet: f.originalSnippet,
    suggestedReplacement: f.suggestedReplacement,
    explanation: f.explanation
  }),
  createPlan: (id, findings) => HygieneRefactorEngine.buildHygienePlan(id, findings),
  applyPlan: (dir, plan) => HygieneRefactorEngine.applyPlan(dir, plan),
  extendedHelp: `
================================================================================
CANONICAL CODEBASE HYGIENE QUICK-REFERENCE (@francogp/auditor)
================================================================================
This tool cleans code syntax without altering runtime semantics:

  Rule Violations                       Canonical Remediation
  ------------------------------------  ----------------------------------------
  explicit-member-accessibility         Explicit "public", "protected", or "private"
  unicorn/prefer-global-this            ECMAScript standard "globalThis"
  eslint/no-void                        Remove operator or wrap concise arrow in { }

USAGE EXAMPLES:
  npm run auditor:hygiene discover
  npm run auditor:hygiene inspect <filePath>
  npm run auditor:hygiene apply <plan.json> --worktree
================================================================================
`
};

export async function runHygieneCli(): Promise<void> {
  await runRefactorCliHarness(hygieneCliDef);
}

if (isMainModule(import.meta.url, ['auditor-hygiene'])) {
  runHygieneCli().catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
}

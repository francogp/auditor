#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/refactor_types.ts
 *
 * CANONICAL TYPE ASSERTION & RETURN TYPE REFACTORING CLI (Node.js 26+ Native)
 * Provides interactive discovery, Dirac micro-context inspection, and safe worktree application
 * for `as any`, double assertions, and explicit function return contracts.
 */

import { styleText } from 'node:util';
import type { TableColumn } from '../core/unifiedTheme.ts';
import { TypesRefactorEngine } from '../core/refactor/typesRefactorEngine.ts';
import {
  runRefactorCliHarness,
  formatCliRelativeFilePath,
  type RefactorCliDefinition
} from '../core/refactor/refactorCliHarness.ts';
import type {
  TypesFindingItem,
  TypesRefactorPlan
} from '../core/refactor/refactorContracts.ts';
import { isMainModule } from './cliUtils.ts';

const TABLE_COLUMNS: readonly TableColumn[] = [
  { key: 'file', header: 'File', width: 46, align: 'left' },
  { key: 'asAny', header: 'as any', width: 8, align: 'right' },
  { key: 'casts', header: 'Casts', width: 8, align: 'right' },
  { key: 'returns', header: 'Returns', width: 9, align: 'right' },
  { key: 'total', header: 'Total', width: 7, align: 'right' }
];

const typesCliDef: RefactorCliDefinition<TypesFindingItem, TypesRefactorPlan> = {
  toolName: 'auditor-types',
  toolDescription: 'as any, double assertions, or missing return types',
  bannerTitle: 'AUDITOR TYPES: TYPE ASSERTION & RETURN TYPE HYGIENE',
  bannerSubtitle: 'Deterministic auto-remediation of as any and strict return contracts',
  scanningMessage: 'Scanning as any and type contracts in',
  zeroFindingsMessage: 'Zero as any, double assertions, or untyped returns detected!',
  tableColumns: TABLE_COLUMNS,
  engineFactory: (projectRoot) => new TypesRefactorEngine({ projectRoot }),
  discoverInFile: (filePath) => TypesRefactorEngine.discoverInFile(filePath),
  buildTableRow: (relFile, findings) => {
    const asAny = findings.filter((f) => f.kind === 'as-any').length;
    const casts = findings.filter((f) => f.kind === 'double-assertion').length;
    const returns = findings.filter((f) => f.kind === 'missing-return-type').length;
    return {
      file: formatCliRelativeFilePath(relFile),
      asAny: String(asAny),
      casts: String(casts),
      returns: String(returns),
      total: String(findings.length)
    };
  },
  buildSummaryMessage: (filesCount, allFindings) => {
    const asAny = allFindings.filter((f) => f.kind === 'as-any').length;
    const casts = allFindings.filter((f) => f.kind === 'double-assertion').length;
    const returns = allFindings.filter((f) => f.kind === 'missing-return-type').length;
    return `Summary: ${filesCount} file(s) with ${allFindings.length} typing opportunities (${asAny} as any, ${casts} double casts, ${returns} missing return types).`;
  },
  toDiracItem: (f) => ({
    line: f.line,
    kind: f.kind,
    originalSnippet: f.originalSnippet,
    suggestedReplacement: f.suggestedReplacement,
    explanation: f.explanation
  }),
  createPlan: (id, findings) => TypesRefactorEngine.createPlan(id, findings),
  applyPlan: (dir, plan) => TypesRefactorEngine.applyPlan(dir, plan)
};

export async function runRefactorTypesCli(argv?: readonly string[]): Promise<void> {
  await runRefactorCliHarness(typesCliDef, argv);
}

if (isMainModule(import.meta.url, ['auditor-types', 'refactor_types'])) {
  runRefactorTypesCli().catch((err) => {
    console.error(styleText('red', `\n[Error] Fatal error in auditor-types: ${err.message}`));
    process.exit(1);
  });
}

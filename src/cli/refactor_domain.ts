#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/refactor_domain.ts
 *
 * CANONICAL DOMAIN TYPE & BRANDED ID REFACTORING CLI (Node.js 26+ Native)
 * Provides interactive discovery, Dirac micro-context inspection, and safe worktree application
 * for naked string parameters, unfrozen domain catalogs, and unbranded ID types.
 */

import { styleText } from 'node:util';
import type { TableColumn } from '../core/unifiedTheme.ts';
import { DomainRefactorEngine } from '../core/refactor/domainRefactorEngine.ts';
import {
  runRefactorCliHarness,
  formatCliRelativeFilePath,
  type RefactorCliDefinition
} from '../core/refactor/refactorCliHarness.ts';
import type {
  DomainFindingItem,
  DomainRefactorPlan
} from '../core/refactor/refactorContracts.ts';
import { isMainModule } from './cliUtils.ts';

const TABLE_COLUMNS: readonly TableColumn[] = [
  { key: 'file', header: 'Archivo', width: 40, align: 'left' },
  { key: 'naked', header: 'NakedStr', width: 9, align: 'right' },
  { key: 'unfrozen', header: 'Unfrozen', width: 9, align: 'right' },
  { key: 'unbranded', header: 'Unbranded', width: 10, align: 'right' },
  { key: 'total', header: 'Total', width: 7, align: 'right' }
];

const domainCliDef: RefactorCliDefinition<DomainFindingItem, DomainRefactorPlan> = {
  toolName: 'auditor-domain',
  toolDescription: 'parameters with naked strings, mutable catalogs, or unbranded IDs',
  bannerTitle: 'AUDITOR DOMAIN: DOMAIN TYPE & BRANDED ID HYGIENE',
  bannerSubtitle: 'Deterministic auto-remediation of naked strings, mutable catalogs, and unbranded IDs',
  scanningMessage: 'Scanning domain contracts and nominal types in',
  zeroFindingsMessage: 'Zero raw strings, mutable catalogs, or unbranded IDs detected!',
  tableColumns: TABLE_COLUMNS,
  engineFactory: (projectRoot) => new DomainRefactorEngine({ projectRoot }),
  discoverInFile: (filePath) => DomainRefactorEngine.discoverInFile(filePath),
  buildTableRow: (relFile, findings) => {
    const naked = findings.filter((f) => f.kind === 'naked-string-parameter').length;
    const unfrozen = findings.filter((f) => f.kind === 'unfrozen-catalog').length;
    const unbranded = findings.filter((f) => f.kind === 'unbranded-id').length;
    return {
      file: formatCliRelativeFilePath(relFile),
      naked: String(naked),
      unfrozen: String(unfrozen),
      unbranded: String(unbranded),
      total: String(findings.length)
    };
  },
  buildSummaryMessage: (filesCount, allFindings) => {
    const naked = allFindings.filter((f) => f.kind === 'naked-string-parameter').length;
    const unfrozen = allFindings.filter((f) => f.kind === 'unfrozen-catalog').length;
    const unbranded = allFindings.filter((f) => f.kind === 'unbranded-id').length;
    return `Summary: ${filesCount} file(s) with ${allFindings.length} domain opportunities (${naked} raw strings, ${unfrozen} mutable catalogs, ${unbranded} unbranded IDs).`;
  },
  toDiracItem: (f) => ({
    line: f.line,
    kind: f.kind,
    originalSnippet: f.originalSnippet,
    suggestedReplacement: f.suggestedReplacement,
    explanation: f.explanation
  }),
  createPlan: (id, findings) => DomainRefactorEngine.createPlan(id, findings),
  applyPlan: (dir, plan) => DomainRefactorEngine.applyPlan(dir, plan)
};

export async function runRefactorDomainCli(argv?: readonly string[]): Promise<void> {
  await runRefactorCliHarness(domainCliDef, argv);
}

if (isMainModule(import.meta.url, ['auditor-domain', 'refactor_domain'])) {
  runRefactorDomainCli().catch((err) => {
    console.error(styleText('red', `\n[Error] Fatal error in auditor-domain: ${err.message}`));
    process.exit(1);
  });
}

#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/refactor_magic.ts
 *
 * CANONICAL MAGIC LITERAL & DESIGN TOKEN REFACTORING CLI (Node.js 26+ Native)
 * Provides interactive discovery, Super-Dirac batch inspection, and safe worktree application.
 */

import path from 'node:path';
import { styleText } from 'node:util';

import {
  COMMON_CLI_ARGS,
  getProcessCliArgs,
  parseCittyArgs,
  type CittyArgsDef
} from '../core/cli/cittyHarness.ts';
import type { MagicRefactorPlan } from '../core/refactor/magicContracts.ts';
import { MagicNumberExtractor } from '../core/refactor/magicNumberExtractor.ts';
import { MagicNumberHarness } from '../core/refactor/magicNumberHarness.ts';
import {
  applyPlanFileWithWorktreeVerification,
  formatCliRelativeFilePath,
  REFACTOR_POSITIONAL_CLI_ARGS,
  REFACTOR_SUBCOMMANDS,
  renderBanner,
  renderBoxTable,
  type TableColumn
} from '../core/refactor/refactorCliHarness.ts';
import { isMainModule } from './cliUtils.ts';
import { REFACTOR_DUPES_CLI_COMMAND } from './refactor_dupes.ts';

export const REFACTOR_MAGIC_CLI_COMMAND = 'auditor:magic';

const REFACTOR_MAGIC_ARGS = {
  ...COMMON_CLI_ARGS,
  ...REFACTOR_POSITIONAL_CLI_ARGS,
  file: {
    type: 'string',
    description: 'Target file to inspect for magic literals'
  },
  plan: {
    type: 'string',
    description: 'Path to MagicRefactorPlan JSON file'
  },
  worktree: {
    type: 'boolean',
    default: false,
    description: 'Execute mutations in an isolated Git worktree'
  }
} as const satisfies CittyArgsDef;

export function handleMagicDiscover(projectRoot: string, extractor: MagicNumberExtractor): void {
  console.log(styleText('cyan', `Scanning files for magic numbers in: ${projectRoot}...\n`));

  const scannableFiles = extractor.getScannableFiles();
  const tableRows: Record<string, string>[] = [];
  let totalFound = 0;

  for (const relFile of scannableFiles) {
    const items = extractor.scanFile(projectRoot, relFile);
    if (items.length > 0) {
      totalFound += items.length;
      const zeroCount = items.filter((i) => i.isZeroTokenResolvable).length;
      tableRows.push({
        file: formatCliRelativeFilePath(relFile),
        count: String(items.length),
        zero: String(zeroCount),
        pending: String(items.length - zeroCount)
      });
    }
  }

  if (tableRows.length === 0) {
    console.log(styleText('green', '[OK] Zero magic numbers detected in workspace!\n'));
    return;
  }

  const columns: TableColumn[] = [
    { key: 'file', header: 'File', width: 44, align: 'left' },
    { key: 'count', header: 'Total', width: 8, align: 'right' },
    { key: 'zero', header: '0-Token', width: 10, align: 'right' },
    { key: 'pending', header: 'Pending', width: 11, align: 'right' }
  ];

  console.log(renderBoxTable(columns, tableRows));
  console.log(
    styleText(
      'yellow',
      `\nTotal: ${totalFound} magic literal(s) detected across ${tableRows.length} file(s).`
    )
  );
  console.log(
    styleText(
      'cyan',
      '\n[Notice] To generate Super-Dirac packet for a file:\n   npm run auditor:magic inspect <file>\n'
    )
  );
}

export function handleMagicInspect(
  projectRoot: string,
  extractor: MagicNumberExtractor,
  targetFile: string | undefined
): void {
  if (!targetFile) {
    console.error(
      styleText('red', '[Error] You must specify a file to inspect: auditor:magic inspect <file>')
    );
    process.exit(1);
  }

  const items = extractor.scanFile(projectRoot, targetFile);
  if (items.length === 0) {
    console.log(styleText('green', `[OK] No magic numbers detected in: ${targetFile}`));
    return;
  }

  const packet = extractor.generateSuperDiracPacket(projectRoot, targetFile, items);

  console.log(styleText('cyan', `[Dirac] Super-Dirac Packet for: ${targetFile}`));
  console.log(
    styleText(
      'gray',
      `• Total: ${packet.totalItems} | 0-Token: ${packet.zeroTokenCount} | Pending: ${packet.pendingAmbiguousCount}`
    )
  );
  console.log(
    styleText(
      'green',
      `• Token Savings: ${packet.fullFileTokensBaseline} -> ${packet.superDiracBatchTokens} (${packet.tokenSavingsPercent}% savings)\n`
    )
  );

  console.log(JSON.stringify(packet, null, 2));

  const suggestedPlan = extractor.createRefactorPlan(
    `magic-plan-${Temporal.Now.instant().epochMilliseconds}`,
    targetFile,
    items
  );
  console.log(
    styleText('yellow', '\n[Plan] Suggested declarative plan ready to apply (--plan):\n')
  );
  console.log(JSON.stringify(suggestedPlan, null, 2));
  console.log(
    styleText(
      'cyan',
      '\n[Notice] To apply this plan automatically:\n' +
        '   1. Save the plan JSON to a file (e.g. scratch/magic_plan.json)\n' +
        '   2. Run: npm run auditor:magic apply scratch/magic_plan.json --worktree\n'
    )
  );
}

export async function handleMagicApply(
  projectRoot: string,
  rawPlanPath: string | undefined,
  useWorktree: boolean
): Promise<void> {
  await applyPlanFileWithWorktreeVerification<MagicRefactorPlan>(
    projectRoot,
    rawPlanPath,
    useWorktree,
    (dir, plan) => MagicNumberHarness.execute(dir, plan),
    'auditor:magic apply <plan.json>'
  );
  console.log(styleText('green', '\n[OK] Magic numbers refactoring applied successfully!'));
}

export async function executeMagicCli(
  parsed: Record<string, unknown>,
  createExtractor: (projectRoot: string) => MagicNumberExtractor
): Promise<void> {
  const command = (parsed.subcommand as string) || 'discover';
  const targetArg =
    (parsed.target as string | undefined) ||
    (typeof parsed.file === 'string' ? parsed.file : undefined) ||
    (typeof parsed.plan === 'string' ? parsed.plan : undefined);

  const rawProject = typeof parsed.project === 'string' ? parsed.project : process.cwd();
  const projectRoot = path.resolve(rawProject);

  if (parsed.help || command === 'help') {
    renderBanner('auditor-magic', 'Deterministic Magic Numbers Governance & Refactoring');
    console.log(`
Usage:
  npm run auditor:magic [command] [options]

Commands:
  discover                  Scan workspace and list files with magic numbers or tokens
  inspect <file>            Extract Super-Dirac packet for a specific file
  apply <plan.json>         Apply refactor plan (supports --worktree)
  (see also: ${REFACTOR_DUPES_CLI_COMMAND})

Options:
  --project <path>          Path to target project root (default: cwd)
  --plan <path>             Path to MagicRefactorPlan JSON
  --worktree                Execute mutations in ephemeral Git Worktree
  -h, --help                Show this help manual
`);
    return;
  }

  renderBanner('auditor-magic', 'Deterministic Magic Numbers Governance & Refactoring');
  const extractor = createExtractor(projectRoot);

  if (!extractor.isToolEnabled()) {
    console.log(
      styleText(
        'yellow',
        `\n[Warning] Tool 'auditor-magic' (constants) is disabled in .auditor/audit.config.ts.\n`
      )
    );
    return;
  }

  extractor.indexProjectConstants(projectRoot);

  if (command === 'discover') {
    handleMagicDiscover(projectRoot, extractor);
    return;
  }
  if (command === 'inspect') {
    handleMagicInspect(projectRoot, extractor, targetArg);
    return;
  }
  if (command === 'apply') {
    await handleMagicApply(
      projectRoot,
      targetArg || (typeof parsed.plan === 'string' ? parsed.plan : undefined),
      Boolean(parsed.worktree)
    );
    return;
  }

  console.error(styleText('red', `[Error] Unknown command: ${command}`));
  process.exit(1);
}

export async function runRefactorMagicCli(rawInputArgs?: readonly string[]): Promise<void> {
  const rawArgs = rawInputArgs ? [...rawInputArgs] : getProcessCliArgs();
  const parsed = parseCittyArgs(REFACTOR_MAGIC_ARGS, rawArgs, REFACTOR_SUBCOMMANDS);
  await executeMagicCli(parsed, (projectRoot) => new MagicNumberExtractor({ projectRoot }));
}

if (isMainModule(import.meta.url, ['auditor-magic', 'refactor_magic'])) {
  runRefactorMagicCli().catch((err) => {
    console.error('\n[Error] Fatal error in auditor-magic:', err);
    process.exit(1);
  });
}

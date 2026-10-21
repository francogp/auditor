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
import {
  renderBanner,
  renderBoxTable,
  type TableColumn
} from '../core/unifiedTheme.ts';
import { MagicNumberExtractor } from '../core/refactor/magicNumberExtractor.ts';
import { MagicNumberHarness } from '../core/refactor/magicNumberHarness.ts';
import {
  applyPlanFileWithWorktreeVerification
} from '../core/refactor/worktreeSandbox.ts';
import { isMainModule } from './cliUtils.ts';
import type { MagicRefactorPlan } from '../core/refactor/magicContracts.ts';

const MAX_DISPLAY_FILE_PATH_LENGTH = 42;

function handleDiscover(projectRoot: string, extractor: MagicNumberExtractor): void {
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
        file: relFile.length > MAX_DISPLAY_FILE_PATH_LENGTH
          ? `...${relFile.slice(-(MAX_DISPLAY_FILE_PATH_LENGTH - 3))}`
          : relFile,
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

function handleInspect(projectRoot: string, extractor: MagicNumberExtractor, targetFile: string | undefined): void {
  if (!targetFile) {
    console.error(styleText('red', '[Error] You must specify a file to inspect: auditor:magic inspect <file>'));
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

  const suggestedPlan = extractor.createRefactorPlan(`magic-plan-${Date.now()}`, targetFile, items);
  console.log(styleText('yellow', '\n[Plan] Suggested declarative plan ready to apply (--plan):\n'));
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

async function handleApply(projectRoot: string, rawPlanPath: string | undefined, useWorktree: boolean): Promise<void> {
  await applyPlanFileWithWorktreeVerification<MagicRefactorPlan>(
    projectRoot,
    rawPlanPath,
    useWorktree,
    (dir, plan) => MagicNumberHarness.execute(dir, plan),
    'auditor:magic apply <plan.json>'
  );
  console.log(styleText('green', '\n[OK] Magic numbers refactoring applied successfully!'));
}

const REFACTOR_MAGIC_ARGS = {
  ...COMMON_CLI_ARGS,
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

const MAGIC_SUBCOMMANDS: ReadonlySet<string> = new Set(['discover', 'inspect', 'apply', 'help']); // runtime-set: O(1) subcommand lookup

export async function runRefactorMagicCli(rawInputArgs?: readonly string[]): Promise<void> {
  const rawArgs = rawInputArgs ? [...rawInputArgs] : getProcessCliArgs();
  const parsed = parseCittyArgs(REFACTOR_MAGIC_ARGS, rawArgs);
  const posList = parsed._;

  const firstPos = posList[0] ? String(posList[0]) : undefined;
  let command = 'discover';
  let targetArg: string | undefined;

  if (firstPos && MAGIC_SUBCOMMANDS.has(firstPos)) {
    command = firstPos;
    targetArg = (posList[1] ? String(posList[1]) : undefined) || (typeof parsed.file === 'string' ? parsed.file : undefined);
  } else if (firstPos) {
    command = firstPos;
  } else {
    targetArg = typeof parsed.file === 'string' ? parsed.file : undefined;
  }

  const projectRoot = path.resolve(String(parsed.project || process.cwd()));

  if (parsed.help || command === 'help') {
    renderBanner('auditor-magic', 'Deterministic Magic Numbers Governance & Refactoring');
    console.log(`
Usage:
  npm run auditor:magic [command] [options]

Commands:
  discover                  Scan workspace and list files with magic numbers or tokens
  inspect <file>            Extract Super-Dirac packet for a specific file
  apply <plan.json>         Apply refactor plan (supports --worktree)

Options:
  --project <path>          Path to target project root (default: cwd)
  --plan <path>             Path to MagicRefactorPlan JSON
  --worktree                Execute mutations in ephemeral Git Worktree
  -h, --help                Show this help manual
`);
    return;
  }

  renderBanner('auditor-magic', 'Deterministic Magic Numbers Governance & Refactoring');
  const extractor = new MagicNumberExtractor({ projectRoot });

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

  switch (command) {
    case 'discover':
      handleDiscover(projectRoot, extractor);
      break;
    case 'inspect':
      handleInspect(projectRoot, extractor, targetArg);
      break;
    case 'apply':
      await handleApply(
        projectRoot,
        targetArg || (typeof parsed.plan === 'string' ? parsed.plan : undefined),
        Boolean(parsed.worktree)
      );
      break;
    default:
      console.error(styleText('red', `[Error] Unknown command: ${command}`));
      process.exit(1);
  }
}

if (isMainModule(import.meta.url, ['auditor-magic', 'refactor_magic'])) {
  runRefactorMagicCli().catch((err) => {
    console.error('\n[Error] Fatal error in auditor-magic:', err);
    process.exit(1);
  });
}

#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/refactor_dupes.ts
 *
 * CANONICAL REFACTORING & DUPLICATION REMEDIATION CLI (Node.js 26+ Native)
 * Provides interactive discovery, micro-context inspection, and AST refactor application.
 */

import path from 'node:path';
import { styleText } from 'node:util';
import {
  COMMON_CLI_ARGS,
  getProcessCliArgs,
  parseCittyArgs,
  resolveHumanModeFromArgs,
  type CittyArgsDef
} from '../core/cli/cittyHarness.ts';
import {
  renderBanner,
  renderBoxTable,
  type TableColumn
} from '../core/unifiedTheme.ts';
import { MicroContextExtractor } from '../core/refactor/microContextExtractor.ts';
import { HybridHarnessEngine } from '../core/refactor/hybridHarness.ts';
import { applyPlanFileWithWorktreeVerification } from '../core/refactor/worktreeSandbox.ts';
import { isMainModule } from './cliUtils.ts';
import type {
  FallowDupesOutput,
  TriagedCloneCandidate,
  RefactorPlan
} from '../core/refactor/refactorContracts.ts';
import { DupesRefactorEngine, runFallowJson } from '../core/refactor/dupesRefactorEngine.ts';

function triageCandidates(projectRoot: string, minOccurrences: number): TriagedCloneCandidate[] {
  const engine = new DupesRefactorEngine({ projectRoot });
  return Array.from(engine.triageCandidates(minOccurrences));
}

interface CandidateRow {
  index: string;
  fingerprint: string;
  topology: string;
  tokens: string;
  status: string;
  files: string;
}

const MAX_COMPACT_CLONES = 15;

function handleDiscover(
  projectRoot: string,
  candidates: TriagedCloneCandidate[],
  isJson: boolean,
  isVerbose = false
): void {
  if (isJson) {
    console.log(JSON.stringify(candidates, null, 2));
    return;
  }

  if (!isVerbose) {
    if (candidates.length === 0) {
      console.log('✔ No duplicate clones found.');
      return;
    }
    console.log(`\n• Total: ${candidates.length} clone group(s) detected:`);
    for (const c of candidates.slice(0, MAX_COMPACT_CLONES)) {
      const fileNames = c.files.map((f) => path.basename(f)).join(', ');
      console.log(`  - [${c.fingerprint}] ${c.topology} (${c.tokenCount * c.occurrenceCount} tokens) -> ${fileNames}`);
    }
    if (candidates.length > MAX_COMPACT_CLONES) {
      console.log(`  ... and ${candidates.length - MAX_COMPACT_CLONES} more group(s).`);
    }
    console.log('\nNext action: npm run auditor:dupes inspect <fingerprint>\n');
    return;
  }

  console.log(
    '\n' +
      renderBanner(
        'DETERMINISTIC REFACTORING: CLONE TRIAGE',
        `Directory: ${path.basename(projectRoot)} | Total: ${candidates.length} groups`
      )
  );

  const cols: readonly TableColumn<CandidateRow>[] = [
    { header: '#', width: 3, align: 'center', key: 'index' },
    { header: 'FINGERPRINT', width: 12, align: 'center', key: 'fingerprint' },
    { header: 'TOPOLOGY', width: 15, align: 'center', key: 'topology' },
    { header: 'TOKENS', width: 8, align: 'right', key: 'tokens' },
    { header: 'STATUS', width: 12, align: 'center', key: 'status' },
    { header: 'AFFECTED FILES', width: 22, align: 'left', key: 'files' }
  ];

  const rows: CandidateRow[] = candidates.slice(0, 20).map((c, i) => {
    const statusLabel = c.isDeadCodeTarget
      ? styleText('red', 'DEAD')
      : styleText('green', 'ACTIVE');
    const fileNames = c.files.map((f) => path.basename(f)).join(', ');
    return {
      index: String(i + 1),
      fingerprint: c.fingerprint,
      topology: c.topology,
      tokens: String(c.tokenCount * c.occurrenceCount),
      status: statusLabel,
      files: fileNames.length > 20 ? fileNames.slice(0, 19) + '…' : fileNames
    };
  });

  console.log(renderBoxTable(cols, rows));
  console.log(
    styleText(
      'cyan',
      '\n[Notice] To inspect a clone and generate its Dirac micro-context:\n   npm run auditor:dupes inspect <fingerprint>\n'
    )
  );
}

function handleInspect(
  projectRoot: string,
  fp: string | undefined,
  isJson: boolean
): void {
  if (!fp) {
    console.error(styleText('red', '[Error] You must specify a fingerprint: auditor:dupes inspect <fingerprint>'));
    process.exit(1);
  }

  const dupes = runFallowJson<FallowDupesOutput>('dupes', [], projectRoot);
  const group = dupes.clone_groups.find((g) => g.fingerprint === fp || g.fingerprint === `dup:${fp}`);

  if (!group) {
    console.error(styleText('red', `[Error] Clone group not found for fingerprint: "${fp}".`));
    process.exit(1);
  }

  const extractor = new MicroContextExtractor();
  const packet = extractor.extract(projectRoot, group);

  if (isJson) {
    console.log(JSON.stringify(packet, null, 2));
    return;
  }

  console.log(
    '\n' +
      renderBanner(
        'DIRAC MICRO-CONTEXT ANCHORED BY HASH',
        `Fingerprint: ${packet.fingerprint} | Instances: ${packet.instances.length}`
      )
  );

  console.log(`  Context Reduction: ${packet.traditionalTokensEstimate.toLocaleString()} tokens → ${packet.microContextTokensEstimate.toLocaleString()} tokens (${styleText('green', packet.tokenSavingsPercent + '% savings')})`);
  console.log(`  Inferred Parameters: ${packet.candidateParameters.join(', ') || 'none'}`);
  console.log(`  Inferred Returns:    ${packet.candidateReturns.join(', ') || 'none'}\n`);

  for (const [idx, inst] of packet.instances.entries()) {
    console.log(styleText('bold', `  Instance #${idx + 1}: ${inst.file} (Lines ${inst.startLine}-${inst.endLine}) [sha256: ${inst.sha256.slice(0, 8)}...]`));
    console.log(inst.contextSnippet.split('\n').map((l) => `    │ ${l}`).join('\n') + '\n');
  }

  console.log(
    styleText(
      'cyan',
      '[Notice] Design RefactorPlan JSON and apply with:\n   npm run auditor:dupes apply --plan <plan.json> --worktree\n'
    )
  );
}

async function handleApply(
  projectRoot: string,
  rawPlanPath: string | undefined,
  useWorktree: boolean
): Promise<void> {
  await applyPlanFileWithWorktreeVerification<RefactorPlan>(
    projectRoot,
    rawPlanPath,
    useWorktree,
    (dir, plan) => HybridHarnessEngine.execute(dir, plan),
    'auditor:dupes apply <plan.json>'
  );
  console.log(styleText('green', '[OK] Refactoring successfully applied to workspace.'));
}

const REFACTOR_DUPES_ARGS = {
  ...COMMON_CLI_ARGS,
  'min-occurrences': {
    type: 'string',
    default: '2',
    description: 'Minimum number of clone occurrences to triage'
  },
  plan: {
    type: 'string',
    description: 'Path to RefactorPlan JSON file'
  },
  subcommand: {
    type: 'positional',
    required: false,
    default: 'discover',
    description: 'Subcommand to run (discover | inspect | apply | help)'
  },
  target: {
    type: 'positional',
    required: false,
    description: 'Fingerprint to inspect or plan JSON file to apply'
  },
  fingerprint: {
    type: 'string',
    description: 'Clone group fingerprint to inspect'
  },
  worktree: {
    type: 'boolean',
    default: false,
    description: 'Execute mutations in an isolated Git worktree'
  }
} as const satisfies CittyArgsDef;

const DUPES_SUBCOMMANDS: ReadonlySet<string> = new Set(['discover', 'inspect', 'apply', 'help']); // runtime-set: O(1) subcommand lookup

export async function runRefactorCli(rawInputArgs?: readonly string[]): Promise<void> {
  const rawArgs = rawInputArgs ? [...rawInputArgs] : getProcessCliArgs();
  const parsed = parseCittyArgs(REFACTOR_DUPES_ARGS, rawArgs, DUPES_SUBCOMMANDS);

  const subCommand = (parsed.subcommand as string) || 'discover';
  const targetArg =
    (parsed.target as string | undefined) ||
    (typeof parsed.fingerprint === 'string' ? parsed.fingerprint : undefined) ||
    (typeof parsed.plan === 'string' ? parsed.plan : undefined);

  if (parsed.help || subCommand === 'help') {
    console.log('Available commands: discover, inspect, apply');
    return;
  }

  if (!DUPES_SUBCOMMANDS.has(subCommand)) {
    console.log('Available commands: discover, inspect, apply');
    return;
  }

  const projectRoot = path.resolve(String(parsed.project || '.'));
  const isJson = Boolean(parsed.json);
  const isVerbose = resolveHumanModeFromArgs(parsed);

  switch (subCommand) {
    case 'discover': {
      const minOcc = parseInt(String(parsed['min-occurrences'] || '2'), 10);
      const candidates = triageCandidates(projectRoot, minOcc);
      handleDiscover(projectRoot, candidates, isJson, isVerbose);
      break;
    }

    case 'inspect': {
      const fp = targetArg || (typeof parsed.fingerprint === 'string' ? parsed.fingerprint : undefined);
      handleInspect(projectRoot, fp, isJson);
      break;
    }

    case 'apply': {
      const rawPlanPath = targetArg || (typeof parsed.plan === 'string' ? parsed.plan : undefined);
      await handleApply(projectRoot, rawPlanPath, Boolean(parsed.worktree));
      break;
    }

    default:
      console.log('Available commands: discover, inspect, apply');
      break;
  }
}

if (isMainModule(import.meta.url, ['auditor-dupes', 'refactor_dupes'])) {
  runRefactorCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

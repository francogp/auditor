/**
 * src/core/refactor/refactorCliHarness.ts
 *
 * Generic CLI execution harness for Auditor interactive refactoring tools.
 * Powered by Citty (`cittyHarness.ts`) for declarative argument parsing,
 * Dirac micro-context rendering, Box-Drawing tables, and safe Git Worktree application.
 */

import fs from 'node:fs';
import path from 'node:path';
import { styleText } from 'node:util';
import {
  renderBanner,
  renderBoxTable
} from '../unifiedTheme.ts';
import type { TableColumn } from '../unifiedTheme.ts';
import {
  COMMON_CLI_ARGS,
  defineCommand,
  getProcessCliArgs,
  parseCittyArgs,
  resolveHumanModeFromArgs,
  type ArgsDef,
  type CommandDef
} from '../cli/cittyHarness.ts';
import { scanProjectSourceFiles } from './refactorFileScanner.ts';
import { applyPlanFileWithWorktreeVerification } from './worktreeSandbox.ts';
import type { BaseRefactorEngine } from './baseRefactorEngine.ts';

export interface DiracInspectionItem {
  readonly line: number;
  readonly kind: string;
  readonly originalSnippet: string;
  readonly suggestedReplacement: string;
  readonly explanation: string;
}

export interface RefactorCliDefinition<TFinding, TPlan> {
  readonly toolName: string;
  readonly toolDescription: string;
  readonly bannerTitle: string;
  readonly bannerSubtitle: string;
  readonly scanningMessage: string;
  readonly zeroFindingsMessage: string;
  readonly tableColumns: readonly TableColumn[];
  readonly engineFactory?: (projectRoot: string) => BaseRefactorEngine<TFinding, TPlan>;
  readonly discoverInFile: (filePath: string) => readonly TFinding[];
  readonly buildTableRow: (relFile: string, fileFindings: readonly TFinding[]) => Record<string, string>;
  readonly buildSummaryMessage: (filesCount: number, allFindings: readonly TFinding[]) => string;
  readonly toDiracItem: (finding: TFinding) => DiracInspectionItem;
  readonly createPlan: (planId: string, findings: readonly TFinding[]) => TPlan;
  readonly applyPlan: (targetDir: string, plan: TPlan) => { readonly filesChanged: number; readonly changesApplied: number };
  readonly extendedHelp?: string;
}

const MAX_DISPLAY_FILE_PATH_LENGTH = 44;

const REFACTOR_SUBCOMMANDS: ReadonlySet<string> = new Set([
  'discover',
  'inspect',
  'apply',
  'help'
]); // runtime-set: O(1) subcommand lookup

const REFACTOR_HARNESS_ARGS = {
  ...COMMON_CLI_ARGS,
  subcommand: {
    type: 'positional',
    required: false,
    description: 'Subcommand to execute (discover, inspect, apply, help)',
    default: 'discover'
  },
  target: {
    type: 'positional',
    required: false,
    description: 'Target file to inspect or plan JSON to apply'
  },
  file: {
    type: 'string',
    description: 'Target file path to inspect'
  },
  plan: {
    type: 'string',
    description: 'Path to declarative refactor plan JSON'
  },
  worktree: {
    type: 'boolean',
    description: 'Execute and verify mutation inside an ephemeral Git Worktree',
    default: false
  }
} as const satisfies ArgsDef;

export function formatCliRelativeFilePath(relPath: string): string {
  if (relPath.length <= MAX_DISPLAY_FILE_PATH_LENGTH) {
    return relPath;
  }
  return `...${relPath.slice(-(MAX_DISPLAY_FILE_PATH_LENGTH - 3))}`;
}

function renderHarnessHelp<TFinding, TPlan>(def: RefactorCliDefinition<TFinding, TPlan>): void {
  console.log(renderBanner(def.bannerTitle, def.bannerSubtitle));
  const scriptAlias = def.toolName.replace(/^auditor-/, 'auditor:');
  console.log(`
Direct usage (binary in node_modules/.bin):
  ${def.toolName} discover [--project <path>] [--human]
  ${def.toolName} inspect <file> [--project <path>]
  ${def.toolName} apply <plan.json> [--worktree] [--project <path>]
  ${def.toolName} help

Usage via project npm scripts:
  npm run ${scriptAlias} discover
  npm run ${scriptAlias} inspect <file>
  npm run ${scriptAlias} apply <plan.json>
  npm run ${scriptAlias} help

[Notice] Help via npm:
   Always run: npm run ${scriptAlias} help
   Avoid using '--help' with npm (e.g. 'npm run ${scriptAlias} -- --help') because npm
   intercepts the flag and displays generic npm help instead of this tool.

[Notice] Options with dashes (--file, --project, --worktree):
   Prefix with '--' to pass through npm:
   npm run ${scriptAlias} -- --project <path>
`);
  if (def.extendedHelp) {
    console.log(def.extendedHelp);
  }
}

function handleDiscoverCommand<TFinding, TPlan>(
  def: RefactorCliDefinition<TFinding, TPlan>,
  projectRoot: string,
  engine?: BaseRefactorEngine<TFinding, TPlan>,
  isHuman: boolean = false
): void {
  const files = engine ? engine.getScannableFiles() : scanProjectSourceFiles(projectRoot);
  const tableRows: Record<string, string>[] = [];
  const allFindings: TFinding[] = [];
  const fileSummaryList: { file: string; count: number }[] = [];

  for (const file of files) {
    const fullPath = path.isAbsolute(file) ? file : path.resolve(projectRoot, file);
    const fileFindings = def.discoverInFile(fullPath);
    if (fileFindings.length > 0) {
      allFindings.push(...fileFindings);
      const relFile = path.relative(projectRoot, fullPath);
      tableRows.push(def.buildTableRow(relFile, fileFindings));
      fileSummaryList.push({ file: relFile, count: fileFindings.length });
    }
  }

  if (tableRows.length === 0) {
    if (isHuman) {
      console.log(styleText('green', `✨ ${def.zeroFindingsMessage}\n`));
    } else {
      console.log(styleText('green', '✔ No refactoring opportunities found.'));
    }
    return;
  }

  if (isHuman) {
    console.log(styleText('cyan', `🔍 ${def.scanningMessage}: ${projectRoot}...\n`));
    console.log(renderBoxTable([...def.tableColumns], tableRows));
    console.log(styleText('yellow', `\n📊 ${def.buildSummaryMessage(tableRows.length, allFindings)}\n`));
  } else {
    console.log(`🔍 ${def.toolName} discover: ${allFindings.length} opportunity(ies) across ${tableRows.length} file(s):\n`);
    for (const item of fileSummaryList) {
      console.log(`• ${item.file}: ${item.count} item(s)`);
    }
    console.log(`\nNext Action: npm run ${def.toolName} inspect <file>`);
  }
}

function handleInspectCommand<TFinding, TPlan>(
  def: RefactorCliDefinition<TFinding, TPlan>,
  projectRoot: string,
  targetFile?: string
): void {
  if (!targetFile) {
    console.error(
      styleText(
        'red',
        `[Error] You must specify a file to inspect. E.g.: ${def.toolName} inspect src/components/Modal.vue or --file <path>`
      )
    );
    process.exit(1);
  }

  const fullPath = path.isAbsolute(targetFile)
    ? path.normalize(targetFile)
    : path.resolve(projectRoot, targetFile);

  if (!fs.existsSync(fullPath)) {
    console.error(styleText('red', `[Error] File not found: ${fullPath}`));
    process.exit(1);
  }

  const findings = def.discoverInFile(fullPath);
  if (findings.length === 0) {
    console.log(
      styleText('green', `[OK] File ${targetFile} has zero findings for ${def.toolDescription}.`)
    );
    return;
  }

  console.log(
    styleText('cyan', `\n[Dirac] Micro-Context for: ${targetFile} (${findings.length} item(s)):\n`)
  );
  for (const f of findings) {
    const d = def.toDiracItem(f);
    console.log(styleText('bold', `  [Line ${d.line}] ${d.kind.toUpperCase()}`));
    console.log(`     Original:     ${styleText('red', d.originalSnippet)}`);
    console.log(`     Suggestion:   ${styleText('green', d.suggestedReplacement)}`);
    console.log(`     Explanation:  ${d.explanation}\n`);
  }

  const plan = def.createPlan(`${def.toolName}-plan-${Date.now()}`, findings);
  console.log(styleText('yellow', '[Plan] Suggested declarative plan (--plan):\n'));
  console.log(JSON.stringify(plan, null, 2));
}

async function handleApplyCommand<TFinding, TPlan>(
  def: RefactorCliDefinition<TFinding, TPlan>,
  projectRoot: string,
  planFile?: string,
  worktree: boolean = false
): Promise<void> {
  if (!planFile) {
    console.error(
      styleText(
        'red',
        `[Error] You must specify a plan file to apply. E.g.: ${def.toolName} apply plan.json or --plan <path>`
      )
    );
    process.exit(1);
  }

  await applyPlanFileWithWorktreeVerification<TPlan>(
    projectRoot,
    planFile,
    worktree,
    async (targetDir, plan) => {
      const res = def.applyPlan(targetDir, plan);
      console.log(
        styleText(
          'green',
          `[OK] Plan applied successfully: ${res.filesChanged} file(s) modified (${res.changesApplied} change(s)).`
        )
      );
    },
    `${def.toolName} apply --plan <path-to-plan.json>`
  );
}

/**
 * Creates a declarative Citty `CommandDef` for a refactoring CLI tool.
 */
export function createRefactorCli<TFinding, TPlan>(
  def: RefactorCliDefinition<TFinding, TPlan>
): CommandDef<typeof REFACTOR_HARNESS_ARGS> {
  return defineCommand({
    meta: {
      name: def.toolName,
      description: def.toolDescription
    },
    args: REFACTOR_HARNESS_ARGS,
    async run({ rawArgs }) {
      await runRefactorCliHarness(def, rawArgs);
    }
  });
}

export async function runRefactorCliHarness<TFinding, TPlan>(
  def: RefactorCliDefinition<TFinding, TPlan>,
  argv: readonly string[] = getProcessCliArgs()
): Promise<void> {
  const parsed = parseCittyArgs(REFACTOR_HARNESS_ARGS, argv, REFACTOR_SUBCOMMANDS);
  const isHuman = resolveHumanModeFromArgs(
    {
      human: Boolean(parsed.human),
      verbose: Boolean(parsed.verbose),
      format: typeof parsed.format === 'string' ? parsed.format : undefined
    },
    argv
  );

  const rawSubcommand =
    (typeof parsed.subcommand === 'string' && parsed.subcommand ? parsed.subcommand : undefined) ??
    (parsed._[0] || 'discover');
  const command = rawSubcommand;
  if (parsed.help || command === 'help') {
    renderHarnessHelp(def);
    return;
  }

  const rawProject = typeof parsed.project === 'string' && parsed.project.length > 0 ? parsed.project : '.';
  const projectRoot = path.resolve(rawProject);
  const engine = def.engineFactory?.(projectRoot);

  if (engine && !engine.isToolEnabled()) {
    console.log(
      styleText(
        'yellow',
        `\n[Warning] Tool '${engine.toolId}' is disabled in .auditor/audit.config.ts.\n`
      )
    );
    return;
  }

  switch (command) {
    case 'discover':
      handleDiscoverCommand(def, projectRoot, engine, isHuman);
      break;
    case 'inspect': {
      const targetFile =
        (typeof parsed.file === 'string' && parsed.file ? parsed.file : undefined) ??
        (typeof parsed.target === 'string' && parsed.target ? parsed.target : undefined) ??
        parsed._[1];
      handleInspectCommand(def, projectRoot, targetFile);
      break;
    }
    case 'apply': {
      const planFile =
        (typeof parsed.plan === 'string' && parsed.plan ? parsed.plan : undefined) ??
        (typeof parsed.target === 'string' && parsed.target ? parsed.target : undefined) ??
        parsed._[1];
      await handleApplyCommand(def, projectRoot, planFile, Boolean(parsed.worktree));
      break;
    }
    default:
      console.error(styleText('red', `[Error] Unknown command: ${command}`));
      process.exit(1);
  }
}

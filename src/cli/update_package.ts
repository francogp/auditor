#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/update_package.ts
 *
 * Dedicated CLI updater for @francogp/auditor across host repositories.
 * Performs a standard, hermetic npm update without ad-hoc scripts or git cloning.
 */

import fs from 'node:fs';
import path from 'node:path';
import childProcess from 'node:child_process';
import { styleText } from 'node:util';
import { isMainModule, bootstrapCliProject } from './cliUtils.ts';
import {
  COMMON_CLI_ARGS,
  getProcessCliArgs,
  parseCittyArgs,
  resolveHumanModeFromArgs,
  type CittyArgsDef
} from '../core/cli/cittyHarness.ts';
import { renderBanner, renderBoxTable, type TableColumn } from '../core/unifiedTheme.ts';
import { ensureNpmrcAllowGit } from '../core/npmrcAllowGit.ts';
import { isSelfProviderProject } from '../core/auditConfig.ts';
import { runNpmCommandSync } from '../core/npmCommandUtils.ts';
import { initAgentSkill } from './init_agent.ts';
import { safeReadFileSync, safeJsonParse, tryOrNull } from '../core/safeUtils.ts';
import { syncEnvScripts } from './sync_env_scripts.ts';
import { AUDITOR_VERSION } from '../core/version.ts';

export interface UpdateAuditorOptions {
  cwd?: string;
  silent?: boolean;
  stopAt?: string;
  targetVersion?: string;
  checkOnly?: boolean;
}

export interface UpdateAuditorResult {
  success: boolean;
  projectRoot: string;
  previousVersion: string;
  newVersion: string;
  updated: boolean;
  updateAvailable?: boolean;
  error?: string;
}

export function findHostProjectRoot(startDir: string = process.cwd(), stopAt?: string): string {
  let current = path.resolve(startDir);
  const boundary = stopAt ? path.resolve(stopAt) : undefined;
  while (true) {
    const pkgPath = path.join(current, 'package.json');
    if (fs.existsSync(pkgPath)) {
      return current;
    }
    if (boundary && current === boundary) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(startDir);
}

export function readInstalledAuditorVersion(projectRoot: string): string {
  const pkgJsonPath = path.join(projectRoot, 'node_modules/@francogp/auditor/package.json');
  if (fs.existsSync(pkgJsonPath)) {
    const raw = safeReadFileSync(pkgJsonPath);
    if (raw) {
      const content = safeJsonParse<{ version?: string }>(raw);
      return content?.version || '(unknown)';
    }
  }
  return '(not installed)';
}

export function parseTagSemver(
  tagStr: string
): { major: number; minor: number; patch: number; isClean: boolean } | null {
  const match = tagStr.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([\w.-]+))?$/);
  if (!match) return null;
  return {
    major: parseInt(match[1]!, 10),
    minor: parseInt(match[2]!, 10),
    patch: parseInt(match[3]!, 10),
    isClean: !match[4]
  };
}

export function compareTagsDescending(tagA: string, tagB: string): number {
  const semA = parseTagSemver(tagA);
  const semB = parseTagSemver(tagB);
  if (!semA && !semB) return 0;
  if (!semA) return 1;
  if (!semB) return -1;

  if (semA.major !== semB.major) return semB.major - semA.major;
  if (semA.minor !== semB.minor) return semB.minor - semA.minor;
  if (semA.patch !== semB.patch) return semB.patch - semA.patch;

  // Prefer clean release tag over pre-release or build-metadata tag
  if (semA.isClean && !semB.isClean) return -1;
  if (!semA.isClean && semB.isClean) return 1;

  return tagB.localeCompare(tagA);
}

export function extractTagsFromLsRemote(stdout: string): string[] {
  const tags = new Set<string>();
  const lines = stdout.split('\n');
  for (const line of lines) {
    const cleanLine = line.replace(/\^\{\}$/, '').trim();
    const match = cleanLine.match(/refs\/tags\/(v?\d+\.\d+\.\d+(?:-[\w.-]+)?)$/);
    if (match && match[1]) {
      const tag = match[1].startsWith('v') ? match[1] : `v${match[1]}`;
      tags.add(tag);
    }
  }
  return Array.from(tags).sort(compareTagsDescending);
}

export function resolveLatestAuditorTag(
  repoUrl = 'https://github.com/francogp/auditor.git'
): string {
  const latestTag = tryOrNull(() => {
    const stdout = childProcess.execSync(`git ls-remote --tags ${repoUrl}`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10000
    });
    const sortedTags = extractTagsFromLsRemote(stdout);
    return sortedTags.length > 0 && sortedTags[0] ? sortedTags[0] : null;
  });
  if (latestTag) {
    return latestTag;
  }
  const baseVersion = AUDITOR_VERSION.split('-')[0];
  return `v${baseVersion}`;
}

export function updateAuditorPackage(options: UpdateAuditorOptions = {}): UpdateAuditorResult {
  const projectRoot = findHostProjectRoot(options.cwd ?? process.cwd(), options.stopAt);
  const hostPkgJsonPath = path.join(projectRoot, 'package.json');

  if (!fs.existsSync(hostPkgJsonPath)) {
    return {
      success: false,
      projectRoot,
      previousVersion: '(n/a)',
      newVersion: '(n/a)',
      updated: false,
      error: `package.json not found in ${projectRoot}`
    };
  }

  let hostPkg: Record<string, unknown>;
  try {
    hostPkg = JSON.parse(fs.readFileSync(hostPkgJsonPath, 'utf-8'));
  } catch (err) {
    // catch-ok: Propagate error when parsing invalid package.json
    return {
      success: false,
      projectRoot,
      previousVersion: '(n/a)',
      newVersion: '(n/a)',
      updated: false,
      error: `Failed to read package.json: ${(err as Error).message}`
    };
  }

  const deps = (hostPkg.dependencies || {}) as Record<string, string>; // open-record: Generic parsed package.json dependencies dictionary
  const devDeps = (hostPkg.devDependencies || {}) as Record<string, string>; // open-record: Generic parsed package.json devDependencies dictionary
  const isDeclared = Boolean(devDeps['@francogp/auditor'] || deps['@francogp/auditor']);

  if (!isDeclared) {
    return {
      success: false,
      projectRoot,
      previousVersion: '(undeclared)',
      newVersion: '(undeclared)',
      updated: false,
      error: 'Package @francogp/auditor is not declared in dependencies or devDependencies.'
    };
  }

  const targetTag = options.targetVersion
    ? options.targetVersion.startsWith('v')
      ? options.targetVersion
      : `v${options.targetVersion}`
    : resolveLatestAuditorTag();

  const previousVersion = readInstalledAuditorVersion(projectRoot);

  if (options.checkOnly) {
    const cleanTarget = targetTag.replace(/^v/, '');
    const cleanPrev = previousVersion.replace(/^v/, '');
    const updateAvailable =
      previousVersion === '(not installed)' ||
      previousVersion === '(unknown)' ||
      cleanPrev !== cleanTarget;

    return {
      success: true,
      projectRoot,
      previousVersion,
      newVersion: targetTag,
      updated: false,
      updateAvailable
    };
  }

  const npmArgs = ['install', '-D', `github:francogp/auditor#${targetTag}`];
  ensureNpmrcAllowGit(projectRoot);

  if (!options.silent) {
    console.log(
      renderBanner(
        '@FRANCOGP/AUDITOR - NATIVE PACKAGE UPDATER',
        `Directory: ${projectRoot}  |  Current Version: ${previousVersion}  |  Target: ${targetTag}`
      )
    );
    console.log(
      styleText('cyan', `[Update] Running native update via npm ${npmArgs.join(' ')}...\n`)
    );
  }

  const proc = runNpmCommandSync(npmArgs, {
    cwd: projectRoot,
    stdio: options.silent ? 'pipe' : 'inherit',
    encoding: 'utf-8'
  });

  if (proc.error || proc.status !== 0) {
    const errorMsg =
      proc.error?.message ||
      proc.stderr?.toString() ||
      `npm ${npmArgs[0]} failed with exit code ${proc.status}`;
    return {
      success: false,
      projectRoot,
      previousVersion,
      newVersion: previousVersion,
      updated: false,
      error: errorMsg
    };
  }

  const newVersion = readInstalledAuditorVersion(projectRoot);
  const updated = previousVersion !== newVersion;
  const agentInitResult = initAgentSkill({ targetDir: projectRoot });
  if (!options.silent && agentInitResult.created) {
    console.log(styleText('green', `[OK] ${agentInitResult.message}\n`));
  }

  const envSyncResult = syncEnvScripts({ targetDir: projectRoot });
  if (!options.silent && envSyncResult.filesUpdated.length > 0) {
    console.log(styleText('green', `[OK] ${envSyncResult.message}\n`));
  }

  runAuditorFixAutoRemediation(projectRoot, options.silent);

  return {
    success: true,
    projectRoot,
    previousVersion,
    newVersion,
    updated
  };
}

export function runAuditorFixAutoRemediation(projectRoot: string, silent?: boolean): boolean {
  try {
    const isSelf = isSelfProviderProject(projectRoot);
    if (!silent) {
      console.log(
        styleText(
          'cyan',
          '[Fix] Running auditor fix automatically to synchronize scripts and configs...\n'
        )
      );
    }

    const hostAuditorPkg = path.join(
      projectRoot,
      'node_modules/@francogp/auditor/dist/cli/audit_full.js'
    );

    let cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    let args = ['run', 'auditor:fix'];

    if (!isSelf && fs.existsSync(hostAuditorPkg)) {
      cmd = 'node';
      args = [
        '--permission',
        '--allow-fs-read=*',
        '--allow-fs-write=*',
        '--allow-child-process',
        '--allow-addons',
        hostAuditorPkg,
        'fix'
      ];
    }

    const pkgPath = path.join(projectRoot, 'package.json');
    const pkgBefore = fs.existsSync(pkgPath) ? fs.readFileSync(pkgPath, 'utf-8') : '';

    const isWindows = process.platform === 'win32';
    const proc = childProcess.spawnSync(cmd, args, {
      cwd: projectRoot,
      stdio: silent ? 'pipe' : 'inherit',
      encoding: 'utf-8',
      shell: cmd === 'npm.cmd' && isWindows
    });

    const pkgAfter = fs.existsSync(pkgPath) ? fs.readFileSync(pkgPath, 'utf-8') : '';
    if (pkgBefore && pkgAfter && pkgBefore !== pkgAfter) {
      const npmCmd = isWindows ? 'npm.cmd' : 'npm';
      childProcess.spawnSync(npmCmd, ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
        cwd: projectRoot,
        stdio: silent ? 'pipe' : 'inherit',
        encoding: 'utf-8',
        shell: isWindows
      });
    }

    return proc.status === 0;
  } catch {
    return false;
  }
}

export function renderUpdateHelp(): string {
  return [
    renderBanner('@FRANCOGP/AUDITOR - NATIVE PACKAGE UPDATER', 'Diagnostic & Hermetic Update CLI'),
    '',
    styleText('bold', 'USAGE:'),
    '  auditor-update [targetVersion] [options]',
    '  npm run auditor:update -- [targetVersion] [options]',
    '',
    styleText('bold', 'ARGUMENTS:'),
    '  targetVersion                Optional target version or tag (e.g. 10.0.0, v10.0.0). Defaults to latest upstream tag.',
    '',
    styleText('bold', 'OPTIONS:'),
    '  -c, --check, --dry-run       Check for available updates without modifying files (read-only mode)',
    '  -s, --silent                 Suppress progress output during installation',
    '  -h, --help                   Display this help manual and exit safely',
    '  --human                      Render interactive Box-Drawing summary table',
    '',
    styleText('bold', 'READ-ONLY VERSION INSPECTION:'),
    '  To check currently installed or framework version without updating:',
    '  • npm run auditor:version',
    '  • auditor --version',
    ''
  ].join('\n');
}

const UPDATE_PACKAGE_ARGS = {
  ...COMMON_CLI_ARGS,
  check: {
    type: 'boolean',
    alias: 'c',
    default: false,
    description: 'Check for available updates without applying changes (read-only)'
  },
  dryRun: {
    type: 'boolean',
    default: false,
    description: 'Alias for --check'
  },
  silent: {
    type: 'boolean',
    alias: 's',
    default: false,
    description: 'Suppress console progress output'
  }
} as const satisfies CittyArgsDef;

const HELP_COMMAND_TOKENS: ReadonlySet<string> = new Set(['help', '--help', '-h']);

export function runCli(): void {
  const rawArgs = getProcessCliArgs();
  const parsed = parseCittyArgs(UPDATE_PACKAGE_ARGS, rawArgs);

  const rawFirstArg = parsed._.map(String)[0]?.trim();
  const isHelpRequested = Boolean(
    parsed.help || (rawFirstArg && HELP_COMMAND_TOKENS.has(rawFirstArg))
  );

  if (isHelpRequested) {
    console.log(renderUpdateHelp());
    process.exit(0);
  }

  const isCheckMode = Boolean(parsed.check || parsed.dryRun);
  const targetVersion =
    rawFirstArg && !rawFirstArg.startsWith('-') && rawFirstArg !== 'help'
      ? rawFirstArg
      : undefined;
  const silent = Boolean(parsed.silent);
  const isHuman = resolveHumanModeFromArgs(parsed);

  const result = updateAuditorPackage({
    targetVersion,
    silent,
    checkOnly: isCheckMode
  });

  if (!result.success) {
    console.error(
      styleText(
        'red',
        `\n[Error] Failed to ${isCheckMode ? 'check' : 'update'} @francogp/auditor: ${result.error}`
      )
    );
    process.exit(1);
  }

  if (isCheckMode) {
    if (!isHuman) {
      const status = result.updateAvailable ? 'UPDATE-AVAILABLE' : 'UP-TO-DATE';
      console.log(
        `[Check] Package: @francogp/auditor | Installed: ${result.previousVersion} | Latest: ${result.newVersion} | Status: ${status}`
      );
      process.exit(0);
    }

    interface CheckTableRow {
      readonly param: string;
      readonly val: string;
    }

    const columns: TableColumn<CheckTableRow>[] = [
      { header: 'PARAMETER', width: 26, render: (r: CheckTableRow) => r.param },
      { header: 'VALUE / STATUS', width: 48, render: (r: CheckTableRow) => r.val }
    ];

    const statusVal = result.updateAvailable
      ? 'UPDATE AVAILABLE'
      : 'UP TO DATE (NO ACTION REQUIRED)';

    const rows: CheckTableRow[] = [
      { param: 'Package', val: '@francogp/auditor' },
      { param: 'Installed Version', val: result.previousVersion },
      { param: 'Latest Available', val: result.newVersion },
      { param: 'Status', val: statusVal }
    ];

    console.log('\n' + renderBoxTable(columns, rows));
    if (result.updateAvailable) {
      console.log(
        styleText(
          'yellow',
          `\n[Notice] A newer version of @francogp/auditor is available (v${result.previousVersion} -> ${result.newVersion}).\n` +
            '         Run "npm run auditor:update" to upgrade.\n'
        )
      );
    } else {
      console.log(
        styleText(
          'green',
          `\n[OK] @francogp/auditor is already up to date (v${result.previousVersion}).\n`
        )
      );
    }
    process.exit(0);
  }

  if (!isHuman) {
    const status = result.updated ? 'UPDATED' : 'UP-TO-DATE';
    console.log(
      `[Update] Package: @francogp/auditor | Previous: ${result.previousVersion} | Installed: ${result.newVersion} | Status: ${status}`
    );
    process.exit(0);
  }

  interface UpdateTableRow {
    readonly param: string;
    readonly val: string;
  }

  const columns: TableColumn<UpdateTableRow>[] = [
    { header: 'PARAMETER', width: 26, render: (r: UpdateTableRow) => r.param },
    { header: 'VALUE / STATUS', width: 48, render: (r: UpdateTableRow) => r.val }
  ];

  const statusVal = result.updated
    ? 'SUCCESSFULLY UPDATED'
    : 'ALREADY UP TO DATE (NO CHANGES)';

  const rows: UpdateTableRow[] = [
    { param: 'Package', val: '@francogp/auditor' },
    { param: 'Previous Version', val: result.previousVersion },
    { param: 'Installed Version', val: result.newVersion },
    { param: 'Status', val: statusVal }
  ];

  console.log('\n' + renderBoxTable(columns, rows));
  if (result.updated) {
    console.log(
      styleText(
        'green',
        `\n[OK] @francogp/auditor was successfully updated from v${result.previousVersion} to v${result.newVersion}.\n`
      )
    );
  } else {
    console.log(
      styleText(
        'cyan',
        `\n[Notice] @francogp/auditor is already up to date (v${result.newVersion}).\n`
      )
    );
  }
  process.exit(0);
}

if (isMainModule(import.meta.url)) {
  bootstrapCliProject();
  runCli();
}

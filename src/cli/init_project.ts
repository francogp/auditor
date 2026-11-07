#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/init_project.ts
 *
 * UNIFIED DAY-0 PROJECT INITIALIZATION ENGINE (Node.js 26+ Native)
 *
 * Sets up a 100% compliant, zero-defect repository from scratch:
 *   1. Initializes Git (`git init -b main`) if not already present.
 *   2. Guarantees `package.json` with `"type": "module"` and canonical scripts.
 *   3. Scaffolds initial `src/` and `tests/` directories with working baseline files.
 *   4. Generates canonical root `AGENTS.md` with all mandatory governance contracts.
 *   5. Bootstraps `.auditor/audit.config.ts` and synchronizes all satellite configs
 *      (`tsconfig.json`, `vite.config.ts`, `.fallowrc.json`, `.stylelintrc.json`).
 *   6. Registers AI agent skills in `.agents/plugins.json`.
 *   7. Automatically runs `npm install` to keep `package-lock.json` in sync.
 *
 * Usage:
 *   npx @francogp/auditor init
 *   npm run auditor:init
 *   auditor init
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { enableCompileCache } from 'node:module';
import path from 'node:path';
import { styleText } from 'node:util';

import {
  ensureProjectBootstrapped,
  ensurePackageJsonModule,
  ensureInitialSourceAndTests
} from '../core/auditBootstrap.ts';
import {
  COMMON_CLI_ARGS,
  getProcessCliArgs,
  parseCittyArgs,
  type CittyArgsDef
} from '../core/cli/cittyHarness.ts';
import { runGit } from '../core/configRatchet.ts';
import { tryCatchSync } from '../core/safeUtils.ts';
import { repairVitePlusProject } from '../core/vitePlusConfigSync.ts';
import { CANONICAL_TSCONFIG } from '../suites/architecture/validate_tsconfig.ts';
import { createDefaultAgentsMdContent } from '../suites/documentation/validate_agents_config_mandate.ts';
import { isMainModule } from './cliUtils.ts';

enableCompileCache();

export interface InitProjectOptions {
  readonly projectRoot?: string;
  readonly install?: boolean;
  readonly quiet?: boolean;
}

export interface InitProjectResult {
  readonly gitInitialized: boolean;
  readonly packageCreated: boolean;
  readonly agentsCreated: boolean;
  readonly configBootstrapped: boolean;
  readonly tsconfigCreated: boolean;
  readonly dependenciesInstalled: boolean;
}

const INIT_CLI_ARGS: CittyArgsDef = {
  ...COMMON_CLI_ARGS,
  install: {
    type: 'boolean',
    default: true,
    description: 'Automatically run npm install to synchronize lockfile'
  },
  quiet: {
    type: 'boolean',
    default: false,
    description: 'Suppress non-essential progress output'
  }
};

export async function initProject(options: InitProjectOptions = {}): Promise<InitProjectResult> {
  const projectRoot = path.resolve(options.projectRoot ?? process.cwd());
  const quiet = Boolean(options.quiet);

  let gitInitialized = false;
  let packageCreated = false;
  let agentsCreated = false;
  let tsconfigCreated = false;
  let dependenciesInstalled = false;

  // 1. Git Initialization
  const gitDir = path.resolve(projectRoot, '.git');
  if (!fs.existsSync(gitDir)) {
    const res = runGit(projectRoot, ['init', '-b', 'main']);
    if (res.ok) {
      gitInitialized = true;
    }
  }

  // 2. Package.json Initialization
  const pkgPath = path.resolve(projectRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    const defaultPkg = {
      name: path
        .basename(projectRoot)
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '-'),
      version: '0.0.0',
      type: 'module',
      private: true,
      scripts: {
        dev: 'vp dev',
        build: 'npm run auditor:full && vp build && npm run auditor:post-build',
        'build:deploy': 'auditor-build-deploy',
        test: 'vp test',
        auditor: 'auditor',
        'auditor:fix': 'auditor fix',
        'auditor:setup': 'auditor phase=setup',
        'auditor:lint': 'auditor speed=light',
        'auditor:full': 'auditor speed=full',
        'auditor:post-build': 'auditor-post-build',
        check: 'npm run auditor:lint',
        'check:fix': 'auditor speed=light fix',
        fmt: 'vp fmt',
        'fmt:check': 'vp fmt --check'
      },
      devDependencies: {
        '@francogp/auditor': '^10.8.1',
        'vite-plus': '^1.5.0'
      }
    };
    fs.writeFileSync(pkgPath, JSON.stringify(defaultPkg, null, 2) + '\n', 'utf-8');
    packageCreated = true;
  } else {
    ensurePackageJsonModule(projectRoot);
  }

  // 3. Source & Tests Scaffolding
  ensureInitialSourceAndTests(projectRoot);

  // 4. Root AGENTS.md
  const agentsPath = path.resolve(projectRoot, 'AGENTS.md');
  if (!fs.existsSync(agentsPath)) {
    const agentsContent = createDefaultAgentsMdContent('en', 'es');
    fs.writeFileSync(agentsPath, agentsContent, 'utf-8');
    agentsCreated = true;
  }

  // 5. TSConfig Baseline
  const tsconfigPath = path.resolve(projectRoot, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) {
    fs.writeFileSync(tsconfigPath, JSON.stringify(CANONICAL_TSCONFIG, null, 2) + '\n', 'utf-8');
    tsconfigCreated = true;
  }

  // 6. Auditor Bootstrap & Vite+ Sync
  const bootstrapRes = await ensureProjectBootstrapped({ projectRoot, force: true });
  repairVitePlusProject(projectRoot);

  // 7. Dependencies & Lockfile Synchronization
  if (options.install !== false) {
    const lockfilePath = path.resolve(projectRoot, 'package-lock.json');
    const nodeModulesPath = path.resolve(projectRoot, 'node_modules');
    const needsInstall = !fs.existsSync(lockfilePath) || !fs.existsSync(nodeModulesPath);

    if (needsInstall && !process.env.CI) {
      tryCatchSync(() => {
        execSync('npm install --prefer-offline --no-audit', {
          cwd: projectRoot,
          stdio: quiet ? 'ignore' : 'inherit'
        });
        dependenciesInstalled = true;
      });
    }
  }

  if (!quiet) {
    console.log(
      styleText(
        'green',
        `\n✨ Project successfully initialized with @francogp/auditor standards!\n`
      )
    );
    console.log(styleText('cyan', `   📁 Location:         `) + styleText('bold', projectRoot));
    console.log(
      styleText('cyan', `   📦 Package:          `) +
        (packageCreated ? styleText('green', 'Created (ESM)') : styleText('dim', 'Verified (ESM)'))
    );
    console.log(
      styleText('cyan', `   📜 AGENTS.md:        `) +
        (agentsCreated ? styleText('green', 'Created (9 Mandates)') : styleText('dim', 'Present'))
    );
    console.log(
      styleText('cyan', `   📘 TSConfig:         `) +
        (tsconfigCreated ? styleText('green', 'Created (Strict)') : styleText('dim', 'Present'))
    );
    console.log(
      styleText('cyan', `   🔧 Auditor Config:   `) +
        (bootstrapRes.configCreated
          ? styleText('green', 'Created (.auditor/audit.config.ts)')
          : styleText('dim', 'Synchronized'))
    );
    console.log(
      styleText('dim', `\nNext step: Run `) +
        styleText('bold', 'npm run auditor:setup') +
        styleText('dim', ' or ') +
        styleText('bold', 'npm run auditor:lint') +
        styleText('dim', ' to verify quality gates.\n')
    );
  }

  return {
    gitInitialized,
    packageCreated,
    agentsCreated,
    configBootstrapped: bootstrapRes.configCreated,
    tsconfigCreated,
    dependenciesInstalled
  };
}

// ─── CLI Entrypoint ──────────────────────────────────────────────────────────
if (isMainModule(import.meta.url)) {
  const argv = getProcessCliArgs();
  const parsed = parseCittyArgs(INIT_CLI_ARGS, argv);
  const targetDir = parsed.project ? String(parsed.project) : process.cwd();

  await initProject({
    projectRoot: targetDir,
    install: parsed.install !== false,
    quiet: Boolean(parsed.quiet)
  });
}

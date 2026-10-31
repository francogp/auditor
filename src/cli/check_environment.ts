#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/check_environment.ts
 *
 * SSoT Environment Engine Validator (Node.js 26+ Native)
 * Enforces Node.js and npm version invariants dynamically derived from package.json
 * without hardcoded versions.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getProcessCliArgs,
  parseCittyArgs,
  COMMON_CLI_ARGS,
  type CittyArgsDef
} from '../core/cli/cittyHarness.ts';
import { safeReadFileSync, safeJsonParse } from '../core/safeUtils.ts';
import { isMainModule } from './cliUtils.ts';
import { runSetup } from './setup_env.ts';

const CHECK_ENV_ARGS = {
  ...COMMON_CLI_ARGS,
  mode: {
    type: 'positional',
    required: false,
    description: 'Execution mode (e.g. preinstall)'
  },
  preinstall: {
    type: 'boolean',
    default: false,
    description: 'Invoked during npm preinstall lifecycle hook'
  }
} as const satisfies CittyArgsDef;

export interface SemverVersion {
  major: number;
  minor: number;
  patch: number;
}

export function parseSemver(v: string): SemverVersion {
  const clean = v.replace(/[^0-9.]/g, '');
  const parts = clean.split('.').map((n) => parseInt(n, 10) || 0);
  return {
    major: parts[0] ?? 0,
    minor: parts[1] ?? 0,
    patch: parts[2] ?? 0
  };
}

export function compareVersions(current: SemverVersion, required: SemverVersion): boolean {
  if (current.major > required.major) return true;
  if (current.major < required.major) return false;
  if (current.minor > required.minor) return true;
  if (current.minor < required.minor) return false;
  return current.patch >= required.patch;
}

export interface AuditorEngineSpecs {
  readonly node: string;
  readonly npm: string;
}

export function getAuditorEngines(): AuditorEngineSpecs {
  const currentFilePath = fileURLToPath(import.meta.url);
  let dir = path.dirname(currentFilePath);
  const auditorPackageJsonPath = path.resolve(dir, '../../package.json');

  if (fs.existsSync(auditorPackageJsonPath)) {
    const data = JSON.parse(fs.readFileSync(auditorPackageJsonPath, 'utf8')) as {
      engines?: { node?: string; npm?: string };
    };
    if (data.engines?.node && data.engines?.npm) {
      return { node: data.engines.node, npm: data.engines.npm };
    }
  }

  // Walk up in case of alternative directory structures or packaging
  while (dir !== path.dirname(dir)) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate)) {
      const raw = safeReadFileSync(candidate);
      if (raw) {
        const data = safeJsonParse<{
          name?: string;
          engines?: { node?: string; npm?: string };
        }>(raw);
        if (data?.name === '@francogp/auditor' && data.engines?.node && data.engines?.npm) {
          return { node: data.engines.node, npm: data.engines.npm };
        }
      }
    }
    dir = path.dirname(dir);
  }

  throw new Error(
    `[getAuditorEngines] Could not determine @francogp/auditor engine requirements from package.json (${auditorPackageJsonPath}). Hardcoded fallbacks are strictly prohibited.`
  );
}

interface HostPackageJson {
  name?: string;
  engines?: { node?: string; npm?: string };
}

function validateHostEnginesDeclaration(
  hostPkg: HostPackageJson,
  projectName: string,
  verbose: boolean = true
): boolean {
  if (!hostPkg.engines?.node || !hostPkg.engines?.npm) {
    if (verbose) {
      console.error(`\n\x1b[31m\x1b[1m❌ ENVIRONMENT ERROR IN ${projectName}:\x1b[0m`);
      console.error(
        'The package.json file must explicitly declare "engines.node" and "engines.npm".'
      );
    }
    return false;
  }

  const hostNodeReq = parseSemver(hostPkg.engines.node);
  const hostNpmReq = parseSemver(hostPkg.engines.npm);

  const auditorEngines = getAuditorEngines();
  const auditorNodeReq = parseSemver(auditorEngines.node);
  const auditorNpmReq = parseSemver(auditorEngines.npm);

  const isHostNodeEngineAdequate = compareVersions(hostNodeReq, auditorNodeReq);
  const isHostNpmEngineAdequate = compareVersions(hostNpmReq, auditorNpmReq);

  if (!isHostNodeEngineAdequate || !isHostNpmEngineAdequate) {
    if (verbose) {
      console.error(`\n\x1b[31m\x1b[1m❌ ENVIRONMENT ERROR IN ${projectName}:\x1b[0m`);
      console.error(
        'The Node.js or npm versions declared in package.json are LOWER than those required by @francogp/auditor:'
      );
      console.error(
        `  - Auditor Requirement: Node ${auditorEngines.node} | npm ${auditorEngines.npm}`
      );
      console.error(
        `  - Declared in Host:    Node ${hostPkg.engines.node} | npm ${hostPkg.engines.npm}`
      );
      console.error(
        '\nUpdate "engines.node" and "engines.npm" in package.json to meet or exceed the auditor baseline.'
      );
    }
    return false;
  }

  return true;
}

function printEnvironmentRemediation(nodeReq: string, npmReq: string, npmDetected: string): void {
  const isWindows = process.platform === 'win32';
  const targetNodeVer = nodeReq.replace(/[^0-9.]/g, '');

  console.error(`Requirement configured in package.json ("engines"):`);
  console.error(`  - Node.js: \x1b[33m${nodeReq}\x1b[0m (Detected: v${process.versions.node})`);
  console.error(`  - npm:     \x1b[33m${npmReq}\x1b[0m (Detected: v${npmDetected})\n`);

  console.error('\x1b[32m\x1b[1m💡 HOW TO RESOLVE WITHOUT AFFECTING OTHER PROJECTS:\x1b[0m');
  console.error('Run the project setup script to activate the isolated environment:');
  if (isWindows) {
    console.error('  .\\setup-windows.ps1');
    console.error('  (or run: vp env use ' + targetNodeVer + ')');
  } else {
    console.error('  ./setup-linux.sh');
    console.error('  (or run: vp env use ' + targetNodeVer + ')');
  }
  console.error(
    '\nℹ️  Multi-project isolation: The project reads .node-version locally without altering your other projects.\n'
  );
}

function validateRuntimeEnvironment(
  hostPkg: HostPackageJson,
  projectName: string,
  verbose: boolean = true
): boolean {
  if (!hostPkg.engines?.node || !hostPkg.engines?.npm) return false;

  const hostNodeReq = parseSemver(hostPkg.engines.node);
  const hostNpmReq = parseSemver(hostPkg.engines.npm);

  const currentNode = parseSemver(process.versions.node);
  const npmUserAgent = process.env.npm_config_user_agent || '';
  const npmMatch = npmUserAgent.match(/npm\/([0-9.]+)/);
  const currentNpm = parseSemver(npmMatch ? npmMatch[1]! : '0.0.0');

  const isCurrentNodeValid = compareVersions(currentNode, hostNodeReq);
  const isCurrentNpmValid = currentNpm.major === 0 || compareVersions(currentNpm, hostNpmReq);

  if (!isCurrentNodeValid || !isCurrentNpmValid) {
    if (verbose) {
      console.error(`\n\x1b[31m\x1b[1m❌ ENVIRONMENT ERROR IN ${projectName}:\x1b[0m`);
      printEnvironmentRemediation(
        hostPkg.engines.node,
        hostPkg.engines.npm,
        npmMatch ? npmMatch[1]! : 'unknown'
      );
    }
    return false;
  }

  return true;
}

export function checkEnvironment(
  targetDir: string = process.cwd(),
  autoRemediate: boolean = true
): boolean {
  const parsed = parseCittyArgs(CHECK_ENV_ARGS, getProcessCliArgs());
  const hostPkgPath = path.resolve(targetDir, 'package.json');
  if (!fs.existsSync(hostPkgPath)) {
    console.error(`[check_environment] package.json not found in ${targetDir}`);
    return false;
  }

  const hostPkg = JSON.parse(fs.readFileSync(hostPkgPath, 'utf8')) as HostPackageJson;
  const projectName = hostPkg.name || path.basename(targetDir);

  const isDeclaredValid = validateHostEnginesDeclaration(hostPkg, projectName, false);
  const isRuntimeValid = isDeclaredValid && validateRuntimeEnvironment(hostPkg, projectName, false);

  if (isDeclaredValid && isRuntimeValid) {
    return true;
  }

  // Automatic remediation executing setup script if available in the host project
  const isWindows = process.platform === 'win32';
  const setupScriptName = isWindows ? 'setup-windows.ps1' : 'setup-linux.sh';
  const setupScriptPath = path.resolve(targetDir, setupScriptName);
  const isPreinstallHook =
    process.env.npm_lifecycle_event === 'preinstall' ||
    Boolean(parsed.preinstall) ||
    parsed.mode === 'preinstall';

  if (autoRemediate && !isPreinstallHook && fs.existsSync(setupScriptPath)) {
    console.log(
      `\n\x1b[36m\x1b[1m🔄 Environment drift detected in ${projectName}. Automatically running ${setupScriptName} to synchronize environment...\x1b[0m\n`
    );
    const setupStatus = runSetup([], targetDir);
    if (setupStatus === 0) {
      const refreshedPkg = JSON.parse(fs.readFileSync(hostPkgPath, 'utf8')) as HostPackageJson;
      const refreshedDeclared = validateHostEnginesDeclaration(refreshedPkg, projectName, false);
      const refreshedRuntime =
        refreshedDeclared && validateRuntimeEnvironment(refreshedPkg, projectName, false);
      if (refreshedDeclared && refreshedRuntime) {
        console.log(
          `\n\x1b[32m\x1b[1m✅ Auto-remediation completed successfully. The ${projectName} environment has been updated and synchronized.\x1b[0m\n`
        );
        return true;
      }
    }
  }

  if (!validateHostEnginesDeclaration(hostPkg, projectName, true)) {
    return false;
  }

  return validateRuntimeEnvironment(hostPkg, projectName, true);
}

// Direct execution when invoked as CLI / preinstall
if (isMainModule(import.meta.url)) {
  const success = checkEnvironment();
  if (!success) {
    process.exit(1);
  }
}

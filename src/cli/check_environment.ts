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
import { isMainModule } from './cliUtils.ts';

export interface SemverVersion {
  major: number;
  minor: number;
  patch: number;
}

export function parseSemver(v: string): SemverVersion {
  const clean = v.replace(/[^0-9.]/g, '');
  const parts = clean.split('.').map(n => parseInt(n, 10) || 0);
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

export function getAuditorEngines(): { node: string; npm: string } {
  const currentFilePath = fileURLToPath(import.meta.url);
  const auditorPackageJsonPath = path.resolve(path.dirname(currentFilePath), '../../package.json');
  if (fs.existsSync(auditorPackageJsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(auditorPackageJsonPath, 'utf8')) as { engines?: { node?: string; npm?: string } };
      if (data.engines?.node && data.engines?.npm) {
        return { node: data.engines.node, npm: data.engines.npm };
      }
    } catch {
      // catch-ok: Fallback below
    }
  }
  return { node: '>=26.10.0', npm: '>=12.0.0' };
}

interface HostPackageJson {
  name?: string;
  engines?: { node?: string; npm?: string };
}

function validateHostEnginesDeclaration(hostPkg: HostPackageJson, projectName: string): boolean {
  if (!hostPkg.engines?.node || !hostPkg.engines?.npm) {
    console.error(`\n\x1b[31m\x1b[1m❌ ERROR DE ENTORNO EN ${projectName}:\x1b[0m`);
    console.error('El archivo package.json debe declarar explícitamente "engines.node" y "engines.npm".');
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
    console.error(`\n\x1b[31m\x1b[1m❌ ERROR DE ENTORNO EN ${projectName}:\x1b[0m`);
    console.error('Las versiones de Node.js o npm declaradas en package.json son INFERIORES a las requeridas por @francogp/auditor:');
    console.error(`  - Requisito del Auditor: Node ${auditorEngines.node} | npm ${auditorEngines.npm}`);
    console.error(`  - Declarado en Host:     Node ${hostPkg.engines.node} | npm ${hostPkg.engines.npm}`);
    console.error('\nActualiza "engines.node" y "engines.npm" en package.json para satisfacer o superar el piso del auditor.');
    return false;
  }

  return true;
}

function printEnvironmentRemediation(nodeReq: string, npmReq: string, npmDetected: string): void {
  const isWindows = process.platform === 'win32';
  const targetNodeVer = nodeReq.replace(/[^0-9.]/g, '');

  console.error(`Requisito configurado en package.json ("engines"):`);
  console.error(`  - Node.js: \x1b[33m${nodeReq}\x1b[0m (Detectado: v${process.versions.node})`);
  console.error(`  - npm:     \x1b[33m${npmReq}\x1b[0m (Detectado: v${npmDetected})\n`);

  console.error('\x1b[32m\x1b[1m💡 CÓMO SOLUCIONARLO SIN AFECTAR OTROS PROYECTOS:\x1b[0m');
  console.error('Ejecuta el script de setup del proyecto para activar el entorno de forma aislada:');
  if (isWindows) {
    console.error('  .\\setup-windows.ps1');
    console.error('  (o ejecuta: nvm install ' + targetNodeVer + ' && nvm use ' + targetNodeVer + ')');
  } else {
    console.error('  ./setup-linux.sh');
    console.error('  (o ejecuta: nvm install ' + targetNodeVer + ' && nvm use)');
  }
  console.error('\nℹ️  Convivencia multi-proyecto: El proyecto lee .nvmrc localmente sin alterar tu alias default de NVM ni tus otros proyectos.\n');
}

function validateRuntimeEnvironment(hostPkg: HostPackageJson, projectName: string): boolean {
  const hostNodeReq = parseSemver(hostPkg.engines!.node!);
  const hostNpmReq = parseSemver(hostPkg.engines!.npm!);

  const currentNode = parseSemver(process.versions.node);
  const npmUserAgent = process.env.npm_config_user_agent || '';
  const npmMatch = npmUserAgent.match(/npm\/([0-9.]+)/);
  const currentNpm = parseSemver(npmMatch ? npmMatch[1]! : '0.0.0');

  const isCurrentNodeValid = compareVersions(currentNode, hostNodeReq);
  const isCurrentNpmValid = currentNpm.major === 0 || compareVersions(currentNpm, hostNpmReq);

  if (!isCurrentNodeValid || !isCurrentNpmValid) {
    console.error(`\n\x1b[31m\x1b[1m❌ ERROR DE ENTORNO EN ${projectName}:\x1b[0m`);
    printEnvironmentRemediation(hostPkg.engines!.node!, hostPkg.engines!.npm!, npmMatch ? npmMatch[1]! : 'desconocido');
    return false;
  }

  return true;
}

export function checkEnvironment(targetDir: string = process.cwd()): boolean {
  const hostPkgPath = path.resolve(targetDir, 'package.json');
  if (!fs.existsSync(hostPkgPath)) {
    console.error(`[check_environment] package.json not found in ${targetDir}`);
    return false;
  }

  const hostPkg = JSON.parse(fs.readFileSync(hostPkgPath, 'utf8')) as HostPackageJson;
  const projectName = hostPkg.name || path.basename(targetDir);

  if (!validateHostEnginesDeclaration(hostPkg, projectName)) {
    return false;
  }

  return validateRuntimeEnvironment(hostPkg, projectName);
}


// Ejecución directa si se invoca como CLI / preinstall
if (isMainModule(import.meta.url)) {
  const success = checkEnvironment();
  if (!success) {
    process.exit(1);
  }
}

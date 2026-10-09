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
import { runSetup } from './setup_env.ts';

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
  let dir = path.dirname(currentFilePath);
  const auditorPackageJsonPath = path.resolve(dir, '../../package.json');

  if (fs.existsSync(auditorPackageJsonPath)) {
    const data = JSON.parse(fs.readFileSync(auditorPackageJsonPath, 'utf8')) as { engines?: { node?: string; npm?: string } };
    if (data.engines?.node && data.engines?.npm) {
      return { node: data.engines.node, npm: data.engines.npm };
    }
  }

  // Walk up in case of alternative directory structures or packaging
  while (dir !== path.dirname(dir)) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate)) {
      try {
        const data = JSON.parse(fs.readFileSync(candidate, 'utf8')) as {
          name?: string;
          engines?: { node?: string; npm?: string };
        };
        if (data.name === '@francogp/auditor' && data.engines?.node && data.engines?.npm) {
          return { node: data.engines.node, npm: data.engines.npm };
        }
      } catch {
        // catch-ok: continue search
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

function validateHostEnginesDeclaration(hostPkg: HostPackageJson, projectName: string, verbose: boolean = true): boolean {
  if (!hostPkg.engines?.node || !hostPkg.engines?.npm) {
    if (verbose) {
      console.error(`\n\x1b[31m\x1b[1m❌ ERROR DE ENTORNO EN ${projectName}:\x1b[0m`);
      console.error('El archivo package.json debe declarar explícitamente "engines.node" y "engines.npm".');
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
      console.error(`\n\x1b[31m\x1b[1m❌ ERROR DE ENTORNO EN ${projectName}:\x1b[0m`);
      console.error('Las versiones de Node.js o npm declaradas en package.json son INFERIORES a las requeridas por @francogp/auditor:');
      console.error(`  - Requisito del Auditor: Node ${auditorEngines.node} | npm ${auditorEngines.npm}`);
      console.error(`  - Declarado en Host:     Node ${hostPkg.engines.node} | npm ${hostPkg.engines.npm}`);
      console.error('\nActualiza "engines.node" y "engines.npm" en package.json para satisfacer o superar el piso del auditor.');
    }
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

function validateRuntimeEnvironment(hostPkg: HostPackageJson, projectName: string, verbose: boolean = true): boolean {
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
      console.error(`\n\x1b[31m\x1b[1m❌ ERROR DE ENTORNO EN ${projectName}:\x1b[0m`);
      printEnvironmentRemediation(hostPkg.engines.node, hostPkg.engines.npm, npmMatch ? npmMatch[1]! : 'desconocido');
    }
    return false;
  }

  return true;
}

export function checkEnvironment(targetDir: string = process.cwd(), autoRemediate: boolean = true): boolean {
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

  // Auto-remediación automática ejecutando el script de setup si está disponible en el proyecto
  const isWindows = process.platform === 'win32';
  const setupScriptName = isWindows ? 'setup-windows.ps1' : 'setup-linux.sh';
  const setupScriptPath = path.resolve(targetDir, setupScriptName);
  const isPreinstallHook = process.env.npm_lifecycle_event === 'preinstall' || process.argv.includes('preinstall');

  if (autoRemediate && !isPreinstallHook && fs.existsSync(setupScriptPath)) {
    console.log(`\n\x1b[36m\x1b[1m🔄 Desalineación de entorno detectada en ${projectName}. Ejecutando automáticamente ${setupScriptName} para sincronizar el entorno...\x1b[0m\n`);
    const setupStatus = runSetup([], targetDir);
    if (setupStatus === 0) {
      const refreshedPkg = JSON.parse(fs.readFileSync(hostPkgPath, 'utf8')) as HostPackageJson;
      const refreshedDeclared = validateHostEnginesDeclaration(refreshedPkg, projectName, false);
      const refreshedRuntime = refreshedDeclared && validateRuntimeEnvironment(refreshedPkg, projectName, false);
      if (refreshedDeclared && refreshedRuntime) {
        console.log(`\n\x1b[32m\x1b[1m✅ Auto-remediación completada con éxito. El entorno de ${projectName} ha sido actualizado y sincronizado.\x1b[0m\n`);
        return true;
      }
    }
  }

  if (!validateHostEnginesDeclaration(hostPkg, projectName, true)) {
    return false;
  }

  return validateRuntimeEnvironment(hostPkg, projectName, true);
}


// Ejecución directa si se invoca como CLI / preinstall
if (isMainModule(import.meta.url)) {
  const success = checkEnvironment();
  if (!success) {
    process.exit(1);
  }
}

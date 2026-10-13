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
import { isMainModule, bootstrapCliProject } from "./cliUtils.js";
import { renderBanner, renderBoxTable } from "../core/unifiedTheme.js";
import { isSelfProviderProject } from "../core/auditConfig.js";
import { initAgentSkill } from "./init_agent.js";
import { syncEnvScripts } from "./sync_env_scripts.js";
export function findHostProjectRoot(startDir = process.cwd(), stopAt) {
    let current = path.resolve(startDir);
    const boundary = stopAt ? path.resolve(stopAt) : undefined;
    while (true) {
        const pkgPath = path.join(current, 'package.json');
        if (fs.existsSync(pkgPath)) {
            return current;
        }
        if (boundary && current === boundary)
            break;
        const parent = path.dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    return path.resolve(startDir);
}
export function readInstalledAuditorVersion(projectRoot) {
    try {
        const pkgJsonPath = path.join(projectRoot, 'node_modules/@francogp/auditor/package.json');
        if (fs.existsSync(pkgJsonPath)) {
            const content = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
            return content.version || '(desconocida)';
        }
    }
    catch {
        // catch-ok: Fallback when package.json is missing or unreadable
    }
    return '(no instalada)';
}
export function updateAuditorPackage(options = {}) {
    const projectRoot = findHostProjectRoot(options.cwd ?? process.cwd(), options.stopAt);
    const hostPkgJsonPath = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(hostPkgJsonPath)) {
        return {
            success: false,
            projectRoot,
            previousVersion: '(no disponible)',
            newVersion: '(no disponible)',
            updated: false,
            error: `No se encontró package.json en ${projectRoot}`
        };
    }
    let hostPkg;
    try {
        hostPkg = JSON.parse(fs.readFileSync(hostPkgJsonPath, 'utf-8'));
    }
    catch (err) {
        // catch-ok: Propagate error when parsing invalid package.json
        return {
            success: false,
            projectRoot,
            previousVersion: '(no disponible)',
            newVersion: '(no disponible)',
            updated: false,
            error: `Error al leer package.json: ${err.message}`
        };
    }
    const deps = (hostPkg.dependencies || {}); // open-record: Generic parsed package.json dependencies dictionary
    const devDeps = (hostPkg.devDependencies || {}); // open-record: Generic parsed package.json devDependencies dictionary
    const isDeclared = Boolean(devDeps['@francogp/auditor'] || deps['@francogp/auditor']);
    if (!isDeclared) {
        return {
            success: false,
            projectRoot,
            previousVersion: '(no declarada)',
            newVersion: '(no declarada)',
            updated: false,
            error: 'El paquete @francogp/auditor no está declarado en dependencies ni devDependencies.'
        };
    }
    const npmArgs = ['install', '-D', 'github:francogp/auditor'];
    const previousVersion = readInstalledAuditorVersion(projectRoot);
    if (!options.silent) {
        console.log(renderBanner('@FRANCOGP/AUDITOR - ACTUALIZADOR NATIVO DE PAQUETE', `Directorio: ${projectRoot}  |  Versión Actual: ${previousVersion}`));
        console.log(styleText('cyan', `📦 Ejecutando actualización nativa vía npm ${npmArgs.join(' ')}...\n`));
    }
    const isWindows = process.platform === 'win32';
    const npmBinary = isWindows ? 'npm.cmd' : 'npm';
    const proc = childProcess.spawnSync(npmBinary, npmArgs, {
        cwd: projectRoot,
        stdio: options.silent ? 'pipe' : 'inherit',
        encoding: 'utf-8',
        shell: isWindows
    });
    if (proc.error || proc.status !== 0) {
        const errorMsg = proc.error?.message || proc.stderr?.toString() || `npm ${npmArgs[0]} falló con código de salida ${proc.status}`;
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
        console.log(styleText('green', `🤖 ${agentInitResult.message}\n`));
    }
    const envSyncResult = syncEnvScripts({ targetDir: projectRoot });
    if (!options.silent && envSyncResult.filesUpdated.length > 0) {
        console.log(styleText('green', `📜 ${envSyncResult.message}\n`));
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
export function runAuditorFixAutoRemediation(projectRoot, silent) {
    try {
        const isSelf = isSelfProviderProject(projectRoot);
        if (!silent) {
            console.log(styleText('cyan', '🛠️ Ejecutando auditor fix automáticamente para sincronizar scripts y configuraciones...\n'));
        }
        const hostAuditorPkg = path.join(projectRoot, 'node_modules/@francogp/auditor/dist/cli/audit_full.js');
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
        const isWindows = process.platform === 'win32';
        const proc = childProcess.spawnSync(cmd, args, {
            cwd: projectRoot,
            stdio: silent ? 'pipe' : 'inherit',
            encoding: 'utf-8',
            shell: cmd === 'npm.cmd' && isWindows
        });
        return proc.status === 0;
    }
    catch {
        return false;
    }
}
export function runCli() {
    const result = updateAuditorPackage();
    if (!result.success) {
        console.error(styleText('red', `\n❌ Falló la actualización de @francogp/auditor: ${result.error}`));
        process.exit(1);
    }
    const columns = [
        { header: 'PARÁMETRO', width: 26, render: (r) => r.param },
        { header: 'VALOR / ESTADO', width: 48, render: (r) => r.val }
    ];
    const statusVal = result.updated
        ? 'ACTUALIZADO EXITOSAMENTE ✅'
        : 'YA EN LA ÚLTIMA VERSIÓN (SIN CAMBIOS) ℹ️';
    const rows = [
        { param: 'Paquete', val: '@francogp/auditor' },
        { param: 'Versión Anterior', val: result.previousVersion },
        { param: 'Versión Instalada', val: result.newVersion },
        { param: 'Estado', val: statusVal }
    ];
    console.log('\n' + renderBoxTable(columns, rows));
    if (result.updated) {
        console.log(styleText('green', `\n✔ @francogp/auditor se actualizó correctamente de v${result.previousVersion} a v${result.newVersion}.\n`));
    }
    else {
        console.log(styleText('cyan', `\nℹ @francogp/auditor ya se encuentra en la última versión disponible (v${result.newVersion}).\n`));
    }
    process.exit(0);
}
if (isMainModule(import.meta.url)) {
    bootstrapCliProject();
    runCli();
}
//# sourceMappingURL=update_package.js.map
#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/sync_env_scripts.ts
 *
 * Environment Scripts Synchronizer (Node.js 26+ Native)
 * Synchronizes the canonical setup-linux.sh and setup-windows.ps1 from @francogp/auditor
 * into the host project root, ensuring zero code divergence.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMainModule } from "./cliUtils.js";
function syncCanonicalScriptFile(file, packageRootDir, targetDir, dryRun) {
    const srcPath = path.join(packageRootDir, file);
    const destPath = path.join(targetDir, file);
    if (!fs.existsSync(srcPath))
        return false;
    if (!dryRun) {
        fs.copyFileSync(srcPath, destPath);
        if (file.endsWith('.sh')) {
            try {
                fs.chmodSync(destPath, 0o755);
            }
            catch {
                // catch-ok: Ignore chmod failures on non-POSIX
            }
        }
    }
    return true;
}
function ensurePluginsDirectory(targetDir, dryRun) {
    const pluginsDir = path.join(targetDir, 'scripts/setup/plugins');
    if (fs.existsSync(pluginsDir) || dryRun)
        return;
    fs.mkdirSync(pluginsDir, { recursive: true });
    fs.writeFileSync(path.join(pluginsDir, '.gitkeep'), '', 'utf8');
    const sampleSh = `#!/usr/bin/env bash
# Plugin de inicialización específico de proyecto (Linux/macOS)
# Coloca aquí tus tareas post-instalación específicas (ej. copiar plantillas, configurar BD)
# echo "Ejecutando plugin de configuración local..."
`;
    const samplePs1 = `# Plugin de inicialización específico de proyecto (Windows)
# Coloca aquí tus tareas post-instalación específicas (ej. copiar plantillas, configurar BD)
# Write-Host "Ejecutando plugin de configuracion local..." -ForegroundColor Cyan
`;
    fs.writeFileSync(path.join(pluginsDir, '01_sample.sh.sample'), sampleSh, 'utf8');
    fs.writeFileSync(path.join(pluginsDir, '01_sample.ps1.sample'), samplePs1, 'utf8');
}
export function syncEnvScripts(options = {}) {
    const targetDir = path.resolve(options.targetDir || process.cwd());
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const packageRootDir = path.resolve(currentDir, '../../');
    const filesToSync = [
        'setup-linux.sh',
        'setup-windows.ps1'
    ];
    const filesUpdated = []; // no-domain: Non-domain utility collection or data structure
    for (const file of filesToSync) {
        if (syncCanonicalScriptFile(file, packageRootDir, targetDir, options.dryRun)) {
            filesUpdated.push(file);
        }
    }
    ensurePluginsDirectory(targetDir, options.dryRun);
    return {
        success: true,
        filesUpdated,
        message: `Sincronizados scripts de entorno canónicos en ${targetDir}`
    };
}
// CLI entrypoint
if (isMainModule(import.meta.url)) {
    const isDryRun = process.argv.includes('--dry-run');
    console.log('\n┌────────────────────────────────────────────────────────┐');
    console.log('│  🔄 Sincronizador de Scripts de Entorno (@francogp/auditor) │');
    console.log('└────────────────────────────────────────────────────────┘\n');
    const result = syncEnvScripts({ dryRun: isDryRun });
    if (result.success) {
        console.log(`✅ ${result.message}`);
        for (const f of result.filesUpdated) {
            console.log(`  - ${f}`);
        }
        console.log('\nEstructura de plugins inicializada en scripts/setup/plugins/');
        console.log('Cero divergencia con el estándar oficial de @francogp/auditor.\n');
    }
    else {
        console.error(`❌ Error al sincronizar: ${result.message}`);
        process.exit(1);
    }
}
//# sourceMappingURL=sync_env_scripts.js.map
#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/setup_env.ts
 *
 * Cross-platform Environment Setup Orchestrator (Node.js 26+ Native)
 * Automatically delegates to setup-linux.sh or setup-windows.ps1 based on platform.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { isMainModule } from "./cliUtils.js";
export function runSetup(args = process.argv.slice(2), targetDir = process.cwd()) {
    const isWindows = process.platform === 'win32';
    const isUpdate = args.some(a => a === 'update' || a === '--update' || a === '-u' || a === '--update-version');
    const forwardedArgs = args.filter(a => a !== 'update' && a !== '--update');
    if (isWindows) {
        const targetScript = isUpdate ? 'update-windows.ps1' : 'setup-windows.ps1';
        let scriptPath = path.resolve(targetDir, targetScript);
        if (!fs.existsSync(scriptPath)) {
            scriptPath = path.resolve(targetDir, 'setup-windows.ps1');
            if (isUpdate && !forwardedArgs.includes('-UpdateVersion')) {
                forwardedArgs.unshift('-UpdateVersion');
            }
        }
        if (!fs.existsSync(scriptPath)) {
            console.error(`[auditor-setup-env] Script no encontrado: ${scriptPath}`);
            return 1;
        }
        const psArgs = ['-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...forwardedArgs];
        const proc = spawnSync('powershell.exe', psArgs, {
            stdio: 'inherit',
            cwd: targetDir
        });
        return proc.status ?? 0;
    }
    else {
        const targetScript = isUpdate ? 'update-linux.sh' : 'setup-linux.sh';
        let scriptPath = path.resolve(targetDir, targetScript);
        if (!fs.existsSync(scriptPath)) {
            scriptPath = path.resolve(targetDir, 'setup-linux.sh');
            if (isUpdate && !forwardedArgs.includes('--update-version')) {
                forwardedArgs.unshift('--update-version');
            }
        }
        if (!fs.existsSync(scriptPath)) {
            console.error(`[auditor-setup-env] Script no encontrado: ${scriptPath}`);
            return 1;
        }
        const proc = spawnSync('bash', [scriptPath, ...forwardedArgs], {
            stdio: 'inherit',
            cwd: targetDir
        });
        return proc.status ?? 0;
    }
}
// CLI entrypoint
if (isMainModule(import.meta.url)) {
    const code = runSetup();
    process.exit(code);
}
//# sourceMappingURL=setup_env.js.map
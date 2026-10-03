#!/usr/bin/env -S node --experimental-strip-types
/**
 * src/cli/audit_build.ts
 *
 * POST-BUILD ARTIFACT AUDITOR CLI (Node.js 26+ Native)
 * Executes exclusively sub-auditors declaring capabilities.requiresBuild === true
 * against compiled production artifacts in dist/.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isMainModule } from "./cliUtils.js";
import "../core/permissionGuard.js";
export async function runAuditBuild(extraArgs = []) {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const fullAuditorPath = path.resolve(currentDir, 'audit_full.ts');
    const fullAuditorJsPath = path.resolve(currentDir, 'audit_full.js');
    const targetScript = fs.existsSync(fullAuditorPath) ? fullAuditorPath : fullAuditorJsPath;
    const nodeArgs = [
        '--permission',
        '--allow-fs-read=*',
        '--allow-fs-write=*',
        '--allow-child-process',
        '--allow-addons',
        '--experimental-strip-types',
        targetScript,
        'preset=build',
        ...extraArgs
    ];
    return new Promise((resolve) => {
        const child = spawn(process.execPath, nodeArgs, {
            stdio: 'inherit',
            cwd: process.cwd(),
            env: process.env
        });
        child.on('close', (code) => {
            resolve(code ?? 0);
        });
    });
}
if (isMainModule(import.meta.url)) {
    const exitCode = await runAuditBuild(process.argv.slice(2));
    process.exit(exitCode);
}
//# sourceMappingURL=audit_build.js.map
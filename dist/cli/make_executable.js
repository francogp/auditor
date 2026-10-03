/**
 * src/cli/make_executable.ts
 *
 * Cross-platform CLI utility to ensure compiled binaries in dist/cli/ have executable permissions (0o755)
 * and purge orphaned distribution files in dist/ whose corresponding source files in src/ were deleted.
 * Native Node.js 26+ execution: works cross-platform on Windows, Linux, and macOS without relying on POSIX chmod.
 */
import fs from 'node:fs';
import path from 'node:path';
import { isMainModule } from "./cliUtils.js";
export function purgeOrphanedDistFiles(distDir = path.resolve(process.cwd(), 'dist'), srcDir = path.resolve(process.cwd(), 'src')) {
    if (!fs.existsSync(distDir) || !fs.existsSync(srcDir)) {
        return;
    }
    function traverseAndClean(currentDist, currentSrc) {
        const entries = fs.readdirSync(currentDist, { withFileTypes: true });
        for (const entry of entries) {
            const distPath = path.join(currentDist, entry.name);
            if (entry.isDirectory()) {
                const srcSubdir = path.join(currentSrc, entry.name);
                if (!fs.existsSync(srcSubdir)) {
                    fs.rmSync(distPath, { recursive: true, force: true });
                }
                else {
                    traverseAndClean(distPath, srcSubdir);
                }
            }
            else if (entry.isFile()) {
                const baseName = entry.name.replace(/\.(d\.ts|d\.ts\.map|js|js\.map)$/, '');
                if (baseName === 'index')
                    continue;
                const candidateTs = path.join(currentSrc, `${baseName}.ts`);
                const candidateIndexTs = path.join(currentSrc, baseName, 'index.ts');
                if (!fs.existsSync(candidateTs) && !fs.existsSync(candidateIndexTs)) {
                    fs.rmSync(distPath, { force: true });
                }
            }
        }
    }
    traverseAndClean(distDir, srcDir);
}
export function makeCliBinariesExecutable(distDir = path.resolve(process.cwd(), 'dist/cli')) {
    if (!fs.existsSync(distDir)) {
        return;
    }
    const entries = fs.readdirSync(distDir);
    for (const entry of entries) {
        if (entry.endsWith('.js')) {
            const fullPath = path.join(distDir, entry);
            try {
                fs.chmodSync(fullPath, 0o755);
            }
            catch {
                // catch-ok: Safe fallback on filesystems or OS environments where chmod is not supported
            }
        }
    }
}
if (isMainModule(import.meta.url)) {
    purgeOrphanedDistFiles();
    makeCliBinariesExecutable();
}
//# sourceMappingURL=make_executable.js.map
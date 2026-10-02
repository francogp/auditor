/**
 * scripts/auditors/architecture/validate_build_tools.ts
 *
 * Verifies native build tools and binaries (e.g. css-checker-kit).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from "../../core/auditorBase.js";
import { getCssCheckerCmd } from "../../analyzers/cssAnalyzer.js";
enableCompileCache();
const isWin = process.platform === 'win32';
export function findCssCheckerBinary() {
    return getCssCheckerCmd() !== null;
}
export const BUILD_TOOLS_RULES = [
    'build-tools-binary-missing'
];
function attemptNpmPostinstall() {
    try {
        const pkgDir = 'node_modules/css-checker-kit';
        const nodeDir = process.execPath ? path.dirname(process.execPath) : '';
        const npmCli = nodeDir ? path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js') : '';
        if (npmCli && fs.existsSync(npmCli)) {
            if (!fs.existsSync(pkgDir)) {
                execFileSync(process.execPath, [npmCli, 'install', '--save-dev', 'css-checker-kit', '--ignore-scripts=false'], { cwd: process.cwd() });
            }
            execFileSync(process.execPath, [npmCli, 'run', 'postinstall', '--ignore-scripts=false'], { cwd: pkgDir });
        }
        else {
            const npmCmd = isWin ? 'npm.cmd' : 'npm';
            if (!fs.existsSync(pkgDir)) {
                execFileSync(npmCmd, ['install', '--save-dev', 'css-checker-kit', '--ignore-scripts=false'], { cwd: process.cwd(), shell: isWin });
            }
            execFileSync(npmCmd, ['run', 'postinstall', '--ignore-scripts=false'], { cwd: pkgDir, shell: isWin });
        }
        return findCssCheckerBinary();
    }
    catch {
        // catch-ok: auto-build of css-checker binary via npm may fail in offline or restricted environments
        return false;
    }
}
function linkBinaryToNodeModules(binDest, binName) {
    const nodeModulesBin = path.resolve(process.cwd(), 'node_modules/.bin');
    if (!fs.existsSync(nodeModulesBin))
        return;
    const symlinkPath = path.join(nodeModulesBin, binName);
    try {
        if (!fs.existsSync(symlinkPath)) {
            if (isWin) {
                fs.copyFileSync(binDest, symlinkPath);
            }
            else {
                fs.symlinkSync(path.join('..', 'css-checker-kit', 'bin', binName), symlinkPath);
            }
        }
    }
    catch {
        // catch-ok: ignore symlink or copy errors when creating node_modules/.bin shortcut
    }
}
function downloadTarball(binDir, binName, releaseUrl) {
    if (isWin) {
        const tarArchive = path.join(binDir, 'archive.tar.gz');
        execFileSync('curl.exe', ['-fsSL', '-L', '-A', 'Mozilla/5.0', releaseUrl, '-o', tarArchive], { stdio: 'ignore' });
        execFileSync('tar.exe', ['-xzf', tarArchive, '-C', binDir, binName], { stdio: 'ignore' });
        if (fs.existsSync(tarArchive))
            fs.unlinkSync(tarArchive);
    }
    else {
        execFileSync('sh', ['-c', `curl -fsSL -L -A "Mozilla/5.0" "${releaseUrl}" | tar -xz -C "${binDir}" ${binName}`], { stdio: 'ignore' });
        const binDest = path.join(binDir, binName);
        try {
            fs.chmodSync(binDest, 0o755);
        }
        catch {
            // catch-ok: ignore chmod errors
        }
    }
}
function attemptDirectBinaryDownload() {
    try {
        const platform = isWin ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux';
        const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'ia32' ? '386' : 'amd64';
        const binName = isWin ? 'css-checker.exe' : 'css-checker';
        const releaseUrl = `https://github.com/ruilisi/css-checker/releases/download/v0.4.1/css-checker_0.4.1_${platform}_${arch}.tar.gz`;
        const binDir = path.resolve(process.cwd(), 'node_modules/css-checker-kit/bin');
        const binDest = path.join(binDir, binName);
        if (!fs.existsSync(binDir)) {
            fs.mkdirSync(binDir, { recursive: true });
        }
        downloadTarball(binDir, binName, releaseUrl);
        linkBinaryToNodeModules(binDest, binName);
        return findCssCheckerBinary();
    }
    catch {
        // catch-ok: fallback download of css-checker binary may fail when offline or rate limited
        return false;
    }
}
export class BuildToolsAuditor extends BaseAuditor {
    constructor() {
        super({
            id: 'validate_build_tools',
            name: 'Build Tools & Binaries Validator',
            description: 'Verifica binarios nativos y herramientas de build',
            family: 'architecture',
            ruleIds: BUILD_TOOLS_RULES,
            packageName: 'Build',
            ruleDescriptions: {
                'build-tools-binary-missing': 'Binario o herramienta no disponible'
            }
        });
    }
    async runAudit() {
        this.context.logStep(1, 1, 'Verifying native binaries and build tools (css-checker-kit)...');
        this.filesScannedCount = 1;
        let ready = findCssCheckerBinary();
        if (!ready) {
            ready = attemptNpmPostinstall();
        }
        if (!ready) {
            ready = attemptDirectBinaryDownload();
        }
        if (!ready) {
            this.addViolation({
                ruleId: 'build-tools-binary-missing',
                severity: 'error',
                file: 'package.json',
                line: 1,
                message: 'css-checker-kit binary could not be found or built.',
                context: 'css-checker'
            });
        }
        this.context.setMetric('Build tools ready', ready ? 1 : 0);
    }
}
// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new BuildToolsAuditor());
//# sourceMappingURL=validate_build_tools.js.map
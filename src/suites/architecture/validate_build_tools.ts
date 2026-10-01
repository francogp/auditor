/**
 * scripts/auditors/architecture/validate_build_tools.ts
 *
 * Verifies native build tools and binaries (e.g. css-checker-kit).
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '../../core/auditorBase.ts';
import { getCssCheckerCmd } from '../../analyzers/cssAnalyzer.ts';

enableCompileCache();

const isWin = process.platform === 'win32';

export function findCssCheckerBinary(): boolean {
  return getCssCheckerCmd() !== null;
}

export type BuildToolsRuleId = 'build-tools-binary-missing';

export const BUILD_TOOLS_RULES: readonly BuildToolsRuleId[] = [
  'build-tools-binary-missing'
] as const;

export class BuildToolsAuditor extends BaseAuditor<BuildToolsRuleId> {
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

  public override async runAudit(): Promise<void> {
    this.context.logStep(1, 1, 'Verifying native binaries and build tools (css-checker-kit)...');
    this.filesScannedCount = 1;

    let ready = findCssCheckerBinary();

    if (!ready) {
      try {
        const pkgDir = 'node_modules/css-checker-kit';
        const nodeDir = process.execPath ? path.dirname(process.execPath) : '';
        const npmCli = nodeDir ? path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js') : '';

        if (npmCli && fs.existsSync(npmCli)) {
          if (!fs.existsSync(pkgDir)) {
            execFileSync(process.execPath, [npmCli, 'install', '--save-dev', 'css-checker-kit', '--ignore-scripts=false'], { cwd: process.cwd() });
          }
          execFileSync(process.execPath, [npmCli, 'run', 'postinstall', '--ignore-scripts=false'], { cwd: pkgDir });
        } else {
          const npmCmd = isWin ? 'npm.cmd' : 'npm';
          if (!fs.existsSync(pkgDir)) {
            execFileSync(npmCmd, ['install', '--save-dev', 'css-checker-kit', '--ignore-scripts=false'], { cwd: process.cwd(), shell: isWin });
          }
          execFileSync(npmCmd, ['run', 'postinstall', '--ignore-scripts=false'], { cwd: pkgDir, shell: isWin });
        }
        ready = findCssCheckerBinary();
      } catch (err) {
        this.context.logProgress(`Auto-build of css-checker binary failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!ready) {
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

        if (isWin) {
          const tarArchive = path.join(binDir, 'archive.tar.gz');
          execFileSync('curl.exe', ['-fsSL', '-L', '-A', 'Mozilla/5.0', releaseUrl, '-o', tarArchive], { stdio: 'ignore' });
          execFileSync('tar.exe', ['-xzf', tarArchive, '-C', binDir, binName], { stdio: 'ignore' });
          if (fs.existsSync(tarArchive)) fs.unlinkSync(tarArchive);
        } else {
          execFileSync('sh', ['-c', `curl -fsSL -L -A "Mozilla/5.0" "${releaseUrl}" | tar -xz -C "${binDir}" ${binName}`], { stdio: 'ignore' });
          try {
            fs.chmodSync(binDest, 0o755);
          } catch {
            // ignore chmod errors
          }
        }

        const nodeModulesBin = path.resolve(process.cwd(), 'node_modules/.bin');
        if (fs.existsSync(nodeModulesBin)) {
          const symlinkPath = path.join(nodeModulesBin, binName);
          try {
            if (!fs.existsSync(symlinkPath)) {
              if (isWin) {
                fs.copyFileSync(binDest, symlinkPath);
              } else {
                fs.symlinkSync(path.join('..', 'css-checker-kit', 'bin', binName), symlinkPath);
              }
            }
          } catch {
            // ignore symlink errors
          }
        }

        ready = findCssCheckerBinary();
      } catch (err) {
        this.context.logProgress(`Fallback download of css-checker binary failed: ${err instanceof Error ? err.message : String(err)}`);
      }
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
if (process.argv[1] && import.meta.filename && path.basename(process.argv[1]) === path.basename(import.meta.filename)) {
  await BaseAuditor.runCli(new BuildToolsAuditor());
}

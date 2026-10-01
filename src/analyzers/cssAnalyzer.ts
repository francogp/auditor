/**
 * scripts/maintenance/analyzers/cssAnalyzer.ts
 *
 * Runs css-checker against CSS/SCSS and Vue style blocks to detect duplicate CSS classes.
 */

import fs from 'node:fs/promises';
import { readFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import type { Violation, RuleDescriptor } from '../suites/architecture/audit_rules.ts';

export const CSS_ANALYZER_DESCRIPTOR: RuleDescriptor = {
  id: 'css-checker',
  name: 'CSS / SCSS Duplication Checker',
  category: 'css-checker: SCSS/CSS duplicado',
  aliases: ['css-checker', 'css', 'scss', 'duplicate-css', 'scss-duplicados']
};

const EXEC_MAX_BUFFER_BYTES = 10 * 1024 * 1024;
const EXEC_TIMEOUT_MS = 15000;

function readFileSyncExists(p: string): boolean {
  try {
    if (process.platform !== 'win32') {
      try {
        chmodSync(p, 0o755);
      } catch {
        // Ignorar si no se tienen permisos de chmod
      }
    }
    return readFileSync(p) !== undefined;
  } catch {
    return false;
  }
}

export function getCssCheckerCmd(): string | null {
  const isWin = process.platform === 'win32';
  const binName = isWin ? 'css-checker.exe' : 'css-checker';

  const candidates = [
    path.join(process.cwd(), 'node_modules', '.bin', isWin ? 'css-checker.cmd' : 'css-checker'),
    path.join(process.cwd(), 'node_modules', '.bin', binName),
    path.join(process.cwd(), 'node_modules', 'css-checker-kit', 'bin', binName),
    path.join(process.cwd(), 'node_modules', 'css-checker-kit', binName),
    path.join(import.meta.dirname, '..', '..', 'node_modules', '.bin', isWin ? 'css-checker.cmd' : 'css-checker'),
    path.join(import.meta.dirname, '..', '..', 'node_modules', '.bin', binName),
    path.join(import.meta.dirname, '..', '..', 'node_modules', 'css-checker-kit', 'bin', binName),
    path.join(import.meta.dirname, '..', '..', 'node_modules', 'css-checker-kit', binName),
    path.join(import.meta.dirname, '..', '..', '..', 'node_modules', '.bin', isWin ? 'css-checker.cmd' : 'css-checker'),
    path.join(import.meta.dirname, '..', '..', '..', 'node_modules', '.bin', binName),
    path.join(import.meta.dirname, '..', '..', '..', 'node_modules', 'css-checker-kit', 'bin', binName),
    path.join(import.meta.dirname, '..', '..', '..', 'node_modules', 'css-checker-kit', binName),
  ];

  const nodeDir = process.execPath ? path.dirname(process.execPath) : '';
  if (nodeDir) {
    candidates.push(path.join(nodeDir, binName));
    candidates.push(path.join(nodeDir, 'bin', binName));
    if (isWin) candidates.push(path.join(nodeDir, 'css-checker.cmd'));
  }

  const rawAppData = process.env.APPDATA;
  if (isWin && typeof rawAppData === 'string' && /^[a-zA-Z0-9_:\\/\s.-]+$/.test(rawAppData) && !rawAppData.includes('..')) {
    candidates.push(path.join(rawAppData, 'npm', 'bin', binName));
    candidates.push(path.join(rawAppData, 'npm', binName));
  }
  const rawHome = process.env.HOME;
  if (typeof rawHome === 'string' && /^[a-zA-Z0-9_:\\/\s.-]+$/.test(rawHome) && !rawHome.includes('..')) {
    candidates.push(path.join(rawHome, '.npm-global', 'bin', binName));
    candidates.push(path.join(rawHome, '.local', 'bin', binName));
    candidates.push(path.join('/usr', 'local', 'bin', binName));
  }

  const pathEnv = process.env.PATH || '';
  const dirs = pathEnv.split(path.delimiter);
  for (const dir of dirs) {
    candidates.push(path.join(dir, binName));
    if (isWin) candidates.push(path.join(dir, 'css-checker.cmd'));
  }

  let found: string | null = null;
  for (const candidate of candidates) {
    if (readFileSyncExists(candidate)) {
      found = candidate;
      break;
    }
  }

  if (!found) {
    try {
      const prefix = execSync('npm config get prefix', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      if (prefix) {
        const prefixCandidates = [
          path.join(prefix, 'bin', binName),
          path.join(prefix, binName)
        ];
        for (const candidate of prefixCandidates) {
          if (readFileSyncExists(candidate)) {
            found = candidate;
            break;
          }
        }
      }
    } catch {
      // Ignore npm config errors
    }
  }

  return found;
}

export async function runCssChecker(
  targetDir: string = '.',
  ignoreDirs: ReadonlySet<string>
): Promise<Violation[]> {
  const violations: Violation[] = [];
  const binCmd = getCssCheckerCmd();

  if (!binCmd) {
    violations.push({
      file: 'css-checker',
      line: 0,
      message: `Aviso: 'css-checker' no está disponible o no se encuentra el binario ejecutable. Omitiendo análisis de CSS duplicados.`,
      context: 'instalación css-checker',
      severity: 'error',
      fixable: false
    });
    return violations;
  }

  const tmpDir = path.resolve(process.cwd(), 'scratch/css_audit_tmp');
  const fileMap: Map<string, string> = new Map();

  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.mkdir(tmpDir, { recursive: true });

    const effectiveTarget = targetDir === '.' ? 'src' : targetDir;
    const searchDir = path.resolve(process.cwd(), effectiveTarget);
    const pattern = '**/*.{scss,css,vue}';

    const bundles: Record<string, string> = {
      bundle_styles: '',
      bundle_components: '',
      bundle_views: '',
      bundle_other: ''
    };

    let count = 0;
    for await (const entry of fs.glob(pattern, { cwd: searchDir, exclude: (p: string) => Array.from(ignoreDirs).some(d => p.includes(d)) })) {
      const fullPath = path.join(searchDir, entry);
      const relPath = path.relative(process.cwd(), fullPath);

      const content = await fs.readFile(fullPath, 'utf-8');
      let cssContent = '';

      if (fullPath.endsWith('.vue')) {
        const matches = content.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
        if (matches) {
          cssContent = matches.map(m => m.replace(/<\/?style[^>]*>/gi, '')).join('\n');
        }
      } else {
        cssContent = content;
      }

      if (cssContent.trim()) {
        count++;
        let bundleKey = 'bundle_other';
        if (relPath.includes('styles')) bundleKey = 'bundle_styles';
        else if (relPath.includes('components')) bundleKey = 'bundle_components';
        else if (relPath.includes('views')) bundleKey = 'bundle_views';

        bundles[bundleKey] += `\n/* FILE: ${relPath} */\n` + cssContent + '\n';
      }
    }

    if (count === 0) return violations;

    process.stderr.write(`     │  🎨 [css-checker] Analizados ${count} archivos de estilo (SCSS/CSS/Vue)\n`);

    for (const [key, code] of Object.entries(bundles)) {
      if (code.trim()) {
        await fs.writeFile(path.join(tmpDir, `${key}.css`), code, 'utf-8');
      }
    }

    let stdout = '';
    try {
      stdout = execSync(`"${binCmd}" -path "${tmpDir}" -colors=false -long-line=false -sim=false`, {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: EXEC_MAX_BUFFER_BYTES,
        timeout: EXEC_TIMEOUT_MS,
        killSignal: 'SIGKILL'
      });
    } catch (e: unknown) {
      const err = e as { stdout?: string | Buffer; message?: string };
      if (err.stdout) {
        stdout = err.stdout.toString('utf-8');
      } else {
        violations.push({
          file: 'css-checker',
          line: 0,
          message: `Aviso ejecutando css-checker: ${err.message || String(e)}. Omitiendo análisis de CSS duplicados.`,
          context: 'css-checker',
          severity: 'error',
          fixable: false
        });
        return violations;
      }
    }

    if (!stdout) return violations;

    const sections = stdout.split(/\(\d+\) Same class content found in \d+ places:/g);
    for (let i = 1; i < sections.length; i++) {
      const sec = sections[i];
      if (!sec) continue;
      const lines = sec.split('\n');
      const places: { selector: string; fileName: string }[] = [];

      for (const line of lines) {
        const match = line.match(/\s*(.+?)\s*<<\s*.*?(style_\d+\.css)/);
        if (match && match[1] && match[2]) {
          places.push({ selector: match[1].trim(), fileName: match[2].trim() });
        }
      }

      if (places.length > 0) {
        const first = places[0]!;
        const firstRealPath = fileMap.get(first.fileName) || first.fileName;
        const locations = places.slice(1).map(p => {
          const rPath = fileMap.get(p.fileName) || p.fileName;
          return `${p.selector} en ${rPath}`;
        }).join(', ');

        violations.push({
          file: path.resolve(process.cwd(), firstRealPath),
          line: 1,
          message: `SCSS duplicado crítico (css-checker): Selector '${first.selector}' coincide con ${places.length} reglas idénticas. Ubicaciones: ${firstRealPath}, ${locations}`,
          context: `duplicación css-checker (${places.length} lugares)`,
          severity: 'error',
          fixable: false
        });
      }
    }
  } catch (err: unknown) {
    violations.push({
      file: 'css-checker',
      line: 0,
      message: `Aviso ejecutando css-checker: ${(err as Error).message || String(err)}. Omitiendo análisis de CSS duplicados.`,
      context: 'css-checker',
      severity: 'error',
      fixable: false
    });
  } finally {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // Ignorar error al limpiar
    }
  }

  return violations;
}

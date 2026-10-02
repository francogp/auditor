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
        // catch-ok: Ignorar si no se tienen permisos de chmod
      }
    }
    return readFileSync(p) !== undefined;
  } catch {
    return false;
  }
}

function getEnvCandidates(binName: string, isWin: boolean): string[] {
  const candidates: string[] = [];
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
  return candidates;
}

function getNodeAndPathCandidates(binName: string, isWin: boolean): string[] {
  const candidates: string[] = [];
  const nodeDir = process.execPath ? path.dirname(process.execPath) : '';
  if (nodeDir) {
    candidates.push(path.join(nodeDir, binName));
    candidates.push(path.join(nodeDir, 'bin', binName));
    if (isWin) candidates.push(path.join(nodeDir, 'css-checker.cmd'));
  }
  const pathEnv = process.env.PATH || '';
  for (const dir of pathEnv.split(path.delimiter)) {
    candidates.push(path.join(dir, binName));
    if (isWin) candidates.push(path.join(dir, 'css-checker.cmd'));
  }
  return candidates;
}

function getPrefixCandidates(binName: string): string[] {
  try {
    const prefix = execSync('npm config get prefix', { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (prefix) {
      return [path.join(prefix, 'bin', binName), path.join(prefix, binName)];
    }
  } catch {
    // catch-ok: Ignore npm config errors
  }
  return [];
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
    ...getNodeAndPathCandidates(binName, isWin),
    ...getEnvCandidates(binName, isWin)
  ];

  for (const candidate of candidates) {
    if (readFileSyncExists(candidate)) return candidate;
  }

  for (const candidate of getPrefixCandidates(binName)) {
    if (readFileSyncExists(candidate)) return candidate;
  }

  return null;
}

function extractCssContent(content: string, isVue: boolean): string {
  if (!isVue) return content;
  const matches = content.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
  if (!matches) return '';
  return matches.map(m => m.replace(/<\/?style[^>]*>/gi, '')).join('\n');
}

function resolveBundleKey(relPath: string): string {
  if (relPath.includes('styles')) return 'bundle_styles';
  if (relPath.includes('components')) return 'bundle_components';
  if (relPath.includes('views')) return 'bundle_views';
  return 'bundle_other';
}

async function collectCssBundles(
  searchDir: string,
  ignoreDirs: ReadonlySet<string>
): Promise<{ count: number; bundles: Record<string, string> }> {
  const bundles: Record<string, string> = {
    bundle_styles: '',
    bundle_components: '',
    bundle_views: '',
    bundle_other: ''
  };
  let count = 0;
  const pattern = '**/*.{scss,css,vue}';

  for await (const entry of fs.glob(pattern, {
    cwd: searchDir,
    exclude: (p: string) => Array.from(ignoreDirs).some(d => p.includes(d))
  })) {
    const fullPath = path.join(searchDir, entry);
    const relPath = path.relative(process.cwd(), fullPath);
    const content = await fs.readFile(fullPath, 'utf-8');
    const cssContent = extractCssContent(content, fullPath.endsWith('.vue'));

    if (cssContent.trim()) {
      count++;
      const bundleKey = resolveBundleKey(relPath);
      bundles[bundleKey] += `\n/* FILE: ${relPath} */\n` + cssContent + '\n';
    }
  }

  return { count, bundles };
}

async function writeCssBundles(bundles: Record<string, string>, tmpDir: string): Promise<void> {
  for (const [key, code] of Object.entries(bundles)) {
    if (code.trim()) {
      await fs.writeFile(path.join(tmpDir, `${key}.css`), code, 'utf-8');
    }
  }
}

function executeCssChecker(binCmd: string, tmpDir: string): { stdout: string; error?: string } {
  try {
    const stdout = execSync(`"${binCmd}" -path "${tmpDir}" -colors=false -long-line=false -sim=false`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: EXEC_MAX_BUFFER_BYTES,
      timeout: EXEC_TIMEOUT_MS,
      killSignal: 'SIGKILL'
    });
    return { stdout };
  } catch (e: unknown) {
    const err = e as { stdout?: string | Buffer; message?: string };
    if (err.stdout) {
      return { stdout: err.stdout.toString('utf-8') };
    }
    return { stdout: '', error: err.message || String(e) };
  }
}

function parseCssCheckerSection(sec: string, fileMap: Map<string, string>): Violation | null {
  const lines = sec.split('\n');
  const places: { selector: string; fileName: string }[] = [];

  for (const line of lines) {
    const match = line.match(/\s*(.+?)\s*<<\s*.*?(style_\d+\.css)/);
    if (match && match[1] && match[2]) {
      places.push({ selector: match[1].trim(), fileName: match[2].trim() });
    }
  }

  if (places.length === 0) return null;

  const first = places[0]!;
  const firstRealPath = fileMap.get(first.fileName) || first.fileName;
  const locations = places.slice(1).map(p => {
    const rPath = fileMap.get(p.fileName) || p.fileName;
    return `${p.selector} en ${rPath}`;
  }).join(', ');

  return {
    file: path.resolve(process.cwd(), firstRealPath),
    line: 1,
    message: `SCSS duplicado crítico (css-checker): Selector '${first.selector}' coincide con ${places.length} reglas idénticas. Ubicaciones: ${firstRealPath}, ${locations}`,
    context: `duplicación css-checker (${places.length} lugares)`,
    severity: 'error',
    fixable: false
  };
}

function parseCssCheckerOutput(stdout: string, fileMap: Map<string, string>): Violation[] {
  const violations: Violation[] = [];
  const sections = stdout.split(/\(\d+\) Same class content found in \d+ places:/g);
  for (let i = 1; i < sections.length; i++) {
    const sec = sections[i];
    if (!sec) continue;
    const violation = parseCssCheckerSection(sec, fileMap);
    if (violation) violations.push(violation);
  }
  return violations;
}

export async function runCssChecker(
  targetDir: string = '.',
  ignoreDirs: ReadonlySet<string>
): Promise<Violation[]> {
  const binCmd = getCssCheckerCmd();
  if (!binCmd) {
    return [{
      file: 'css-checker',
      line: 0,
      message: `Aviso: 'css-checker' no está disponible o no se encuentra el binario ejecutable. Omitiendo análisis de CSS duplicados.`,
      context: 'instalación css-checker',
      severity: 'error',
      fixable: false
    }];
  }

  const tmpDir = path.resolve(process.cwd(), 'scratch/css_audit_tmp');
  const fileMap: Map<string, string> = new Map();

  try {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await fs.mkdir(tmpDir, { recursive: true });

    const effectiveTarget = targetDir === '.' ? 'src' : targetDir;
    const searchDir = path.resolve(process.cwd(), effectiveTarget);
    const { count, bundles } = await collectCssBundles(searchDir, ignoreDirs);

    if (count === 0) return [];

    process.stderr.write(`     │  🎨 [css-checker] Analizados ${count} archivos de estilo (SCSS/CSS/Vue)\n`);
    await writeCssBundles(bundles, tmpDir);

    const { stdout, error } = executeCssChecker(binCmd, tmpDir);
    if (error) {
      return [{
        file: 'css-checker',
        line: 0,
        message: `Aviso ejecutando css-checker: ${error}. Omitiendo análisis de CSS duplicados.`,
        context: 'css-checker',
        severity: 'error',
        fixable: false
      }];
    }

    if (!stdout) return [];
    return parseCssCheckerOutput(stdout, fileMap);
  } catch (err: unknown) {
    return [{
      file: 'css-checker',
      line: 0,
      message: `Aviso ejecutando css-checker: ${(err as Error).message || String(err)}. Omitiendo análisis de CSS duplicados.`,
      context: 'css-checker',
      severity: 'error',
      fixable: false
    }];
  } finally {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // catch-ok: Ignorar error al limpiar directorio temporal
    }
  }
}

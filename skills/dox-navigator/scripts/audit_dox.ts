import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

interface Violation {
  file: string;
  line: number;
  message: string;
  context: string;
  severity: 'error' | 'warning';
}

interface AuditStats {
  dirsScanned: number;
  doxFilesCount: number;
  linksChecked: number;
}

async function checkDoxIntegrity(): Promise<{ violations: Violation[]; stats: AuditStats }> {
  const violations: Violation[] = [];
  const rootDir = process.cwd();
  const srcDir = path.join(rootDir, 'src');

  let dirsScanned = 0;
  let linksChecked = 0;

  const gitIgnoredPaths = new Set<string>();
  try {
    const gitignoreRaw = await fs.readFile(path.join(rootDir, '.gitignore'), 'utf-8');
    for (const line of gitignoreRaw.split('\n')) {
      const trimmed = line.trim().replace(/\/$/, '');
      if (!trimmed || trimmed.startsWith('#') || trimmed.includes('*') || trimmed.includes('?')) continue;
      gitIgnoredPaths.add(path.resolve(rootDir, trimmed));
    }
  } catch {
    /* skip silently */
  }

  function isGitIgnoredPath(targetPath: string): boolean {
    let current = targetPath;
    while (current.startsWith(rootDir) && current !== rootDir) {
      if (gitIgnoredPaths.has(current)) return true;
      current = path.dirname(current);
    }
    return false;
  }

  const doxDirs: string[] = [];

  async function hasCodeFiles(dir: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (ext === '.ts' || ext === '.vue' || ext === '.js' || ext === '.scss' || ext === '.css') {
            return true;
          }
        }
      }
    } catch {
      return false;
    }
    return false;
  }

  async function traverseSrc(dir: string) {
    if (isGitIgnoredPath(dir)) return;
    dirsScanned++;

    if (dir !== srcDir && (await hasCodeFiles(dir))) {
      doxDirs.push(dir);
    }

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await traverseSrc(path.join(dir, entry.name));
        }
      }
    } catch {
      /* skip silently */
    }
  }

  await traverseSrc(srcDir);

  const doxFilesMap = new Map<string, string>();

  // Check root AGENTS.md
  const rootAgentsPath = path.join(rootDir, 'AGENTS.md');
  try {
    const content = await fs.readFile(rootAgentsPath, 'utf-8');
    doxFilesMap.set(rootDir, content);
  } catch {
    violations.push({
      file: rootAgentsPath,
      line: 1,
      message: `Missing root documentation file 'AGENTS.md'.`,
      context: 'AGENTS.md',
      severity: 'error'
    });
  }

  // Load all AGENTS.md in src/
  async function loadSrcDoxFiles(dir: string) {
    if (isGitIgnoredPath(dir)) return;

    try {
      const agentsPath = path.join(dir, 'AGENTS.md');
      const content = await fs.readFile(agentsPath, 'utf-8');
      doxFilesMap.set(dir, content);
    } catch {
      /* skip silently */
    }

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await loadSrcDoxFiles(path.join(dir, entry.name));
        }
      }
    } catch {
      /* skip silently */
    }
  }

  await loadSrcDoxFiles(srcDir);

  for (const dir of doxDirs) {
    const agentsPath = path.join(dir, 'AGENTS.md');
    if (!doxFilesMap.has(dir)) {
      violations.push({
        file: agentsPath,
        line: 1,
        message: `Missing mandatory documentation file 'AGENTS.md' in directory '${path.relative(rootDir, dir)}'.`,
        context: 'AGENTS.md',
        severity: 'error'
      });
    }
  }

  function findNearestAncestorDoxDir(dir: string): string | null {
    let current = path.dirname(dir);
    while (current !== rootDir) {
      if (doxFilesMap.has(current)) {
        return current;
      }
      current = path.dirname(current);
    }
    return doxFilesMap.has(rootDir) ? rootDir : null;
  }

  for (const [dirPath, content] of doxFilesMap.entries()) {
    const agentsPath = path.join(dirPath, 'AGENTS.md');

    if (dirPath !== rootDir) {
      const parentDoxDir = findNearestAncestorDoxDir(dirPath);
      if (parentDoxDir) {
        const parentContent = doxFilesMap.get(parentDoxDir);
        if (parentContent) {
          const relativeChildPath = path.relative(parentDoxDir, agentsPath);
          const posixPath = relativeChildPath.split(path.sep).join(path.posix.sep);
          const cleanPath = posixPath.startsWith('./') ? posixPath.slice(2) : posixPath;
          const dirOnlyPath = path.dirname(posixPath);
          const hasLink = parentContent.includes(cleanPath) ||
                          parentContent.includes('./' + cleanPath) ||
                          parentContent.includes('[' + dirOnlyPath + '/]') ||
                          parentContent.includes('(' + dirOnlyPath + '/') ||
                          parentContent.includes('./' + dirOnlyPath + '/');

          if (!hasLink) {
            const parentFile = path.join(parentDoxDir, 'AGENTS.md');
            violations.push({
              file: parentFile,
              line: 1,
              message: `Child AGENTS.md '${path.relative(rootDir, agentsPath)}' is not indexed in parent DOX '${path.relative(rootDir, parentFile)}'.`,
              context: cleanPath,
              severity: 'error'
            });
          }
        }
      }
    }

    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      if (lineText === undefined) continue;
      let match;
      while ((match = linkRegex.exec(lineText)) !== null) {
        linksChecked++;
        const label = match[1] ?? '';
        const targetUrl = (match[2] ?? '').trim();

        if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://') || targetUrl.startsWith('#')) {
          continue;
        }

        const isFullPath = targetUrl.startsWith('file://') ||
                           targetUrl.startsWith('/') ||
                           targetUrl.startsWith('\\') ||
                           /^[a-zA-Z]:/.test(targetUrl) ||
                           path.isAbsolute(targetUrl);

        if (isFullPath) {
          violations.push({
            file: agentsPath,
            line: i + 1,
            message: `Absolute path or full URL '${targetUrl}' forbidden in label '${label}'. Use relative paths exclusively.`,
            context: targetUrl,
            severity: 'error'
          });
          continue;
        }

        const cleanTarget = targetUrl.split('#')[0];
        if (!cleanTarget) continue;

        const absoluteTarget = path.resolve(dirPath, cleanTarget);
        const isGitIgnored = isGitIgnoredPath(absoluteTarget);
        if (isGitIgnored) continue;

        try {
          await fs.stat(absoluteTarget);
        } catch {
          violations.push({
            file: agentsPath,
            line: i + 1,
            message: `Broken relative link: '${targetUrl}' pointing to '${cleanTarget}' does not exist on disk.`,
            context: targetUrl,
            severity: 'error'
          });
        }
      }
    }
  }

  return {
    violations,
    stats: {
      dirsScanned,
      doxFilesCount: doxFilesMap.size,
      linksChecked
    }
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      json: { type: 'boolean' }
    }
  });

  const { violations, stats } = await checkDoxIntegrity();

  if (values.json) {
    console.log(JSON.stringify({ stats, violations }, null, 2));
  } else {
    console.log('📘 DOX Integrity Check (root AGENTS.md + src/ hierarchy)');
    console.log(`🔍 Scanned ${stats.dirsScanned} directories in src/`);
    console.log(`📄 Verified ${stats.doxFilesCount} AGENTS.md files`);
    console.log(`🔗 Checked ${stats.linksChecked} markdown links`);
    console.log(`\nFound ${violations.length} violations.\n`);

    for (const v of violations) {
      console.log(`[ERROR] ${path.relative(process.cwd(), v.file)}:${v.line} -> ${v.message}`);
    }
  }

  if (violations.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * scripts/maintenance/analyzers/doxAnalyzer.ts
 *
 * Checks AGENTS.md / DOX hierarchy, relative links, and documentation integrity.
 */

import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { styleText } from 'node:util';
import type { Violation, RuleDescriptor } from '../suites/architecture/audit_rules.ts';

export const DOX_ANALYZER_DESCRIPTOR: RuleDescriptor = {
  id: 'dox',
  name: 'DOX / AGENTS.md Integrity',
  category: 'DOX / AGENTS.md',
  aliases: ['dox', 'agents', 'agents.md', 'documentation', 'dox-integrity', 'doxindexintegrity']
};

export async function checkDoxIntegrity(
  rootDir: string,
  ignoreDirs: ReadonlySet<string>
): Promise<Violation[]> {
  const violations: Violation[] = [];

  const gitIgnoredPaths = new Set<string>();
  try {
    const gitignoreRaw = await fs.readFile(path.join(rootDir, '.gitignore'), 'utf-8');
    for (const line of gitignoreRaw.split('\n')) {
      const trimmed = line.trim().replace(/\/$/, '');
      if (!trimmed || trimmed.startsWith('#') || trimmed.includes('*') || trimmed.includes('?')) continue;
      gitIgnoredPaths.add(path.resolve(rootDir, trimmed));
    }
  } catch {
    // no .gitignore found — skip silently
  }

  const doxDirs: string[] = []; // no-domain: Non-domain utility collection or data structure

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

  function isIgnored(dir: string): boolean {
    const dirName = path.basename(dir);
    if (ignoreDirs.has(dirName) || (dirName.startsWith('.') && dirName !== '.')) {
      return true;
    }
    const absDir = path.resolve(dir);
    for (const ignored of gitIgnoredPaths) {
      if (absDir === ignored || absDir.startsWith(ignored + path.sep)) {
        return true;
      }
    }
    return false;
  }

  async function traverse(dir: string) {
    if (isIgnored(dir)) {
      return;
    }

    const relPath = path.relative(rootDir, dir);

    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    if (relPath !== '' && relPath !== 'src') {
      if (await hasCodeFiles(dir)) {
        doxDirs.push(dir);
      }
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        await traverse(path.join(dir, entry.name));
      }
    }
  }

  await traverse(rootDir);

  const doxFilesMap = new Map<string, string>();

  async function loadAllDoxFiles(dir: string) {
    if (isIgnored(dir)) {
      return;
    }

    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    try {
      const agentsPath = path.join(dir, 'AGENTS.md');
      const content = await fs.readFile(agentsPath, 'utf-8');
      doxFilesMap.set(dir, content);
    } catch (err) {
      void err;
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        await loadAllDoxFiles(path.join(dir, entry.name));
      }
    }
  }

  await loadAllDoxFiles(rootDir);

  for (const dir of doxDirs) {
    const agentsPath = path.join(dir, 'AGENTS.md');
    if (!doxFilesMap.has(dir)) {
      violations.push({
        file: agentsPath,
        line: 1,
        message: `Falta el archivo obligatorio de documentación 'AGENTS.md' en el directorio '${path.relative(rootDir, dir)}'.`,
        context: 'AGENTS.md',
        severity: 'error',
        fixable: false,
        packageName: 'DOX',
        ruleId: 'dox-missing-agents-md',
        ruleDescription: 'Falta archivo AGENTS.md'
      });
    }
  }

  const rootAgentsPath = path.join(rootDir, 'AGENTS.md');
  process.stderr.write(styleText('cyan', '📘 Escaneando jerarquía e integridad de índices AGENTS.md / DOX...\n'));

  if (!doxFilesMap.has(rootDir)) {
    violations.push({
      file: rootAgentsPath,
      line: 1,
      message: `Falta el archivo de documentación raíz 'AGENTS.md'.`,
      context: 'AGENTS.md',
      severity: 'error',
      fixable: false,
      packageName: 'DOX',
      ruleId: 'dox-missing-agents-md',
      ruleDescription: 'Falta AGENTS.md en la raíz'
    });
  }

  function findNearestAncestorDoxDir(dir: string): string | null {
    let current = path.dirname(dir);
    while (current !== rootDir) {
      if (doxFilesMap.has(current)) {
        return current;
      }
      current = path.dirname(current);
    }
    return rootDir;
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
          const hasLink =
            parentContent.includes(cleanPath) ||
            parentContent.includes('./' + cleanPath) ||
            parentContent.includes(encodeURI(cleanPath)) ||
            parentContent.includes('./' + encodeURI(cleanPath)) ||
            parentContent.includes('[' + dirOnlyPath + '/]') ||
            parentContent.includes('(' + dirOnlyPath + '/') ||
            parentContent.includes('./' + dirOnlyPath + '/');

          if (!hasLink) {
            const parentFile = path.join(parentDoxDir, 'AGENTS.md');
            violations.push({
              file: parentFile,
              line: 1,
              message: `El archivo '${path.relative(rootDir, agentsPath)}' no está registrado en el índice DOX de '${path.relative(rootDir, parentFile)}'.`,
              context: cleanPath,
              severity: 'error',
              fixable: false,
              packageName: 'DOX',
              ruleId: 'dox-unregistered-child',
              ruleDescription: 'AGENTS.md hijo no registrado'
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
        const label = match[1] ?? '';
        const targetUrl = (match[2] ?? '').trim();

        if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://') || targetUrl.startsWith('#')) {
          continue;
        }

        const isFullPath =
          targetUrl.startsWith('file://') ||
          targetUrl.startsWith('/') ||
          targetUrl.startsWith('\\') ||
          /^[a-zA-Z]:/.test(targetUrl) ||
          path.isAbsolute(targetUrl);

        if (isFullPath) {
          violations.push({
            file: agentsPath,
            line: i + 1,
            message: `Enlace absoluto o ruta completa prohibida '${targetUrl}' detectada en '${label}'. Se exige el uso exclusivo de rutas relativas (RULE 10).`,
            context: targetUrl,
            severity: 'error',
            fixable: false,
            packageName: 'DOX',
            ruleId: 'dox-absolute-link',
            ruleDescription: 'Enlace con ruta absoluta'
          });
          continue;
        }

        const rawTarget = targetUrl.split('#')[0] ?? '';
        let cleanTarget: string;
        try {
          cleanTarget = decodeURIComponent(rawTarget);
        } catch {
          cleanTarget = rawTarget;
        }
        if (!cleanTarget) continue;

        const absoluteTarget = path.resolve(dirPath, cleanTarget);

        const isGitIgnored =
          gitIgnoredPaths.has(absoluteTarget) ||
          [...gitIgnoredPaths].some(p => absoluteTarget.startsWith(p + path.sep));
        if (isGitIgnored) {
          violations.push({
            file: agentsPath,
            line: i + 1,
            message: `Enlace a ruta ignorada por Git (.gitignore): '${targetUrl}' apunta a una ruta no versionada que no existirá en clones o CI.`,
            context: targetUrl,
            severity: 'error',
            fixable: false,
            packageName: 'DOX',
            ruleId: 'dox-gitignore-target',
            ruleDescription: 'Enlace a ruta ignorada en git'
          });
          continue;
        }

        try {
          await fs.stat(absoluteTarget);
        } catch (_e) {
          violations.push({
            file: agentsPath,
            line: i + 1,
            message: `Enlace roto: '${targetUrl}' apuntando a '${cleanTarget}' no existe en el disco.`,
            context: targetUrl,
            severity: 'error',
            fixable: false,
            packageName: 'DOX',
            ruleId: 'dox-broken-link',
            ruleDescription: 'Enlace roto a archivo inexistente'
          });
        }
      }
    }
  }

  return violations;
}

/**
 * scripts/maintenance/analyzers/doxAnalyzer.ts
 *
 * Checks AGENTS.md / DOX hierarchy, relative links, and documentation integrity.
 */

import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import type { Violation, RuleDescriptor } from '../suites/architecture/audit_rules.ts';
import { isTestPath } from '../core/auditConfig.ts';
import { buildRepositoryFileIndex } from '../core/safePath.ts';

export const DOX_ANALYZER_DESCRIPTOR: RuleDescriptor = {
  id: 'dox',
  name: 'DOX / AGENTS.md Integrity',
  category: 'DOX / AGENTS.md',
  aliases: ['dox', 'agents', 'agents.md', 'documentation', 'dox-integrity', 'doxindexintegrity']
};

const CODE_EXTENSIONS = new Set(['.ts', '.vue', '.js', '.scss', '.css']);

async function loadGitIgnoredPaths(rootDir: string): Promise<Set<string>> {
  const gitIgnoredPaths = new Set<string>();
  try {
    const gitignoreRaw = await fs.readFile(path.join(rootDir, '.gitignore'), 'utf-8');
    for (const line of gitignoreRaw.split('\n')) {
      const trimmed = line.trim().replace(/\/$/, '');
      if (!trimmed || trimmed.startsWith('#') || trimmed.includes('*') || trimmed.includes('?')) continue;
      gitIgnoredPaths.add(path.resolve(rootDir, trimmed));
    }
  } catch {
    // catch-ok: no .gitignore found — skip silently
  }
  return gitIgnoredPaths;
}

function isPathIgnored(
  dir: string,
  ignoreDirs: ReadonlySet<string>,
  gitIgnoredPaths: ReadonlySet<string>
): boolean {
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

interface DoxHierarchyScan {
  doxDirs: string[];
  doxFilesMap: Map<string, string>;
}

function checkDirContainsCodeOrAgentsMd(entries: readonly Dirent[]): { hasCode: boolean; hasAgentsMd: boolean } {
  let hasCode = false;
  let hasAgentsMd = false;
  for (const entry of entries) {
    if (entry.isFile()) {
      if (entry.name === 'AGENTS.md') hasAgentsMd = true;
      const ext = path.extname(entry.name).toLowerCase();
      if (CODE_EXTENSIONS.has(ext)) hasCode = true;
    }
  }
  return { hasCode, hasAgentsMd };
}

async function tryReadAgentsMd(dir: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(dir, 'AGENTS.md'), 'utf-8');
  } catch {
    // catch-ok: unreadable AGENTS.md
    return null;
  }
}

async function scanDoxHierarchy(
  rootDir: string,
  ignoreDirs: ReadonlySet<string>,
  gitIgnoredPaths: ReadonlySet<string>
): Promise<DoxHierarchyScan> {
  const doxDirs: string[] = [];
  const doxFilesMap = new Map<string, string>();

  async function traverse(dir: string): Promise<void> {
    if (isPathIgnored(dir, ignoreDirs, gitIgnoredPaths)) return;

    let entries: Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      // catch-ok: unreadable directory
      return;
    }

    const relPath = path.relative(rootDir, dir);
    const { hasCode, hasAgentsMd } = checkDirContainsCodeOrAgentsMd(entries);

    if (relPath !== '' && relPath !== 'src' && hasCode) {
      doxDirs.push(dir);
    }

    if (hasAgentsMd) {
      const content = await tryReadAgentsMd(dir);
      if (content !== null) {
        doxFilesMap.set(dir, content);
      }
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        await traverse(path.join(dir, entry.name));
      }
    }
  }

  await traverse(rootDir);
  return { doxDirs, doxFilesMap };
}

function findNearestAncestorDoxDir(
  dir: string,
  rootDir: string,
  doxFilesMap: ReadonlyMap<string, string>
): string | null {
  let current = path.dirname(dir);
  while (current !== rootDir) {
    if (doxFilesMap.has(current)) {
      return current;
    }
    current = path.dirname(current);
  }
  return rootDir;
}

function validateMissingAgentsFiles(
  rootDir: string,
  doxDirs: readonly string[],
  doxFilesMap: ReadonlyMap<string, string>
): Violation[] {
  const violations: Violation[] = [];

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

  return violations;
}

function validateChildRegistration(
  rootDir: string,
  doxFilesMap: ReadonlyMap<string, string>
): Violation[] {
  const violations: Violation[] = [];

  for (const [dirPath] of doxFilesMap.entries()) {
    if (dirPath === rootDir) continue;

    const agentsPath = path.join(dirPath, 'AGENTS.md');
    const parentDoxDir = findNearestAncestorDoxDir(dirPath, rootDir, doxFilesMap);
    if (!parentDoxDir) continue;

    const parentContent = doxFilesMap.get(parentDoxDir);
    if (!parentContent) continue;

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

  return violations;
}

function checkLinkSyntax(
  targetUrl: string,
  label: string,
  line: number,
  agentsPath: string
): Violation | null {
  const isFullPath =
    targetUrl.startsWith('file://') ||
    targetUrl.startsWith('/') ||
    targetUrl.startsWith('\\') ||
    /^[a-zA-Z]:/.test(targetUrl) ||
    path.isAbsolute(targetUrl);

  if (isFullPath) {
    return {
      file: agentsPath,
      line,
      message: `Enlace absoluto o ruta completa prohibida '${targetUrl}' detectada en '${label}'. Se exige el uso exclusivo de rutas relativas (RULE 10).`,
      context: targetUrl,
      severity: 'error',
      fixable: false,
      packageName: 'DOX',
      ruleId: 'dox-absolute-link',
      ruleDescription: 'Enlace con ruta absoluta'
    };
  }
  return null;
}

async function checkLinkTarget(
  targetUrl: string,
  line: number,
  agentsPath: string,
  dirPath: string,
  rootDir: string,
  gitIgnoredPaths: ReadonlySet<string>,
  repoFileIndex: ReadonlyMap<string, readonly string[]>
): Promise<Violation | null> {
  const rawTarget = targetUrl.split('#')[0] ?? '';
  let cleanTarget: string;
  try {
    cleanTarget = decodeURIComponent(rawTarget);
  } catch {
    // catch-ok: malformed URI component fallback
    cleanTarget = rawTarget;
  }
  if (!cleanTarget) return null;

  const absoluteTarget = path.resolve(dirPath, cleanTarget);
  const isGitIgnored =
    gitIgnoredPaths.has(absoluteTarget) ||
    [...gitIgnoredPaths].some(p => absoluteTarget.startsWith(p + path.sep));

  if (isGitIgnored) {
    return {
      file: agentsPath,
      line,
      message: `Enlace a ruta ignorada por Git (.gitignore): '${targetUrl}' apunta a una ruta no versionada que no existirá en clones o CI.`,
      context: targetUrl,
      severity: 'error',
      fixable: false,
      packageName: 'DOX',
      ruleId: 'dox-gitignore-target',
      ruleDescription: 'Enlace a ruta ignorada en git'
    };
  }

  try {
    await fs.stat(absoluteTarget);
  } catch {
    // catch-ok: non-existent file target check
    const basename = path.basename(cleanTarget);
    const candidateMatches = (repoFileIndex.get(basename) ?? []).filter(
      cand => !gitIgnoredPaths.has(cand) && ![...gitIgnoredPaths].some(p => cand.startsWith(p + path.sep))
    );

    let message = `Enlace roto: '${targetUrl}' apuntando a '${cleanTarget}' no existe en el disco.`;
    if (candidateMatches.length > 0) {
      const suggestions = candidateMatches.map(cand => {
        let rel = path.relative(dirPath, cand).split(path.sep).join(path.posix.sep);
        if (!rel.startsWith('.')) rel = './' + rel;
        return rel;
      });
      const foundIn = candidateMatches.map(cand => path.relative(rootDir, cand).split(path.sep).join(path.posix.sep)).join(', ');
      message = `Enlace roto: '${targetUrl}' no existe en esa ruta, pero aparentemente fue localizado en '${foundIn}'. Verifica si corresponde corregir el enlace a: '${suggestions.join("' o '")}'.`;
    }

    return {
      file: agentsPath,
      line,
      message,
      context: targetUrl,
      severity: 'error',
      fixable: false,
      packageName: 'DOX',
      ruleId: 'dox-broken-link',
      ruleDescription: 'Enlace roto a archivo inexistente'
    };
  }

  return null;
}

async function validateSingleLink(
  targetUrl: string,
  label: string,
  line: number,
  agentsPath: string,
  dirPath: string,
  rootDir: string,
  gitIgnoredPaths: ReadonlySet<string>,
  repoFileIndex: ReadonlyMap<string, readonly string[]>
): Promise<Violation | null> {
  if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://') || targetUrl.startsWith('#')) {
    return null;
  }
  const syntaxViolation = checkLinkSyntax(targetUrl, label, line, agentsPath);
  if (syntaxViolation) return syntaxViolation;
  return checkLinkTarget(targetUrl, line, agentsPath, dirPath, rootDir, gitIgnoredPaths, repoFileIndex);
}

async function validateFileLinks(
  agentsPath: string,
  dirPath: string,
  rootDir: string,
  content: string,
  gitIgnoredPaths: ReadonlySet<string>,
  repoFileIndex: ReadonlyMap<string, readonly string[]>
): Promise<Violation[]> {
  const violations: Violation[] = [];
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    if (lineText === undefined) continue;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(lineText)) !== null) {
      const label = match[1] ?? '';
      const targetUrl = (match[2] ?? '').trim();
      const violation = await validateSingleLink(
        targetUrl,
        label,
        i + 1,
        agentsPath,
        dirPath,
        rootDir,
        gitIgnoredPaths,
        repoFileIndex
      );
      if (violation) {
        violations.push(violation);
      }
    }
  }

  return violations;
}

async function validateUnindexedCodeFiles(
  rootDir: string,
  doxFilesMap: ReadonlyMap<string, string>,
  gitIgnoredPaths: ReadonlySet<string>
): Promise<Violation[]> {
  const violations: Violation[] = [];
  const ALLOWED_CODE_EXTS = new Set(['.ts', '.vue', '.js', '.cjs', '.mjs', '.jsx', '.tsx', '.scss', '.css']);

  for (const [dirPath, content] of doxFilesMap.entries()) {
    if (dirPath === rootDir) continue;

    let entries: Dirent[];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      // catch-ok: unreadable directory
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const fileName = entry.name;
      if (fileName === 'AGENTS.md') continue;
      if (fileName.endsWith('.d.ts') || fileName.endsWith('.map')) continue;

      const ext = path.extname(fileName).toLowerCase();
      if (!ALLOWED_CODE_EXTS.has(ext)) continue;

      const fullPath = path.join(dirPath, fileName);
      if (isTestPath(fullPath)) continue;

      const isIgnored =
        gitIgnoredPaths.has(fullPath) ||
        [...gitIgnoredPaths].some(p => fullPath.startsWith(p + path.sep));
      if (isIgnored) continue;

      if (!content.includes(fileName)) {
        const agentsPath = path.join(dirPath, 'AGENTS.md');
        violations.push({
          file: agentsPath,
          line: 1,
          message: `El archivo de código '${path.relative(rootDir, fullPath)}' no está indexado en el AGENTS.md local ('${path.relative(rootDir, agentsPath)}').`,
          context: fileName,
          severity: 'error',
          fixable: false,
          packageName: 'DOX',
          ruleId: 'dox-unindexed-file',
          ruleDescription: 'Archivo de código no indexado en DOX'
        });
      }
    }
  }

  return violations;
}

export async function checkDoxIntegrity(
  rootDir: string,
  ignoreDirs: ReadonlySet<string>
): Promise<Violation[]> {
  const gitIgnoredPaths = await loadGitIgnoredPaths(rootDir);
  const { doxDirs, doxFilesMap } = await scanDoxHierarchy(rootDir, ignoreDirs, gitIgnoredPaths);
  const repoFileIndex = buildRepositoryFileIndex(rootDir, p => isPathIgnored(p, ignoreDirs, gitIgnoredPaths));

  const violations: Violation[] = [
    ...validateMissingAgentsFiles(rootDir, doxDirs, doxFilesMap),
    ...validateChildRegistration(rootDir, doxFilesMap),
    ...(await validateUnindexedCodeFiles(rootDir, doxFilesMap, gitIgnoredPaths))
  ];

  for (const [dirPath, content] of doxFilesMap.entries()) {
    const agentsPath = path.join(dirPath, 'AGENTS.md');
    const linkViolations = await validateFileLinks(agentsPath, dirPath, rootDir, content, gitIgnoredPaths, repoFileIndex);
    violations.push(...linkViolations);
  }

  return violations;
}

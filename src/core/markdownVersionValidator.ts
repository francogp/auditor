/**
 * src/core/markdownVersionValidator.ts
 *
 * Helper module for validating and synchronizing project SemVer and
 * @francogp/auditor version references across Markdown documentation.
 */

import fs from 'node:fs';
import path from 'node:path';
import { safeReadFileSync, safeJsonParse, tryOrNull } from './safeUtils.ts';

export interface ProjectVersionInfo {
  readonly pkgName: string;
  readonly currentSemver: string;
  readonly fullVersion: string;
  readonly expectedAuditorSemver: string | null;
  readonly expectedAuditorFullVersion: string | null;
}

export interface OutdatedVersionMatch {
  readonly lineNum: number;
  readonly found: string;
  readonly expected: string;
  readonly context: string;
}

interface PackageJsonShape {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const EXEMPT_MARKDOWN_FILENAMES: ReadonlySet<string> = new Set([
  'changelog.md',
  'v8-migration-guide.md'
]);

const HISTORICAL_OR_EXEMPT_LINE_PATTERNS: readonly RegExp[] = [
  /\b(?:since\s+version|from\s+version|prior\s+to|legacy|deprecated|migrating\s+from|upgraded?\s+from|salto|jump)\b/i,
  /\bauditor(?::update|-update)\b.*v\d+\.\d+\.\d+/i,
  /\?\?\s*['"]\d+\.\d+\.\d+['"]/
];

function extractBaseSemver(versionStr: string): string | null {
  const match = /^v?(\d+\.\d+\.\d+)/.exec(versionStr.trim());
  return match ? match[1]! : null;
}

function resolveInstalledAuditorVersions(rootDir: string, pkg: PackageJsonShape): {
  semver: string | null;
  fullVersion: string | null;
} {
  if (pkg.name === '@francogp/auditor' && pkg.version) {
    return {
      semver: extractBaseSemver(pkg.version),
      fullVersion: pkg.version
    };
  }

  const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
  const depSpec = allDeps['@francogp/auditor'];
  let semver: string | null = null;
  if (typeof depSpec === 'string') {
    const tagMatch = /#v?(\d+\.\d+\.\d+)/.exec(depSpec) ?? /(\d+\.\d+\.\d+)/.exec(depSpec);
    if (tagMatch) {
      semver = tagMatch[1]!;
    }
  }

  let fullVersion: string | null = null;
  const installedPkgPath = path.join(rootDir, 'node_modules', '@francogp', 'auditor', 'package.json');
  const installedRaw = safeReadFileSync(installedPkgPath);
  if (installedRaw) {
    const installedPkg = safeJsonParse<PackageJsonShape>(installedRaw);
    if (installedPkg?.version) {
      fullVersion = installedPkg.version;
      if (!semver) {
        semver = extractBaseSemver(installedPkg.version);
      }
    }
  }

  return { semver, fullVersion };
}

/**
 * Resolves the canonical project version and @francogp/auditor version from package.json.
 */
export function resolveProjectVersionInfo(rootDir: string): ProjectVersionInfo | null {
  const pkgPath = path.join(rootDir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return null;
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as PackageJsonShape;
    if (!pkg.version) {
      return null;
    }
    const currentSemver = extractBaseSemver(pkg.version);
    if (!currentSemver) {
      return null;
    }
    const auditorVer = resolveInstalledAuditorVersions(rootDir, pkg);
    return {
      pkgName: pkg.name ?? '',
      currentSemver,
      fullVersion: pkg.version,
      expectedAuditorSemver: auditorVer.semver,
      expectedAuditorFullVersion: auditorVer.fullVersion
    };
  } catch {
    // catch-ok: ignore invalid package.json
    return null;
  }
}

function isExemptMarkdownFile(relPath: string): boolean {
  const base = path.basename(relPath).toLowerCase();
  return EXEMPT_MARKDOWN_FILENAMES.has(base);
}

function isHistoricalOrExemptLine(line: string): boolean {
  return HISTORICAL_OR_EXEMPT_LINE_PATTERNS.some((re) => re.test(line));
}

function inspectLineAndReplace(
  line: string,
  lineNum: number,
  info: ProjectVersionInfo,
  matches: OutdatedVersionMatch[]
): string {
  if (isHistoricalOrExemptLine(line)) {
    return line;
  }

  let updatedLine = line;

  // 1. github:francogp/auditor#vX.Y.Z
  if (info.expectedAuditorSemver) {
    const expectedSemver = info.expectedAuditorSemver;
    const ghRefRegex = /(github:francogp\/auditor#v)(\d+\.\d+\.\d+)/g;
    updatedLine = updatedLine.replace(ghRefRegex, (fullMatch, prefix: string, ver: string) => {
      if (ver !== expectedSemver) {
        matches.push({
          lineNum,
          found: `v${ver}`,
          expected: `v${expectedSemver}`,
          context: fullMatch
        });
        return `${prefix}${expectedSemver}`;
      }
      return fullMatch;
    });

    // 2. Release tag example `#vX.Y.Z` on lines mentioning @francogp/auditor or release tag
    if (updatedLine.includes('@francogp/auditor') || /release\s+tag/i.test(updatedLine)) {
      const tagTickRegex = /(`#v)(\d+\.\d+\.\d+)(`)/g;
      updatedLine = updatedLine.replace(
        tagTickRegex,
        (fullMatch, prefix: string, ver: string, suffix: string) => {
          if (ver !== expectedSemver) {
            matches.push({
              lineNum,
              found: `#v${ver}`,
              expected: `#v${expectedSemver}`,
              context: fullMatch
            });
            return `${prefix}${expectedSemver}${suffix}`;
          }
          return fullMatch;
        }
      );
    }

    // 3. auditorVersion: 'X.Y.Z...' in config snippets
    const auditorVersionRegex =
      /(auditorVersion:\s*['"])v?(\d+\.\d+\.\d+)(-build\.[^'"]*)?(['"])/g;
    updatedLine = updatedLine.replace(
      auditorVersionRegex,
      (
        fullMatch,
        prefix: string,
        ver: string,
        buildSuffix: string | undefined,
        quoteSuffix: string
      ) => {
        if (ver !== expectedSemver) {
          const replacementVer =
            info.expectedAuditorFullVersion ??
            `${expectedSemver}${buildSuffix ?? ''}`;
          matches.push({
            lineNum,
            found: `${ver}${buildSuffix ?? ''}`,
            expected: replacementVer,
            context: fullMatch
          });
          return `${prefix}${replacementVer}${quoteSuffix}`;
        }
        return fullMatch;
      }
    );
  }

  // 4. Explicit project package version reference: <pkgName>@X.Y.Z or <pkgName> vX.Y.Z
  if (info.pkgName.length > 0) {
    const escapedPkg = info.pkgName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pkgVerRegex = new RegExp(`(${escapedPkg}(?:@|\\s+v))(\\d+\\.\\d+\\.\\d+)`, 'g');
    updatedLine = updatedLine.replace(pkgVerRegex, (fullMatch, prefix: string, ver: string) => {
      if (ver !== info.currentSemver) {
        matches.push({
          lineNum,
          found: ver,
          expected: info.currentSemver,
          context: fullMatch
        });
        return `${prefix}${info.currentSemver}`;
      }
      return fullMatch;
    });
  }

  return updatedLine;
}

/**
 * Scans raw Markdown lines for outdated project or @francogp/auditor SemVer references,
 * optionally returning the updated content when fixing.
 */
export function scanAndFixMarkdownProjectVersions(
  relPath: string,
  rawLines: readonly string[],
  info: ProjectVersionInfo | null
): {
  matches: OutdatedVersionMatch[];
  updatedContent: string | null;
  checkedCount: number;
} {
  if (!info || isExemptMarkdownFile(relPath)) {
    return { matches: [], updatedContent: null, checkedCount: 0 };
  }

  const matches: OutdatedVersionMatch[] = [];
  const newLines: string[] = [];
  let changed = false;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]!;
    const replaced = inspectLineAndReplace(line, i + 1, info, matches);
    if (replaced !== line) {
      changed = true;
    }
    newLines.push(replaced);
  }

  return {
    matches,
    updatedContent: changed ? newLines.join('\n') : null,
    checkedCount: rawLines.length
  };
}

/**
 * Synchronizes version references in standard documentation files (README.md, skill references)
 * during `auditor-version bump`.
 */
export function syncDocumentationVersionReferences(cwd: string): string[] {
  const info = resolveProjectVersionInfo(cwd);
  if (!info) {
    return [];
  }

  const candidateRelPaths = [
    'README.md',
    '.agents/skills/auditor/references/host-package-governance.md'
  ];

  const modifiedFiles: string[] = [];
  for (const relPath of candidateRelPaths) {
    const absPath = path.join(cwd, relPath);
    if (!fs.existsSync(absPath)) {
      continue;
    }
    tryOrNull(() => {
      const rawContent = fs.readFileSync(absPath, 'utf-8');
      const { updatedContent } = scanAndFixMarkdownProjectVersions(
        relPath,
        rawContent.split('\n'),
        info
      );
      if (updatedContent !== null && updatedContent !== rawContent) {
        fs.writeFileSync(absPath, updatedContent, 'utf-8');
        modifiedFiles.push(absPath);
      }
    });
  }
  return modifiedFiles;
}

/**
 * src/core/versionAnalyzer.ts
 *
 * Intelligent heuristic engine for determining SemVer bumps (major, minor, patch)
 * based on Git diff metrics, affected subsystems, and commit intent.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export const MAJOR_DIFF_LINES_THRESHOLD = 1000 as const;
export const MAJOR_CORE_LINES_THRESHOLD = 500 as const;
export const MINOR_DIFF_LINES_THRESHOLD = 100 as const;

export const VERSION_BUMP_TYPES = ['major', 'minor', 'patch', 'build'] as const;
export type VersionBumpType = (typeof VERSION_BUMP_TYPES)[number];

export const GIT_STATUS_FLAGS = ['A', 'M', 'D', 'R', '?'] as const;
export type GitStatusFlag = (typeof GIT_STATUS_FLAGS)[number];

export interface ChangedFileDetail {
  path: string;
  status: GitStatusFlag;
  insertions: number;
  deletions: number;
}

export interface DiffMetrics {
  filesChanged: number;
  insertions: number;
  deletions: number;
  totalLinesChanged: number;
  hasCoreChanges: boolean;
  hasNewFeatures: boolean;
  hasBreakingChanges: boolean;
  changedFiles: ChangedFileDetail[];
}

export interface CandidateVersions {
  readonly major: string;
  readonly minor: string;
  readonly patch: string;
  readonly build: string;
}

export interface VersionAnalysisResult {
  currentVersion: string;
  baseVersion: string;
  recommendedBump: VersionBumpType;
  recommendedVersion: string;
  candidates: CandidateVersions;
  buildId: string;
  buildDate: string;
  rationale: string;
  metrics: DiffMetrics;
}

export interface VersionAnalysisOptions {
  cwd?: string;
  commitMessage?: string;
  customNow?: Temporal.ZonedDateTime;
  baseRef?: string;
}

/**
 * Extracts base SemVer major.minor.patch tuple from a version string.
 */
export function parseBaseSemver(versionStr: string): [number, number, number] {
  const match = versionStr.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return [1, 0, 0];
  }
  return [parseInt(match[1]!, 10), parseInt(match[2]!, 10), parseInt(match[3]!, 10)];
}

/**
 * Calculates the next SemVer base version given a bump type.
 */
export function calculateNextBaseVersion(currentBase: string, bump: VersionBumpType): string {
  const [major, minor, patch] = parseBaseSemver(currentBase);
  switch (bump) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    case 'build':
      return `${major}.${minor}.${patch}`;
  }
}

/**
 * Generates an elegant build timestamp ID (YYYYMMDD-HHmmss).
 */
export function generateBuildId(customNow?: Temporal.ZonedDateTime): { buildId: string; buildDate: string } {
  const now = customNow ?? Temporal.Now.zonedDateTimeISO();
  const yyyy = String(now.year);
  const mm = String(now.month).padStart(2, '0');
  const dd = String(now.day).padStart(2, '0');
  const hh = String(now.hour).padStart(2, '0');
  const min = String(now.minute).padStart(2, '0');
  const ss = String(now.second).padStart(2, '0');

  const buildId = `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
  return { buildId, buildDate: now.toString() };
}

function parseNumstatOutput(diffOutput: string, map: Map<string, ChangedFileDetail>): void {
  const lines = diffOutput.trim().split('\n').filter(l => l.trim().length > 0);
  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length >= 3) {
      const ins = parts[0] === '-' ? 0 : parseInt(parts[0]!, 10) || 0;
      const del = parts[1] === '-' ? 0 : parseInt(parts[1]!, 10) || 0;
      const filePath = parts[2]!.trim();
      map.set(filePath, { path: filePath, status: 'M', insertions: ins, deletions: del });
    }
  }
}

function countFileLines(filePath: string): number {
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    try {
      return fs.readFileSync(filePath, 'utf-8').split('\n').length;
    } catch {
      // catch-ok: fallback for binary/unreadable files
      return 1;
    }
  }
  return 0;
}

function parsePorcelainOutput(statusOutput: string, cwd: string, map: Map<string, ChangedFileDetail>): void {
  const lines = statusOutput.trim().split('\n').filter(l => l.trim().length > 0);
  for (const line of lines) {
    const statusCode = line.slice(0, 2).trim();
    const filePath = line.slice(3).trim();

    if (statusCode === '??' || statusCode === 'A') {
      const ins = countFileLines(path.join(cwd, filePath));
      map.set(filePath, { path: filePath, status: 'A', insertions: ins, deletions: 0 });
    } else if (statusCode === 'D') {
      const existing = map.get(filePath);
      if (existing) {
        existing.status = 'D';
      } else {
        map.set(filePath, { path: filePath, status: 'D', insertions: 0, deletions: 1 });
      }
    }
  }
}

function aggregateSubsystemMetrics(changedFiles: ChangedFileDetail[]): {
  insertions: number;
  deletions: number;
  hasCoreChanges: boolean;
  hasNewFeatures: boolean;
} {
  let insertions = 0;
  let deletions = 0;
  let hasCoreChanges = false;
  let hasNewFeatures = false;

  for (const file of changedFiles) {
    insertions += file.insertions;
    deletions += file.deletions;

    if (file.path.startsWith('src/core/') || file.path === 'src/index.ts') {
      hasCoreChanges = true;
    }
    if (file.status === 'A' && (file.path.startsWith('src/suites/') || file.path.startsWith('src/cli/') || file.path.startsWith('.agents/skills/') || file.path.startsWith('skills/'))) {
      hasNewFeatures = true;
    }
  }

  return { insertions, deletions, hasCoreChanges, hasNewFeatures };
}

/**
 * Collects Git diff metrics from the current working tree and uncommitted changes.
 */
export function collectGitDiffMetrics(cwd: string = process.cwd(), baseRef: string = 'HEAD'): DiffMetrics {
  const changedFilesMap = new Map<string, ChangedFileDetail>();

  try {
    const diffOutput = execSync(`git diff ${baseRef} --numstat`, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    parseNumstatOutput(diffOutput, changedFilesMap);
  } catch {
    // catch-ok: In non-git directories or empty repos, fallback cleanly
  }

  try {
    const statusOutput = execSync('git status --porcelain', { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    parsePorcelainOutput(statusOutput, cwd, changedFilesMap);
  } catch {
    // catch-ok: Fallback when git is unavailable
  }

  const changedFiles = Array.from(changedFilesMap.values());
  const agg = aggregateSubsystemMetrics(changedFiles);

  return {
    filesChanged: changedFiles.length,
    insertions: agg.insertions,
    deletions: agg.deletions,
    totalLinesChanged: agg.insertions + agg.deletions,
    hasCoreChanges: agg.hasCoreChanges,
    hasNewFeatures: agg.hasNewFeatures,
    hasBreakingChanges: false,
    changedFiles
  };
}

function readCurrentPackageVersion(cwd: string): string {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) return '1.0.0';
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? '1.0.0';
  } catch {
    // catch-ok: Default to 1.0.0 if package.json cannot be parsed
    return '1.0.0';
  }
}

function applyCommitMessageIntent(metrics: DiffMetrics, commitMessage?: string): void {
  if (!commitMessage) return;
  const msg = commitMessage.trim();
  if (
    msg.includes('BREAKING CHANGE:') ||
    msg.includes('breaking:') ||
    /^[a-z]+(?:\([a-z0-9_-]+\))?!:/.test(msg)
  ) {
    metrics.hasBreakingChanges = true;
  } else if (/^feat(?:\([a-z0-9_-]+\))?:/.test(msg)) {
    metrics.hasNewFeatures = true;
  }
}

function evaluateBumpRationale(metrics: DiffMetrics): { recommendedBump: VersionBumpType; rationale: string } {
  if (metrics.hasBreakingChanges) {
    return {
      recommendedBump: 'major',
      rationale: 'Cambio de ruptura (breaking change) declarado explícitamente en el commit.'
    };
  }
  if (metrics.hasCoreChanges && metrics.totalLinesChanged >= MAJOR_CORE_LINES_THRESHOLD) {
    return {
      recommendedBump: 'major',
      rationale: `Refactorización profunda en el núcleo (src/core) con ${metrics.totalLinesChanged} líneas modificadas.`
    };
  }
  if (metrics.totalLinesChanged >= MAJOR_DIFF_LINES_THRESHOLD) {
    return {
      recommendedBump: 'major',
      rationale: `Transformación arquitectónica de gran escala (${metrics.totalLinesChanged} líneas en ${metrics.filesChanged} archivos).`
    };
  }
  if (metrics.hasNewFeatures) {
    return {
      recommendedBump: 'minor',
      rationale: 'Nueva funcionalidad, suite o skill incorporada al repositorio.'
    };
  }
  if (metrics.totalLinesChanged >= MINOR_DIFF_LINES_THRESHOLD || metrics.changedFiles.some((f: ChangedFileDetail) => f.status === 'A')) {
    return {
      recommendedBump: 'minor',
      rationale: `Ampliación de capacidades con ${metrics.totalLinesChanged} líneas modificadas y nuevos archivos.`
    };
  }
  return {
    recommendedBump: 'patch',
    rationale: `Ajustes menores, correcciones o mantenimiento (${metrics.totalLinesChanged} líneas en ${metrics.filesChanged} archivos).`
  };
}

/**
 * Analyzes diff metrics and commit intent to suggest the optimal SemVer bump.
 */
export function analyzeVersionBump(options: VersionAnalysisOptions = {}): VersionAnalysisResult {
  const cwd = options.cwd ?? process.cwd();
  const currentVersion = readCurrentPackageVersion(cwd);
  const [major, minor, patch] = parseBaseSemver(currentVersion);
  const baseVersion = `${major}.${minor}.${patch}`;

  const metrics = collectGitDiffMetrics(cwd, options.baseRef ?? 'HEAD');
  applyCommitMessageIntent(metrics, options.commitMessage);

  const { recommendedBump, rationale } = evaluateBumpRationale(metrics);

  const { buildId, buildDate } = generateBuildId(options.customNow);
  const nextBaseVersion = calculateNextBaseVersion(baseVersion, recommendedBump);
  const recommendedVersion = `${nextBaseVersion}-build.${buildId}`;

  const candidates: CandidateVersions = {
    major: `${calculateNextBaseVersion(baseVersion, 'major')}-build.${buildId}`,
    minor: `${calculateNextBaseVersion(baseVersion, 'minor')}-build.${buildId}`,
    patch: `${calculateNextBaseVersion(baseVersion, 'patch')}-build.${buildId}`,
    build: `${baseVersion}-build.${buildId}`
  };

  return {
    currentVersion,
    baseVersion,
    recommendedBump,
    recommendedVersion,
    candidates,
    buildId,
    buildDate,
    rationale,
    metrics
  };
}

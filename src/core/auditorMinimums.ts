/**
 * src/core/auditorMinimums.ts
 *
 * SSoT for mandatory minimum library versions exposed to host projects.
 * The floor of every library is the range declared in the `peerDependencies`
 * of `@francogp/auditor/package.json`. Zero hardcoded versions in code.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DependencyLocation } from 'fallow/types';
import semver from 'semver';

import { getPackageJson, writePackageJson, type PackageJsonDTO } from './packageJson.ts';
import { safeJsonParse, safeReadFileSync } from './safeUtils.ts';

export type AuditorMinimumVersions = Readonly<Record<string, string>>;

export interface DependencyMaximumSpec {
  readonly ceiling: string;
  readonly prohibitedRange: string;
  readonly reason: string;
}

export type AuditorMaximumVersions = Readonly<Record<string, DependencyMaximumSpec>>;

export const AUDITOR_MAXIMUM_VERSIONS: AuditorMaximumVersions = Object.freeze({
  typescript: {
    ceiling: '<7.0.0',
    prohibitedRange: '>=7.0.0',
    reason:
      'TypeScript 7+ is not permitted due to incompatibilities with the Vue component compiler.'
  }
});

export function getAuditorMaximumVersions(): AuditorMaximumVersions {
  return AUDITOR_MAXIMUM_VERSIONS;
}

export function normalizeToCaretRange(range: string): string {
  const trimmed = range.trim();
  if (trimmed.startsWith('>=')) {
    const versionPart = trimmed.slice(2).trim();
    if (semver.valid(versionPart)) {
      return `^${versionPart}`;
    }
  }
  return trimmed;
}

function readAuditorPackageJsonSection(
  sectionKey: 'peerDependencies' | 'overrides'
): Readonly<Record<string, string>> | null {
  const auditorPackageJsonPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../package.json'
  );
  if (!fs.existsSync(auditorPackageJsonPath)) {
    return null;
  }
  const data = JSON.parse(fs.readFileSync(auditorPackageJsonPath, 'utf8')) as Record<
    string,
    Record<string, string> | undefined
  >;
  const section = data[sectionKey];
  return section && Object.keys(section).length > 0 ? section : null;
}

export function getAuditorMinimumVersions(): AuditorMinimumVersions {
  const peers = readAuditorPackageJsonSection('peerDependencies');
  if (peers) {
    return peers;
  }
  throw new Error(
    '[getAuditorMinimumVersions] Could not read peerDependencies from @francogp/auditor package.json. Hardcoded fallbacks are strictly prohibited.'
  );
}

export function getAuditorCanonicalOverrides(): Readonly<Record<string, string>> {
  return readAuditorPackageJsonSection('overrides') ?? {};
}

export function readHostInstalledAuditorMinimums(
  projectRoot: string
): AuditorMinimumVersions | null {
  const hostAuditorPkgPath = path.join(
    path.resolve(projectRoot),
    'node_modules/@francogp/auditor/package.json'
  );
  if (!fs.existsSync(hostAuditorPkgPath)) {
    return null;
  }
  try {
    const data = JSON.parse(fs.readFileSync(hostAuditorPkgPath, 'utf8')) as {
      readonly peerDependencies?: Readonly<Record<string, string>>;
    };
    return data.peerDependencies && Object.keys(data.peerDependencies).length > 0
      ? data.peerDependencies
      : null;
  } catch {
    return null;
  }
}

function splitNpmAliasRange(
  range: string
): { readonly prefix: string; readonly versionPart: string } | null {
  if (!range.startsWith('npm:')) return null;
  const lastAt = range.lastIndexOf('@');
  if (lastAt <= 4) return null;
  return {
    prefix: range.slice(0, lastAt + 1),
    versionPart: range.slice(lastAt + 1)
  };
}

export function extractExactPinnedVersion(range: string): string | null {
  if (semver.valid(range)) {
    return range;
  }
  const alias = splitNpmAliasRange(range);
  if (alias && semver.valid(alias.versionPart)) {
    return alias.versionPart;
  }
  return null;
}

function normalizePinnedVersionToCaret(range: string): string | null {
  const exact = extractExactPinnedVersion(range);
  if (!exact) return null;
  const alias = splitNpmAliasRange(range);
  return alias ? `${alias.prefix}^${exact}` : `^${exact}`;
}

export type DependencyDeclarationSection = DependencyLocation;

export interface DeclaredDependency {
  readonly range: string;
  readonly isProduction: boolean;
  readonly section: DependencyDeclarationSection;
}

const DECLARATION_SECTIONS: Record<
  DependencyDeclarationSection,
  { readonly isProduction: boolean }
> = {
  dependencies: { isProduction: true },
  devDependencies: { isProduction: false },
  optionalDependencies: { isProduction: true }
};

export function findDeclaredDependency(
  pkg: Readonly<Record<string, unknown>>,
  name: string
): DeclaredDependency | null {
  for (const [section, { isProduction }] of Object.entries(DECLARATION_SECTIONS) as [
    DependencyDeclarationSection,
    { readonly isProduction: boolean }
  ][]) {
    const entries = pkg[section] as Record<string, string> | undefined;
    const range = entries?.[name];
    if (typeof range === 'string') {
      return { range, isProduction, section };
    }
  }
  return null;
}

interface LockfileShape {
  packages?: Record<string, { readonly version?: string }>;
  dependencies?: Record<string, { readonly version?: string }>;
}

function readLockfileInstalledVersion(projectRoot: string, name: string): string | null {
  const lockPath = path.resolve(projectRoot, 'package-lock.json');
  if (!fs.existsSync(lockPath)) return null;
  const raw = safeReadFileSync(lockPath);
  if (!raw) return null;
  const lock = safeJsonParse<LockfileShape>(raw);
  if (!lock) return null;
  const pkgVersion = lock.packages?.[`node_modules/${name}`]?.version;
  if (pkgVersion) return pkgVersion;
  const legacyDepVersion = lock.dependencies?.[name]?.version;
  if (legacyDepVersion) return legacyDepVersion;
  return null;
}

export type DependencyEvaluationStatus =
  | 'satisfied'
  | 'outdated_range'
  | 'outdated_installed'
  | 'exceeds_max_range'
  | 'exceeds_max_installed'
  | 'undeclared';

export interface DependencyEvaluation {
  readonly name: string;
  readonly requiredFloor: string;
  readonly declaredRange: string | null;
  readonly declaredFloor: string | null;
  readonly installedVersion: string | null;
  readonly isProduction: boolean;
  readonly section: DependencyDeclarationSection | null;
  readonly status: DependencyEvaluationStatus;
  readonly installCommand?: string;
}

export interface ProjectDependenciesReport {
  readonly projectRoot: string;
  readonly evaluated: readonly DependencyEvaluation[];
  readonly totalGoverned: number;
  readonly declaredCount: number;
  readonly satisfiedCount: number;
  readonly outdatedCount: number;
  readonly undeclaredCount: number;
  readonly prodUpdates: readonly string[];
  readonly devUpdates: readonly string[];
  readonly prodInstallCommand?: string;
  readonly devInstallCommand?: string;
}

export function repairPackageJsonMinimumRanges(
  projectRoot: string,
  pkg: PackageJsonDTO,
  minimums: AuditorMinimumVersions = getAuditorMinimumVersions(),
  maximums: AuditorMaximumVersions = getAuditorMaximumVersions()
): { readonly modified: boolean; readonly pkg: PackageJsonDTO } {
  let modified = false;
  const nextDeps = pkg.dependencies ? { ...pkg.dependencies } : undefined;
  const nextDevDeps = pkg.devDependencies ? { ...pkg.devDependencies } : undefined;
  const nextOptDeps = pkg.optionalDependencies ? { ...pkg.optionalDependencies } : undefined;

  const sectionMap: Record<DependencyDeclarationSection, Record<string, string> | undefined> = {
    dependencies: nextDeps,
    devDependencies: nextDevDeps,
    optionalDependencies: nextOptDeps
  };

  for (const [name, floor] of Object.entries(minimums)) {
    const declared = findDeclaredDependency(pkg, name);
    if (!declared) continue;
    const targetSection = sectionMap[declared.section];
    if (!targetSection) continue;

    const declaredMin = semver.validRange(declared.range)
      ? semver.minVersion(declared.range)
      : null;
    const requiredMin = semver.minVersion(floor);
    const belowMin = Boolean(declaredMin && requiredMin && semver.lt(declaredMin, requiredMin));
    const maxSpec = maximums[name];
    const exceedsMax = Boolean(
      maxSpec &&
      semver.validRange(declared.range) &&
      semver.intersects(declared.range, maxSpec.prohibitedRange)
    );

    if (belowMin || exceedsMax) {
      targetSection[name] = normalizeToCaretRange(floor);
      modified = true;
    } else {
      const normalizedCaret = normalizePinnedVersionToCaret(declared.range);
      if (normalizedCaret) {
        targetSection[name] = normalizedCaret;
        modified = true;
      }
    }
  }

  if (!modified) {
    return { modified: false, pkg };
  }

  const updatedPkg: PackageJsonDTO = {
    ...pkg,
    ...(nextDeps ? { dependencies: nextDeps } : {}),
    ...(nextDevDeps ? { devDependencies: nextDevDeps } : {}),
    ...(nextOptDeps ? { optionalDependencies: nextOptDeps } : {})
  };
  writePackageJson(projectRoot, updatedPkg);
  return { modified: true, pkg: updatedPkg };
}

function isLockedVersionBelowRange(
  lockedVersion: string | undefined,
  declaredRange: string | undefined
): boolean {
  if (!lockedVersion || !declaredRange || !semver.valid(lockedVersion)) return false;
  if (!semver.validRange(declaredRange)) return false;
  const minRequired = semver.minVersion(declaredRange);
  return Boolean(minRequired && semver.lt(lockedVersion, minRequired));
}

function isVitestClusterPackageName(pkgName: string): boolean {
  const cleanName = pkgName.replace(/\/$/, '');
  return (
    cleanName === 'vite-plus' ||
    cleanName.startsWith('vite-plus/') ||
    cleanName === 'vitest' ||
    cleanName.startsWith('vitest/') ||
    cleanName.startsWith('@vitest/')
  );
}

function isVitestClusterLockKey(lockKey: string): boolean {
  const normalized = lockKey.replaceAll('\\', '/');
  const segments = normalized.split('node_modules/').slice(1);
  return segments.some((seg) => isVitestClusterPackageName(seg));
}

/**
 * Prunes coupled vite-plus / vitest / @vitest/* entries from package-lock.json when
 * their locked versions fall below the floors declared in package.json, preventing
 * npm Arborist ERESOLVE peer conflicts caused by exact peerDependencies across @vitest/*.
 */
export function pruneStaleVitestClusterFromLockfile(projectRoot: string): boolean {
  const root = path.resolve(projectRoot);
  const lockPath = path.join(root, 'package-lock.json');
  if (!fs.existsSync(lockPath)) return false;

  const pkg = getPackageJson(root, true);
  if (!pkg) return false;

  const rawText = safeReadFileSync(lockPath);
  if (!rawText) return false;
  const rawLock = safeJsonParse<LockfileShape & Record<string, unknown>>(rawText);
  if (!rawLock) return false;

  const packages = rawLock.packages;
  const legacyDeps = rawLock.dependencies;
  if (!packages && !legacyDeps) return false;

  const vitePlusRange = findDeclaredDependency(pkg, 'vite-plus')?.range;
  const coverageRange = findDeclaredDependency(pkg, '@vitest/coverage-v8')?.range;
  const vitestRange = findDeclaredDependency(pkg, 'vitest')?.range;

  const lockedVitePlus =
    packages?.['node_modules/vite-plus']?.version ?? legacyDeps?.['vite-plus']?.version;
  const lockedVitest = packages?.['node_modules/vitest']?.version ?? legacyDeps?.vitest?.version;
  const lockedCoverage =
    packages?.['node_modules/@vitest/coverage-v8']?.version ??
    legacyDeps?.['@vitest/coverage-v8']?.version;

  const needsClusterPrune =
    isLockedVersionBelowRange(lockedVitePlus, vitePlusRange) ||
    isLockedVersionBelowRange(lockedCoverage, coverageRange) ||
    isLockedVersionBelowRange(lockedVitest, coverageRange) ||
    isLockedVersionBelowRange(lockedVitest, vitestRange);

  if (!needsClusterPrune) return false;

  let removed = false;
  if (packages && typeof packages === 'object') {
    const nextPackages: Record<string, { readonly version?: string }> = {};
    for (const [key, val] of Object.entries(packages)) {
      if (isVitestClusterLockKey(key)) {
        removed = true;
      } else {
        nextPackages[key] = val;
      }
    }
    rawLock.packages = nextPackages;
  }

  if (legacyDeps && typeof legacyDeps === 'object') {
    const nextDeps: Record<string, { readonly version?: string }> = {};
    for (const [key, val] of Object.entries(legacyDeps)) {
      if (isVitestClusterPackageName(key)) {
        removed = true;
      } else {
        nextDeps[key] = val;
      }
    }
    rawLock.dependencies = nextDeps;
  }

  if (!removed) return false;
  fs.writeFileSync(lockPath, JSON.stringify(rawLock, null, 2) + '\n', 'utf8');
  return true;
}

function classifyDependencyStatus(
  declaredRange: string,
  declaredMin: semver.SemVer | null,
  requiredMin: semver.SemVer | null,
  installedVersion: string | null,
  maxSpec?: DependencyMaximumSpec
): DependencyEvaluationStatus {
  if (maxSpec && semver.intersects(declaredRange, maxSpec.prohibitedRange)) {
    return 'exceeds_max_range';
  }
  if (
    maxSpec &&
    installedVersion &&
    semver.valid(installedVersion) &&
    semver.satisfies(installedVersion, maxSpec.prohibitedRange)
  ) {
    return 'exceeds_max_installed';
  }
  if (declaredMin && requiredMin && semver.lt(declaredMin, requiredMin)) {
    return 'outdated_range';
  }
  if (
    installedVersion &&
    semver.valid(installedVersion) &&
    requiredMin &&
    semver.lt(installedVersion, requiredMin)
  ) {
    return 'outdated_installed';
  }
  return 'satisfied';
}

export function evaluateProjectDependencies(
  projectRoot: string = process.cwd(),
  minimumsOverride?: AuditorMinimumVersions
): ProjectDependenciesReport {
  const root = path.resolve(projectRoot);
  const minimums = minimumsOverride ?? getAuditorMinimumVersions();
  const maximums = getAuditorMaximumVersions();
  const pkg = getPackageJson(root, true);

  const evaluated: DependencyEvaluation[] = [];
  const prodUpdates: string[] = [];
  const devUpdates: string[] = [];

  for (const [name, floor] of Object.entries(minimums)) {
    const declared = pkg ? findDeclaredDependency(pkg, name) : null;
    const requiredMin = semver.minVersion(floor);
    const installedVersion = readLockfileInstalledVersion(root, name);

    if (!declared) {
      evaluated.push({
        name,
        requiredFloor: floor,
        declaredRange: null,
        declaredFloor: null,
        installedVersion,
        isProduction: false,
        section: null,
        status: 'undeclared'
      });
      continue;
    }

    const declaredMin = semver.validRange(declared.range)
      ? semver.minVersion(declared.range)
      : null;
    const declaredFloor = declaredMin ? declaredMin.version : null;
    const isProd = declared.isProduction;
    const status = classifyDependencyStatus(
      declared.range,
      declaredMin,
      requiredMin,
      installedVersion,
      maximums[name]
    );

    const installCommand =
      status !== 'satisfied' ? `npm install ${isProd ? '' : '-D '}${name}@${floor}` : undefined;

    if (status !== 'satisfied') {
      (isProd ? prodUpdates : devUpdates).push(`${name}@${floor}`);
    }

    evaluated.push({
      name,
      requiredFloor: floor,
      declaredRange: declared.range,
      declaredFloor,
      installedVersion,
      isProduction: isProd,
      section: declared.section,
      status,
      installCommand
    });
  }

  const declaredItems = evaluated.filter((e) => e.status !== 'undeclared');
  const satisfiedCount = declaredItems.filter((e) => e.status === 'satisfied').length;
  const outdatedCount = declaredItems.filter((e) => e.status !== 'satisfied').length;
  const undeclaredCount = evaluated.filter((e) => e.status === 'undeclared').length;

  return {
    projectRoot: root,
    evaluated,
    totalGoverned: Object.keys(minimums).length,
    declaredCount: declaredItems.length,
    satisfiedCount,
    outdatedCount,
    undeclaredCount,
    prodUpdates,
    devUpdates,
    prodInstallCommand: prodUpdates.length > 0 ? `npm install ${prodUpdates.join(' ')}` : undefined,
    devInstallCommand: devUpdates.length > 0 ? `npm install -D ${devUpdates.join(' ')}` : undefined
  };
}

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
import semver from 'semver';
import type { DependencyLocation } from 'fallow/types';
import { getPackageJson } from './packageJson.ts';

export type AuditorMinimumVersions = Readonly<Record<string, string>>; // open-record: package name -> declared semver range

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
    reason: 'TypeScript 7+ no está permitido por incompatibilidades con el compilador de componentes Vue.'
  }
});

export function getAuditorMaximumVersions(): AuditorMaximumVersions {
  return AUDITOR_MAXIMUM_VERSIONS;
}

export function getAuditorMinimumVersions(): AuditorMinimumVersions {
  const auditorPackageJsonPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../package.json'
  );

  if (fs.existsSync(auditorPackageJsonPath)) {
    const data = JSON.parse(fs.readFileSync(auditorPackageJsonPath, 'utf8')) as {
      peerDependencies?: Record<string, string>; // open-record: parsed package.json peerDependencies
    };
    if (data.peerDependencies && Object.keys(data.peerDependencies).length > 0) {
      return data.peerDependencies;
    }
  }

  throw new Error(
    `[getAuditorMinimumVersions] Could not read peerDependencies from @francogp/auditor package.json (${auditorPackageJsonPath}). Hardcoded fallbacks are strictly prohibited.`
  );
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
  readonly packages?: Readonly<Record<string, { readonly version?: string }>>;
  readonly dependencies?: Readonly<Record<string, { readonly version?: string }>>;
}

function readLockfileInstalledVersion(projectRoot: string, name: string): string | null {
  const lockPath = path.resolve(projectRoot, 'package-lock.json');
  if (!fs.existsSync(lockPath)) return null;
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as LockfileShape;
    const pkgVersion = lock.packages?.[`node_modules/${name}`]?.version;
    if (pkgVersion) return pkgVersion;
    const legacyDepVersion = lock.dependencies?.[name]?.version;
    if (legacyDepVersion) return legacyDepVersion;
    return null;
  } catch {
    return null;
  }
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
  readonly prodInstallCommand?: string;
  readonly devInstallCommand?: string;
}

export function evaluateProjectDependencies(
  projectRoot: string = process.cwd()
): ProjectDependenciesReport {
  const root = path.resolve(projectRoot);
  const minimums = getAuditorMinimumVersions();
  const maximums = getAuditorMaximumVersions();
  const pkg = getPackageJson(root, true);

  const evaluated: DependencyEvaluation[] = [];
  const prodUpdates: string[] = []; // no-domain: Dynamic npm install package specifier accumulator
  const devUpdates: string[] = []; // no-domain: Dynamic npm install package specifier accumulator

  for (const [name, floor] of Object.entries(minimums)) {
    const declared = pkg ? findDeclaredDependency(pkg as Record<string, unknown>, name) : null;
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

    let status: DependencyEvaluationStatus = 'satisfied';

    const maxSpec = maximums[name];
    if (maxSpec && semver.intersects(declared.range, maxSpec.prohibitedRange)) {
      status = 'exceeds_max_range';
    } else if (
      maxSpec &&
      installedVersion &&
      semver.valid(installedVersion) &&
      semver.satisfies(installedVersion, maxSpec.prohibitedRange)
    ) {
      status = 'exceeds_max_installed';
    } else if (declaredMin && requiredMin && semver.lt(declaredMin, requiredMin)) {
      status = 'outdated_range';
    } else if (
      installedVersion &&
      semver.valid(installedVersion) &&
      requiredMin &&
      semver.lt(installedVersion, requiredMin)
    ) {
      status = 'outdated_installed';
    }

    const installCommand =
      status !== 'satisfied' ? `npm install ${isProd ? '' : '-D '}${name}@${floor}` : undefined;

    if (status !== 'satisfied') {
      if (isProd) {
        prodUpdates.push(`${name}@${floor}`);
      } else {
        devUpdates.push(`${name}@${floor}`);
      }
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

  const prodInstallCommand =
    prodUpdates.length > 0 ? `npm install ${prodUpdates.join(' ')}` : undefined;

  const devInstallCommand =
    devUpdates.length > 0 ? `npm install -D ${devUpdates.join(' ')}` : undefined;

  return {
    projectRoot: root,
    evaluated,
    totalGoverned: Object.keys(minimums).length,
    declaredCount: declaredItems.length,
    satisfiedCount,
    outdatedCount,
    undeclaredCount,
    prodInstallCommand,
    devInstallCommand
  };
}

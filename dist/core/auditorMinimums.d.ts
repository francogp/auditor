import { PackageJsonDTO } from "./packageJson.js";
import { DependencyLocation } from "fallow/types";
export type AuditorMinimumVersions = Readonly<Record<string, string>>;
export interface DependencyMaximumSpec {
  readonly ceiling: string;
  readonly prohibitedRange: string;
  readonly reason: string;
}
export type AuditorMaximumVersions = Readonly<Record<string, DependencyMaximumSpec>>;
export declare const AUDITOR_MAXIMUM_VERSIONS: AuditorMaximumVersions;
export declare function getAuditorMaximumVersions(): AuditorMaximumVersions;
export declare function normalizeToCaretRange(range: string): string;
export declare function getAuditorMinimumVersions(): AuditorMinimumVersions;
export declare function getAuditorManagedDependencyFloors(): AuditorMinimumVersions;
export interface ConflictingOverrideFinding {
  readonly name: string;
  readonly declaredOverride: string;
  readonly reason: string;
}
export declare function evaluateConflictingOverrides(projectRoot: string, pkgOverrides: Readonly<Record<string, string>> | undefined): readonly ConflictingOverrideFinding[];
export declare function readHostInstalledAuditorMinimums(projectRoot: string): AuditorMinimumVersions | null;
export declare function extractExactPinnedVersion(range: string): string | null;
export type DependencyDeclarationSection = DependencyLocation;
export interface DeclaredDependency {
  readonly range: string;
  readonly isProduction: boolean;
  readonly section: DependencyDeclarationSection;
}
export declare function findDeclaredDependency(pkg: Readonly<Record<string, unknown>>, name: string): DeclaredDependency | null;
interface LockfileRootEntry {
  readonly version?: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
}
export interface LockfileShape {
  packages?: Record<string, LockfileRootEntry>;
  dependencies?: Record<string, {
    readonly version?: string;
  }>;
}
export interface LockfileSyncCheckResult {
  readonly inSync: boolean;
  readonly reason: string | null;
}
/**
 * Verifies whether package-lock.json is synchronized with package.json (root sections + overrides).
 * Skips gracefully when package-lock.json lacks a root `""` entry (e.g. minimal synthetic fixtures).
 */
export declare function evaluateLockfileSync(projectRoot: string, pkg: PackageJsonDTO, lock: LockfileShape | null): LockfileSyncCheckResult;
/**
 * Runs `npm install --no-audit --no-fund` to resynchronize package-lock.json and node_modules.
 */
export declare function defaultLockfileInstaller(projectRoot: string): void;
export type DependencyEvaluationStatus = 'satisfied' | 'outdated_range' | 'outdated_installed' | 'exceeds_max_range' | 'exceeds_max_installed' | 'undeclared';
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
export declare function repairPackageJsonMinimumRanges(projectRoot: string, pkg: PackageJsonDTO, minimums?: AuditorMinimumVersions, maximums?: AuditorMaximumVersions): {
  readonly modified: boolean;
  readonly pkg: PackageJsonDTO;
};
/**
 * Prunes coupled vite-plus / vitest / @vitest/* entries from package-lock.json when
 * their locked versions fall below the floors declared in package.json, preventing
 * npm Arborist ERESOLVE peer conflicts caused by exact peerDependencies across @vitest/*.
 */
export declare function pruneStaleVitestClusterFromLockfile(projectRoot: string): boolean;
export declare function evaluateProjectDependencies(projectRoot?: string, minimumsOverride?: AuditorMinimumVersions): ProjectDependenciesReport;
export {};
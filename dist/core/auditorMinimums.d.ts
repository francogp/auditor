/**
 * src/core/auditorMinimums.ts
 *
 * SSoT for mandatory minimum library versions exposed to host projects.
 * The floor of every library is the range declared in the `peerDependencies`
 * of `@francogp/auditor/package.json`. Zero hardcoded versions in code.
 */
import type { DependencyLocation } from 'fallow/types';
export type AuditorMinimumVersions = Readonly<Record<string, string>>;
export declare function getAuditorMinimumVersions(): AuditorMinimumVersions;
export type DependencyDeclarationSection = DependencyLocation;
export interface DeclaredDependency {
    readonly range: string;
    readonly isProduction: boolean;
    readonly section: DependencyDeclarationSection;
}
export declare function findDeclaredDependency(pkg: Readonly<Record<string, unknown>>, name: string): DeclaredDependency | null;
export type DependencyEvaluationStatus = 'satisfied' | 'outdated_range' | 'outdated_installed' | 'undeclared';
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
export declare function evaluateProjectDependencies(projectRoot?: string): ProjectDependenciesReport;
//# sourceMappingURL=auditorMinimums.d.ts.map
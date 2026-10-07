/**
 * packages/auditor/src/cli/auditTaskFactory.ts
 *
 * Task definition construction, permission resolution, and execution filtering
 * for auditor auto-discovery.
 */
import { type AuditFamily, type AuditTaskDefinition, type AuditorCapabilities } from '../core/auditContract.ts';
import { type loadAuditConfig } from '../core/auditConfig.ts';
export interface DiscoveryOptions {
    baseDir?: string;
    projectRoot?: string;
    family?: string;
    task?: string;
    suites?: string[];
    preset?: string;
    fastOnly?: boolean;
    skipSimilar?: boolean;
    fixOnly?: boolean;
    lintOnly?: boolean;
    mdOnly?: boolean;
    buildOnly?: boolean;
    withBuild?: boolean;
    includeHeavy?: boolean;
}
export declare function getTimeoutForTask(_filename: string, configRunnerTimeout?: number): number;
export declare const DEFAULT_PERMISSIONS: readonly ["--permission", "--experimental-strip-types", "--allow-fs-read=*", "--allow-fs-write=*", "--allow-child-process", "--allow-addons"];
export declare function getPermissionsForTask(filename: string, fullPath?: string): string[];
/** Convert snake_case or kebab-case filename to Title Case */
export declare function formatTaskTitle(filename: string): string;
export declare function shouldSkipTaskByFilters(id: string, filename: string, family: AuditFamily, isFast: boolean, options: DiscoveryOptions, targetSuiteIds: Set<string> | null): boolean;
export declare function shouldSkipTaskByCapabilities(capabilities: Partial<AuditorCapabilities> | undefined, options: DiscoveryOptions): boolean;
export declare function buildTaskCliArguments(filename: string, fullPath: string, id: string, isBuiltin: boolean, options: DiscoveryOptions): string[];
export declare function createAuditTaskDefinition(fullPath: string, filename: string, family: AuditFamily, config: Awaited<ReturnType<typeof loadAuditConfig>>, options: DiscoveryOptions, isBuiltin: boolean, targetSuiteIds: Set<string> | null): Promise<AuditTaskDefinition | null>;
//# sourceMappingURL=auditTaskFactory.d.ts.map
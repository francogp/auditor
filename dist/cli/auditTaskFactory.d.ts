import { loadAuditConfig } from "../core/auditConfigLoader.js";
import { AuditExecutionPhase, AuditExecutionSpeed, AuditFamily, AuditTaskDefinition, AuditorRuleCapabilities } from "../core/auditContract.js";
import { DEFAULT_PERMISSIONS } from "../core/permissionGuard.js";
//#region src/cli/auditTaskFactory.d.ts
export interface DiscoveryOptions {
  baseDir?: string;
  projectRoot?: string;
  family?: string;
  task?: string;
  suites?: string[];
  preset?: string;
  speed?: AuditExecutionSpeed;
  onlySpeed?: AuditExecutionSpeed;
  phase?: AuditExecutionPhase;
  fastOnly?: boolean;
  skipSimilar?: boolean;
  fixOnly?: boolean;
  lintOnly?: boolean;
  criticalOnly?: boolean;
  onlyCritical?: boolean;
  precommitOnly?: boolean;
  mdOnly?: boolean;
  buildOnly?: boolean;
  withBuild?: boolean;
  includeHeavy?: boolean;
}
export declare function getTimeoutForTask(_filename: string, configRunnerTimeout?: number): number;
export declare function getPermissionsForTask(filename: string, fullPath?: string): string[];
/** Convert snake_case or kebab-case filename to Title Case */
export declare function formatTaskTitle(filename: string): string;
export declare function shouldSkipTaskByFilters(id: string, filename: string, family: AuditFamily, isFast: boolean, options: DiscoveryOptions, targetSuiteIds: Set<string> | null): boolean;
export declare function shouldSkipTaskByCapabilities(capabilities: Partial<AuditorRuleCapabilities> | undefined, options: DiscoveryOptions): boolean;
export declare function buildTaskCliArguments(filename: string, fullPath: string, id: string, isBuiltin: boolean, options: DiscoveryOptions): string[];
export declare function createAuditTaskDefinition(fullPath: string, filename: string, family: AuditFamily, config: Awaited<ReturnType<typeof loadAuditConfig>>, options: DiscoveryOptions, isBuiltin: boolean, targetSuiteIds: Set<string> | null): Promise<AuditTaskDefinition | null>;
//#endregion
export { DEFAULT_PERMISSIONS };
import { ChunkBudgetConfig } from "../core/auditConfigTypes.js";
import { SubAuditorStatus } from "../core/auditContract.js";
//#region src/cli/audit_bundle.d.ts
export interface ModuleMeta {
  readonly id: string;
}
export interface NodePart {
  readonly metaUid: string;
  readonly renderedLength: number;
  readonly gzipLength: number;
  readonly brotliLength?: number;
}
export interface VisualizerData {
  readonly nodeMetas: Record<string, ModuleMeta>;
  readonly nodeParts: Record<string, NodePart>;
}
export interface AggregatedModule {
  readonly id: string;
  readonly rendered: number;
  readonly gzip: number;
  readonly heavyChunkCount: number;
  readonly count: number;
}
export type ChunkAuditStatus = SubAuditorStatus;
export interface ChunkAuditResult {
  readonly filename: string;
  readonly sizeBytes: number;
  readonly sizeKB: string;
  readonly gzipBytes?: number;
  readonly gzipKB?: string;
  readonly compressionRatio?: string;
  readonly status: ChunkAuditStatus;
  readonly budgetName?: string;
  readonly budgetLimitBytes?: number;
  readonly note: string;
}
export interface BundleAuditSummary {
  readonly success: boolean;
  readonly totalErrors: number;
  readonly totalWarnings: number;
  readonly topModules: readonly AggregatedModule[];
  readonly chunkResults: readonly ChunkAuditResult[];
  readonly duplicateViolations: readonly string[];
}
export declare const BYTES_PER_KB = 1024;
export declare const DEFAULT_HEAVY_CHUNK_THRESHOLD: number;
export declare const DEFAULT_UNBUDGETED_CHUNK_LIMIT: number;
export declare const DEFAULT_TOP_MODULES_LIMIT = 15;
export declare const DEFAULT_DUPLICATE_MODULE_THRESHOLD_BYTES: number;
export declare function parseVisualizerData(content: string): VisualizerData | null;
export declare function aggregateModuleSizes(data: VisualizerData, heavyChunkThreshold?: number): readonly AggregatedModule[];
export declare function auditSingleChunk(filename: string, fullPath: string, budgets: readonly ChunkBudgetConfig[], unbudgetedLimit?: number): ChunkAuditResult;
export interface DiscoveredChunk {
  readonly filename: string;
  readonly fullPath: string;
}
export declare function discoverCompiledChunks(targetDir: string): readonly DiscoveredChunk[];
export declare function resolveDistDir(projectRoot: string, configuredDistDir?: string): string;
export declare function runBundleAudit(projectRoot?: string): Promise<BundleAuditSummary>;
export declare function executeCli(rawArgs?: readonly string[]): Promise<void>;
//#endregion
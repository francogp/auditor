/**
 * packages/auditor/src/core/auditConfigLoader.ts
 *
 * Config loader, in-memory cache, and child process environment serialization.
 */
import { type AuditEngineConfig } from './auditConfigTypes.ts';
export declare const MAX_INLINE_ENV_CONFIG_CHARS = 16384;
export declare function sanitizePath(inputPath: string): string;
export declare function tryLoadJsonConfig(jsonConfigPath: string, projectRoot: string, logWarning?: boolean): AuditEngineConfig | null;
export declare function serializeAuditConfigToEnv(config: AuditEngineConfig, projectRoot?: string): void;
export declare function tryLoadConfigFromEnv(projectRoot: string): AuditEngineConfig | null;
export declare function loadAuditConfig(projectRoot?: string): Promise<AuditEngineConfig>;
export declare function getAuditConfig(projectRoot?: string): AuditEngineConfig;
export declare function setAuditConfig(config: AuditEngineConfig, projectRoot?: string): void;
export declare function resetAuditConfig(): void;
//# sourceMappingURL=auditConfigLoader.d.ts.map
import { AuditEngineConfig, AuditVitePlusConfig, DeepPartial } from "./auditConfigTypes.js";
export declare const DEFAULT_SIMILAR_CODE_THRESHOLD = 0.95;
export declare const DEFAULT_TEST_COVERAGE_PERCENTAGE = 80;
export declare const DEFAULT_TYPE_COVERAGE_AT_LEAST = 95;
export declare const DEFAULT_PRECOMPRESS_THRESHOLD_BYTES = 512;
export declare const DEFAULT_CANONICAL_LINT_PLUGINS: readonly ["vitest", "node", "promise", "unicorn", "typescript", "vue", "import", "jsx-a11y"];
export declare const DEFAULT_VITE_PLUS_AUDIT_CONFIG: Readonly<AuditVitePlusConfig>;
export declare const DEFAULT_AUDIT_CONFIG: AuditEngineConfig;
export declare function collectDeclaredSubsystems(config: DeepPartial<AuditEngineConfig>): Set<string>;
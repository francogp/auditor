/**
 * packages/auditor/src/index.ts
 *
 * UNIFIED AUDIT ENGINE (Node.js 26+)
 * Main entry point for the generic static analysis and architecture audit framework.
 */
export * from "./core/auditContract.js";
export * from "./core/auditConfig.js";
export * from "./core/auditorBase.js";
export * from "./core/astContext.js";
export * from "./core/streamingRunner.js";
export * from "./core/unifiedTheme.js";
export * from "./core/suiteGating.js";
export * from "./core/reportUtils.js";
export * from "./core/safePath.js";
export * from "./core/gitignoreMatcher.js";
export * from "./core/gitIgnoreRegistry.js";
export * from "./core/configFileRegistry.js";
export * from "./cli/auditScanner.js";
export * from "./cli/check_environment.js";
export * from "./cli/init_agent.js";
export * from "./cli/sync_env_scripts.js";
export * from "./cli/cliUtils.js";
export * from "./core/version.js";
export * from "./core/auditorContractConformance.js";
export * from "./plugin/defineAuditorExtension.js";
export * from "./suites/persistence/validate_valibot_parity.js";
//# sourceMappingURL=index.js.map
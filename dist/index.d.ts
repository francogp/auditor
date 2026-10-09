/**
 * packages/auditor/src/index.ts
 *
 * UNIFIED AUDIT ENGINE (Node.js 26+)
 * Main entry point for the generic static analysis and architecture audit framework.
 */
export * from './core/auditContract.ts';
export * from './core/auditConfig.ts';
export * from './core/auditorBase.ts';
export * from './core/auditedDocument.ts';
export * from './core/astContext.ts';
export * from './core/streamingRunner.ts';
export * from './core/unifiedTheme.ts';
export * from './core/suiteGating.ts';
export * from './core/reportUtils.ts';
export * from './core/safePath.ts';
export * from './core/auditPathPredicates.ts';
export * from './core/auditRootMatcher.ts';
export * from './core/auditTestPredicates.ts';
export * from './core/auditProjectIdentity.ts';
export * from './core/scannerUtils.ts';
export * from './core/auditZLayers.ts';
export * from './core/gitignoreMatcher.ts';
export * from './core/gitIgnoreRegistry.ts';
export * from './core/configFileRegistry.ts';
export * from './core/packageScriptRegistry.ts';
export * from './cli/auditScanner.ts';
export * from './cli/check_environment.ts';
export * from './cli/init_agent.ts';
export * from './cli/sync_env_scripts.ts';
export * from './cli/cliUtils.ts';
export * from './core/version.ts';
export * from './core/auditorContractConformance.ts';
export * from './plugin/defineAuditorExtension.ts';
export { VUE_SFC_BLOCK_TAGS, type VueSfcBlockTag, type VueSfcBlock, parseVueSfc, parseVueSfcBlocks, type VueSfcBlocks as VueParsedSfcBlocks } from './core/vueSfcParser.ts';
export * from './analyzers/homebrew/index.ts';
export * from './suites/architecture/validate_auditor_hygiene.ts';
export * from './suites/persistence/validate_valibot_parity.ts';
//# sourceMappingURL=index.d.ts.map
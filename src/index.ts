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
export * from './core/auditBootstrap.ts';
export * from './core/auditorContractConformance.ts';
export * from './plugin/defineAuditorExtension.ts';
export {
  VUE_SFC_BLOCK_TAGS,
  type VueSfcBlockTag,
  type VueSfcBlock,
  parseVueSfc,
  parseVueSfcBlocks,
  type VueSfcBlocks as VueParsedSfcBlocks
} from './core/vueSfcParser.ts';
export * from './analyzers/homebrew/index.ts';
export * from './core/npmCommandUtils.ts';
export * from './suites/architecture/validate_auditor_hygiene.ts';
export * from './suites/architecture/validate_script_commands.ts';
export * from './suites/architecture/validate_script_extensions.ts';
export * from './suites/persistence/validate_valibot_parity.ts';
export * from './core/domainTypeOxlintPlugin.ts';
export * from './core/vitePlusConfigSync.ts';
export * from './suites/architecture/validate_oxlint.ts';
export * from './suites/architecture/validate_oxfmt.ts';
export * from './suites/architecture/validate_vite_plus_config.ts';
export * from './suites/architecture/validate_file_encoding.ts';
export * from './core/vitePrecompressPlugin.ts';
export * from './core/refactor/baseRefactorEngine.ts';
export * from './core/refactor/classHierarchyHoister.ts';
export * from './core/refactor/domainRefactorEngine.ts';
export * from './core/refactor/dupesRefactorEngine.ts';
export * from './core/refactor/hybridHarness.ts';
export * from './core/refactor/magicContracts.ts';
export * from './core/refactor/magicNumberExtractor.ts';
export * from './core/refactor/magicNumberHarness.ts';
export * from './core/refactor/microContextExtractor.ts';
export * from './core/refactor/motionRefactorEngine.ts';
export * from './core/refactor/o1RefactorEngine.ts';
export * from './core/refactor/paramPermutationMapper.ts';
export * from './core/refactor/refactorCliHarness.ts';
export * from './core/refactor/refactorContracts.ts';
export * from './core/refactor/refactorFileScanner.ts';
export * from './core/refactor/typesRefactorEngine.ts';
export * from './core/refactor/worktreeSandbox.ts';

/**
 * src/analyzers/homebrew/detectors/thirdPartyToolContractDetector.ts
 *
 * Detects discrepancies between third-party tool execution and the constructor contract:
 * 1. If an auditor invokes external tool runners or binaries (executeNodeCli, resolvePackageBin,
 *    executeCliAndReadJson, executeFallowJsonCommand, resolveFallowBinary, stylelint.lint,
 *    spawnSync, execSync, execFileSync) but fails to declare `usesThirdPartyTool: true` with a valid
 *    `thirdPartyToolPolicy`.
 * 2. If an auditor declares `usesThirdPartyTool: true` but contains zero external tool invocations.
 */
import type { HomebrewDetector } from '../homebrewTypes.ts';
export declare const thirdPartyToolContractDetector: HomebrewDetector;
//# sourceMappingURL=thirdPartyToolContractDetector.d.ts.map
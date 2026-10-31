import { AUDITOR_HOMEBREW_RULES, createLineDetector, isInsideStringLiteral } from "./homebrewTypes.js";
import { braceCountingDetector } from "./detectors/braceCountingDetector.js";
import { commentStrippingDetector } from "./detectors/commentStrippingDetector.js";
import { fileWalkerDetector } from "./detectors/fileWalkerDetector.js";
import { hardcodedConfigDetector } from "./detectors/hardcodedConfigDetector.js";
import { inefficientFileScanDetector } from "./detectors/inefficientFileScanDetector.js";
import { manualStepLoggingDetector } from "./detectors/manualStepLoggingDetector.js";
import { manualTimingDetector } from "./detectors/manualTimingDetector.js";
import { packageJsonDetector } from "./detectors/packageJsonDetector.js";
import { predicatesDetector } from "./detectors/predicatesDetector.js";
import { rawConsoleDetector } from "./detectors/rawConsoleDetector.js";
import { redundantRuleEvaluatedDetector } from "./detectors/redundantRuleEvaluatedDetector.js";
import { thirdPartyToolContractDetector } from "./detectors/thirdPartyToolContractDetector.js";
import { tsAstDetector } from "./detectors/tsAstDetector.js";
import { unmeasuredRuleDetector } from "./detectors/unmeasuredRuleDetector.js";
import { vueSfcRegexDetector } from "./detectors/vueSfcRegexDetector.js";
import { HomebrewDetectorRegistry, HomebrewDetectorRegistryImpl } from "./homebrewRegistry.js";
// src/analyzers/homebrew/index.ts
/**
* src/analyzers/homebrew/index.ts
*
* Public entrypoint and default registry bootstrap for homebrew detectors.
*/
HomebrewDetectorRegistry.register(packageJsonDetector);
HomebrewDetectorRegistry.register(vueSfcRegexDetector);
HomebrewDetectorRegistry.register(tsAstDetector);
HomebrewDetectorRegistry.register(rawConsoleDetector);
HomebrewDetectorRegistry.register(commentStrippingDetector);
HomebrewDetectorRegistry.register(braceCountingDetector);
HomebrewDetectorRegistry.register(fileWalkerDetector);
HomebrewDetectorRegistry.register(predicatesDetector);
HomebrewDetectorRegistry.register(manualTimingDetector);
HomebrewDetectorRegistry.register(hardcodedConfigDetector);
HomebrewDetectorRegistry.register(manualStepLoggingDetector);
HomebrewDetectorRegistry.register(unmeasuredRuleDetector);
HomebrewDetectorRegistry.register(redundantRuleEvaluatedDetector);
HomebrewDetectorRegistry.register(thirdPartyToolContractDetector);
HomebrewDetectorRegistry.register(inefficientFileScanDetector);
export { AUDITOR_HOMEBREW_RULES, HomebrewDetectorRegistry, HomebrewDetectorRegistryImpl, braceCountingDetector, commentStrippingDetector, createLineDetector, fileWalkerDetector, hardcodedConfigDetector, inefficientFileScanDetector, isInsideStringLiteral, manualStepLoggingDetector, manualTimingDetector, packageJsonDetector, predicatesDetector, rawConsoleDetector, redundantRuleEvaluatedDetector, thirdPartyToolContractDetector, tsAstDetector, unmeasuredRuleDetector, vueSfcRegexDetector };

/**
 * src/analyzers/homebrew/index.ts
 *
 * Public entrypoint and default registry bootstrap for homebrew detectors.
 */

import { braceCountingDetector } from './detectors/braceCountingDetector.ts';
import { commentStrippingDetector } from './detectors/commentStrippingDetector.ts';
import { fileWalkerDetector } from './detectors/fileWalkerDetector.ts';
import { hardcodedConfigDetector } from './detectors/hardcodedConfigDetector.ts';
import { inefficientFileScanDetector } from './detectors/inefficientFileScanDetector.ts';
import { manualStepLoggingDetector } from './detectors/manualStepLoggingDetector.ts';
import { manualTimingDetector } from './detectors/manualTimingDetector.ts';
import { packageJsonDetector } from './detectors/packageJsonDetector.ts';
import { predicatesDetector } from './detectors/predicatesDetector.ts';
import { rawConsoleDetector } from './detectors/rawConsoleDetector.ts';
import { redundantRuleEvaluatedDetector } from './detectors/redundantRuleEvaluatedDetector.ts';
import { thirdPartyToolContractDetector } from './detectors/thirdPartyToolContractDetector.ts';
import { tsAstDetector } from './detectors/tsAstDetector.ts';
import { unmeasuredRuleDetector } from './detectors/unmeasuredRuleDetector.ts';
import { vueSfcRegexDetector } from './detectors/vueSfcRegexDetector.ts';
import { HomebrewDetectorRegistry } from './homebrewRegistry.ts';

// Auto-register canonical built-in detectors
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

export * from './homebrewTypes.ts';
export * from './homebrewRegistry.ts';
export {
  packageJsonDetector,
  vueSfcRegexDetector,
  tsAstDetector,
  rawConsoleDetector,
  commentStrippingDetector,
  braceCountingDetector,
  fileWalkerDetector,
  predicatesDetector,
  manualTimingDetector,
  hardcodedConfigDetector,
  manualStepLoggingDetector,
  unmeasuredRuleDetector,
  redundantRuleEvaluatedDetector,
  thirdPartyToolContractDetector,
  inefficientFileScanDetector
};

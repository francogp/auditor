/**
 * src/analyzers/homebrew/index.ts
 *
 * Public entrypoint and default registry bootstrap for homebrew detectors.
 */
import { HomebrewDetectorRegistry } from "./homebrewRegistry.js";
import { packageJsonDetector } from "./detectors/packageJsonDetector.js";
import { vueSfcRegexDetector } from "./detectors/vueSfcRegexDetector.js";
import { tsAstDetector } from "./detectors/tsAstDetector.js";
import { pathNormalizeDetector } from "./detectors/pathNormalizeDetector.js";
import { rawConsoleDetector } from "./detectors/rawConsoleDetector.js";
import { commentStrippingDetector } from "./detectors/commentStrippingDetector.js";
import { braceCountingDetector } from "./detectors/braceCountingDetector.js";
import { pathContainmentDetector } from "./detectors/pathContainmentDetector.js";
import { fileWalkerDetector } from "./detectors/fileWalkerDetector.js";
import { predicatesDetector } from "./detectors/predicatesDetector.js";
// Auto-register canonical built-in detectors
HomebrewDetectorRegistry.register(packageJsonDetector);
HomebrewDetectorRegistry.register(vueSfcRegexDetector);
HomebrewDetectorRegistry.register(tsAstDetector);
HomebrewDetectorRegistry.register(pathNormalizeDetector);
HomebrewDetectorRegistry.register(rawConsoleDetector);
HomebrewDetectorRegistry.register(commentStrippingDetector);
HomebrewDetectorRegistry.register(braceCountingDetector);
HomebrewDetectorRegistry.register(pathContainmentDetector);
HomebrewDetectorRegistry.register(fileWalkerDetector);
HomebrewDetectorRegistry.register(predicatesDetector);
export * from "./homebrewTypes.js";
export * from "./homebrewRegistry.js";
export { packageJsonDetector, vueSfcRegexDetector, tsAstDetector, pathNormalizeDetector, rawConsoleDetector, commentStrippingDetector, braceCountingDetector, pathContainmentDetector, fileWalkerDetector, predicatesDetector };
//# sourceMappingURL=index.js.map
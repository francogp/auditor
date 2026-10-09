/**
 * src/analyzers/homebrew/index.ts
 *
 * Public entrypoint and default registry bootstrap for homebrew detectors.
 */
import { packageJsonDetector } from './detectors/packageJsonDetector.ts';
import { vueSfcRegexDetector } from './detectors/vueSfcRegexDetector.ts';
import { tsAstDetector } from './detectors/tsAstDetector.ts';
import { pathNormalizeDetector } from './detectors/pathNormalizeDetector.ts';
import { rawConsoleDetector } from './detectors/rawConsoleDetector.ts';
import { commentStrippingDetector } from './detectors/commentStrippingDetector.ts';
import { braceCountingDetector } from './detectors/braceCountingDetector.ts';
import { pathContainmentDetector } from './detectors/pathContainmentDetector.ts';
import { fileWalkerDetector } from './detectors/fileWalkerDetector.ts';
import { predicatesDetector } from './detectors/predicatesDetector.ts';
export * from './homebrewTypes.ts';
export * from './homebrewRegistry.ts';
export { packageJsonDetector, vueSfcRegexDetector, tsAstDetector, pathNormalizeDetector, rawConsoleDetector, commentStrippingDetector, braceCountingDetector, pathContainmentDetector, fileWalkerDetector, predicatesDetector };
//# sourceMappingURL=index.d.ts.map
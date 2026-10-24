import { HomebrewDetector } from "../homebrewTypes.js";
/**
 * src/analyzers/homebrew/detectors/braceCountingDetector.ts
 *
 * Detects manual brace or parenthesis depth counting loops
 * instead of using canonical block helpers in src/core/scannerUtils.ts.
 */
export declare const braceCountingDetector: HomebrewDetector;
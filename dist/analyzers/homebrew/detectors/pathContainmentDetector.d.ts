import { HomebrewDetector } from "../homebrewTypes.js";
//#region src/analyzers/homebrew/detectors/pathContainmentDetector.d.ts
/**
 * src/analyzers/homebrew/detectors/pathContainmentDetector.ts
 *
 * Detects manual startsWith('..') path escape checks
 * instead of using canonical isPathContained() or safeResolve() from src/core/safePath.ts.
 */
export declare const pathContainmentDetector: HomebrewDetector;
//#endregion
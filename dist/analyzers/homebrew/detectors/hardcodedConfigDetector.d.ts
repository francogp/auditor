import { HomebrewDetector } from "../homebrewTypes.js";
//#region src/analyzers/homebrew/detectors/hardcodedConfigDetector.d.ts
/**
 * src/analyzers/homebrew/detectors/hardcodedConfigDetector.ts
 *
 * Detects hardcoded candidate paths, candidate arrays, and inline ignore bypasses
 * in auditor suites and extensions instead of dynamic configuration-driven resolution.
 */
export declare const hardcodedConfigDetector: HomebrewDetector;
//#endregion
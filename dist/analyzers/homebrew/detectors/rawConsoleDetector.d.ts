import { HomebrewDetector } from "../homebrewTypes.js";
//#region src/analyzers/homebrew/detectors/rawConsoleDetector.d.ts
/**
 * src/analyzers/homebrew/detectors/rawConsoleDetector.ts
 *
 * Detects direct uncoordinated console.log() calls inside sub-auditors and extensions
 * instead of using BaseAuditor reporting methods or unifiedTheme box drawing.
 */
export declare const rawConsoleDetector: HomebrewDetector;
//#endregion
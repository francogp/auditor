import { HomebrewDetector } from "../homebrewTypes.js";
//#region src/analyzers/homebrew/detectors/manualTimingDetector.d.ts
/**
 * src/analyzers/homebrew/detectors/manualTimingDetector.ts
 *
 * Detects homebrew or manual duration measurement in sub-auditors and extensions
 * (such as performance.now(), console.time(), or direct recordRuleDuration calls)
 * instead of using canonical superclass APIs (declareSubAuditor, declareFileSubAuditor,
 * declarePatternSubAuditor, runSubAuditorsBatch, or reportRuleDuration for 3rd-party tools).
 */
export declare const manualTimingDetector: HomebrewDetector;
//#endregion
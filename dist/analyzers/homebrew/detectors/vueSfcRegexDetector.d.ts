import { HomebrewDetector } from "../homebrewTypes.js";
//#region src/analyzers/homebrew/detectors/vueSfcRegexDetector.d.ts
/**
 * src/analyzers/homebrew/detectors/vueSfcRegexDetector.ts
 *
 * Detects manual regular expressions or tag slicers extracting Vue SFC blocks
 * (<template>, <script>, <style>) instead of using canonical parseVueSfc() or AuditedDocument.
 */
export declare const vueSfcRegexDetector: HomebrewDetector;
//#endregion
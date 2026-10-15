import { HomebrewDetector } from "../homebrewTypes.js";
//#region src/analyzers/homebrew/detectors/commentStrippingDetector.d.ts
/**
 * src/analyzers/homebrew/detectors/commentStrippingDetector.ts
 *
 * Detects homebrew regular expressions for stripping comments
 * instead of using canonical stripComments() from src/core/scannerUtils.ts or AuditedDocument.
 */
export declare const commentStrippingDetector: HomebrewDetector;
//#endregion
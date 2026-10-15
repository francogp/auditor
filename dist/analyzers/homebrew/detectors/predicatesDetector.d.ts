import { HomebrewDetector } from "../homebrewTypes.js";
//#region src/analyzers/homebrew/detectors/predicatesDetector.d.ts
/**
 * src/analyzers/homebrew/detectors/predicatesDetector.ts
 *
 * Detects homebrew test path and repository identity predicates (.includes('.spec.'), endsWith('/auditor'))
 * instead of canonical isTestPath() and isSelfProviderProject().
 */
export declare const predicatesDetector: HomebrewDetector;
//#endregion
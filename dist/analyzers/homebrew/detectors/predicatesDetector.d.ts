import { HomebrewDetector } from "../homebrewTypes.js";
/**
 * src/analyzers/homebrew/detectors/predicatesDetector.ts
 *
 * Detects homebrew test path and repository identity predicates (.includes('.spec.'), endsWith('/auditor'))
 * instead of canonical isTestPath() and isSelfProviderProject().
 */
export declare const predicatesDetector: HomebrewDetector;
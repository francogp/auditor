/**
 * src/analyzers/homebrew/detectors/manualStepLoggingDetector.ts
 *
 * Detects legacy manual progress logging (`this.context.logStep(n, m, '...')`) inside
 * sub-auditors and host extensions. Since v7 the superclass prints one canonical
 * `🔍 [n/m] <rule>` line per declared rule with its empirical duration; manual step lines
 * duplicate and desynchronize that numbering, so rules must be measured through
 * `runSubAuditorSync` / `runSubAuditor` / `declareFileSubAuditor` instead.
 */
export declare const manualStepLoggingDetector: import("../homebrewTypes.ts").HomebrewDetector;
//# sourceMappingURL=manualStepLoggingDetector.d.ts.map
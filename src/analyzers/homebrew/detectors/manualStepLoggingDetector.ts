/**
 * src/analyzers/homebrew/detectors/manualStepLoggingDetector.ts
 *
 * Detects legacy manual progress logging (`this.context.logStep(n, m, '...')`) inside
 * sub-auditors and host extensions. Since v7 the superclass prints one canonical
 * `🔍 [n/m] <rule>` line per declared rule with its empirical duration; manual step lines
 * duplicate and desynchronize that numbering, so rules must be measured through
 * `runSubAuditorSync` / `runSubAuditor` / `declareFileSubAuditor` instead.
 */

import { createLineDetector, isInsideStringLiteral } from '../homebrewTypes.ts';

export const manualStepLoggingDetector = createLineDetector({
  id: 'manual-step-logging',
  ruleId: 'auditor-manual-step-logging',
  ruleDescription: 'Manual step logging in auditor',
  checkLine(line) {
    const match = /\bcontext\.logStep\s*\(/.exec(line);
    if (!match) return null;

    if (isInsideStringLiteral(line, match.index)) return null;

    return "Manual call to 'this.context.logStep()'. The framework already prints a '🔍 [n/m]' line per rule with its real duration. Remove manual logging and measure each rule with 'this.runSubAuditorSync(ruleId, ...)', 'await this.runSubAuditor(ruleId, ...)' or 'declareFileSubAuditor(ruleId, handler)'.";
  }
});

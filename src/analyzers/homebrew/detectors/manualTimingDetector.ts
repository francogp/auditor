/**
 * src/analyzers/homebrew/detectors/manualTimingDetector.ts
 *
 * Detects homebrew or manual duration measurement in sub-auditors and extensions
 * (such as performance.now(), console.time(), or direct recordRuleDuration calls)
 * instead of using canonical superclass APIs (declareSubAuditor, declareFileSubAuditor,
 * declarePatternSubAuditor, runSubAuditorsBatch, or reportRuleDuration for 3rd-party tools).
 */

import { createLineDetector, isInsideStringLiteral } from '../homebrewTypes.ts';

export const manualTimingDetector = createLineDetector({
  id: 'manual-timing',
  ruleId: 'auditor-manual-rule-timing',
  ruleDescription: 'Homebrew timing in auditor',
  checkLine(line, _trimmed, _lineNum, context) {
    const normalized = context.filePath.replace(/\\/g, '/');
    if (normalized.includes('/cli/') || normalized.startsWith('src/cli/')) return null;
    if (normalized.includes('src/core/') || normalized.startsWith('src/core/')) return null;
    if (normalized.endsWith('audit_project.ts')) return null;

    // Check for performance.now(), console.time/timeEnd, process.hrtime, or direct recordRuleDuration
    const match =
      /\b(?:performance\.now\s*\(|console\.time(?:End)?\s*\(|process\.hrtime\b|\bthis\.recordRuleDuration\s*\()/.exec(
        line
      );
    if (!match) return null;

    if (isInsideStringLiteral(line, match.index)) return null;

    // Ignore comments
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      return null;
    }

    return "Manual rule timing or ad-hoc call to 'performance.now()' / 'recordRuleDuration' in sub-auditor or extension. Measuring ad-hoc execution duration is forbidden. Declare sub-auditors with 'declareSubAuditor()', 'declareFileSubAuditor()' or 'declarePatternSubAuditor()', or use 'runSubAuditorSync()' to measure each rule individually.";
  }
});

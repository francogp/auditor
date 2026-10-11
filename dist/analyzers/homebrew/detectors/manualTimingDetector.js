/**
 * src/analyzers/homebrew/detectors/manualTimingDetector.ts
 *
 * Detects homebrew or manual duration measurement in sub-auditors and extensions
 * (such as performance.now(), console.time(), or direct recordRuleDuration calls)
 * instead of using canonical superclass APIs (declareSubAuditor, declareFileSubAuditor,
 * declarePatternSubAuditor, runSubAuditorsBatch, or reportRuleDuration for 3rd-party tools).
 */
import { createLineDetector } from "../homebrewTypes.js";
export const manualTimingDetector = createLineDetector({
    id: 'manual-timing',
    ruleId: 'auditor-manual-rule-timing',
    ruleDescription: 'Medición casera de tiempos en auditor',
    checkLine(line, _trimmed, _lineNum, context) {
        if (context.filePath.includes('/cli/') || context.filePath.startsWith('src/cli/'))
            return null;
        if (context.filePath.includes('src/core/') || context.filePath.startsWith('src/core/'))
            return null;
        if (line.includes('// timing-ok:') || line.includes('// benchmark-ok:'))
            return null;
        // Check for performance.now(), console.time/timeEnd, process.hrtime, or direct recordRuleDuration
        const match = /\b(?:performance\.now\s*\(|console\.time(?:End)?\s*\(|process\.hrtime\b|\bthis\.recordRuleDuration\s*\()/.exec(line);
        if (!match)
            return null;
        // Ignore if inside a string literal
        const before = line.slice(0, match.index);
        const singleQuotes = (before.match(/'/g) || []).length % 2 === 1;
        const doubleQuotes = (before.match(/"/g) || []).length % 2 === 1;
        const backticks = (before.match(/`/g) || []).length % 2 === 1;
        if (singleQuotes || doubleQuotes || backticks)
            return null;
        // Ignore comments
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
            return null;
        }
        return "Medición manual de tiempos o llamada casera a 'performance.now()' / 'recordRuleDuration' en subauditor o extensión. Prohibido medir tiempos ad-hoc. Declara las sub-herramientas con 'declareSubAuditor()', 'declareFileSubAuditor()' o 'declarePatternSubAuditor()', o usa 'runSubAuditorSync()' para medir cada regla individualmente.";
    }
});
//# sourceMappingURL=manualTimingDetector.js.map
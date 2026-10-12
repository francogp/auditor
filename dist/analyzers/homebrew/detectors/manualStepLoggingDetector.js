/**
 * src/analyzers/homebrew/detectors/manualStepLoggingDetector.ts
 *
 * Detects legacy manual progress logging (`this.context.logStep(n, m, '...')`) inside
 * sub-auditors and host extensions. Since v7 the superclass prints one canonical
 * `🔍 [n/m] <rule>` line per declared rule with its empirical duration; manual step lines
 * duplicate and desynchronize that numbering, so rules must be measured through
 * `runSubAuditorSync` / `runSubAuditor` / `declareFileSubAuditor` instead.
 */
import { createLineDetector } from "../homebrewTypes.js";
export const manualStepLoggingDetector = createLineDetector({
    id: 'manual-step-logging',
    ruleId: 'auditor-manual-step-logging',
    ruleDescription: 'Log manual de pasos en auditor',
    checkLine(line) {
        const match = /\bcontext\.logStep\s*\(/.exec(line);
        if (!match)
            return null;
        // Ignore matches that sit inside a string literal
        const before = line.slice(0, match.index);
        const singleQuotes = (before.match(/'/g) || []).length % 2 === 1;
        const doubleQuotes = (before.match(/"/g) || []).length % 2 === 1;
        const backticks = (before.match(/`/g) || []).length % 2 === 1;
        if (singleQuotes || doubleQuotes || backticks)
            return null;
        return "Llamada manual a 'this.context.logStep()'. El framework ya imprime una línea '🔍 [n/m]' por regla con su duración real. Elimina el log manual y mide cada regla con 'this.runSubAuditorSync(ruleId, ...)', 'await this.runSubAuditor(ruleId, ...)' o 'declareFileSubAuditor(ruleId, handler)'.";
    }
});
//# sourceMappingURL=manualStepLoggingDetector.js.map
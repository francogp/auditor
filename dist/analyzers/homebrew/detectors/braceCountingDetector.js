/**
 * src/analyzers/homebrew/detectors/braceCountingDetector.ts
 *
 * Detects manual brace or parenthesis depth counting loops
 * instead of using canonical block helpers in src/core/scannerUtils.ts.
 */
import { createLineDetector } from "../homebrewTypes.js";
export const braceCountingDetector = createLineDetector({
    id: 'brace-counting',
    ruleId: 'auditor-manual-brace-counting',
    ruleDescription: 'Conteo casero de llaves o bloques',
    checkLine(line) {
        const hasManualDepthVar = /\b(?:let|var)\s+(?:parenDepth|braceDepth|braceCount)\s*=\s*0\b/.test(line) ||
            /\b(?:parenDepth|braceDepth)\+\+/.test(line);
        if (hasManualDepthVar) {
            return "Conteo manual de profundidad de llaves o paréntesis detectado. Usa helpers canónicos como 'findMatchingBrace()' o 'extractBlock()' de 'src/core/scannerUtils.ts'.";
        }
        return null;
    }
});
//# sourceMappingURL=braceCountingDetector.js.map
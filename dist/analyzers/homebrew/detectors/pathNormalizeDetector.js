/**
 * src/analyzers/homebrew/detectors/pathNormalizeDetector.ts
 *
 * Detects homebrew path normalization regexes and string replacements
 * instead of canonical normalizePosixPath() from src/core/safePath.ts.
 */
import { createLineDetector } from "../homebrewTypes.js";
export const pathNormalizeDetector = createLineDetector({
    id: 'path-normalize',
    ruleId: 'auditor-manual-path-normalize',
    ruleDescription: 'Normalización casera de rutas',
    checkLine(line) {
        const hasManualSeparatorNormalization = line.includes(".split('\\\\').join('/')") ||
            line.includes(".split('\\').join('/')") ||
            line.includes(".replace(/\\\\/g, '/')") ||
            line.includes(".replaceAll('\\\\', '/')") ||
            line.includes(".replace(/^[a-z]:[/\\\\]/i, '')");
        if (hasManualSeparatorNormalization) {
            return "Normalización manual de separadores de ruta detectada. Usa la utilidad canónica 'normalizePosixPath(path)' de 'src/core/safePath.ts'.";
        }
        return null;
    }
});
//# sourceMappingURL=pathNormalizeDetector.js.map
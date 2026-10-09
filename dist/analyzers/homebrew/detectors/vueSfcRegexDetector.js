/**
 * src/analyzers/homebrew/detectors/vueSfcRegexDetector.ts
 *
 * Detects manual regular expressions or tag slicers extracting Vue SFC blocks
 * (<template>, <script>, <style>) instead of using canonical parseVueSfc() or AuditedDocument.
 */
import { createLineDetector } from "../homebrewTypes.js";
export const vueSfcRegexDetector = createLineDetector({
    id: 'vue-sfc-regex',
    ruleId: 'auditor-manual-vue-sfc-regex',
    ruleDescription: 'Regex casero de bloques SFC de Vue',
    checkLine(line) {
        const hasManualSfcRegex = /<(?:template|script|style)(?:\b|[\s>])/i.test(line) &&
            /(?:RegExp|match|exec|\.test|matchAll)\(/.test(line);
        const hasManualTagSlice = /<(?:template|script|style)/i.test(line) &&
            (line.includes('indexOf(') || line.includes('slice(') || line.includes('substring(')) &&
            /<\/(?:template|script|style)>/i.test(line);
        if (hasManualSfcRegex || hasManualTagSlice) {
            return "Extracción artesanal de bloques Vue SFC (<template>, <script>, <style>). Usa 'parseVueSfc()' de 'src/core/vueSfcParser.ts' o 'AuditedDocument'.";
        }
        return null;
    }
});
//# sourceMappingURL=vueSfcRegexDetector.js.map
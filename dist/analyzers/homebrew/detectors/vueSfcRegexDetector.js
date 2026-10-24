import { createLineDetector } from "../homebrewTypes.js";
// src/analyzers/homebrew/detectors/vueSfcRegexDetector.ts
/**
* src/analyzers/homebrew/detectors/vueSfcRegexDetector.ts
*
* Detects manual regular expressions or tag slicers extracting Vue SFC blocks
* (<template>, <script>, <style>) instead of using canonical parseVueSfc() or AuditedDocument.
*/
const vueSfcRegexDetector = createLineDetector({
	id: "vue-sfc-regex",
	ruleId: "auditor-manual-vue-sfc-regex",
	ruleDescription: "Homebrew Vue SFC regex",
	checkLine(line) {
		const hasManualSfcRegex = /<(?:template|script|style)(?:\b|[\s>])/i.test(line) && /(?:RegExp|match|exec|\.test|matchAll)\(/.test(line);
		const hasManualTagSlice = /<(?:template|script|style)/i.test(line) && (line.includes("indexOf(") || line.includes("slice(") || line.includes("substring(")) && /<\/(?:template|script|style)>/i.test(line);
		if (hasManualSfcRegex || hasManualTagSlice) return "Ad-hoc extraction of Vue SFC blocks (<template>, <script>, <style>) detected. Use 'parseVueSfc()' from 'src/core/vueSfcParser.ts' or 'AuditedDocument'.";
		return null;
	}
});
export { vueSfcRegexDetector };

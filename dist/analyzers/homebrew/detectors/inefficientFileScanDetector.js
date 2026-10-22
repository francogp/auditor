//#region src/analyzers/homebrew/detectors/inefficientFileScanDetector.ts
const inefficientFileScanDetector = {
	id: "inefficient-file-scan",
	ruleId: "auditor-inefficient-file-scan",
	ruleDescription: "Inefficient file scanning",
	detect(context) {
		const findings = [];
		const lines = context.lines;
		let inRuleLoop = false;
		let ruleLoopBraceDepth = 0;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmed = line.trim();
			const lineNum = i + 1;
			if (trimmed.startsWith("//") || trimmed.startsWith("/*") || trimmed.startsWith("*")) continue;
			const isConfigObjectPattern = /^\s*files\s*:\s*\[/.test(trimmed) || line.includes("overrideConfig");
			if (/['"]\*\*\/\*\.(?:md|vue|html|ts|js)['"]/.test(trimmed) && !isConfigObjectPattern && !line.includes("coverage") && !line.includes("include:") && !line.includes("targetArgs") && !context.filePath.includes("inefficientFileScanDetector")) findings.push({
				ruleId: "auditor-inefficient-file-scan",
				line: lineNum,
				message: "Blind global wildcard ('**/*.ext') detected in external tool call. Pass files discovered by auditor or use scoped targetArgs.",
				context: trimmed.slice(0, 100),
				severity: "error"
			});
			if (!inRuleLoop && /for\s*\(\s*(?:const|let|var)\s+\w+\s+of\s+(?:[A-Z_]+_RULES|this\.ruleIds|this\.getRuleCatalog\(\))\s*\)/.test(line)) {
				inRuleLoop = true;
				ruleLoopBraceDepth = 0;
			}
			if (inRuleLoop) {
				for (const char of line) {
					if (char === "{") ruleLoopBraceDepth++;
					if (char === "}") ruleLoopBraceDepth--;
				}
				if (/for\s*\(\s*(?:const|let|var)\s+\w+\s+of\s+(?:filePaths|files|allFiles|candidateFiles)\s*\)/.test(line)) findings.push({
					ruleId: "auditor-inefficient-file-scan",
					line: lineNum,
					message: "Nested loop of rule over files detected. Invert the loop (traverse each file once in RAM) or use 'this.scanFilesSinglePass()'.",
					context: trimmed.slice(0, 100),
					severity: "error"
				});
				if (ruleLoopBraceDepth <= 0 && line.includes("}")) inRuleLoop = false;
			}
		}
		return findings;
	}
};
//#endregion
export { inefficientFileScanDetector };

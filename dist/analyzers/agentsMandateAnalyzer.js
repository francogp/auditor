import fs from "node:fs";
//#region src/analyzers/agentsMandateAnalyzer.ts
/**
* src/analyzers/agentsMandateAnalyzer.ts
*
* AGENTS.MD MANDATE ANALYZER & AUTO-REPAIR HELPER (Node.js 26+ Native)
* Provides shared utilities to parse, validate, and inject canonical governance
* mandates into the root AGENTS.md document without code duplication.
*/
/**
* Splits markdown content into structural contract sections / paragraph chunks,
* properly respecting bullet lists and whitespace.
*/
function extractContractSections(content) {
	const fileLines = content.split("\n");
	const sections = [];
	let currentLines = [];
	for (const line of fileLines) {
		const trimmed = line.trim();
		if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed === "") {
			if (currentLines.length > 0) {
				sections.push(currentLines.join("\n"));
				currentLines = [];
			}
		}
		if (trimmed !== "") currentLines.push(line);
	}
	if (currentLines.length > 0) sections.push(currentLines.join("\n"));
	return sections;
}
/**
* Checks whether text satisfies the expected documentation language constraint.
*/
function matchesMandateLanguage(text, expectedLanguage, englishTokens, spanishTokens) {
	if (expectedLanguage === "en") return englishTokens.test(text) && !spanishTokens.test(text);
	if (expectedLanguage === "es") return spanishTokens.test(text);
	return true;
}
/**
* Injects or updates a canonical mandate under `## Local Contracts` in AGENTS.md in-place,
* guaranteeing zero duplicate lines on repeated executions.
*/
function injectOrUpdateMandateInAgentsMd(options) {
	const { agentsMdPath, content, canonicalSnippet, isExistingLine } = options;
	const lines = content.split("\n");
	const matchingIndices = [];
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (isExistingLine(line) || line.trim() === canonicalSnippet.trim()) matchingIndices.push(i);
	}
	if (matchingIndices.length > 0) {
		const firstIndex = matchingIndices[0];
		lines[firstIndex] = canonicalSnippet;
		for (let i = matchingIndices.length - 1; i > 0; i--) lines.splice(matchingIndices[i], 1);
		fs.writeFileSync(agentsMdPath, lines.join("\n"), "utf8");
		return;
	}
	const contractHeaderIndex = lines.findIndex((l) => l.trim().startsWith("## Local Contracts"));
	if (contractHeaderIndex !== -1) {
		if (lines[contractHeaderIndex + 1] === "") lines.splice(contractHeaderIndex + 2, 0, canonicalSnippet);
		else lines.splice(contractHeaderIndex + 1, 0, "", canonicalSnippet);
		fs.writeFileSync(agentsMdPath, lines.join("\n"), "utf8");
		return;
	}
	const appended = content.trimEnd() + "\n\n## Local Contracts\n\n" + canonicalSnippet + "\n";
	fs.writeFileSync(agentsMdPath, appended, "utf8");
}
/**
* Finds the 1-indexed line number of the `## Local Contracts` header in AGENTS.md content.
*/
function findLocalContractsHeaderLine(content) {
	const index = content.split("\n").findIndex((line) => line.trim().startsWith("## Local Contracts"));
	return index !== -1 ? index + 1 : 1;
}
//#endregion
export { extractContractSections, findLocalContractsHeaderLine, injectOrUpdateMandateInAgentsMd, matchesMandateLanguage };

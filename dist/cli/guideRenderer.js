import { themeStyles } from "../core/unifiedTheme.js";
import { styleText } from "node:util";
import boxen from "boxen";
// src/cli/guideRenderer.ts
/**
* src/cli/guideRenderer.ts
*
* ON-DEMAND EXTENSIVE AUDIT REMEDIATION & DIAGNOSTIC GUIDE RENDERER (Node.js 26+ Native)
* Provides detailed, unbounded troubleshooting manuals for individual rules, suites, or families.
* Formatted with Unicode Box-Drawing (≤ 80 cols) and Markdown support.
*/
function findRuleGuide(allTasks, ruleIdOrName) {
	const cleanId = ruleIdOrName.trim().toLowerCase();
	const normalizedClean = cleanId.replace(/_/g, "-");
	for (const task of allTasks) {
		const rules = task.ruleDescriptions ?? task.manifest?.rules ?? {};
		const remediations = task.ruleRemediations ?? task.manifest?.remediations ?? {};
		for (const [rId, rDesc] of Object.entries(rules)) {
			const lowerRId = rId.toLowerCase();
			if (lowerRId === cleanId || lowerRId.replace(/_/g, "-") === normalizedClean) return {
				ruleId: rId,
				ruleDescription: rDesc,
				remediation: remediations[rId] ?? "No remediation guide registered.",
				task
			};
		}
	}
}
function renderRuleGuideCard(match, isVerbose = false) {
	const { boldWhite, boldYellow, boldCyan, dim, white } = themeStyles;
	const sections = [];
	const title = `📖 REMEDIATION GUIDE: ${match.ruleId}`;
	const subtitle = `Suite: ${match.task.name} [${match.task.id}] | Family: ${match.task.family.toUpperCase()}`;
	sections.push([boldCyan(title), dim(subtitle)]);
	sections.push([boldYellow("📋 RULE DESCRIPTION:"), white(`  ${match.ruleDescription}`)]);
	const runCommand = `npm run auditor suite=${match.task.id}`;
	sections.push([boldYellow("🚀 ISOLATED DIAGNOSTIC COMMAND:"), white(`  ${runCommand}`)]);
	const remediationLines = match.remediation.split("\n").map((l) => `  ${l}`);
	sections.push([boldYellow("💡 DIAGNOSIS, ROOT CAUSE & STEP-BY-STEP REMEDIATION:"), white(remediationLines.join("\n"))]);
	if (match.task.configKey) sections.push([boldYellow("🛠️ LINKED CONFIGURATION:"), dim(`  Section in .auditor/audit.config.ts: `) + boldWhite(match.task.configKey)]);
	const content = sections.map((sec) => sec.join("\n")).join("\n\n");
	if (!isVerbose) return `\n${content}\n`;
	return `${boxen(content, {
		borderColor: "yellow",
		borderStyle: "double",
		padding: {
			top: 0,
			bottom: 0,
			left: 1,
			right: 1
		}
	})}\n`;
}
function renderSuiteGuideCards(task, isVerbose = false) {
	const rules = task.ruleDescriptions ?? task.manifest?.rules ?? {};
	const remediations = task.ruleRemediations ?? task.manifest?.remediations ?? {};
	const ruleEntries = Object.entries(rules);
	if (ruleEntries.length === 0) return styleText("yellow", `\n⚠️ Suite '${task.id}' does not declare evaluable rules.\n`);
	const output = [];
	output.push(styleText(["bold", "cyan"], `\n🏛️ SUITE RULES GUIDE: ${task.name} [${task.id}]\n`));
	for (const [rId, rDesc] of ruleEntries) output.push(renderRuleGuideCard({
		ruleId: rId,
		ruleDescription: rDesc,
		remediation: remediations[rId] ?? "No guide declared.",
		task
	}, isVerbose));
	return output.join("\n");
}
function renderFamilyGuideIndex(family, tasksInFamily) {
	const boldYellow = (s) => styleText(["bold", "yellow"], s);
	const boldWhite = (s) => styleText(["bold", "white"], s);
	const dim = (s) => styleText("dim", s);
	const lines = [];
	lines.push(boldYellow(`\n📚 RULES & GUIDES CATALOG FOR FAMILY: ${family.toUpperCase()}\n`));
	for (const task of tasksInFamily) {
		const rules = task.ruleDescriptions ?? task.manifest?.rules ?? {};
		lines.push(`  ${task.icon ?? "🧩"} ${boldWhite(task.name)} [${task.id}]:`);
		for (const [rId, rDesc] of Object.entries(rules)) lines.push(`     • ${styleText("cyan", rId)}: ${dim(rDesc)}`);
		lines.push("");
	}
	lines.push(dim(`👉 To view the full guide for a rule: auditor guide <ruleId>\n`));
	return lines.join("\n");
}
function renderGlobalGuideIndex(allTasks) {
	const { boldYellow, boldCyan, dim } = themeStyles;
	const lines = [];
	lines.push(boldYellow("\n📚 ON-DEMAND AUDIT GUIDES & MANUALS (@francogp/auditor)\n"));
	lines.push("USAGE:");
	lines.push(`  ${boldCyan("auditor guide <ruleId>")}              Shows full guide for a specific rule.`);
	lines.push(`  ${boldCyan("auditor guide suite=<suiteId>")}        Shows all rule guides for a suite.`);
	lines.push(`  ${boldCyan("auditor guide family=<family>")}        Shows rules index for an architectural family.\n`);
	lines.push(boldYellow("QUICK EXAMPLES:"));
	lines.push(`  npm run auditor guide coverage-missing-ledger`);
	lines.push(`  npm run auditor guide audit-config-missing-section`);
	lines.push(`  npm run auditor guide suite=validate_audit_coverage\n`);
	const totalRules = allTasks.reduce((acc, t) => acc + Object.keys(t.ruleDescriptions ?? t.manifest?.rules ?? {}).length, 0);
	lines.push(dim(`Total documented rules available in this repository: ${totalRules}\n`));
	return lines.join("\n");
}
export { findRuleGuide, renderFamilyGuideIndex, renderGlobalGuideIndex, renderRuleGuideCard, renderSuiteGuideCards };

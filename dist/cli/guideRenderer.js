import { themeStyles } from "../core/unifiedTheme.js";
import { styleText } from "node:util";
import boxen from "boxen";
//#region src/cli/guideRenderer.ts
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
				remediation: remediations[rId] ?? "No hay guía de remediación registrada.",
				task
			};
		}
	}
}
function renderRuleGuideCard(match, isVerbose = false) {
	const { boldWhite, boldYellow, boldCyan, dim, white } = themeStyles;
	const sections = [];
	const title = `📖 GUÍA DE REMEDIACIÓN: ${match.ruleId}`;
	const subtitle = `Suite: ${match.task.name} [${match.task.id}] | Familia: ${match.task.family.toUpperCase()}`;
	sections.push([boldCyan(title), dim(subtitle)]);
	sections.push([boldYellow("📋 DESCRIPCIÓN DEL CONTROL:"), white(`  ${match.ruleDescription}`)]);
	const runCommand = `npm run auditor suite=${match.task.id}`;
	sections.push([boldYellow("🚀 EJECUCIÓN AISLADA PARA DIAGNÓSTICO:"), white(`  ${runCommand}`)]);
	const remediationLines = match.remediation.split("\n").map((l) => `  ${l}`);
	sections.push([boldYellow("💡 DIAGNÓSTICO, CAUSA RAÍZ Y REMEDIACIÓN PASO A PASO:"), white(remediationLines.join("\n"))]);
	if (match.task.configKey) sections.push([boldYellow("🛠️ CONFIGURACIÓN VINCULADA:"), dim(`  Sección en .auditor/audit.config.ts: `) + boldWhite(match.task.configKey)]);
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
	if (ruleEntries.length === 0) return styleText("yellow", `\n⚠️ La suite '${task.id}' no declara reglas evaluables.\n`);
	const output = [];
	output.push(styleText(["bold", "cyan"], `\n🏛️ GUÍA COMPLETA DE REGLAS: ${task.name} [${task.id}]\n`));
	for (const [rId, rDesc] of ruleEntries) output.push(renderRuleGuideCard({
		ruleId: rId,
		ruleDescription: rDesc,
		remediation: remediations[rId] ?? "Sin guía declarada.",
		task
	}, isVerbose));
	return output.join("\n");
}
function renderFamilyGuideIndex(family, tasksInFamily) {
	const boldYellow = (s) => styleText(["bold", "yellow"], s);
	const boldWhite = (s) => styleText(["bold", "white"], s);
	const dim = (s) => styleText("dim", s);
	const lines = [];
	lines.push(boldYellow(`\n📚 CATÁLOGO DE REGLAS Y GUÍAS PARA LA FAMILIA: ${family.toUpperCase()}\n`));
	for (const task of tasksInFamily) {
		const rules = task.ruleDescriptions ?? task.manifest?.rules ?? {};
		lines.push(`  ${task.icon ?? "🧩"} ${boldWhite(task.name)} [${task.id}]:`);
		for (const [rId, rDesc] of Object.entries(rules)) lines.push(`     • ${styleText("cyan", rId)}: ${dim(rDesc)}`);
		lines.push("");
	}
	lines.push(dim(`👉 Para ver la guía completa de una regla: auditor guide <ruleId>\n`));
	return lines.join("\n");
}
function renderGlobalGuideIndex(allTasks) {
	const { boldYellow, boldCyan, dim } = themeStyles;
	const lines = [];
	lines.push(boldYellow("\n📚 SISTEMA DE GUÍAS Y MANUALES A PEDIDO (@francogp/auditor)\n"));
	lines.push("USO DEL COMANDO:");
	lines.push(`  ${boldCyan("auditor guide <ruleId>")}              Muestra la guía completa de una regla en particular.`);
	lines.push(`  ${boldCyan("auditor guide suite=<suiteId>")}        Muestra todas las guías de las reglas de una suite.`);
	lines.push(`  ${boldCyan("auditor guide family=<family>")}        Muestra el índice de reglas por familia arquitectónica.\n`);
	lines.push(boldYellow("EJEMPLOS RÁPIDOS:"));
	lines.push(`  npm run auditor guide coverage-missing-ledger`);
	lines.push(`  npm run auditor guide audit-config-missing-section`);
	lines.push(`  npm run auditor guide suite=validate_audit_coverage\n`);
	const totalRules = allTasks.reduce((acc, t) => acc + Object.keys(t.ruleDescriptions ?? t.manifest?.rules ?? {}).length, 0);
	lines.push(dim(`Total de reglas documentadas disponibles en este repositorio: ${totalRules}\n`));
	return lines.join("\n");
}
//#endregion
export { findRuleGuide, renderFamilyGuideIndex, renderGlobalGuideIndex, renderRuleGuideCard, renderSuiteGuideCards };

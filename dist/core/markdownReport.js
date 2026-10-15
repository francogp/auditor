import { FAMILY_METADATA, groupResultsByFamily } from "./auditContract.js";
import { formatDurationMs, formatNumber } from "./durationFormatter.js";
import path from "node:path";
//#region src/core/markdownReport.ts
/**
* packages/auditor/src/core/markdownReport.ts
*
* Markdown audit report generator for CI/CD and disk dumps.
*/
function getTaskStatusIcon(t) {
	if (t.status === "skipped") return "⏭️ Skip";
	if (t.status === "passed" && t.summary.errors === 0) return "✅ Pass";
	return "❌ Fail";
}
function getTaskPrimaryMetric(t) {
	const metricEntries = Object.entries(t.metrics);
	if (metricEntries.length === 0) return "-";
	const [firstKey, firstVal] = metricEntries[0];
	return `${typeof firstVal === "number" ? formatNumber(firstVal) : firstVal} ${firstKey}`;
}
function renderMarkdownFamilyRow(t) {
	const icon = getTaskStatusIcon(t);
	const metricStr = getTaskPrimaryMetric(t);
	return `| ${icon} | **${t.name}** | \`${formatDurationMs(t.durationMs)}\` | ${metricStr} | ${formatNumber(t.summary.errors)} | ${formatNumber(t.summary.warnings)} |\n`;
}
function renderSingleFamilySection(familyKey, tasks) {
	const meta = FAMILY_METADATA[familyKey];
	let section = `## ${meta ? `${meta.icon} Familia ${meta.order}: ${meta.title}` : familyKey}\n\n`;
	section += `| Estado | Auditoría | Duración | Métrica Principal | Errores | Advertencias |\n`;
	section += `| :---: | :--- | :---: | :--- | :---: | :---: |\n`;
	for (const t of tasks) section += renderMarkdownFamilyRow(t);
	return section + "\n";
}
function renderMarkdownFamilyTables(byFamily) {
	let md = "";
	for (const [familyKey, tasks] of byFamily) md += renderSingleFamilySection(familyKey, tasks);
	return md;
}
function renderMarkdownFindingsTable(allFindings) {
	if (allFindings.length === 0) return "";
	let md = `## 📋 Detalle de Incidencias\n\n`;
	md += `| Severidad | Archivo | Línea | Regla | Mensaje |\n`;
	md += `| :---: | :--- | :---: | :--- | :--- |\n`;
	for (const f of allFindings.slice(0, 100)) {
		const sevIcon = f.severity === "error" ? "❌ Error" : "⚠️ Warn";
		const filePath = f.file ? `\`${path.relative(process.cwd(), f.file)}\`` : "Global";
		const lineStr = f.line !== void 0 ? String(f.line) : "-";
		const ruleStr = f.ruleId ? `\`${f.ruleId}\`` : "-";
		md += `| ${sevIcon} | ${filePath} | ${lineStr} | ${ruleStr} | ${f.message.replace(/\|/g, "\\|")} |\n`;
	}
	if (allFindings.length > 100) md += `\n*... y 🐛 ${formatNumber(allFindings.length - 100)} más truncadas por longitud.*\n`;
	return md;
}
function renderMarkdownReport(results, suitesPassed, totalDurationMs) {
	const totalErrors = results.reduce((acc, r) => acc + r.summary.errors, 0);
	const totalWarnings = results.reduce((acc, r) => acc + r.summary.warnings, 0);
	const isPassed = totalErrors === 0;
	let md = `# 🛡️ Reporte Consolidado de Auditoría Global\n\n`;
	md += `**Estado**: ${isPassed ? "✅ Aprobado" : "❌ Fallido"}\n`;
	md += `**Duración Total**: \`${formatDurationMs(totalDurationMs)}\`\n`;
	md += `**Suites**: \`${formatNumber(suitesPassed)} / ${formatNumber(results.length)} Aprobadas\`\n`;
	md += `**Errores**: \`${formatNumber(totalErrors)}\` | **Advertencias**: \`${formatNumber(totalWarnings)}\`\n\n`;
	const byFamily = groupResultsByFamily(results);
	md += renderMarkdownFamilyTables(byFamily);
	md += renderMarkdownFindingsTable(results.flatMap((r) => r.findings));
	return md;
}
//#endregion
export { renderMarkdownReport };

import { formatDurationMs, formatNumber } from "./durationFormatter.js";
import { styleText } from "node:util";
//#region src/core/executiveTheme.ts
/**
* src/core/executiveTheme.ts
*
* Ultra-compact, AI-friendly executive console renderer for @francogp/auditor.
* Emits high-density semantic text without heavy Unicode Box-Drawing decorations.
*/
const PHASE_NAME_PAD_LENGTH = 12;
function renderExecutivePassSummary(params) {
	const { totalSuites, passedSuites, skippedSuites = 0, totalErrors, totalWarnings, durationMs, latestAuditJsonPath = "scratch/audits/latest_audit.json", ratchetOk = true } = params;
	const skippedText = skippedSuites > 0 ? ` (${skippedSuites} skipped)` : "";
	const ratchetText = ratchetOk ? " | Ratchet: OK" : "";
	const isWarningPass = totalWarnings > 0;
	const title = isWarningPass ? `[WARN] AUDIT PASSED WITH WARNINGS [${passedSuites}/${totalSuites} suites${skippedText}] in ${formatDurationMs(durationMs)}` : `[OK] AUDIT PASSED [${passedSuites}/${totalSuites} suites${skippedText}] in ${formatDurationMs(durationMs)}`;
	return `${styleText(isWarningPass ? ["bold", "yellow"] : ["bold", "green"], title)}\n${`  Errors: ${totalErrors} | Warnings: ${totalWarnings}${ratchetText}`}\n${styleText("dim", `  Report: ${latestAuditJsonPath}`)}\n`;
}
function renderExecutiveFailSummary(params) {
	const { totalSuites, failedSuites, totalErrors, totalWarnings, durationMs, phaseBreakdown, fixableErrors = 0, fixableWarnings = 0, latestAuditJsonPath = "scratch/audits/latest_audit.json" } = params;
	const totalFixable = fixableErrors + fixableWarnings;
	const fixableText = totalFixable > 0 ? ` (${totalFixable} auto-fixable)` : "";
	const suiteText = failedSuites > 0 ? ` in ${failedSuites} suite(s)` : "";
	const header = styleText(["bold", "red"], `[FAIL] AUDIT FAILED [${totalSuites} suites] in ${formatDurationMs(durationMs)}`);
	const status = `  Status: ${formatNumber(totalErrors)} error(s), ${formatNumber(totalWarnings)} warning(s)${fixableText}${suiteText}`;
	const phaseLines = ["  Breakdown by Phase:"];
	for (const p of phaseBreakdown) {
		const counts = [p.errors > 0 ? `${p.errors} error(s)` : "", p.warnings > 0 ? `${p.warnings} warning(s)` : ""].filter(Boolean).join(", ");
		phaseLines.push(`  • ${p.phase.padEnd(PHASE_NAME_PAD_LENGTH)}: ${counts}`);
	}
	const nextActions = ["  Next Actions for AI:"];
	if (totalFixable > 0) nextActions.push(`  1. Mandatory Auto-Fix: npm run auditor:fix (${totalFixable} auto-fixable)`);
	else nextActions.push("  1. Focus critical phase: npm run auditor:next", "  2. Inspect findings:   npm run auditor:findings", phaseBreakdown[0] ? `  3. Inspect by phase:   npm run auditor:findings -- phase=${phaseBreakdown[0].phase}` : "  3. Inspect by rule:    npm run auditor:by-rule", "  4. Consult rule guide: npm run auditor -- guide <ruleId>");
	const reportLine = styleText("dim", `  Full Report: ${latestAuditJsonPath}`);
	return `${header}\n${status}\n\n${phaseLines.join("\n")}\n\n${nextActions.join("\n")}\n\n${reportLine}\n`;
}
function renderExecutiveSetupBlockingSummary(params) {
	const { totalSuites, setupErrors, postponedAppErrors, durationMs, blockingSuites, hasFixableErrors, latestAuditJsonPath = "scratch/audits/latest_audit.json" } = params;
	const header = styleText(["bold", "red"], `[BLOCKED] AUDIT BLOCKED: Setup Phase Failure [${totalSuites} suites] in ${formatDurationMs(durationMs)}`);
	const status = `  Status: ${formatNumber(setupErrors)} setup error(s) (${formatNumber(postponedAppErrors)} downstream app errors postponed to prevent false positives)`;
	const suitesLines = ["  Blocking Suites:"];
	for (const s of blockingSuites) suitesLines.push(`  • ${s}`);
	const warning = styleText(["bold", "yellow"], "  MANDATE: STRICTLY FORBIDDEN to modify application code or styles while setup phase is blocked.");
	const nextActions = [
		"  Next Actions for AI:",
		"  1. Inspect setup issues: npm run auditor:findings -- phase=setup",
		hasFixableErrors ? "  2. Run setup auto-repair: npm run auditor:fix" : "  2. Fix configuration in .auditor/audit.config.ts or package.json"
	];
	const reportLine = styleText("dim", `  Full Report: ${latestAuditJsonPath}`);
	return `${header}\n${status}\n\n${suitesLines.join("\n")}\n\n${warning}\n\n${nextActions.join("\n")}\n\n${reportLine}\n`;
}
function renderExecutiveFixSummary(params) {
	const { durationMs, totalViolationsRepaired, filesModified, remainingErrors = 0, remainingWarnings = 0, latestAuditJsonPath = "scratch/audits/latest_audit.json" } = params;
	const header = styleText(["bold", "green"], `[OK] AUTO-FIX COMPLETED in ${formatDurationMs(durationMs)}`);
	const details = `  Repaired: ${formatNumber(totalViolationsRepaired)} violation(s) across ${formatNumber(filesModified)} file(s)`;
	let remaining = "";
	if (remainingErrors > 0 || remainingWarnings > 0) remaining = styleText("yellow", `  Remaining: ${formatNumber(remainingErrors)} unfixable error(s), ${formatNumber(remainingWarnings)} warning(s)`);
	const nextAction = "  Next Action: Run 'npm run auditor' to verify clean pass.";
	const reportLine = styleText("dim", `  Full Report: ${latestAuditJsonPath}`);
	const lines = [header, details];
	if (remaining) lines.push(remaining);
	lines.push(nextAction, reportLine);
	return `${lines.join("\n")}\n`;
}
function extractPhaseBreakdown(results) {
	const map = /* @__PURE__ */ new Map();
	for (const r of results) for (const f of r.findings ?? []) {
		const phase = f.remediationPhase || "behavior";
		const entry = map.get(phase) ?? {
			errors: 0,
			warnings: 0
		};
		if (f.severity === "error") entry.errors++;
		else entry.warnings++;
		map.set(phase, entry);
	}
	const result = [];
	for (const [phase, data] of map.entries()) if (data.errors > 0 || data.warnings > 0) result.push({
		phase,
		errors: data.errors,
		warnings: data.warnings
	});
	return result.sort((a, b) => {
		if (a.phase === "setup") return -1;
		if (b.phase === "setup") return 1;
		return b.errors - a.errors;
	});
}
//#endregion
export { extractPhaseBreakdown, renderExecutiveFailSummary, renderExecutiveFixSummary, renderExecutivePassSummary, renderExecutiveSetupBlockingSummary };

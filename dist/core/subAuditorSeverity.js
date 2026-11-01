import "./auditContract.js";
// src/core/subAuditorSeverity.ts
function isSubAuditorFailed(report) {
	return (report.errorsCount ?? 0) > 0 || report.status === "failed";
}
function isSubAuditorWarning(report) {
	return (report.warningsCount ?? 0) > 0 || report.status === "warning";
}
function resolveEffectiveErrorsCount(report, fallbackCount = 0) {
	if ((report.errorsCount ?? 0) > 0) return report.errorsCount;
	return isSubAuditorFailed(report) ? fallbackCount : 0;
}
function resolveEffectiveWarningsCount(report, fallbackCount = 0) {
	if ((report.warningsCount ?? 0) > 0) return report.warningsCount;
	return isSubAuditorWarning(report) && !isSubAuditorFailed(report) ? fallbackCount : 0;
}
export { isSubAuditorFailed, isSubAuditorWarning, resolveEffectiveErrorsCount, resolveEffectiveWarningsCount };

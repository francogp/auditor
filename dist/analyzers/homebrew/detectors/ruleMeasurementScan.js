import { SharedAstContext } from "../../../core/astContext.js";
import ts from "typescript";
// src/analyzers/homebrew/detectors/ruleMeasurementScan.ts
/**
* src/analyzers/homebrew/detectors/ruleMeasurementScan.ts
*
* Shared AST scan used by the rule-measurement detectors (`auditor-unmeasured-rule`,
* `auditor-redundant-rule-evaluated`). Parses each inspected file once (cached per
* inspection context) through the canonical SharedAstContext and cross-references:
*   - violation sites:  `this.addViolation({ ruleId: 'literal', ... })`
*   - evaluation wrappers (mark the rule evaluated AND time it): runSubAuditor(Sync),
*     evaluateRule(Sync), declareSubAuditor, declareFileSubAuditor, declarePatternSubAuditor
*   - other measurement sources: reportRuleDuration, recordRuleDuration, markRuleNotApplicable
*   - explicit stamps: `this.markRuleEvaluated('literal')`
*
* Only string-literal rule ids are reasoned about. Whenever a measurement call receives a
* non-literal rule id (e.g. a `for (const r of this.ruleIds)` loop) the scan reports
* `hasDynamicMeasurement` so detectors abstain instead of guessing.
*/
const EVALUATION_WRAPPER_METHODS = /* @__PURE__ */ new Set([
	"runSubAuditor",
	"runSubAuditorSync",
	"evaluateRule",
	"evaluateRuleSync",
	"declareSubAuditor",
	"declareFileSubAuditor",
	"declarePatternSubAuditor"
]);
const REPORTING_METHODS = /* @__PURE__ */ new Set([
	"reportRuleDuration",
	"recordRuleDuration",
	"markRuleNotApplicable"
]);
const scanCache = /* @__PURE__ */ new WeakMap();
function literalText(node) {
	if (!node) return void 0;
	let current = node;
	while (ts.isAsExpression(current) || ts.isParenthesizedExpression(current)) current = current.expression;
	return ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current) ? current.text : void 0;
}
function violationRuleLiteral(call) {
	const arg = call.arguments[0];
	if (!arg || !ts.isObjectLiteralExpression(arg)) return void 0;
	for (const prop of arg.properties) {
		if (!ts.isPropertyAssignment(prop)) continue;
		if ((ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name) ? prop.name.text : void 0) === "ruleId") return literalText(prop.initializer);
	}
}
function isExtendingFileScanAuditor(node) {
	if (!ts.isClassDeclaration(node) || !node.heritageClauses) return false;
	for (const clause of node.heritageClauses) {
		if (clause.token !== ts.SyntaxKind.ExtendsKeyword) continue;
		for (const type of clause.types) if (ts.isIdentifier(type.expression) && type.expression.text === "FileScanAuditor") return true;
	}
	return false;
}
function processCallSite(call, line, acc) {
	if (!ts.isPropertyAccessExpression(call.expression)) return;
	const method = call.expression.name.text;
	if (method === "addViolation") {
		const ruleId = violationRuleLiteral(call);
		if (ruleId !== void 0) acc.violations.push({
			ruleId,
			line
		});
		return;
	}
	if (method === "markRuleEvaluated") {
		const ruleId = literalText(call.arguments[0]);
		if (ruleId !== void 0) acc.marks.push({
			ruleId,
			line
		});
		return;
	}
	const isWrapper = EVALUATION_WRAPPER_METHODS.has(method);
	const isReporter = REPORTING_METHODS.has(method);
	if (!isWrapper && !isReporter) return;
	const ruleId = literalText(call.arguments[0]);
	if (ruleId === void 0) {
		acc.hasDynamicMeasurement = true;
		return;
	}
	acc.measured.add(ruleId);
	if (isWrapper) acc.wrapped.add(ruleId);
}
function scanRuleMeasurement(context) {
	const cached = scanCache.get(context);
	if (cached) return cached;
	const sourceFile = new SharedAstContext().getSourceFile(context.absolutePath, context.content);
	const acc = {
		violations: [],
		marks: [],
		measured: /* @__PURE__ */ new Set(),
		wrapped: /* @__PURE__ */ new Set(),
		hasDynamicMeasurement: false
	};
	let extendsFileScan = false;
	const lineOf = (node) => sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
	const visit = (node) => {
		if (!extendsFileScan && isExtendingFileScanAuditor(node)) extendsFileScan = true;
		if (ts.isCallExpression(node)) processCallSite(node, lineOf(node), acc);
		ts.forEachChild(node, visit);
	};
	visit(sourceFile);
	if (extendsFileScan) {
		const distinctRules = /* @__PURE__ */ new Set([...acc.violations.map((v) => v.ruleId), ...acc.marks.map((m) => m.ruleId)]);
		if (distinctRules.size === 1) for (const singleRule of distinctRules) acc.measured.add(singleRule);
	}
	const scan = {
		violations: acc.violations,
		marks: acc.marks,
		measured: acc.measured,
		wrapped: acc.wrapped,
		hasDynamicMeasurement: acc.hasDynamicMeasurement
	};
	scanCache.set(context, scan);
	return scan;
}
export { scanRuleMeasurement };

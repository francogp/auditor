import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { BaseAuditor, FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import ts from "typescript";
//#region src/suites/architecture/validate_reactive_purity.ts
/**
* scripts/auditors/architecture/validate_reactive_purity.ts
*
* REACTIVE COMPUTED PURITY AUDITOR (Node.js 26+ Native)
*
* Enforces pure, side-effect-free computed getters across stores and composables:
*   1. Computed getters must NEVER mutate state (.value =, state.x =, this.x =, store.x =).
*   2. Computed getters must NEVER trigger persistence side-effects (.save(), scheduleSave(), etc.).
*
* Escape Hatch:
*   // purity-ok: <justification> disables check on that line or block.
*
* Usage:
*   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_reactive_purity.ts
*   npm run validate:reactive-purity
*/
enableCompileCache();
const REACTIVE_PURITY_RULES = ["computed-state-mutation", "computed-side-effect"];
const IMPURE_CALL_PATTERNS = [
	"scheduleSave",
	"scheduleLocalSave",
	".save(",
	".persist(",
	".saveLocal(",
	"authStore.logout",
	"window.location"
];
function extractGetterFromObjectLiteral(expr, sf) {
	for (const prop of expr.properties) if (ts.isPropertyAssignment(prop) && prop.name.getText(sf) === "get") {
		if (ts.isArrowFunction(prop.initializer) || ts.isFunctionExpression(prop.initializer)) return prop.initializer.body;
	}
	return null;
}
function extractComputedGetterBody(firstArg, sf) {
	if (ts.isArrowFunction(firstArg) || ts.isFunctionExpression(firstArg)) return firstArg.body;
	if (ts.isObjectLiteralExpression(firstArg)) return extractGetterFromObjectLiteral(firstArg, sf);
	return null;
}
var ReactivePurityAuditor = class extends FileScanAuditor {
	constructor(roots, projectRoot) {
		const config = getAuditConfig(projectRoot);
		const effectiveRoots = roots ?? [...config.paths.storesRoots ?? [], ...config.paths.composablesRoots ?? []];
		super({
			usesThirdPartyTool: false,
			ruleCapabilities: createRuleCapabilities(REACTIVE_PURITY_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			id: "validate_reactive_purity",
			name: "Reactive Computed Purity Auditor",
			description: "Verifica pureza reactiva y ausencia de efectos en computeds",
			family: "architecture",
			ruleIds: REACTIVE_PURITY_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(REACTIVE_PURITY_RULES, "behavior"),
			packageName: "Computed",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			icon: "🧼",
			ruleDescriptions: {
				"computed-state-mutation": "Mutación de estado prohibida",
				"computed-side-effect": "Efecto secundario prohibido"
			},
			ruleRemediations: {
				"computed-state-mutation": "Guía de diagnóstico y remediación para computed-state-mutation. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"computed-side-effect": "Guía de diagnóstico y remediación para computed-side-effect. Revisa la incidencia detectada y ajusta el código correspondiente."
			},
			roots: effectiveRoots,
			allowedExtensions: /* @__PURE__ */ new Set([".ts", ".vue"]),
			projectRoot
		});
	}
	checkComputedCall(node, sf, relPath, content) {
		if (!ts.isCallExpression(node)) return;
		if (node.expression.getText(sf) !== "computed" || node.arguments.length === 0) return;
		const firstArg = node.arguments[0];
		if (!firstArg) return;
		const getterBody = extractComputedGetterBody(firstArg, sf);
		if (getterBody) this.inspectGetterBody(getterBody, sf, relPath, content);
	}
	activeTargetRule;
	scanFile(relPath, content, sourceFile) {
		if (!content.includes("computed")) return;
		const sf = sourceFile ?? this.context.getAst(relPath, content);
		if (!sf.text.trim()) return;
		this.runSubAuditorSync("computed-state-mutation", () => {
			this.activeTargetRule = "computed-state-mutation";
			const visit = (node) => {
				this.checkComputedCall(node, sf, relPath, content);
				ts.forEachChild(node, visit);
			};
			visit(sf);
		});
		this.runSubAuditorSync("computed-side-effect", () => {
			this.activeTargetRule = "computed-side-effect";
			const visit = (node) => {
				this.checkComputedCall(node, sf, relPath, content);
				ts.forEachChild(node, visit);
			};
			visit(sf);
			this.activeTargetRule = void 0;
		});
	}
	reportComputedViolation(node, sourceFile, relPath, fullContent, ruleId, message) {
		const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
		const realLine = line + 1;
		if (!this.hasPuritySuppression(fullContent, realLine - 1)) this.addViolation({
			ruleId,
			severity: "error",
			file: relPath,
			line: realLine,
			message,
			context: node.getText(sourceFile)
		});
	}
	inspectGetterBody(bodyNode, sourceFile, relPath, fullContent) {
		const walk = (child) => {
			if (!this.activeTargetRule || this.activeTargetRule === "computed-state-mutation") {
				if (ts.isBinaryExpression(child)) {
					const op = child.operatorToken.kind;
					if (op >= ts.SyntaxKind.FirstAssignment && op <= ts.SyntaxKind.LastAssignment) {
						const leftText = child.left.getText(sourceFile);
						if (leftText.includes(".value") || leftText.startsWith("state.") || leftText.startsWith("this.") || leftText.includes("Store.")) this.reportComputedViolation(child, sourceFile, relPath, fullContent, "computed-state-mutation", `Mutación impura dentro de 'computed()': '${child.getText(sourceFile)}'. Los computed deben ser funciones puras.`);
					}
				}
			}
			if (!this.activeTargetRule || this.activeTargetRule === "computed-side-effect") {
				if (ts.isCallExpression(child)) {
					const callText = child.expression.getText(sourceFile);
					if (IMPURE_CALL_PATTERNS.some((pat) => callText.includes(pat))) this.reportComputedViolation(child, sourceFile, relPath, fullContent, "computed-side-effect", `Llamada con efectos secundarios dentro de 'computed()': '${child.getText(sourceFile)}'. Queda prohibido disparar persistencia en getters.`);
				}
			}
			ts.forEachChild(child, walk);
		};
		ts.forEachChild(bodyNode, walk);
	}
	hasPuritySuppression(content, lineIndex) {
		const lines = content.split("\n");
		const targetLine = lines[lineIndex] || "";
		const prevLine = lineIndex > 0 ? lines[lineIndex - 1] || "" : "";
		const suppressionRegex = /\/\/\s*purity-ok:\s*\S+/i;
		return suppressionRegex.test(targetLine) || suppressionRegex.test(prevLine);
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ReactivePurityAuditor());
//#endregion
export { REACTIVE_PURITY_RULES, ReactivePurityAuditor };

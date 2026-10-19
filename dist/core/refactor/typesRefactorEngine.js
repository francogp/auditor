import { BaseRefactorEngine } from "./baseRefactorEngine.js";
import { executePlanFileReplacements, forEachSourceScriptLine } from "./refactorFileScanner.js";
//#region src/core/refactor/typesRefactorEngine.ts
/**
* src/core/refactor/typesRefactorEngine.ts
*
* TYPE ASSERTION & RETURN TYPE GOVERNANCE REFACTORING ENGINE (Node.js 26+ Native)
* Provides deterministic discovery, Dirac micro-context extraction,
* and automated plan-based remediation for `as any`, double assertions, and missing return types.
*/
const AS_ANY_REGEX = /\bas\s+any\b/g;
const ANGLE_ANY_REGEX = /<any>\s*([a-zA-Z0-9_$.()]+)/g;
const DOUBLE_ASSERTION_REGEX = /\bas\s+(?:unknown|any)\s+as\s+([A-Za-z0-9_$.<>[\]|& ]+)/g;
const EXPORTED_FN_REGEX = /^(\s*export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\([^)]*\))\s*\{/m;
var TypesRefactorEngine = class TypesRefactorEngine extends BaseRefactorEngine {
	toolId = "auditor-types";
	configSectionKey = "typeCheck";
	allowedExtensions = /* @__PURE__ */ new Set([".ts", ".vue"]);
	discoverInFile(filePath) {
		return TypesRefactorEngine.discoverInFile(filePath);
	}
	createPlan(typesPlanId, typesFindings) {
		return TypesRefactorEngine.buildTypeAssertionPlan(typesPlanId, typesFindings);
	}
	applyPlan(projectRoot, plan) {
		TypesRefactorEngine.applyPlan(projectRoot, plan);
		return { modifiedFiles: plan.targetFiles };
	}
	/**
	* Scans a file to discover type assertion and return type hygiene violations.
	*/
	static discoverInFile(filePath) {
		const findings = [];
		forEachSourceScriptLine(filePath, (line, actualLine) => {
			if (line.includes("// type-ok:") || line.includes("// type-ignore:") || line.includes("// eslint-disable")) return;
			DOUBLE_ASSERTION_REGEX.lastIndex = 0;
			let doubleMatch;
			if ((doubleMatch = DOUBLE_ASSERTION_REGEX.exec(line)) !== null) {
				const fullMatch = doubleMatch[0];
				const targetType = doubleMatch[1]?.trim() || "TargetType";
				findings.push({
					file: filePath,
					line: actualLine,
					kind: "double-assertion",
					originalSnippet: fullMatch,
					suggestedReplacement: `as ${targetType} /* verify narrowing */`,
					explanation: `Avoid double-casting (${fullMatch}). Use explicit type narrowing or domain-specific guards.`
				});
				return;
			}
			AS_ANY_REGEX.lastIndex = 0;
			if (AS_ANY_REGEX.test(line)) {
				findings.push({
					file: filePath,
					line: actualLine,
					kind: "as-any",
					originalSnippet: "as any",
					suggestedReplacement: "as unknown",
					explanation: "Avoid loose \"as any\" assertions. Prefer \"as unknown\" or domain types to maintain compile-time safety."
				});
				return;
			}
			ANGLE_ANY_REGEX.lastIndex = 0;
			let angleMatch;
			if ((angleMatch = ANGLE_ANY_REGEX.exec(line)) !== null) {
				const fullMatch = angleMatch[0];
				const expr = angleMatch[1] || "expr";
				findings.push({
					file: filePath,
					line: actualLine,
					kind: "as-any",
					originalSnippet: fullMatch,
					suggestedReplacement: `(${expr} as unknown)`,
					explanation: `Avoid legacy angle-bracket syntax "${fullMatch}". Use "as unknown" or specific interfaces.`
				});
				return;
			}
			const fnMatch = EXPORTED_FN_REGEX.exec(line);
			if (fnMatch) {
				const header = fnMatch[1];
				const fnName = fnMatch[2];
				if (header && fnName && !line.includes("):") && !header.endsWith(":")) {
					const fallbackReturn = header.includes("async ") ? ": Promise<void>" : ": void";
					findings.push({
						file: filePath,
						line: actualLine,
						kind: "missing-return-type",
						identifier: fnName,
						originalSnippet: header,
						suggestedReplacement: `${header}${fallbackReturn}`,
						explanation: `Exported function "${fnName}" lacks an explicit return type. Add an explicit contract.`
					});
				}
			}
		});
		return findings;
	}
	/**
	* Creates a deterministic refactoring plan from findings.
	*/
	static buildTypeAssertionPlan(planId, findings) {
		const targetFiles = Array.from(new Set(findings.map((f) => f.file)));
		const assertionReplacements = [];
		const returnTypeInjections = [];
		for (const f of findings) if (f.kind === "as-any" || f.kind === "double-assertion") assertionReplacements.push({
			file: f.file,
			line: f.line,
			originalSnippet: f.originalSnippet,
			replacementSnippet: f.suggestedReplacement.replace(/\s*\/\*.*?\*\/\s*$/, "")
		});
		else if (f.kind === "missing-return-type") returnTypeInjections.push({
			file: f.file,
			line: f.line,
			originalHeader: f.originalSnippet,
			replacementHeader: f.suggestedReplacement
		});
		return {
			version: 1,
			planId,
			targetFiles,
			assertionReplacements,
			returnTypeInjections
		};
	}
	static createPlan(planId, findings) {
		return TypesRefactorEngine.buildTypeAssertionPlan(planId, findings);
	}
	/**
	* Deterministically applies a TypesRefactorPlan across target source files.
	*/
	static applyPlan(targetDir, plan) {
		const assertionReplacements = plan.assertionReplacements?.map((item) => ({
			file: item.file,
			original: item.originalSnippet,
			replacement: item.replacementSnippet
		}));
		const returnTypeInjections = plan.returnTypeInjections?.map((item) => ({
			file: item.file,
			original: item.originalHeader,
			replacement: item.replacementHeader
		}));
		return executePlanFileReplacements(targetDir, plan.targetFiles, [assertionReplacements, returnTypeInjections]);
	}
};
//#endregion
export { TypesRefactorEngine };

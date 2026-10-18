import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { isTestPath } from "../../core/auditTestPredicates.js";
import "../../core/auditConfig.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import { AuditedDocument } from "../../core/auditedDocument.js";
import { BaseAuditor, FileScanAuditor, createUniformRemediationPhases, createUniformRuleCapabilities, resolveFileScanRoots } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import ts from "typescript";
//#region src/suites/architecture/validate_code_simplification.ts
enableCompileCache();
const CODE_SIMPLIFICATION_RULES = [
	"dead-code-accumulation",
	"boolean-trap-parameters",
	"deep-nesting-control-flow",
	"redundant-else-after-return",
	"premature-abstraction-wrapper",
	"massive-switch-branching"
];
const CODE_SIMPLIFICATION_CAPABILITIES = {
	speed: "light",
	phase: "normal",
	fix: "none",
	md: false,
	ast: true,
	changedOnly: false,
	critical: false
};
const SCANNABLE_EXTS = /* @__PURE__ */ new Set([
	".ts",
	".js",
	".vue"
]);
var ValidateCodeSimplificationAuditor = class extends FileScanAuditor {
	constructor(options = {}) {
		const { effectiveRoot, targetRoots } = resolveFileScanRoots(options);
		const config = getAuditConfig(effectiveRoot);
		super({
			usesThirdPartyTool: false,
			id: "validate_code_simplification",
			name: "Code Complexity & Readability Simplifier Validator",
			description: "Simplificación de código, nesting y claridad sintáctica",
			family: "architecture",
			packageName: "Simplify",
			icon: "🧹",
			configKey: "codeSimplification.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			roots: targetRoots,
			allowedExtensions: SCANNABLE_EXTS,
			ruleIds: CODE_SIMPLIFICATION_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(CODE_SIMPLIFICATION_RULES, "hygiene"),
			ruleDescriptions: {
				"dead-code-accumulation": "Bloques de código muerto comentados",
				"boolean-trap-parameters": "Parámetros booleanos posicionales",
				"deep-nesting-control-flow": "Anidamiento excesivo > 4 niveles",
				"redundant-else-after-return": "Cláusula else tras return o throw",
				"premature-abstraction-wrapper": "Wrapper innecesario sin lógica",
				"massive-switch-branching": "Switch masivo con más de 10 casos"
			},
			ruleRemediations: {
				"dead-code-accumulation": "Guía de diagnóstico y remediación para dead-code-accumulation. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"boolean-trap-parameters": "Guía de diagnóstico y remediación para boolean-trap-parameters. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"deep-nesting-control-flow": "Guía de diagnóstico y remediación para deep-nesting-control-flow. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"redundant-else-after-return": "Guía de diagnóstico y remediación para redundant-else-after-return. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"premature-abstraction-wrapper": "Guía de diagnóstico y remediación para premature-abstraction-wrapper. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"massive-switch-branching": "Guía de diagnóstico y remediación para massive-switch-branching. Revisa la incidencia detectada y ajusta el código correspondiente."
			},
			ruleCapabilities: createUniformRuleCapabilities(CODE_SIMPLIFICATION_RULES, CODE_SIMPLIFICATION_CAPABILITIES),
			projectRoot: effectiveRoot,
			coverage: deriveCoverageFromRoots(targetRoots, SCANNABLE_EXTS, effectiveRoot),
			exemptPaths: config.codeSimplification?.exemptPaths
		});
	}
	scanFile(relPath, content, sourceFile, doc) {
		const sourceLines = content.split("\n");
		const isTestFile = isTestPath(relPath);
		this.runSubAuditorSync("dead-code-accumulation", () => {
			if (!isTestFile && !content.includes("dead-code-ok")) this.auditDeadCodeAccumulation(relPath, sourceLines);
		});
		this.runSubAuditorSync("boolean-trap-parameters", () => {
			if (!isTestFile && !content.includes("boolean-trap-ok")) this.auditBooleanTrapParameters(relPath, content, sourceLines);
		});
		this.runSubAuditorSync("deep-nesting-control-flow", () => {
			if (!isTestFile && !content.includes("nesting-ok")) {
				const document = doc ?? new AuditedDocument(path.resolve(this.projectRoot, relPath), content, relPath);
				const sf = sourceFile ?? document.getAst();
				if (sf) this.auditDeepNestingControlFlow(relPath, sf, document, sourceLines);
			}
		});
		this.runSubAuditorSync("redundant-else-after-return", () => {
			if (!isTestFile && !content.includes("redundant-else-ok")) this.auditRedundantElseAfterReturn(relPath, content, sourceLines);
		});
		this.runSubAuditorSync("premature-abstraction-wrapper", () => {
			if (!isTestFile && !content.includes("wrapper-ok")) this.auditPrematureAbstractionWrapper(relPath, content, sourceLines);
		});
		this.runSubAuditorSync("massive-switch-branching", () => {
			if (!isTestFile && !content.includes("switch-ok")) this.auditMassiveSwitchBranching(relPath, content, sourceLines);
		});
	}
	recordSimplificationFinding(relPath, content, lines, matchIndex, tag, ruleId, message) {
		const line = this.getLineNumber(content, matchIndex);
		const lineText = lines[line - 1] ?? "";
		const prevLineText = line > 1 ? lines[line - 2] ?? "" : "";
		if (lineText.includes(tag) || prevLineText.includes(tag)) return;
		this.addViolation({
			ruleId,
			severity: "error",
			message,
			file: relPath,
			line
		});
	}
	auditDeadCodeAccumulation(relPath, lines) {
		let consecutiveCommentedCode = 0;
		let startLine = 0;
		const codeLikePattern = /^\s*\/\/\s*(?:const|let|var|if\s*\(|for\s*\(|while\s*\(|return\b|function\b|import\b|await\b|\w+\.\w+\s*\(|\w+\s*=[^=])/;
		const docExemptions = /-(?:ok|audit|domain|path|type|lint)|TODO|FIXME|NOTE|eslint|@param|@returns|\/\/\s*[-*#]/i;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (codeLikePattern.test(line) && !docExemptions.test(line)) {
				if (consecutiveCommentedCode === 0) startLine = i + 1;
				consecutiveCommentedCode++;
				if (consecutiveCommentedCode >= 3) {
					this.addViolation({
						ruleId: "dead-code-accumulation",
						severity: "error",
						message: `Acumulación de código muerto comentado (>= 3 líneas consecutivas iniciando en línea ${startLine})`,
						file: relPath,
						line: startLine
					});
					consecutiveCommentedCode = 0;
				}
			} else consecutiveCommentedCode = 0;
		}
	}
	auditBooleanTrapParameters(relPath, content, lines) {
		const signatureRegex = /(?:function\s+\w+\s*|\b\w+\s*)\(([^);{}]+)\)/g;
		let match;
		while ((match = signatureRegex.exec(content)) !== null) {
			const booleanParamMatches = (match[1] ?? "").replace(/\{[^}]*\}/g, "").match(/:\s*boolean\b/g);
			if (booleanParamMatches && booleanParamMatches.length >= 2) this.recordSimplificationFinding(relPath, content, lines, match.index, "boolean-trap-ok", "boolean-trap-parameters", "Firma de función con múltiples parámetros booleanos posicionales; refactorizar hacia options object");
		}
	}
	computeNestingDepth(node, currentDepth, parentIsLoop, allowMatrixLoops) {
		const isElseIf = ts.isIfStatement(node) && node.parent !== void 0 && ts.isIfStatement(node.parent) && node.parent.elseStatement === node;
		const isLoop = this.isLoopAstNode(node);
		return isElseIf || allowMatrixLoops && isLoop && parentIsLoop ? currentDepth : currentDepth + 1;
	}
	isLoopAstNode(node) {
		return ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node);
	}
	isControlFlowAstNode(node) {
		return ts.isIfStatement(node) || ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node) || ts.isWhileStatement(node) || ts.isDoStatement(node) || ts.isSwitchStatement(node);
	}
	isFunctionBoundaryAstNode(node) {
		return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node) || ts.isGetAccessor(node) || ts.isSetAccessor(node) || ts.isConstructorDeclaration(node);
	}
	checkDeepNestingViolation(relPath, node, sourceFile, doc, lines, depth, maxDepth, reportedLines) {
		if (depth <= maxDepth) return;
		const { line } = doc ? doc.getNodeLineAndColumn(node, sourceFile) : { line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1 };
		if (reportedLines.has(line)) return;
		reportedLines.add(line);
		const lineText = lines[line - 1] ?? "";
		const prevLineText = line > 1 ? lines[line - 2] ?? "" : "";
		if (!(lineText.includes("nesting-ok") || prevLineText.includes("nesting-ok") || (doc ? doc.hasEscapeHatch(line, "deep-nesting-control-flow") : false))) this.addViolation({
			ruleId: "deep-nesting-control-flow",
			severity: "error",
			message: `Control de flujo con anidamiento profundo (${depth} niveles > ${maxDepth}); aplicar early return`,
			file: relPath,
			line
		});
	}
	auditDeepNestingControlFlow(relPath, sourceFile, doc, lines) {
		const config = getAuditConfig(this.projectRoot);
		const maxNestingDepth = config.codeSimplification?.maxNestingDepth ?? 4;
		const allowMatrixLoops = config.codeSimplification?.allowMatrixLoops ?? false;
		const reportedLines = /* @__PURE__ */ new Set();
		const visit = (node, currentDepth, parentIsLoop) => {
			if (this.isFunctionBoundaryAstNode(node)) {
				ts.forEachChild(node, (child) => visit(child, 0, false));
				return;
			}
			if (this.isControlFlowAstNode(node)) {
				const nextDepth = this.computeNestingDepth(node, currentDepth, parentIsLoop, allowMatrixLoops);
				this.checkDeepNestingViolation(relPath, node, sourceFile, doc, lines, nextDepth, maxNestingDepth, reportedLines);
				const isLoop = this.isLoopAstNode(node);
				ts.forEachChild(node, (child) => visit(child, nextDepth, isLoop));
				return;
			}
			ts.forEachChild(node, (child) => visit(child, currentDepth, parentIsLoop));
		};
		visit(sourceFile, 0, false);
	}
	auditRedundantElseAfterReturn(relPath, content, lines) {
		const redundantElseRegex = /(?:return\b[^;]*;|throw\b[^;]*;)\s*\}\s*else\s*\{/g;
		let match;
		while ((match = redundantElseRegex.exec(content)) !== null) this.recordSimplificationFinding(relPath, content, lines, match.index, "redundant-else-ok", "redundant-else-after-return", "Cláusula else redundante inmediatamente después de return o throw definitivo");
	}
	auditPrematureAbstractionWrapper(relPath, content, lines) {
		const wrapperRegex = /function\s+(\w+)\s*\(([^)]*)\)\s*:\s*([^{]+)\{\s*return\s+([\w.]+)\s*\(([^)]*)\);\s*\}/g;
		let match;
		while ((match = wrapperRegex.exec(content)) !== null) {
			const fnName = match[1];
			const params = match[2].replace(/\s*:[^,)]+/g, "").replace(/\s+/g, "");
			const returnType = match[3] ?? "";
			const delegateName = match[4];
			const args = match[5].replace(/\s+/g, "");
			if (/\b\w+\s+is\s+/i.test(returnType) || delegateName.endsWith(".has")) continue;
			if (fnName !== delegateName && params === args && params.length > 0) this.recordSimplificationFinding(relPath, content, lines, match.index, "wrapper-ok", "premature-abstraction-wrapper", `Función wrapper '${fnName}' innecesaria que solo reenvía parámetros idénticos a '${delegateName}'`);
		}
	}
	auditMassiveSwitchBranching(relPath, content, lines) {
		const switchRegex = /switch\s*\([^)]*\)\s*\{([^}]*)\}/g;
		let match;
		while ((match = switchRegex.exec(content)) !== null) {
			const caseMatches = (match[1] ?? "").match(/\bcase\s[^:]+:/g);
			if (caseMatches && caseMatches.length > 10) this.recordSimplificationFinding(relPath, content, lines, match.index, "switch-ok", "massive-switch-branching", `Estructura switch masiva (${caseMatches.length} casos > 10); refactorizar hacia tabla Map`);
		}
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateCodeSimplificationAuditor());
//#endregion
export { CODE_SIMPLIFICATION_CAPABILITIES, CODE_SIMPLIFICATION_RULES, ValidateCodeSimplificationAuditor };

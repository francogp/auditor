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
		const scanRoots = resolveFileScanRoots(options);
		const simplificationConfig = getAuditConfig(scanRoots.effectiveRoot);
		super({
			id: "validate_code_simplification",
			name: "Code Complexity & Readability Simplifier Validator",
			description: "Code simplification, nesting, and syntactic clarity",
			family: "architecture",
			packageName: "Simplify",
			icon: "🧹",
			requiredPermissions: [],
			usesThirdPartyTool: false,
			roots: scanRoots.targetRoots,
			allowedExtensions: SCANNABLE_EXTS,
			exemptPaths: simplificationConfig.codeSimplification?.exemptPaths,
			configKey: "codeSimplification.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			ruleIds: CODE_SIMPLIFICATION_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(CODE_SIMPLIFICATION_RULES, "hygiene"),
			ruleDescriptions: {
				"dead-code-accumulation": "Commented dead code blocks",
				"boolean-trap-parameters": "Positional boolean parameters",
				"deep-nesting-control-flow": "Excessive nesting > 4 levels",
				"redundant-else-after-return": "Else clause after return or throw",
				"premature-abstraction-wrapper": "Unnecessary wrapper without logic",
				"massive-switch-branching": "Massive switch with over 10 cases"
			},
			ruleRemediations: {
				"dead-code-accumulation": "📖 REMEDIATION GUIDE: dead-code-accumulation\n1. Root Cause: Commented-out dead code blocks were detected in source files. Git is the single valid history; leaving commented-out code creates clutter and confuses maintainers.\n2. Diagnosis: Locate the commented code lines indicated in the report.\n3. Canonical Solution: Completely delete the commented-out code block.\n4. Example / Auto-fix command:\n   ❌ Dead code: // const oldTotal = items.reduce((acc, i) => acc + i.val, 0);\n   ✅ Clean:     Removed from source file.",
				"boolean-trap-parameters": "📖 REMEDIATION GUIDE: boolean-trap-parameters\n1. Root Cause: A function declares multiple positional boolean parameters (e.g. fn(active: boolean, force: boolean, log: boolean)). At call sites, the meaning of each argument is ambiguous, unreadable, and error-prone.\n2. Diagnosis: Inspect the function signature at the reported line.\n3. Canonical Solution: Refactor positional booleans into a typed options interface with named properties (e.g., options: UserActionOptions).\n4. Example / Auto-fix command:\n   ❌ Boolean trap: createUser('Alice', true, false);\n   ✅ Named options: createUser('Alice', { isAdmin: true, notify: false });",
				"deep-nesting-control-flow": "📖 REMEDIATION GUIDE: deep-nesting-control-flow\n1. Root Cause: Control structures (if, for, while, callbacks) are nested beyond 4 levels deep (\"Arrow Anti-pattern\"), making mental execution tracking difficult.\n2. Diagnosis: Examine the nested conditionals or loops at the reported line.\n3. Canonical Solution:\n   a) Apply early returns (guard clauses) to flatten control flow.\n   b) Extract subtasks into small pure helper functions.\n4. Example / Auto-fix command:\n   ❌ Nested:    if (a) { if (b) { if (c) { doWork(); } } }\n   ✅ Flattened: if (!a || !b || !c) return; doWork();",
				"redundant-else-after-return": "📖 REMEDIATION GUIDE: redundant-else-after-return\n1. Root Cause: An else or else if block immediately follows an if block whose body always terminates with return, throw, break, or continue.\n2. Diagnosis: Review the reported if (...) { return; } else { ... } construct.\n3. Canonical Solution: Remove the else keyword and hoist the block body to the outer scope.\n4. Example / Auto-fix command:\n   ❌ Redundant: if (!item) return null; else { return item.name; }\n   ✅ Concise:   if (!item) return null; return item.name;",
				"premature-abstraction-wrapper": "📖 REMEDIATION GUIDE: premature-abstraction-wrapper\n1. Root Cause: A single-line wrapper function merely forwards arguments to another function without adding validation, transformation, typing, or behavior.\n2. Diagnosis: Inspect the reported wrapper function to check if it adds value.\n3. Canonical Solution: Delete the wrapper and have callers invoke the underlying function directly (YAGNI simplification).\n4. Example / Auto-fix command:\n   ❌ Wrapper: function getLength(arr: string[]) { return arr.length; }\n   ✅ Direct:  Use arr.length at call sites.",
				"massive-switch-branching": "📖 REMEDIATION GUIDE: massive-switch-branching\n1. Root Cause: A switch statement contains more than 10 case branches, harming readability and violating modular design.\n2. Diagnosis: Inspect the switch statement at the reported line.\n3. Canonical Solution:\n   a) Replace the switch with a dictionary or handler map indexed by domain keys: const HANDLERS: Record<Type, Handler> = { ... };.\n   b) If individual branch logic is complex, apply the Strategy pattern or polymorphism.\n4. Example / Auto-fix command:\n   ❌ Massive switch: switch(type) { case 'a': ... case 'b': ... // 15 cases }\n   ✅ Canonical map:  const handler = ACTION_MAP[type]; handler?.();"
			},
			ruleCapabilities: createUniformRuleCapabilities(CODE_SIMPLIFICATION_RULES, CODE_SIMPLIFICATION_CAPABILITIES),
			projectRoot: scanRoots.effectiveRoot,
			coverage: deriveCoverageFromRoots(scanRoots.targetRoots, SCANNABLE_EXTS, scanRoots.effectiveRoot)
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
						message: `Dead commented code accumulation (>= 3 consecutive lines starting at line ${startLine})`,
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
			message: `Deeply nested control flow (${depth} levels > ${maxDepth}); apply early return`,
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

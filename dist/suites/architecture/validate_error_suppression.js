import { AuditedDocument } from "../../core/auditedDocument.js";
import { BaseAuditor, FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases, resolveFileScanRoots } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import ts from "typescript";
// src/suites/architecture/validate_error_suppression.ts
/**
* scripts/auditors/architecture/validate_error_suppression.ts
*
* ZERO ERROR SUPPRESSION AUDITOR (Node.js 26+ Native)
*
* Enforces the project's Zero Error Suppression Mandate (AGENTS.md):
*   1. No Empty Catch Blocks (`no-empty-catch`):
*      Forbids empty catch blocks or catch-with-parameter blocks that swallow exceptions silently.
*   2. No Silent Promise Catch (`no-silent-promise-catch`):
*      Forbids `.catch(() => {})`, `.catch(() => null)`, `.catch(() => undefined)`
*      that discard promise rejections without re-throwing or logging.
*   3. No Silent Mock Fallbacks (`no-silent-mock-fallbacks`):
*      Forbids using schema fallback wrappers (such as `v.fallback(...)` in Valibot)
*      that silently heal invalid data rather than failing loud at trust boundaries.
*   4. Strict Catch Narrowing (`strict-catch-narrowing`):
*      Requires explicit type narrowing (`if (err instanceof Error)`) before accessing
*      `.message` or `.code` on caught exception objects.
*
* Usage:
*   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_error_suppression.ts
*/
enableCompileCache();
const ERROR_SUPPRESSION_RULES = [
	"no-empty-catch",
	"no-silent-promise-catch",
	"no-silent-mock-fallbacks",
	"strict-catch-narrowing"
];
const STANDARD_ERROR_PROPERTIES = /* @__PURE__ */ new Set([
	"message",
	"code",
	"stack"
]);
var ErrorSuppressionAuditor = class extends FileScanAuditor {
	constructor(options = {}) {
		const { effectiveRoot, targetRoots } = resolveFileScanRoots(options, (cfg) => cfg.paths.codeRoots);
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			roots: targetRoots,
			projectRoot: effectiveRoot,
			ruleCapabilities: createRuleCapabilities(ERROR_SUPPRESSION_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: true,
				changedOnly: false,
				critical: false
			}),
			id: "validate_error_suppression",
			name: "Zero Error Suppression Auditor",
			description: "Prohibits error suppression, empty catches, and fallbacks",
			family: "architecture",
			ruleIds: ERROR_SUPPRESSION_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(ERROR_SUPPRESSION_RULES, "hygiene"),
			packageName: "Error",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			icon: "🚫",
			ruleDescriptions: {
				"no-empty-catch": "Empty or silent catch block",
				"no-silent-promise-catch": "Promise with silent .catch()",
				"no-silent-mock-fallbacks": "Prohibited use of v.fallback",
				"strict-catch-narrowing": "Catch block without instanceof Error"
			},
			ruleRemediations: {
				"no-empty-catch": "📖 REMEDIATION GUIDE: no-empty-catch\n1. Root Cause: An empty catch block or one that performs no action was found. Silencing exceptions masks critical defects and violates Loud Failure principles.\n2. Diagnosis: Locate the reported catch block at the specified file and line.\n3. Canonical Solution:\n   a) Propagate the error by throwing a typed exception (`throw error`).\n   b) Formally log or handle the error if performing controlled degradation.\n   c) If optional I/O fails safely (e.g. optional cache read), check existence before running or log a debug warning via structured logger.\n4. Example / Auto-fix command:\n   ❌ Incorrect: try { doWork(); } /* empty catch swallowing exceptions */\n   ✅ Correct:   const data = tryOrNull(() => doWork()); // or catch (e) { logger.warn(\"Failed\", { cause: e }); }",
				"no-silent-promise-catch": "📖 REMEDIATION GUIDE: no-silent-promise-catch\n1. Root Cause: An empty `.catch()` handler was chained to a Promise without logging or re-throwing, leaving the promise silently swallowed.\n2. Diagnosis: Check the `.catch()` handler on the promise at the reported line.\n3. Canonical Solution:\n   a) Log the error or propagate it to the caller.\n   b) If handling a non-fatal rejection, handle with typed fallback and structured logging.\n4. Example / Auto-fix command:\n   ❌ Incorrect: Promise with empty catch discarding errors silently\n   ✅ Correct:   `fetchData().catch((err) => { logger.error(\"Failed to fetch data\", err); });`",
				"no-silent-mock-fallbacks": "📖 REMEDIATION GUIDE: no-silent-mock-fallbacks\n1. Root Cause: Use of `v.fallback()` in Valibot schemas. Silent fallbacks mask data corruptions or API divergence instead of triggering early validation failures.\n2. Diagnosis: Look for `v.fallback(...)` calls in validation schemas.\n3. Canonical Solution: Remove `v.fallback()`. If an API field is optional, type it explicitly with `v.optional(...)` or `v.nullish(...)` and supply defaults in domain constructors.\n4. Example / Auto-fix command:\n   ❌ Incorrect: Using silent schema fallback\n   ✅ Correct:   `v.optional(v.string(), \"default\")`",
				"strict-catch-narrowing": "📖 REMEDIATION GUIDE: strict-catch-narrowing\n1. Root Cause: In modern TypeScript with `useUnknownInCatchVariables: true`, catch error variables are `unknown`. Accessing properties like message or stack without checking `instanceof Error` triggers runtime crashes if non-Errors are thrown.\n2. Diagnosis: Locate unsafe error property accesses inside the catch block.\n3. Canonical Solution: Narrow the type via `e instanceof Error ? e.message : String(e)` or use a typed helper like `toErrorMessage(e)`.\n4. Example / Auto-fix command:\n   ❌ Incorrect: Direct property access on unknown error without narrowing\n   ✅ Correct:   `const msg = e instanceof Error ? e.message : String(e);`"
			},
			allowedExtensions: /* @__PURE__ */ new Set([".ts", ".vue"])
		});
	}
	scanFile(relPath, content, sourceFile) {
		const doc = new AuditedDocument(relPath, content, relPath);
		const sf = sourceFile ?? doc.getAst();
		if (!sf) return;
		const isSchemaFile = relPath.includes("schema") || relPath.includes("models") || relPath.includes("storage");
		const visit = (node) => {
			if (ts.isCatchClause(node)) {
				this.runSubAuditorSync("no-empty-catch", () => {
					if (node.block.statements.length === 0) {
						const { line, column } = doc.getNodeLineAndColumn(node, sf);
						this.addViolation({
							ruleId: "no-empty-catch",
							severity: "error",
							file: relPath,
							line,
							column,
							message: `Empty catch block detected. Swallowing errors violates the Zero Error Suppression Mandate. Fail loudly or log with reason.`,
							context: node.getText(sf).slice(0, 100)
						});
					}
				});
				this.runSubAuditorSync("strict-catch-narrowing", () => {
					if (node.variableDeclaration && ts.isIdentifier(node.variableDeclaration.name)) {
						const varName = node.variableDeclaration.name.text;
						let hasPropertyAccess = false;
						let hasInstanceofCheck = false;
						const checkCatchBody = (inner) => {
							if (ts.isBinaryExpression(inner) && inner.operatorToken.kind === ts.SyntaxKind.InstanceOfKeyword && inner.left.getText(sf) === varName && inner.right.getText(sf) === "Error") hasInstanceofCheck = true;
							if (ts.isPropertyAccessExpression(inner)) {
								let target = inner.expression;
								if (ts.isAsExpression(target) || ts.isTypeAssertionExpression(target)) target = target.expression;
								if (ts.isIdentifier(target) && target.text === varName) {
									const prop = inner.name.text;
									if (STANDARD_ERROR_PROPERTIES.has(prop)) hasPropertyAccess = true;
								}
							}
							ts.forEachChild(inner, checkCatchBody);
						};
						checkCatchBody(node.block);
						if (hasPropertyAccess && !hasInstanceofCheck) {
							const { line, column } = doc.getNodeLineAndColumn(node, sf);
							this.addViolation({
								ruleId: "strict-catch-narrowing",
								severity: "error",
								file: relPath,
								line,
								column,
								message: `Caught error '${varName}' accessed without strict type narrowing. Verify '${varName} instanceof Error' before reading properties.`,
								context: `catch (${varName})`
							});
						}
					}
				});
			}
			if (ts.isCallExpression(node)) {
				if (isSchemaFile) this.runSubAuditorSync("no-silent-mock-fallbacks", () => {
					const callText = node.expression.getText(sf);
					if (callText === "fallback" || callText.endsWith(".fallback")) {
						const { line, column } = doc.getNodeLineAndColumn(node, sf);
						this.addViolation({
							ruleId: "no-silent-mock-fallbacks",
							severity: "error",
							file: relPath,
							line,
							column,
							message: `Schema fallback detected via fallback(). Runtime schema auto-heal is prohibited; data schemas must fail loud on invalid shapes.`,
							context: node.getText(sf).slice(0, 100)
						});
					}
				});
				this.runSubAuditorSync("no-silent-promise-catch", () => {
					if (ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "catch" && node.arguments.length > 0) {
						const handler = node.arguments[0];
						if (handler && (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler))) {
							let isSilent = false;
							if (ts.isBlock(handler.body)) {
								if (handler.body.statements.length === 0) isSilent = true;
							} else {
								const body = handler.body;
								if (body.kind === ts.SyntaxKind.NullKeyword || body.kind === ts.SyntaxKind.UndefinedKeyword || body.kind === ts.SyntaxKind.FalseKeyword || body.kind === ts.SyntaxKind.TrueKeyword) isSilent = true;
							}
							if (isSilent) {
								const { line, column } = doc.getNodeLineAndColumn(node, sf);
								this.addViolation({
									ruleId: "no-silent-promise-catch",
									severity: "error",
									file: relPath,
									line,
									column,
									message: `Silent promise .catch() handler detected. Swallowing rejections silently is strictly forbidden. Log or handle the rejection explicitly.`,
									context: node.getText(sf).slice(0, 100)
								});
							}
						}
					}
				});
			}
			ts.forEachChild(node, visit);
		};
		visit(sf);
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ErrorSuppressionAuditor());
export { ERROR_SUPPRESSION_RULES, ErrorSuppressionAuditor };

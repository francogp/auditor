import { unwrapExpression } from "../pathLiteralHeuristics.js";
import { isFsSinkCall, isPathBuilderCall } from "../pathHeuristics.js";
import ts from "typescript";
//#region src/analyzers/nativePaths/detectors/envArgvDetector.ts
/**
* src/analyzers/nativePaths/detectors/envArgvDetector.ts
*
* unsanitized-env-argv-path: raw `process.env.*` / `process.argv[n]` passed straight
* into filesystem or `path.join/resolve` sinks without CWE-22 containment validation.
*/
const ENV_ARGV_MESSAGE = "'process.env' or 'process.argv' passed directly to a path/filesystem function without containment validation (CWE-22). Resolve with 'path.resolve()' and validate with 'path.relative()' + '!path.isAbsolute()' (or 'assertSafePathComponent()') before using.";
function isProcessMember(expr, member) {
	const node = unwrapExpression(expr);
	return ts.isPropertyAccessExpression(node) && node.name.text === member && ts.isIdentifier(node.expression) && node.expression.text === "process";
}
function isRawEnvOrArgv(expr) {
	const node = unwrapExpression(expr);
	if (ts.isPropertyAccessExpression(node)) return isProcessMember(node.expression, "env");
	if (ts.isElementAccessExpression(node)) return isProcessMember(node.expression, "env") || isProcessMember(node.expression, "argv");
	if (ts.isBinaryExpression(node)) {
		const kind = node.operatorToken.kind;
		return (kind === ts.SyntaxKind.QuestionQuestionToken || kind === ts.SyntaxKind.BarBarToken) && (isRawEnvOrArgv(node.left) || isRawEnvOrArgv(node.right));
	}
	return false;
}
const envArgvDetector = (node) => {
	if (!ts.isCallExpression(node) || !(isFsSinkCall(node) || isPathBuilderCall(node))) return null;
	return node.arguments.some(isRawEnvOrArgv) ? {
		ruleId: "unsanitized-env-argv-path",
		node,
		message: ENV_ARGV_MESSAGE
	} : null;
};
//#endregion
export { envArgvDetector };

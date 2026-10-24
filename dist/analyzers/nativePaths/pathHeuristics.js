import { POSIX_SEP, WIN_SEP, collectStringFragments, flattenPlusChain, getRegexInfo, getStringValue, getTemplateTexts, hasFileExtensionTail, hasTraversalToken, isDriveLetterRegex, isDriveOrUncLiteral, isInsideRegExpConstruction, isOutermostPlus, isPathFragment, isRegExpConstruction, isSeparatorOnly, isUrlConstruction, startsWithUrlScheme, unwrapExpression } from "./pathLiteralHeuristics.js";
import ts from "typescript";
// src/analyzers/nativePaths/pathHeuristics.ts
/**
* src/analyzers/nativePaths/pathHeuristics.ts
*
* Pure TypeScript AST predicates used by native path detectors.
* Code structure is resolved exclusively through the TypeScript Compiler API;
* only the textual payload of literal nodes (string values, regex sources,
* identifier names) is inspected with plain string operations.
*/
const PARENT_SEGMENT = "..";
const FILE_SCHEME = "file://";
const REGEX_CONSUMER_METHODS = /* @__PURE__ */ new Set([
	"test",
	"exec",
	"match",
	"matchAll",
	"search"
]);
const PATH_WORDS = /* @__PURE__ */ new Set([
	"path",
	"dir",
	"directory",
	"file",
	"filename",
	"filepath",
	"folder",
	"root",
	"base",
	"segment",
	"subdir",
	"sub",
	"dirname",
	"basename",
	"rel",
	"relative",
	"cwd"
]);
const PATH_COLLECTION_WORDS = /* @__PURE__ */ new Set([
	"paths",
	"dirs",
	"directories",
	"files",
	"folders",
	"roots",
	"segments",
	"parts"
]);
const FILENAME_WORDS = /* @__PURE__ */ new Set([
	...PATH_WORDS,
	"name",
	"attachment",
	"upload",
	"asset",
	"image",
	"document"
]);
const URL_WORDS = /* @__PURE__ */ new Set([
	"url",
	"urls",
	"uri",
	"href",
	"origin",
	"host",
	"hostname",
	"endpoint",
	"endpoints",
	"route",
	"routes",
	"api",
	"link",
	"links",
	"query",
	"search",
	"location",
	"http",
	"https",
	"domain"
]);
const PATH_ORIGIN_GLOBALS = /* @__PURE__ */ new Set(["__dirname", "__filename"]);
const OS_PATH_FUNCTIONS = /* @__PURE__ */ new Set(["tmpdir", "homedir"]);
const STRING_PASSTHROUGH_METHODS = /* @__PURE__ */ new Set([
	"trim",
	"trimStart",
	"trimEnd",
	"toLowerCase",
	"toUpperCase",
	"normalize",
	"replace",
	"replaceAll",
	"slice",
	"substring"
]);
const FS_SINK_METHODS = /* @__PURE__ */ new Set([
	"readFileSync",
	"readFile",
	"writeFileSync",
	"writeFile",
	"appendFileSync",
	"appendFile",
	"existsSync",
	"mkdirSync",
	"mkdir",
	"readdirSync",
	"readdir",
	"statSync",
	"stat",
	"lstatSync",
	"lstat",
	"unlinkSync",
	"unlink",
	"rmSync",
	"rm",
	"rmdirSync",
	"rmdir",
	"copyFileSync",
	"copyFile",
	"openSync",
	"open",
	"createReadStream",
	"createWriteStream"
]);
const FS_OBJECTS = /* @__PURE__ */ new Set([
	"fs",
	"fsSync",
	"fsp",
	"fsPromises",
	"promises"
]);
const PATH_BUILDER_FUNCTIONS = /* @__PURE__ */ new Set([
	"join",
	"resolve",
	"normalize"
]);
const NODE_PATH_API = /* @__PURE__ */ new Set([
	"join",
	"resolve",
	"normalize",
	"relative",
	"dirname",
	"basename",
	"extname",
	"parse",
	"format",
	"isAbsolute",
	"toNamespacedPath",
	"matchesGlob"
]);
function isUpperChar(ch) {
	return ch !== void 0 && ch >= "A" && ch <= "Z";
}
function isLowerOrDigitChar(ch) {
	return ch !== void 0 && (ch >= "a" && ch <= "z" || ch >= "0" && ch <= "9");
}
/**
* Splits camelCase, PascalCase, snake_case and SCREAMING_CASE identifiers into lowercase words.
*/
function splitIdentifierWords(name) {
	const words = [];
	let current = "";
	const flush = () => {
		if (current) words.push(current.toLowerCase());
		current = "";
	};
	for (let i = 0; i < name.length; i++) {
		const ch = name[i];
		if (ch === "_" || ch === "$" || ch === "-") {
			flush();
			continue;
		}
		if (isUpperChar(ch) && current.length > 0 && (isLowerOrDigitChar(name[i - 1]) || isUpperChar(name[i - 1]) && isLowerOrDigitChar(name[i + 1]))) flush();
		current += ch;
	}
	flush();
	return words;
}
function hasWordIn(name, words) {
	return splitIdentifierWords(name).some((w) => words.has(w));
}
function isUrlLikeName(name) {
	return name.toLowerCase().endsWith("pathname") || hasWordIn(name, URL_WORDS);
}
function isPathLikeName(name) {
	if (isUrlLikeName(name)) return false;
	return name === "ROOT" || hasWordIn(name, PATH_WORDS);
}
function isFilenameLikeName(name) {
	if (isUrlLikeName(name)) return false;
	return hasWordIn(name, FILENAME_WORDS);
}
/** Plural identifiers holding path segments (`segments`, `pathParts`, `dirs`). */
function isPathCollectionName(name) {
	if (isUrlLikeName(name)) return false;
	return hasWordIn(name, PATH_COLLECTION_WORDS);
}
/**
* Returns the identifier or trailing property name that labels an expression (`a.b.filePath` → `filePath`).
*/
function getExpressionName(expr) {
	const node = unwrapExpression(expr);
	if (ts.isIdentifier(node)) return node.text;
	if (ts.isPropertyAccessExpression(node)) return node.name.text;
}
/**
* Collects every identifier and property name along a receiver chain
* (`location.search.slice(1)` → `slice`, `search`, `location`).
*/
function collectChainNames(expr) {
	const names = [];
	let node = unwrapExpression(expr);
	for (;;) {
		if (ts.isIdentifier(node)) {
			names.push(node.text);
			return names;
		}
		if (ts.isPropertyAccessExpression(node)) {
			names.push(node.name.text);
			node = unwrapExpression(node.expression);
		} else if (ts.isCallExpression(node) || ts.isElementAccessExpression(node)) node = unwrapExpression(node.expression);
		else return names;
	}
}
function asMethodCall(node) {
	if (!ts.isCallExpression(node)) return void 0;
	const callee = node.expression;
	if (!ts.isPropertyAccessExpression(callee)) return void 0;
	return {
		call: node,
		method: callee.name.text,
		receiver: callee.expression
	};
}
function isIdentifierNamed(expr, name) {
	const node = unwrapExpression(expr);
	return ts.isIdentifier(node) && node.text === name;
}
/**
* True for `path.<fn>`, `path.posix.<fn>` and `path.win32.<fn>` callee expressions
* where `<fn>` is a real `node:path` function.
*/
function getNodePathFunction(callee) {
	if (!ts.isPropertyAccessExpression(callee)) return void 0;
	const fn = callee.name.text;
	if (!NODE_PATH_API.has(fn)) return void 0;
	const owner = unwrapExpression(callee.expression);
	if (isIdentifierNamed(owner, "path")) return {
		fn,
		flavor: "native"
	};
	if (ts.isPropertyAccessExpression(owner) && isIdentifierNamed(owner.expression, "path")) {
		const flavor = owner.name.text;
		if (flavor === "posix" || flavor === "win32") return {
			fn,
			flavor
		};
	}
}
/** `path.sep`, `path.posix.sep`, `path.win32.sep`. */
function isSepConstant(expr) {
	const node = unwrapExpression(expr);
	if (!ts.isPropertyAccessExpression(node) || node.name.text !== "sep") return false;
	const owner = unwrapExpression(node.expression);
	if (isIdentifierNamed(owner, "path")) return true;
	return ts.isPropertyAccessExpression(owner) && isIdentifierNamed(owner.expression, "path");
}
function isImportMetaProperty(node, prop) {
	return ts.isPropertyAccessExpression(node) && node.name.text === prop && ts.isMetaProperty(node.expression) && node.expression.keywordToken === ts.SyntaxKind.ImportKeyword;
}
function isImportMetaUrl(expr) {
	return isImportMetaProperty(unwrapExpression(expr), "url");
}
function isCallToFileURLToPath(node) {
	const callee = node.expression;
	if (ts.isIdentifier(callee)) return callee.text === "fileURLToPath";
	if (ts.isPropertyAccessExpression(callee)) return callee.name.text === "fileURLToPath";
	return false;
}
/**
* Expressions that always produce a filesystem path: `__dirname`, `import.meta.dirname`,
* `process.cwd()`, `os.tmpdir()`, any `path.*()` call, `fileURLToPath()` and `path.sep`.
*/
function isPathOrigin(expr) {
	const node = unwrapExpression(expr);
	if (ts.isIdentifier(node)) return PATH_ORIGIN_GLOBALS.has(node.text);
	if (isImportMetaProperty(node, "dirname") || isImportMetaProperty(node, "filename")) return true;
	if (isSepConstant(node)) return true;
	if (!ts.isCallExpression(node)) return false;
	if (isCallToFileURLToPath(node)) return true;
	const callee = node.expression;
	if (getNodePathFunction(callee)) return true;
	if (!ts.isPropertyAccessExpression(callee)) return false;
	const owner = unwrapExpression(callee.expression);
	if (callee.name.text === "cwd" && isIdentifierNamed(owner, "process")) return true;
	return OS_PATH_FUNCTIONS.has(callee.name.text) && isIdentifierNamed(owner, "os");
}
/**
* Like isPathOrigin but also follows string pass-through chains (`path.relative(a, b).replace(...)`).
*/
function isPathOriginChain(expr) {
	let node = unwrapExpression(expr);
	for (;;) {
		if (isPathOrigin(node)) return true;
		const mc = asMethodCall(node);
		if (!mc || !STRING_PASSTHROUGH_METHODS.has(mc.method)) return false;
		node = unwrapExpression(mc.receiver);
	}
}
function isPathish(expr, pathOriginNames) {
	const node = unwrapExpression(expr);
	if (isPathOriginChain(node)) return true;
	if (ts.isIdentifier(node)) return pathOriginNames.has(node.text) || isPathLikeName(node.text);
	if (ts.isPropertyAccessExpression(node)) return isPathLikeName(node.name.text);
	const mc = asMethodCall(node);
	if (mc && STRING_PASSTHROUGH_METHODS.has(mc.method)) return isPathish(mc.receiver, pathOriginNames);
	return false;
}
function isFilenameish(expr, pathOriginNames) {
	if (isPathish(expr, pathOriginNames)) return true;
	const name = getExpressionName(expr);
	return name !== void 0 && isFilenameLikeName(name);
}
function isUrlish(expr) {
	if (isPathOriginChain(expr)) return false;
	return collectChainNames(expr).some((n) => n === "url" || isUrlLikeName(n));
}
function isFsSinkCall(call) {
	const callee = call.expression;
	if (ts.isIdentifier(callee)) return FS_SINK_METHODS.has(callee.text);
	if (!ts.isPropertyAccessExpression(callee) || !FS_SINK_METHODS.has(callee.name.text)) return false;
	const owner = unwrapExpression(callee.expression);
	if (ts.isIdentifier(owner)) return FS_OBJECTS.has(owner.text);
	return ts.isPropertyAccessExpression(owner) && owner.name.text === "promises";
}
/** `path.join/resolve/normalize` (native or posix flavor, never win32). */
function isPathBuilderCall(call) {
	const fn = getNodePathFunction(call.expression);
	return fn !== void 0 && fn.flavor !== "win32" && PATH_BUILDER_FUNCTIONS.has(fn.fn);
}
function isInsideWin32Call(node) {
	for (let cur = node.parent; cur; cur = cur.parent) {
		if (ts.isCallExpression(cur) && getNodePathFunction(cur.expression)?.flavor === "win32") return true;
		if (ts.isStatement(cur)) return false;
	}
	return false;
}
export { FILE_SCHEME, PARENT_SEGMENT, POSIX_SEP, REGEX_CONSUMER_METHODS, WIN_SEP, asMethodCall, collectStringFragments, flattenPlusChain, getExpressionName, getNodePathFunction, getRegexInfo, getStringValue, getTemplateTexts, hasFileExtensionTail, hasTraversalToken, isDriveLetterRegex, isDriveOrUncLiteral, isFilenameish, isFsSinkCall, isImportMetaUrl, isInsideRegExpConstruction, isInsideWin32Call, isOutermostPlus, isPathBuilderCall, isPathCollectionName, isPathFragment, isPathLikeName, isPathOriginChain, isPathish, isRegExpConstruction, isSepConstant, isSeparatorOnly, isUrlConstruction, isUrlLikeName, isUrlish, startsWithUrlScheme, unwrapExpression };

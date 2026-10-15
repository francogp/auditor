import path from "node:path";
import fs from "node:fs";
//#region src/core/gitignoreMatcher.ts
/**
* scripts/lib/gitignoreMatcher.ts
*
* DYNAMIC GITIGNORE MATCHER (Node.js 26+ Native)
* Reads and parses .gitignore rules dynamically to evaluate whether a file or directory
* path is git-ignored, preventing auditors from enforcing the existence of transient,
* scratch, or development artifacts in clean repositories or production.
*/
const REGEX_SPECIAL_CHARS = /* @__PURE__ */ new Set([
	".",
	"+",
	"^",
	"$",
	"(",
	")",
	"[",
	"]",
	"{",
	"}",
	"|",
	"\\"
]);
function parseWildcardToken(pattern, index) {
	if (pattern[index + 1] === "*") {
		if (pattern[index + 2] === "/") return {
			token: "(?:.*/)?",
			advance: 3
		};
		return {
			token: ".*",
			advance: 2
		};
	}
	return {
		token: "[^/]*",
		advance: 1
	};
}
function escapePatternChar(pattern, index) {
	const char = pattern[index];
	if (!char) return {
		token: "",
		advance: 1
	};
	if (char === "*") return parseWildcardToken(pattern, index);
	if (char === "?") return {
		token: "[^/]",
		advance: 1
	};
	if (REGEX_SPECIAL_CHARS.has(char)) return {
		token: `\\${char}`,
		advance: 1
	};
	return {
		token: char,
		advance: 1
	};
}
function convertGlobToRegexString(pattern) {
	let escaped = "";
	let i = 0;
	while (i < pattern.length) {
		const { token, advance } = escapePatternChar(pattern, i);
		escaped += token;
		i += advance;
	}
	return escaped;
}
var GitIgnoreMatcher = class {
	rootDir;
	rules = [];
	ignoredDirPrefixes = [];
	constructor(rootDir = process.cwd(), customGitignorePath) {
		this.rootDir = path.resolve(rootDir);
		const gitignorePath = customGitignorePath ?? path.join(this.rootDir, ".gitignore");
		this.loadRules(gitignorePath);
	}
	loadRules(gitignorePath) {
		if (!fs.existsSync(gitignorePath)) return;
		const lines = fs.readFileSync(gitignorePath, "utf8").split(/\r?\n/);
		for (const rawLine of lines) {
			const trimmed = rawLine.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			let pattern = trimmed;
			const isNegative = pattern.startsWith("!");
			if (isNegative) pattern = pattern.slice(1).trim();
			const isDirectoryOnly = pattern.endsWith("/");
			if (isDirectoryOnly) pattern = pattern.slice(0, -1);
			const isRootRelative = pattern.startsWith("/");
			if (isRootRelative) pattern = pattern.slice(1);
			if (!isNegative && !pattern.includes("*") && !pattern.includes("?") && !pattern.includes("[")) {
				this.ignoredDirPrefixes.push(pattern + "/");
				this.ignoredDirPrefixes.push(pattern);
			}
			const regex = this.patternToRegex(pattern, isRootRelative);
			this.rules.push({
				pattern,
				isNegative,
				isDirectoryOnly,
				isRootRelative,
				regex
			});
		}
	}
	patternToRegex(pattern, isRootRelative) {
		const escaped = convertGlobToRegexString(pattern);
		return new RegExp(`${isRootRelative ? "^" : "(?:^|/)"}${escaped}(?:/.*)?$`);
	}
	/**
	* Evaluates if a given path (relative to rootDir or absolute) matches .gitignore rules.
	*/
	isIgnored(targetPath) {
		let normalized = targetPath.replace(/\\/g, "/");
		if (path.isAbsolute(targetPath)) {
			const rel = path.relative(this.rootDir, targetPath).replace(/\\/g, "/");
			if (rel.startsWith("..")) return false;
			normalized = rel;
		} else normalized = normalized.replace(/^\.\//, "");
		for (const prefix of this.ignoredDirPrefixes) if (normalized === prefix || normalized.startsWith(prefix.endsWith("/") ? prefix : prefix + "/")) return true;
		let ignored = false;
		for (const rule of this.rules) if (rule.regex.test(normalized)) ignored = !rule.isNegative;
		return ignored;
	}
};
/**
* Finds all gitignore requirements that are not currently covered by .gitignore.
*/
function findMissingGitIgnoreRequirements(projectRoot, gitignorePath, requirements) {
	const matcher = new GitIgnoreMatcher(projectRoot, gitignorePath);
	return requirements.filter((req) => {
		const probe = req.samplePath ?? (req.pattern.endsWith("/") ? `${req.pattern}probe.tmp` : req.pattern);
		return !matcher.isIgnored(probe);
	});
}
/**
* Appends missing gitignore entry patterns to the specified .gitignore file.
*/
function appendGitIgnoreEntries(gitignorePath, patterns) {
	let existingContent = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, "utf8") : "";
	if (existingContent.length > 0 && !existingContent.endsWith("\n")) existingContent += "\n";
	const additionLines = [
		"# Auditor tool caches (Added by @francogp/auditor)",
		...patterns,
		""
	];
	const separator = existingContent.length === 0 || existingContent.endsWith("\n\n") ? "" : "\n";
	fs.writeFileSync(gitignorePath, existingContent + separator + additionLines.join("\n"), "utf8");
}
//#endregion
export { GitIgnoreMatcher, appendGitIgnoreEntries, findMissingGitIgnoreRequirements };

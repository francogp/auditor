import { safeReadFileAsync, safeReaddirAsync } from "../core/safeUtils.js";
import { normalizePosixPath } from "../core/reportUtils.js";
import { isTestPath } from "../core/auditTestPredicates.js";
import "../core/auditConfig.js";
import "../core/safePath.js";
import { collectRepositoryFiles } from "../core/auditorBase.js";
import { GitIgnoreMatcher } from "../core/gitignoreMatcher.js";
import path from "node:path";
//#region src/analyzers/doxAnalyzer.ts
/**
* scripts/maintenance/analyzers/doxAnalyzer.ts
*
* Checks AGENTS.md / DOX hierarchy, relative links, and documentation integrity.
*/
const DOX_ANALYZER_DESCRIPTOR = {
	id: "dox",
	name: "DOX / AGENTS.md Integrity",
	category: "DOX / AGENTS.md",
	aliases: [
		"dox",
		"agents",
		"agents.md",
		"documentation",
		"dox-integrity"
	]
};
const CODE_EXTENSIONS = /* @__PURE__ */ new Set([
	".ts",
	".vue",
	".js",
	".scss",
	".css"
]);
async function tryReadAgentsMd(dir) {
	return safeReadFileAsync(path.join(dir, "AGENTS.md"));
}
function normalizeDirPath(dir) {
	const resolved = path.resolve(dir);
	const drive = resolved.charAt(0);
	if (process.platform === "win32" && resolved.length >= 2 && resolved.charAt(1) === ":" && drive) return drive.toLowerCase() + resolved.slice(1);
	return resolved;
}
async function scanDoxHierarchy(rootDir, ignoreDirs, gitIgnoreMatcher) {
	const doxDirs = [];
	const doxFilesMap = /* @__PURE__ */ new Map();
	const dirCodeMap = /* @__PURE__ */ new Set();
	const allFiles = collectRepositoryFiles(rootDir, rootDir, Array.from(ignoreDirs), /* @__PURE__ */ new Set([
		".ts",
		".vue",
		".js",
		".scss",
		".css",
		".md"
	]));
	for (const file of allFiles) {
		if (gitIgnoreMatcher.isIgnored(file)) continue;
		const baseName = path.basename(file);
		const dir = path.dirname(file);
		if (baseName === "AGENTS.md") {
			const content = await tryReadAgentsMd(dir);
			if (content !== null) doxFilesMap.set(normalizeDirPath(dir), content);
		} else {
			const ext = path.extname(file);
			if (CODE_EXTENSIONS.has(ext)) dirCodeMap.add(normalizeDirPath(dir));
		}
	}
	const normRootDir = normalizeDirPath(rootDir);
	for (const dir of dirCodeMap) {
		const relPath = path.relative(normRootDir, dir);
		if (relPath !== "" && relPath !== "src") doxDirs.push(dir);
	}
	return {
		doxDirs,
		doxFilesMap
	};
}
function findNearestAncestorDoxDir(dir, rootDir, doxFilesMap) {
	const normRoot = normalizeDirPath(rootDir);
	let current = normalizeDirPath(path.dirname(dir));
	while (current !== normRoot) {
		if (doxFilesMap.has(current)) return current;
		const next = normalizeDirPath(path.dirname(current));
		if (next === current) break;
		current = next;
	}
	return normRoot;
}
function validateMissingAgentsFiles(rootDir, doxDirs, doxFilesMap) {
	const violations = [];
	const normRootDir = normalizeDirPath(rootDir);
	for (const dir of doxDirs) {
		const agentsPath = path.join(dir, "AGENTS.md");
		if (!doxFilesMap.has(normalizeDirPath(dir))) violations.push({
			file: agentsPath,
			line: 1,
			message: `Missing required documentation file 'AGENTS.md' in directory '${safeRelativePosix(normRootDir, dir)}'.`,
			context: "AGENTS.md",
			severity: "error",
			fixable: false,
			packageName: "DOX",
			ruleId: "dox-missing-agents-md",
			ruleDescription: "Missing AGENTS.md file"
		});
	}
	const rootAgentsPath = path.join(rootDir, "AGENTS.md");
	if (!doxFilesMap.has(normRootDir)) violations.push({
		file: rootAgentsPath,
		line: 1,
		message: `Missing root documentation file 'AGENTS.md'.`,
		context: "AGENTS.md",
		severity: "error",
		fixable: false,
		packageName: "DOX",
		ruleId: "dox-missing-agents-md",
		ruleDescription: "Missing root AGENTS.md"
	});
	return violations;
}
function extractChildDoxSection(content) {
	const afterHeader = content.match(/(?:^|\n)## Child DOX Index[ \t]*(?:\r?\n)([\s\S]*)$/)?.[1];
	if (!afterHeader) return "";
	const nextSectionMatch = afterHeader.match(/\r?\n## /);
	if (nextSectionMatch && nextSectionMatch.index !== void 0) return afterHeader.slice(0, nextSectionMatch.index);
	return afterHeader;
}
function safeRelativePosix(from, to) {
	const normFrom = normalizeDirPath(from);
	const normTo = normalizeDirPath(to);
	return normalizePosixPath(path.relative(normFrom, normTo));
}
function validateChildRegistration(rootDir, doxFilesMap) {
	const violations = [];
	const normRootDir = normalizeDirPath(rootDir);
	for (const [dirPath] of doxFilesMap.entries()) {
		if (dirPath === normRootDir) continue;
		const agentsPath = path.join(dirPath, "AGENTS.md");
		const parentDoxDir = findNearestAncestorDoxDir(dirPath, normRootDir, doxFilesMap);
		if (!parentDoxDir) continue;
		const parentContent = doxFilesMap.get(parentDoxDir);
		if (!parentContent) continue;
		const posixPath = safeRelativePosix(parentDoxDir, agentsPath);
		const cleanPath = posixPath.startsWith("./") ? posixPath.slice(2) : posixPath;
		const dirOnlyPath = path.dirname(posixPath);
		const targetLower = extractChildDoxSection(parentContent).toLowerCase();
		const cleanLower = cleanPath.toLowerCase();
		const dirOnlyLower = dirOnlyPath.toLowerCase();
		if (!(targetLower.includes(cleanLower) || targetLower.includes("./" + cleanLower) || targetLower.includes(encodeURI(cleanLower)) || targetLower.includes("./" + encodeURI(cleanLower)) || targetLower.includes(dirOnlyLower + "/") || targetLower.includes("./" + dirOnlyLower + "/") || targetLower.includes("[" + dirOnlyLower + "/]") || targetLower.includes("[`" + dirOnlyLower + "/`]"))) {
			const parentFile = path.join(parentDoxDir, "AGENTS.md");
			violations.push({
				file: parentFile,
				line: 1,
				message: `File '${safeRelativePosix(normRootDir, agentsPath)}' is not registered in the DOX index of '${safeRelativePosix(normRootDir, parentFile)}'.`,
				context: cleanPath,
				severity: "error",
				fixable: false,
				packageName: "DOX",
				ruleId: "dox-unregistered-child",
				ruleDescription: "Unregistered child AGENTS.md"
			});
		}
	}
	return violations;
}
const ALLOWED_CODE_EXTS = /* @__PURE__ */ new Set([
	".ts",
	".vue",
	".js",
	".cjs",
	".mjs",
	".jsx",
	".tsx",
	".scss",
	".css"
]);
function isIndexableCodeFile(fileName, fullPath, gitIgnoreMatcher) {
	if (fileName === "AGENTS.md") return false;
	if (fileName.endsWith(".d.ts") || fileName.endsWith(".map")) return false;
	const ext = path.extname(fileName).toLowerCase();
	if (!ALLOWED_CODE_EXTS.has(ext)) return false;
	if (isTestPath(fullPath)) return false;
	return !gitIgnoreMatcher.isIgnored(fullPath);
}
async function checkDirUnindexedCodeFiles(dirPath, content, rootDir, gitIgnoreMatcher) {
	const violations = [];
	const entries = await safeReaddirAsync(dirPath);
	if (!entries) return [];
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		const fullPath = path.join(dirPath, entry.name);
		if (!isIndexableCodeFile(entry.name, fullPath, gitIgnoreMatcher)) continue;
		if (!content.includes(entry.name)) {
			const agentsPath = path.join(dirPath, "AGENTS.md");
			violations.push({
				file: agentsPath,
				line: 1,
				message: `Code file '${path.relative(rootDir, fullPath)}' is not indexed in local AGENTS.md ('${path.relative(rootDir, agentsPath)}').`,
				context: entry.name,
				severity: "error",
				fixable: false,
				packageName: "DOX",
				ruleId: "dox-unindexed-file",
				ruleDescription: "Code file not indexed in DOX"
			});
		}
	}
	return violations;
}
async function validateUnindexedCodeFiles(rootDir, doxFilesMap, gitIgnoreMatcher) {
	const violations = [];
	for (const [dirPath, content] of doxFilesMap.entries()) {
		if (dirPath === rootDir) continue;
		violations.push(...await checkDirUnindexedCodeFiles(dirPath, content, rootDir, gitIgnoreMatcher));
	}
	return violations;
}
function createSectionOrderViolation(agentsPath, line, rawHeader, message) {
	return {
		file: agentsPath,
		line,
		message,
		context: rawHeader,
		severity: "error",
		fixable: false,
		packageName: "DOX",
		ruleId: "dox-section-order",
		ruleDescription: "Orden incorrecto de secciones en AGENTS.md"
	};
}
const MANDATORY_DOX_SECTIONS = [
	{
		level: 1,
		title: "Purpose",
		normalized: "purpose",
		raw: "# Purpose"
	},
	{
		level: 2,
		title: "Ownership",
		normalized: "ownership",
		raw: "## Ownership"
	},
	{
		level: 2,
		title: "Local Contracts",
		normalized: "local contracts",
		raw: "## Local Contracts"
	},
	{
		level: 2,
		title: "Work Guidance",
		normalized: "work guidance",
		raw: "## Work Guidance"
	},
	{
		level: 2,
		title: "Verification",
		normalized: "verification",
		raw: "## Verification"
	},
	{
		level: 2,
		title: "Child DOX Index",
		normalized: "child dox index",
		raw: "## Child DOX Index"
	}
];
const PLACEHOLDER_KEYWORDS = /* @__PURE__ */ new Set([
	"todo",
	"tbd",
	"na",
	"n/a",
	"none",
	"ninguno",
	"ninguna",
	"vacio",
	"vacío",
	"empty",
	"pendiente",
	"placeholder",
	"lorem ipsum",
	"coming soon"
]);
const MIN_TODO_STUB_CHARS = 25;
const MIN_MEANINGFUL_SECTION_CHARS = 10;
const DOX_SECTION_RANK = {
	PURPOSE: 10,
	OWNERSHIP: 20,
	LOCAL_CONTRACTS: 30,
	KEY_FILES_EARLY: 35,
	WORK_GUIDANCE: 40,
	VERIFICATION: 50,
	KEY_FILES_LATE: 55,
	CHILD_DOX_INDEX: 60
};
function maskCodeBlocksPreservingLines(content) {
	return content.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g, (match) => {
		return match.replace(/[^\n]/g, " ");
	});
}
function isGarbageOrEmptyContent(rawContent) {
	const stripped = rawContent.replace(/<!--[\s\S]*?-->/g, "").trim();
	if (!stripped) return true;
	const cleanOneLiner = stripped.toLowerCase().replace(/^[-*_\s]+/, "").replace(/[:.?!]+$/, "").trim();
	if (PLACEHOLDER_KEYWORDS.has(cleanOneLiner)) return true;
	if (cleanOneLiner.startsWith("todo") || cleanOneLiner.startsWith("tbd") || cleanOneLiner.startsWith("pendiente")) {
		if (stripped.replace(/[^a-z0-9áéíóúñ]/gi, "").length < MIN_TODO_STUB_CHARS) return true;
	}
	const lines = stripped.split("\n").map((l) => l.trim()).filter(Boolean);
	if (lines.length === 0) return true;
	if (lines.every((line) => {
		const cleaned = line.toLowerCase().replace(/^[-*_\s]+/, "").replace(/[:.?!]+$/, "").trim();
		return PLACEHOLDER_KEYWORDS.has(cleaned) || /^(?:\.{3,}|\?+|-+|_+)$/.test(cleaned);
	})) return true;
	if (stripped.replace(/[^a-z0-9áéíóúñ]/gi, "").length < MIN_MEANINGFUL_SECTION_CHARS) return true;
	return false;
}
function getHeaderRank(normalized, prevRank) {
	if (normalized === "purpose") return DOX_SECTION_RANK.PURPOSE;
	if (normalized === "ownership") return DOX_SECTION_RANK.OWNERSHIP;
	if (normalized === "local contracts") return DOX_SECTION_RANK.LOCAL_CONTRACTS;
	if (normalized === "key files") {
		if (prevRank >= DOX_SECTION_RANK.LOCAL_CONTRACTS && prevRank < DOX_SECTION_RANK.WORK_GUIDANCE) return DOX_SECTION_RANK.KEY_FILES_EARLY;
		if (prevRank >= DOX_SECTION_RANK.VERIFICATION && prevRank < DOX_SECTION_RANK.CHILD_DOX_INDEX) return DOX_SECTION_RANK.KEY_FILES_LATE;
		return DOX_SECTION_RANK.KEY_FILES_EARLY;
	}
	if (normalized === "work guidance") return DOX_SECTION_RANK.WORK_GUIDANCE;
	if (normalized === "verification") return DOX_SECTION_RANK.VERIFICATION;
	if (normalized === "child dox index") return DOX_SECTION_RANK.CHILD_DOX_INDEX;
	return null;
}
function parseDoxHeaders(maskedLines) {
	const headerInfos = [];
	for (let i = 0; i < maskedLines.length; i++) {
		const lineText = maskedLines[i];
		if (lineText === void 0) continue;
		const match = /^(#{1,2})\s+(\S.*)$/.exec(lineText);
		if (match) {
			const level = match[1]?.length ?? 1;
			const rawTitle = (match[2] ?? "").trim();
			headerInfos.push({
				level,
				title: rawTitle,
				normalizedTitle: rawTitle.toLowerCase(),
				line: i + 1,
				rawHeader: `${match[1]} ${rawTitle}`,
				lineIndex: i
			});
		}
	}
	return headerInfos;
}
function checkMandatoryDoxSections(headerInfos, agentsPath, rootDir) {
	const violations = [];
	for (const mandatory of MANDATORY_DOX_SECTIONS) if (!headerInfos.find((h) => h.level === mandatory.level && h.normalizedTitle === mandatory.normalized)) violations.push({
		file: agentsPath,
		line: 1,
		message: `Missing required section '${mandatory.raw}' in '${path.relative(rootDir, agentsPath)}'.`,
		context: mandatory.raw,
		severity: "error",
		fixable: false,
		packageName: "DOX",
		ruleId: "dox-missing-section",
		ruleDescription: "Missing required section in AGENTS.md"
	});
	return violations;
}
function checkDoxSectionOrder(headerInfos, agentsPath, rootDir) {
	const violations = [];
	let lastRank = 0;
	let lastHeader = null;
	const seenSections = /* @__PURE__ */ new Set();
	for (const h of headerInfos) {
		if (seenSections.has(h.normalizedTitle)) {
			violations.push(createSectionOrderViolation(agentsPath, h.line, h.rawHeader, `Duplicate section '${h.rawHeader}' in '${path.relative(rootDir, agentsPath)}' (line ${h.line}).`));
			continue;
		}
		seenSections.add(h.normalizedTitle);
		const rank = getHeaderRank(h.normalizedTitle, lastRank);
		if (rank === null) {
			violations.push(createSectionOrderViolation(agentsPath, h.line, h.rawHeader, `Unrecognized or non-canonical section '${h.rawHeader}' in '${path.relative(rootDir, agentsPath)}' (line ${h.line}). Allowed structure: # Purpose -> ## Ownership -> ## Local Contracts -> [## Key Files] -> ## Work Guidance -> ## Verification -> ## Child DOX Index.`));
			continue;
		}
		if (rank <= lastRank) violations.push(createSectionOrderViolation(agentsPath, h.line, h.rawHeader, `Incorrect section order in '${path.relative(rootDir, agentsPath)}': '${h.rawHeader}' (line ${h.line}) must not appear after '${lastHeader?.rawHeader ?? "start"}' (line ${lastHeader?.line ?? 1}). Canonical order required: # Purpose -> ## Ownership -> ## Local Contracts -> ## Work Guidance -> ## Verification -> ## Child DOX Index.`));
		else {
			lastRank = rank;
			lastHeader = h;
		}
	}
	return violations;
}
function checkDoxSectionContent(headerInfos, originalLines, agentsPath, rootDir) {
	const violations = [];
	for (let idx = 0; idx < headerInfos.length; idx++) {
		const h = headerInfos[idx];
		const nextH = headerInfos[idx + 1];
		const endLineIndex = nextH ? nextH.lineIndex : originalLines.length;
		if (isGarbageOrEmptyContent(originalLines.slice(h.lineIndex + 1, endLineIndex).join("\n"))) violations.push({
			file: agentsPath,
			line: h.line,
			message: `Required section '${h.rawHeader}' in '${path.relative(rootDir, agentsPath)}' (line ${h.line}) is empty or contains placeholder text. It must contain substantial and useful information.`,
			context: h.rawHeader,
			severity: "error",
			fixable: false,
			packageName: "DOX",
			ruleId: "dox-empty-section",
			ruleDescription: "Empty section or placeholder content"
		});
	}
	return violations;
}
function validateDoxSectionStructure(agentsPath, rootDir, content) {
	const maskedLines = maskCodeBlocksPreservingLines(content).split("\n");
	const originalLines = content.split("\n");
	const headerInfos = parseDoxHeaders(maskedLines);
	return [
		...checkMandatoryDoxSections(headerInfos, agentsPath, rootDir),
		...checkDoxSectionOrder(headerInfos, agentsPath, rootDir),
		...checkDoxSectionContent(headerInfos, originalLines, agentsPath, rootDir)
	];
}
async function checkDoxIntegrity(rootDir, ignoreDirs) {
	const gitIgnoreMatcher = new GitIgnoreMatcher(rootDir);
	const { doxDirs, doxFilesMap } = await scanDoxHierarchy(rootDir, ignoreDirs, gitIgnoreMatcher);
	const violations = [
		...validateMissingAgentsFiles(rootDir, doxDirs, doxFilesMap),
		...validateChildRegistration(rootDir, doxFilesMap),
		...await validateUnindexedCodeFiles(rootDir, doxFilesMap, gitIgnoreMatcher)
	];
	for (const [dirPath, content] of doxFilesMap.entries()) {
		const agentsPath = path.join(dirPath, "AGENTS.md");
		violations.push(...validateDoxSectionStructure(agentsPath, rootDir, content));
	}
	return violations;
}
//#endregion
export { DOX_ANALYZER_DESCRIPTOR, checkDoxIntegrity, validateDoxSectionStructure };

import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { normalizePosixPath } from "../../core/reportUtils.js";
import "../../core/auditConfig.js";
import { toPosixRelative } from "../../core/auditCoverage.js";
import "../../core/safePath.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { GitIgnoreMatcher } from "../../core/gitignoreMatcher.js";
import { resolveProjectVersionInfo, scanAndFixMarkdownProjectVersions } from "../../core/markdownVersionValidator.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/documentation/validate_markdown_code_references.ts
/**
* scripts/auditors/documentation/validate_markdown_code_references.ts
*
* MARKDOWN CODE & SCRIPT REFERENCES AUDITOR (Node.js 26+ Native)
*
* Validates that all inline source code paths, npm run commands, skill references,
* and runtime versions referenced across documentation and skills are completely accurate:
*   1. Broken Source Path References (`markdown-broken-source-ref`): Detects
*      mentions of `src/...`, `scripts/...`, `supabase/...`, or `tests/...` that
*      do not resolve to an existent file or directory on disk.
*   2. Unregistered NPM Scripts (`markdown-unregistered-npm-script`): Detects
*      mentions of `npm run <cmd>` where `<cmd>` is not registered in `package.json.scripts`.
*   3. Hardcoded Runtime Versions (`markdown-hardcoded-runtime-version`): Detects
*      hardcoded runtime version assertions (e.g. `Node >= 26.x`, `npm >= 12.x`)
*      instead of referencing `package.json` (`engines`) and `.node-version`.
*   4. Broken Skill References (`markdown-broken-skill-ref`): Detects mentions
*      of `@/<skill-name>` where `<skill-name>` is not a valid skill in `.agents/skills/`.
*   5. Case Mismatches (`markdown-case-mismatch`): Detects file path or filename
*      mentions that differ in casing from disk (Linux ext4 case sensitivity violation).
*
* Usage:
*   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/documentation/validate_markdown_code_references.ts
*   npm run validate:markdown-code-references
*/
enableCompileCache();
const MARKDOWN_CODE_REFERENCE_RULES = [
	"markdown-broken-source-ref",
	"markdown-hardcoded-runtime-version",
	"markdown-broken-skill-ref",
	"markdown-case-mismatch",
	"markdown-outdated-project-version"
];
const DEFAULT_SCAN_DIRECTORIES = [
	".agents/skills",
	"AGENTS.md",
	"README.md",
	"docs",
	"src",
	"tests",
	"scripts"
];
function getPersistenceDirs(config) {
	if (config.persistence?.engine === "none") return [];
	const res = [];
	if (config.paths?.migrationsDir) res.push(config.paths.migrationsDir);
	if (config.persistence?.supabaseDir) res.push(config.persistence.supabaseDir);
	return res;
}
function getRootMarkdownFiles(root) {
	try {
		return fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md")).map((entry) => entry.name);
	} catch {
		return [];
	}
}
function extractTopLevelRoots(dirs) {
	return dirs.map((d) => normalizePosixPath(d).split("/")[0]).filter(Boolean);
}
function resolveConfiguredPathCandidates(paths) {
	if (!paths) return [];
	const declared = [
		...paths.srcRoots ?? [],
		...paths.testRoots ?? [],
		...paths.e2eRoots ?? [],
		...paths.integrationRoots ?? [],
		...paths.scriptsRoots ?? []
	];
	return [...declared, ...extractTopLevelRoots(declared)];
}
function resolveAdditionalDomainCandidates(paths) {
	if (!paths) return [];
	const additional = [
		...paths.codeRoots ?? [],
		...paths.demoRoots ?? [],
		...paths.dataRoots ?? [],
		...paths.cliRoots ?? []
	];
	return [...additional, ...extractTopLevelRoots(additional)];
}
function resolveMarkdownScanDirectories(projectRoot, explicitRoots) {
	if (explicitRoots && explicitRoots.length > 0) return explicitRoots;
	const config = getAuditConfig(projectRoot);
	const effectiveRoot = projectRoot || process.cwd();
	const candidates = [
		".agents/skills",
		"AGENTS.md",
		"README.md",
		"docs",
		...resolveConfiguredPathCandidates(config.paths),
		...resolveAdditionalDomainCandidates(config.paths),
		...getPersistenceDirs(config),
		...getRootMarkdownFiles(effectiveRoot)
	];
	return Array.from(new Set(candidates));
}
const DEFAULT_KNOWN_VALID_ABSTRACT_PATHS = [
	"scripts/tests",
	"scripts/.cache/",
	"scripts/setup/plugins/",
	"scripts/setup/plugins/01_deploy_env.sh",
	"scripts/setup/plugins/01_deploy_env.ps1",
	"scripts/auditors/"
];
function getKnownValidAbstractPaths(projectRoot) {
	const config = getAuditConfig(projectRoot);
	const paths = new Set(DEFAULT_KNOWN_VALID_ABSTRACT_PATHS);
	if (config.paths?.migrationsDir) paths.add(config.paths.migrationsDir);
	if (config.persistence?.supabaseDir) {
		paths.add(path.posix.join(config.persistence.supabaseDir, "migrations"));
		paths.add(path.posix.join(config.persistence.supabaseDir, "studio"));
	}
	if (config.documentation?.knownValidAbstractPaths) for (const p of config.documentation.knownValidAbstractPaths) paths.add(p);
	return paths;
}
const KNOWN_VALID_ABSTRACT_PATHS = new Set(DEFAULT_KNOWN_VALID_ABSTRACT_PATHS);
const KNOWN_PATH_ALIASES = /* @__PURE__ */ new Set([
	"components",
	"logic",
	"stores",
	"types",
	"assets",
	"data",
	"views",
	"router",
	"plugins",
	"layouts",
	"utils",
	"services",
	"styles",
	"lib",
	"tests",
	"api",
	"composables",
	"injection-keys",
	"models",
	"shared"
]);
const STANDARD_FILES_TO_SKIP = /* @__PURE__ */ new Set([
	"package.json",
	"tsconfig.json",
	"vite.config.ts",
	"vitest.config.ts",
	"index.ts",
	"README.md",
	"AGENTS.md",
	"setup-linux.sh",
	"setup-windows.ps1",
	"Dockerfile",
	"docker-compose.yml",
	".gitignore",
	".eslintrc.cjs"
]);
const BUILTIN_SKILLS = /* @__PURE__ */ new Set([
	"a11y-debugging",
	"agy-customizations",
	"antigravity-guide",
	"chrome-devtools",
	"chrome-extensions",
	"debug-optimize-lcp",
	"generative_ui",
	"memory-leak-debugging",
	"migrate-workflows",
	"modern-web-guidance",
	"troubleshooting"
]);
function stripCodeBlocks(markdown) {
	return markdown.replace(/```[\s\S]*?```/g, (match) => {
		return "\n".repeat((match.match(/\n/g) || []).length);
	});
}
const CANDIDATE_EXTENSIONS = [
	".ts",
	".vue",
	".d.ts",
	".json",
	".sql",
	".scss",
	".css",
	".md"
];
function findCaseInsensitiveEntry(entries, seg, isLast) {
	const directMatch = entries.find((e) => e.toLowerCase() === seg.toLowerCase());
	if (directMatch) return directMatch;
	if (!isLast) return void 0;
	for (const ext of CANDIDATE_EXTENSIONS) {
		const extMatch = entries.find((e) => e.toLowerCase() === (seg + ext).toLowerCase());
		if (extMatch) return extMatch;
	}
}
function hasExactMatchWithExtension(entries, seg) {
	return CANDIDATE_EXTENSIONS.some((ext) => entries.includes(seg + ext));
}
function resolveSegmentCasing(entries, seg, isLast) {
	if (entries.includes(seg)) return {
		exists: true,
		exactMatch: true
	};
	const foundEntry = findCaseInsensitiveEntry(entries, seg, isLast);
	if (foundEntry) return {
		exists: true,
		exactMatch: false,
		actualCasing: foundEntry
	};
	if (isLast && hasExactMatchWithExtension(entries, seg)) return {
		exists: true,
		exactMatch: true
	};
	return {
		exists: false,
		exactMatch: false
	};
}
function checkExactCase(startDir, relativePath) {
	const segments = toPosixRelative(startDir, relativePath).split("/").filter(Boolean);
	let current = startDir;
	for (let idx = 0; idx < segments.length; idx++) {
		const seg = segments[idx];
		if (!fs.existsSync(current)) return {
			exists: false,
			exactMatch: false
		};
		const result = resolveSegmentCasing(fs.readdirSync(current), seg, idx === segments.length - 1);
		if (!result.exists || !result.exactMatch) return result;
		current = path.join(current, seg);
	}
	return {
		exists: true,
		exactMatch: true
	};
}
function addSkillsFromDir(targetDir, skillsSet) {
	if (fs.existsSync(targetDir)) try {
		for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) if (entry.isDirectory() && !entry.name.startsWith(".")) skillsSet.add(entry.name);
	} catch {}
}
function discoverRegisteredSkills(rootDir) {
	const allSkills = /* @__PURE__ */ new Set();
	addSkillsFromDir(path.join(rootDir, ".agents/skills"), allSkills);
	addSkillsFromDir(path.join(rootDir, "skills"), allSkills);
	addSkillsFromDir(path.join(rootDir, "node_modules/@francogp/auditor/.agents/skills"), allSkills);
	addSkillsFromDir(path.join(rootDir, "node_modules/@francogp/auditor/skills"), allSkills);
	addSkillsFromDir(path.resolve(import.meta.dirname, "../../../.agents/skills"), allSkills);
	addSkillsFromDir(path.resolve(import.meta.dirname, "../../../skills"), allSkills);
	const config = getAuditConfig(rootDir);
	if (config.documentation?.skillsRoots) for (const r of config.documentation.skillsRoots) addSkillsFromDir(path.resolve(rootDir, r), allSkills);
	return allSkills;
}
const TARGET_NODE_MAJOR_VERSION = "26";
const TARGET_NPM_MAJOR_VERSION = "12";
const HARDCODED_RUNTIME_VERSION_REGEX = new RegExp(`Node(?:\\.js)?\\s+(?:(?:>=|>|v)\\s*)?26\\.\\d+|npm\\s+(?:(?:>=|>|v)\\s*)?12\\.\\d+`, "i");
function checkHardcodedRuntimeVersions(line, lineNum, relPath, auditor) {
	const versionMatch = HARDCODED_RUNTIME_VERSION_REGEX.exec(line);
	if (!versionMatch) return 0;
	auditor.addViolation({
		ruleId: "markdown-hardcoded-runtime-version",
		severity: "error",
		file: relPath,
		line: lineNum,
		message: `Hardcoded runtime version detected: "${versionMatch[0]}". Must reference package.json (engines) and .node-version`,
		context: versionMatch[0]
	});
	return 1;
}
function checkSkillReferences(line, lineNum, relPath, allSkills, auditor) {
	let checked = 0;
	const skillRefRegex = /@\/([\w-]+)/g;
	let skillMatch;
	while ((skillMatch = skillRefRegex.exec(line)) !== null) {
		const candidate = skillMatch[1];
		const fullRef = skillMatch[0];
		if (line[skillMatch.index + fullRef.length] === "/") continue;
		if (KNOWN_PATH_ALIASES.has(candidate)) continue;
		checked++;
		if (!(allSkills.has(candidate) || BUILTIN_SKILLS.has(candidate))) auditor.addViolation({
			ruleId: "markdown-broken-skill-ref",
			severity: "error",
			file: relPath,
			line: lineNum,
			message: `Reference to non-existent skill: "@/${candidate}". Skill does not exist in .agents/skills or built-in skills`,
			context: `@/${candidate}`
		});
	}
	return checked;
}
function isCandidateAbstractPattern(candidate) {
	return candidate.includes("*") || candidate.includes("...") || candidate.includes("<") || candidate.includes("YYYYMMDD") || candidate.includes("case_xxx") || candidate.includes("_xxx") || candidate.includes("my_") || candidate.includes("myData") || candidate.endsWith("_") || candidate.endsWith("/") && candidate.split("/").length <= 2;
}
function validateSingleSourceRef(candidate, lineNum, relPath, filePath, rootDir, gitIgnoreMatcher, knownValidAbstractPaths, auditor) {
	if (isCandidateAbstractPattern(candidate) || knownValidAbstractPaths.has(candidate)) return;
	if (gitIgnoreMatcher.isIgnored(candidate) || gitIgnoreMatcher.isIgnored(path.resolve(rootDir, candidate))) return;
	const caseCheck = checkExactCase(rootDir, candidate);
	if (!caseCheck.exists) {
		const localCaseCheck = checkExactCase(path.dirname(filePath), candidate);
		if (!localCaseCheck.exists) auditor.addViolation({
			ruleId: "markdown-broken-source-ref",
			severity: "error",
			file: relPath,
			line: lineNum,
			message: `Referenced code path does not exist on disk: "${candidate}"`,
			context: candidate
		});
		else if (!localCaseCheck.exactMatch) auditor.addViolation({
			ruleId: "markdown-case-mismatch",
			severity: "error",
			file: relPath,
			line: lineNum,
			message: `Referenced code path has casing mismatch on disk: "${candidate}" -> "${localCaseCheck.actualCasing}" (Linux ext4)`,
			context: candidate
		});
	} else if (!caseCheck.exactMatch) auditor.addViolation({
		ruleId: "markdown-case-mismatch",
		severity: "error",
		file: relPath,
		line: lineNum,
		message: `Referenced code path has casing mismatch on disk: "${candidate}" -> "${caseCheck.actualCasing}" (Linux ext4)`,
		context: candidate
	});
}
function checkSourcePathReferences(line, lineNum, relPath, filePath, rootDir, gitIgnoreMatcher, knownValidAbstractPaths, auditor) {
	let checked = 0;
	const pathRegex = /(?:^|[`'"\s[\]()])(src\/[\w./#-]+|scripts\/[\w./#-]+|tests\/[\w./#-]+|supabase\/[\w./#-]+|scratch\/[\w./#-]+|packages\/[\w./#-]+)(?:$|[`'"\s[\]().,:;])/g;
	let pathMatch;
	while ((pathMatch = pathRegex.exec(line)) !== null) {
		const candidate = pathMatch[1].replace(/[.,:;)\]`'"]+$/, "").split("#")[0];
		if (candidate.startsWith("packages/") && /\b(?:migraci[oó]n|migration|elimina|eliminad[oa]|remove|deleted|legacy|antes:|before:|deprecated|previa|previo|desactualizad[oa])\b/i.test(line)) continue;
		checked++;
		validateSingleSourceRef(candidate, lineNum, relPath, filePath, rootDir, gitIgnoreMatcher, knownValidAbstractPaths, auditor);
	}
	return checked;
}
function checkAgentsMdBulletDeclaration(line, lineNum, relPath, fileDir, rootDir, gitIgnoreMatcher, seenViolations, auditor) {
	const bm = /^\s*-\s*`([\w.-]+\.(?:ts|vue|json|sql|scss|css))`[:\s-]/.exec(line);
	if (!bm) return 0;
	const token = bm[1];
	const tokenPath = path.resolve(fileDir, token);
	if (STANDARD_FILES_TO_SKIP.has(token) || gitIgnoreMatcher.isIgnored(tokenPath)) return 0;
	const localCheck = checkExactCase(fileDir, token);
	const violationKey = `${relPath}:${lineNum}:${token}`;
	if (!localCheck.exists && !seenViolations.has(violationKey)) {
		seenViolations.add(violationKey);
		auditor.addViolation({
			ruleId: "markdown-broken-source-ref",
			severity: "error",
			file: relPath,
			line: lineNum,
			message: `File declared in local contracts list does not exist in "${path.relative(rootDir, fileDir)}": "${token}"`,
			context: token
		});
	} else if (!localCheck.exactMatch && !seenViolations.has(violationKey)) {
		seenViolations.add(violationKey);
		auditor.addViolation({
			ruleId: "markdown-case-mismatch",
			severity: "error",
			file: relPath,
			line: lineNum,
			message: `File "${token}" has casing mismatch on disk: "${localCheck.actualCasing}" (Linux ext4)`,
			context: token
		});
	}
	return 1;
}
function checkAgentsMdInlineTokens(line, lineNum, relPath, fileDir, dirEntries, gitIgnoreMatcher, seenViolations, auditor) {
	let checked = 0;
	const inlineTokenRegex = /`([\w.-]+\.(?:ts|vue|json|sql|scss|css))`(?:[:\s\-)]|$)/g;
	let itm;
	while ((itm = inlineTokenRegex.exec(line)) !== null) {
		const token = itm[1];
		const tokenPath = path.resolve(fileDir, token);
		if (STANDARD_FILES_TO_SKIP.has(token) || gitIgnoreMatcher.isIgnored(tokenPath)) continue;
		const foundCase = dirEntries.find((e) => e.toLowerCase() === token.toLowerCase());
		if (foundCase && foundCase !== token) {
			checked++;
			const violationKey = `${relPath}:${lineNum}:${token}`;
			if (!seenViolations.has(violationKey)) {
				seenViolations.add(violationKey);
				auditor.addViolation({
					ruleId: "markdown-case-mismatch",
					severity: "error",
					file: relPath,
					line: lineNum,
					message: `File "${token}" has casing mismatch on disk: "${foundCase}" (Linux ext4)`,
					context: token
				});
			}
		}
	}
	return checked;
}
var MarkdownCodeReferencesAuditor = class extends BaseAuditor {
	rootDir;
	scanRoots;
	gitIgnoreMatcher;
	constructor(options = {}) {
		const effectiveRoot = options.projectRoot || process.cwd();
		const effectiveScanRoots = resolveMarkdownScanDirectories(effectiveRoot, options.roots);
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(MARKDOWN_CODE_REFERENCE_RULES, {
				speed: "light",
				phase: "normal",
				fix: "normal",
				md: true,
				ast: false,
				changedOnly: false,
				critical: false
			}, ["markdown-outdated-project-version"]),
			fixableRuleIds: ["markdown-outdated-project-version"],
			id: "validate_markdown_code_references",
			name: "Markdown Code References Validator",
			description: "Validates paths, scripts, casing, and skills in markdown",
			family: "documentation",
			ruleIds: MARKDOWN_CODE_REFERENCE_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(MARKDOWN_CODE_REFERENCE_RULES, "polish"),
			packageName: "Doc",
			configKey: "documentation.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "💻",
			ruleDescriptions: {
				"markdown-broken-source-ref": "Non-existent code path",
				"markdown-hardcoded-runtime-version": "Hardcoded Node/npm version",
				"markdown-broken-skill-ref": "Non-existent skill reference",
				"markdown-case-mismatch": "Incorrect path casing",
				"markdown-outdated-project-version": "Outdated project version"
			},
			ruleRemediations: {
				"markdown-broken-source-ref": "📖 REMEDIATION GUIDE: markdown-broken-source-ref\n1. Root Cause: A Markdown file references a file or directory path that does not exist in the repository filesystem.\n2. Diagnosis: Check the path indicated in the message and line of the Markdown file.\n3. Canonical Solution:\n   a) If the file was moved or renamed: update the Markdown path to point to its current location.\n   b) If the file was deleted: remove the obsolete reference from the document or manual.\n   c) If it is an abstract or hypothetical path in an example: delimit it with placeholder syntax (e.g. `<path>`, `...`, `path/to/...`) so the parser does not treat it as a real path.\n4. Example:\n   ❌ Incorrect: `[Config](./src/oldConfig.ts)` (if the file does not exist)\n   ✅ Correct:   `[Config](./src/config/audit.config.ts)`",
				"markdown-hardcoded-runtime-version": "📖 REMEDIATION GUIDE: markdown-hardcoded-runtime-version\n1. Root Cause: A fixed Node.js or runtime version was found hardcoded in plain text in documentation, violating SSoT (Single Source of Truth).\n2. Diagnosis: Locate the line where the fixed version appears (for example, \"Node.js v20.0.0\").\n3. Canonical Solution:\n   a) Instead of hardcoding version numbers, reference `package.json` (`engines.node`) or `.node-version` / `.nvmrc`.\n   b) If necessary to document requirements, write \"Node.js (per package.json engines)\" or synchronize with current canonical version.\n4. Example:\n   ❌ Incorrect: \"Requires Node.js 20.10.0+\"\n   ✅ Correct:   \"Requires Node.js (per `engines.node` in `package.json`)\"",
				"markdown-broken-skill-ref": "📖 REMEDIATION GUIDE: markdown-broken-skill-ref\n1. Root Cause: An agent skill is referenced with `@/skill-name` syntax, but the skill does not exist in `.agents/skills/` or built-in skills.\n2. Diagnosis: Check the skill identifier on the reported line against `.agents/skills/` contents.\n3. Canonical Solution:\n   a) If the skill was renamed: update the name to the current canonical identifier.\n   b) If the skill was removed: delete the reference from documentation.\n   c) If the skill is not installed: add it to `.agents/skills/` adhering to the skills schema.\n4. Example:\n   ❌ Incorrect: `@/non-existent-skill`\n   ✅ Correct:   `@/auditor`",
				"markdown-case-mismatch": "📖 REMEDIATION GUIDE: markdown-case-mismatch\n1. Root Cause: A path in documentation matches a file on disk but differs in casing. While Windows is case-insensitive, Linux/macOS and CI environments will fail.\n2. Diagnosis: Compare the referenced path with the exact filename on the filesystem.\n3. Canonical Solution: Correct the casing of the path in Markdown to match the disk 100%.\n4. Example:\n   ❌ Incorrect: `src/core/Auditorbase.ts`\n   ✅ Correct:   `src/core/auditorBase.ts`",
				"markdown-outdated-project-version": "📖 REMEDIATION GUIDE: markdown-outdated-project-version\n1. Root Cause: A documentation file or release notes references an outdated package version that does not match `package.json.version`.\n2. Diagnosis: Inspect the reported version in the Markdown file and compare with `package.json`.\n3. Canonical Solution:\n   a) Run `npm run auditor:fix` or `auditor fix` if the rule supports auto-fix.\n   b) Or manually update the version number in the document to the current SemVer in `package.json`.\n4. Example:\n   ❌ Outdated:     `v9.1.0` (when package is at 9.2.0)\n   ✅ Synchronized: `v9.2.0`"
			},
			coverage: { include: ["**/*.md"] },
			roots: effectiveScanRoots,
			allowedExtensions: /* @__PURE__ */ new Set([".md"]),
			extraIgnorePatterns: [
				"coverage/**",
				...getAuditConfig(effectiveRoot).paths.ignoreGlobs ?? [],
				...getAuditConfig(effectiveRoot).paths.ignoredPatterns ?? []
			],
			unignoreDirs: [".agents"],
			projectRoot: effectiveRoot
		});
		this.rootDir = effectiveRoot;
		this.scanRoots = effectiveScanRoots;
		this.gitIgnoreMatcher = new GitIgnoreMatcher(this.rootDir);
	}
	scanMarkdownDocReferences(docs, targetRuleId, knownValidAbstractPaths) {
		let count = 0;
		const sink = { addViolation: (v) => {
			if (v.ruleId === targetRuleId) this.addViolation(v);
		} };
		const seenViolations = /* @__PURE__ */ new Set();
		for (const doc of docs) for (let i = 0; i < doc.lines.length; i++) {
			const line = doc.lines[i];
			const lineNum = i + 1;
			if (!doc.isSkillDoc) count += checkSourcePathReferences(line, lineNum, doc.relPath, doc.filePath, this.rootDir, this.gitIgnoreMatcher, knownValidAbstractPaths, sink);
			if (doc.relPath.endsWith("AGENTS.md")) {
				count += checkAgentsMdBulletDeclaration(line, lineNum, doc.relPath, doc.fileDir, this.rootDir, this.gitIgnoreMatcher, seenViolations, sink);
				count += checkAgentsMdInlineTokens(line, lineNum, doc.relPath, doc.fileDir, doc.dirEntries, this.gitIgnoreMatcher, seenViolations, sink);
			}
		}
		return count;
	}
	async runAudit() {
		const knownValidAbstractPaths = getKnownValidAbstractPaths(this.rootDir);
		const allSkills = discoverRegisteredSkills(this.rootDir);
		const mdFiles = this.collectMarkdownFiles();
		if (mdFiles.length === 0) {
			for (const r of MARKDOWN_CODE_REFERENCE_RULES) this.markRuleNotApplicable(r, "No se encontraron archivos markdown");
			return;
		}
		let referencesChecked = 0;
		const docs = [];
		for (const filePath of mdFiles) {
			this.recordScanned(filePath);
			const relPath = toPosixRelative(this.rootDir, filePath);
			const rawContent = fs.readFileSync(filePath, "utf8");
			const rawLines = rawContent.split("\n");
			const lines = stripCodeBlocks(rawContent).split("\n");
			const isSkillDoc = relPath.startsWith(".agents/skills/") || relPath.startsWith("skills/");
			const fileDir = path.dirname(filePath);
			let dirEntries = [];
			if (relPath.endsWith("AGENTS.md")) try {
				dirEntries = fs.readdirSync(fileDir);
			} catch {
				dirEntries = [];
			}
			docs.push({
				filePath,
				relPath,
				rawContent,
				rawLines,
				lines,
				isSkillDoc,
				fileDir,
				dirEntries
			});
		}
		this.runSubAuditorSync("markdown-broken-source-ref", () => {
			referencesChecked += this.scanMarkdownDocReferences(docs, "markdown-broken-source-ref", knownValidAbstractPaths);
		});
		this.runSubAuditorSync("markdown-hardcoded-runtime-version", () => {
			for (const doc of docs) for (let i = 0; i < doc.lines.length; i++) referencesChecked += checkHardcodedRuntimeVersions(doc.lines[i], i + 1, doc.relPath, this);
		});
		this.runSubAuditorSync("markdown-broken-skill-ref", () => {
			for (const doc of docs) for (let i = 0; i < doc.lines.length; i++) referencesChecked += checkSkillReferences(doc.lines[i], i + 1, doc.relPath, allSkills, this);
		});
		this.runSubAuditorSync("markdown-case-mismatch", () => {
			this.scanMarkdownDocReferences(docs, "markdown-case-mismatch", knownValidAbstractPaths);
		});
		this.runSubAuditorSync("markdown-outdated-project-version", () => {
			const versionInfo = resolveProjectVersionInfo(this.rootDir);
			if (!versionInfo) {
				this.markRuleNotApplicable("markdown-outdated-project-version", "package.json sin campo version");
				return;
			}
			for (const doc of docs) {
				const { matches, updatedContent } = scanAndFixMarkdownProjectVersions(doc.relPath, doc.rawLines, versionInfo);
				if (matches.length === 0) continue;
				referencesChecked += matches.length;
				if (this.isFixActive() && updatedContent !== null && updatedContent !== doc.rawContent) {
					fs.writeFileSync(doc.filePath, updatedContent, "utf-8");
					continue;
				}
				for (const m of matches) this.addViolation({
					ruleId: "markdown-outdated-project-version",
					severity: "error",
					file: doc.relPath,
					line: m.lineNum,
					message: `Outdated version reference "${m.found}" in documentation (expected current version: "${m.expected}").`,
					context: m.context,
					fixable: true
				});
			}
		});
		this.context.setMetric("Scanned Markdown Files", mdFiles.length);
		this.context.setMetric("Analyzed Code References", referencesChecked);
	}
	collectMarkdownFiles() {
		return this.context.collectFiles(this.scanRoots, /* @__PURE__ */ new Set([".md"]));
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new MarkdownCodeReferencesAuditor());
//#endregion
export { DEFAULT_KNOWN_VALID_ABSTRACT_PATHS, DEFAULT_SCAN_DIRECTORIES, KNOWN_VALID_ABSTRACT_PATHS, MARKDOWN_CODE_REFERENCE_RULES, MarkdownCodeReferencesAuditor, TARGET_NODE_MAJOR_VERSION, TARGET_NPM_MAJOR_VERSION, checkExactCase, getKnownValidAbstractPaths, resolveMarkdownScanDirectories, stripCodeBlocks };

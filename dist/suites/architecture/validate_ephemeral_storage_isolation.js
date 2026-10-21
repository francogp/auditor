import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases, getEffectiveScannableRoots } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/architecture/validate_ephemeral_storage_isolation.ts
/**
* scripts/auditors/architecture/validate_ephemeral_storage_isolation.ts
*
* EPHEMERAL STORAGE & SCRATCH ISOLATION AUDITOR (Node.js 26+ Native)
*
* Enforces repository architecture, file hygiene, and ephemeral storage isolation:
*   1. Ephemeral Directories in Source Roots (`ephemeral-no-source-temp-dirs`):
*      Forbids temporary or ephemeral folders (`temp/`, `tmp/`, `temp_*`, `ephemeral/`, `scratch/`)
*      inside source code directories (`src/`, `scripts/`, `tests/`, `supabase/`, `data/`, `database/`).
*   2. Prohibit Ignoring Source Code Temp in .gitignore (`ephemeral-no-gitignore-source-temp`):
*      Forbids adding temporary directories or files inside source trees to `.gitignore`
*      (e.g. `src/temp`, `supabase/temp_supabase/`, `database/temp`). All temporary persistence
*      and scratch artifacts MUST reside in `scratch/`.
*   3. Ephemeral Source Directory References in Code (`ephemeral-no-source-temp-references`):
*      Forbids source code, scripts, or tests from targeting or referencing ephemeral paths
*      inside source trees instead of `scratch/`.
*
* Escape Hatches:
*   `// scratch-ok`, `// temp-ok`, `-- scratch-ok`
*
* Usage:
*   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_ephemeral_storage_isolation.ts
*   npm run validate:ephemeral-storage-isolation
*/
enableCompileCache();
const EPHEMERAL_STORAGE_RULES = [
	"ephemeral-no-source-temp-dirs",
	"ephemeral-no-gitignore-source-temp",
	"ephemeral-no-source-temp-references"
];
const CANONICAL_SOURCE_ROOTS = [
	"src",
	"scripts",
	"tests",
	"supabase",
	"data",
	"database"
];
function getEffectiveSourceRoots(projectRoot) {
	const config = getAuditConfig(projectRoot);
	const scannable = getEffectiveScannableRoots(config);
	const additional = [
		...config.paths.dataRoots ?? [],
		config.persistence.supabaseDir ?? "supabase",
		"database"
	];
	return Array.from(/* @__PURE__ */ new Set([...scannable, ...additional]));
}
const FORBIDDEN_DIR_NAMES = /* @__PURE__ */ new Set([
	"temp",
	"tmp",
	".temp",
	".tmp",
	"ephemeral",
	"scratch"
]);
const FORBIDDEN_DIR_PREFIXES = ["temp_", "tmp_"];
function isForbiddenDirName(name) {
	const lower = name.toLowerCase();
	return FORBIDDEN_DIR_NAMES.has(lower) || FORBIDDEN_DIR_PREFIXES.some((prefix) => lower.startsWith(prefix));
}
const DEFAULT_ALLOWED_DATABASE_DIRS = /* @__PURE__ */ new Set([
	"backups",
	"migrations",
	"schemas"
]);
const DEFAULT_ALLOWED_DATABASE_FILES = /* @__PURE__ */ new Set(["AGENTS.md", ".gitkeep"]);
const FORBIDDEN_CODE_REF_REGEX = /(?:['"`]|path\.(?:resolve|join)\([^)]*)\b(?:src|scripts|tests|supabase|data|database)\/(?:temp|tmp|temp_\w+|tmp_\w+)\b/;
const GITIGNORE_FORBIDDEN_REGEX = /(?:^|\/)(?:src|scripts|tests|supabase|data|database)\/(?:\.?temp|\.?tmp)/;
function isSelfReferentialFile(relPath) {
	return relPath.endsWith("validate_ephemeral_storage_isolation.ts") || relPath.endsWith("validate_ephemeral_storage_isolation.test.ts");
}
function scanLinesForEphemeralRefs(lines, relPath, auditor) {
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] || "";
		if (auditor.isLineIgnored(line, ["scratch-ok", "temp-ok"])) continue;
		if (FORBIDDEN_CODE_REF_REGEX.test(line)) auditor.addViolation({
			ruleId: "ephemeral-no-source-temp-references",
			severity: "error",
			file: relPath,
			line: i + 1,
			message: `Forbidden reference to ephemeral path inside source code tree. All temporary databases, test simulation exports, and scratch artifacts must reside strictly inside 'scratch/'.`,
			context: line.trim()
		});
	}
}
var EphemeralStorageIsolationAuditor = class extends BaseAuditor {
	allowedDatabaseDirs;
	allowedDatabaseFiles;
	constructor(optionsOrRoot) {
		const options = typeof optionsOrRoot === "string" ? { projectRoot: optionsOrRoot } : optionsOrRoot ?? {};
		const effectiveRoots = options.roots ?? getEffectiveSourceRoots(options.projectRoot);
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(EPHEMERAL_STORAGE_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			id: "validate_ephemeral_storage_isolation",
			name: "Ephemeral Storage & Scratch Isolation Validator",
			description: "Strict isolation of temporary files in scratch/",
			family: "architecture",
			ruleIds: EPHEMERAL_STORAGE_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(EPHEMERAL_STORAGE_RULES, "behavior"),
			packageName: "Isolation",
			configKey: "persistence.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "📁",
			ruleDescriptions: {
				"ephemeral-no-source-temp-dirs": "Temporary directory in source code",
				"ephemeral-no-gitignore-source-temp": "Temporary entry in .gitignore",
				"ephemeral-no-source-temp-references": "Reference to temporary directory"
			},
			ruleRemediations: {
				"ephemeral-no-source-temp-dirs": "📖 REMEDIATION GUIDE: ephemeral-no-source-temp-dirs\n1. Root Cause: A temporary folder (`temp`, `tmp`, `.temp`, `.tmp`, `scratch`, `ephemeral`) was detected inside source code trees (`src/`, `scripts/`, `tests/`, `database/`). Ephemeral storage must strictly reside inside `scratch/`.\n2. Diagnosis: Locate the reported ephemeral folder inside the source tree.\n3. Canonical Solution:\n   a) Delete the temporary directory from source code.\n   b) Update generating scripts or tests to write to `scratch/<module>/` or use the ephemeral sandbox utility.\n4. Example / Auto-fix command:\n   ❌ Prohibited: `database/tmp/` or `src/services/temp/`\n   ✅ Canonical:  `scratch/test-db/` or `scratch/temp-exports/`",
				"ephemeral-no-gitignore-source-temp": "📖 REMEDIATION GUIDE: ephemeral-no-gitignore-source-temp\n1. Root Cause: The `.gitignore` file ignores temporary directories inside sources (e.g. `src/**/temp/`, `database/tmp/`). This masks source pollution instead of funneling artifacts to `scratch/`.\n2. Diagnosis: Inspect `.gitignore` at the reported line.\n3. Canonical Solution: Remove patterns ignoring source-level temporaries and ensure `.gitignore` contains the global isolation rule `scratch/`.\n4. Example / Auto-fix command:\n   ❌ Incorrect: `src/temp/` or `tests/tmp/` in `.gitignore`\n   ✅ Canonical: `scratch/` in `.gitignore`",
				"ephemeral-no-source-temp-references": "📖 REMEDIATION GUIDE: ephemeral-no-source-temp-references\n1. Root Cause: Source code contains path literals or resolutions (`path.join`, `path.resolve`) targeting temporary directories inside `src/`, `scripts/`, `tests/`, or `database/`.\n2. Diagnosis: Locate the temporary path reference at the reported line.\n3. Canonical Solution:\n   a) Redirect paths to target `path.resolve(projectRoot, 'scratch', ...)`.\n   b) If strictly required in a specific test fixture, annotate with `// scratch-ok: <reason>`.\n4. Example / Auto-fix command:\n   ❌ Prohibited: `const dbPath = path.resolve(__dirname, 'temp', 'test.db');`\n   ✅ Canonical:  `const dbPath = path.resolve(process.cwd(), 'scratch', 'test.db');`"
			},
			coverage: {
				include: [".gitignore", ...effectiveRoots.map((r) => `${r}/**/*.{ts,vue,js,sql,sh}`)],
				exclude: ["src/suites/architecture/validate_ephemeral_storage_isolation.ts", "tests/validate_ephemeral_storage_isolation.test.ts"]
			},
			roots: [...effectiveRoots],
			allowedExtensions: /* @__PURE__ */ new Set([
				".ts",
				".vue",
				".js",
				".sql",
				".sh"
			]),
			projectRoot: options.projectRoot
		});
		const config = getAuditConfig(options.projectRoot);
		const configuredDbDirs = config.persistence?.allowedDatabaseDirs;
		const configuredDbFiles = config.persistence?.allowedDatabaseFiles;
		this.allowedDatabaseDirs = options.allowedDatabaseDirs ?? (configuredDbDirs && configuredDbDirs.length > 0 ? new Set(configuredDbDirs) : DEFAULT_ALLOWED_DATABASE_DIRS);
		this.allowedDatabaseFiles = options.allowedDatabaseFiles ?? (configuredDbFiles && configuredDbFiles.length > 0 ? new Set(configuredDbFiles) : DEFAULT_ALLOWED_DATABASE_FILES);
	}
	runAudit() {
		this.runSubAuditorSync("ephemeral-no-source-temp-dirs", () => {
			this.scanSourceDirectoriesOnDisk();
		});
		this.runSubAuditorSync("ephemeral-no-gitignore-source-temp", () => {
			this.scanGitignoreRules();
		});
		this.runSubAuditorSync("ephemeral-no-source-temp-references", () => {
			this.scanSourceCodeReferences();
		});
	}
	scanSourceDirectoriesOnDisk() {
		for (const root of this.roots) {
			const rootDir = path.resolve(this.projectRoot, root);
			if (!fs.existsSync(rootDir)) continue;
			this.walkAndCheckDirectory(rootDir, root);
		}
	}
	checkDatabaseDirectoryEntry(entry) {
		if (entry.isDirectory()) {
			if (!this.allowedDatabaseDirs.has(entry.name)) this.addViolation({
				ruleId: "ephemeral-no-source-temp-dirs",
				severity: "error",
				file: `database/${entry.name}`,
				line: 1,
				message: `Forbidden directory 'database/${entry.name}' detected. All temporary databases, test exports, and scratch artifacts must reside strictly inside 'scratch/database/'.`,
				context: `database/${entry.name}`
			});
		} else if (entry.isFile() && !entry.name.startsWith(".") && !this.allowedDatabaseFiles.has(entry.name)) this.addViolation({
			ruleId: "ephemeral-no-source-temp-dirs",
			severity: "error",
			file: `database/${entry.name}`,
			line: 1,
			message: `Forbidden file 'database/${entry.name}' detected under database root. Ephemeral files must reside in 'scratch/database/'.`,
			context: `database/${entry.name}`
		});
	}
	checkSubDirectory(entry, currentDir, rootName) {
		if (!entry.isDirectory() || entry.name === "node_modules" || entry.name === ".git") return;
		const subPath = path.join(currentDir, entry.name);
		const relSubPath = path.relative(this.projectRoot, subPath).split(path.sep).join(path.posix.sep);
		if (this.isPathIgnored(relSubPath)) return;
		if (isForbiddenDirName(entry.name)) this.addViolation({
			ruleId: "ephemeral-no-source-temp-dirs",
			severity: "error",
			file: relSubPath,
			line: 1,
			message: `Forbidden ephemeral directory '${relSubPath}' detected in source tree. All temporary artifacts, test dumps, and caches must reside strictly in 'scratch/'.`,
			context: relSubPath
		});
		this.walkAndCheckDirectory(subPath, rootName);
	}
	walkAndCheckDirectory(currentDir, rootName) {
		let entries;
		try {
			entries = fs.readdirSync(currentDir, { withFileTypes: true });
		} catch {
			return;
		}
		const relToRoot = path.relative(this.projectRoot, currentDir).split(path.sep).join(path.posix.sep);
		if (rootName === "database" && relToRoot === "database") for (const entry of entries) this.checkDatabaseDirectoryEntry(entry);
		for (const entry of entries) this.checkSubDirectory(entry, currentDir, rootName);
	}
	scanGitignoreRules() {
		const gitignorePath = path.resolve(this.projectRoot, ".gitignore");
		if (!fs.existsSync(gitignorePath)) return;
		try {
			this.recordScanned(".gitignore");
			const lines = fs.readFileSync(gitignorePath, "utf-8").split("\n");
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i]?.trim() || "";
				if (!line || line.startsWith("#")) continue;
				if (GITIGNORE_FORBIDDEN_REGEX.test(line) && !this.isLineIgnored(line, ["scratch-ok", "temp-ok"])) this.addViolation({
					ruleId: "ephemeral-no-gitignore-source-temp",
					severity: "error",
					file: ".gitignore",
					line: i + 1,
					message: `Ignoring temporary folders inside source directories in .gitignore is forbidden ('${line}'). Ephemeral assets must reside in 'scratch/', not inside source code trees.`,
					context: line
				});
			}
		} catch {}
	}
	scanSourceCodeReferences() {
		const existingRoots = this.roots.filter((r) => fs.existsSync(path.resolve(this.projectRoot, r)));
		const scannableFiles = this.context.collectFiles(existingRoots, /* @__PURE__ */ new Set([
			".ts",
			".vue",
			".js",
			".sql",
			".sh"
		]));
		if (scannableFiles.length === 0) {
			this.markRuleNotApplicable("ephemeral-no-source-temp-references", "No se encontraron archivos de código fuente");
			return;
		}
		for (const filePath of scannableFiles) {
			const relPath = path.relative(this.projectRoot, filePath).split(path.sep).join(path.posix.sep);
			if (isSelfReferentialFile(relPath)) continue;
			this.recordScanned(relPath);
			try {
				const content = fs.readFileSync(filePath, "utf-8");
				if (content.includes("/temp") || content.includes("/tmp")) scanLinesForEphemeralRefs(content.split("\n"), relPath, this);
			} catch {}
		}
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new EphemeralStorageIsolationAuditor());
//#endregion
export { CANONICAL_SOURCE_ROOTS, EPHEMERAL_STORAGE_RULES, EphemeralStorageIsolationAuditor, getEffectiveSourceRoots };

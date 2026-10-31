import { BaseAuditor, createUniformRemediationPhases, createUniformRuleCapabilities } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
// src/suites/architecture/validate_docker_config.ts
/**
* src/suites/architecture/validate_docker_config.ts
*
* DOCKER CONFIGURATION & CONTAINER ISOLATION AUDITOR (Node.js 26+ Native)
*
* Enforces standardized Docker ignore patterns and container security hygiene:
*   1. Conditionally active only when Dockerfile or compose files exist in the project.
*   2. Guarantees .dockerignore exists on disk; auto-scaffolds in --fix mode.
*   3. Enforces mandatory exclusion of sensitive artifacts and dependencies:
*      - node_modules
*      - .git
*      - scratch
*      - .env*
*      - dist
*   4. Preserves custom patterns and comments without destruction.
*/
enableCompileCache();
const DOCKER_CONFIG_RULES = ["dockerignore-missing", "dockerignore-missing-pattern"];
const MANDATORY_DOCKER_IGNORE_PATTERNS = [
	"node_modules",
	".git",
	"scratch",
	".env*"
];
const CANONICAL_DOCKERIGNORE_LINES = [
	"# Ignored files and dependencies for Docker image builds",
	"node_modules",
	".git",
	"dist",
	"scratch",
	".env*",
	"*.log",
	""
];
const CANONICAL_DOCKERIGNORE_CONTENT = CANONICAL_DOCKERIGNORE_LINES.join("\n");
const DOCKER_FILE_CANDIDATES = [
	"Dockerfile",
	"Dockerfile.dev",
	"Dockerfile.prod",
	"docker-compose.yml",
	"docker-compose.yaml",
	"compose.yml",
	"compose.yaml"
];
function isDockerProjectContext(projectRoot) {
	return DOCKER_FILE_CANDIDATES.some((f) => fs.existsSync(path.join(projectRoot, f)));
}
const DOCKER_CONFIG_REQUIREMENT = {
	id: "docker-config",
	file: ".dockerignore",
	candidateFiles: [".dockerignore"],
	description: "Docker exclusions configuration (.dockerignore)",
	ruleId: "dockerignore-missing",
	isApplicable: (_config, projectRoot) => isDockerProjectContext(projectRoot),
	generateDefaultContent: () => CANONICAL_DOCKERIGNORE_CONTENT
};
var ValidateDockerConfigAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		const projectRoot = options.projectRoot ?? process.cwd();
		const configRequirement = {
			...DOCKER_CONFIG_REQUIREMENT,
			...options.configFile ? {
				file: options.configFile,
				candidateFiles: [options.configFile]
			} : {}
		};
		super({
			ruleFixers: {},
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createUniformRuleCapabilities(DOCKER_CONFIG_RULES, {
				speed: "light",
				phase: "setup",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			configFiles: [configRequirement],
			id: "validate_docker_config",
			name: "Docker Configuration Validator",
			description: "Validates .dockerignore baseline in Docker projects",
			icon: "🐳",
			family: "architecture",
			ruleIds: DOCKER_CONFIG_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(DOCKER_CONFIG_RULES, "setup"),
			packageName: "Docker",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			ruleDescriptions: {
				"dockerignore-missing": "Missing .dockerignore file",
				"dockerignore-missing-pattern": "Missing critical pattern in .dockerignore"
			},
			ruleRemediations: {
				"dockerignore-missing": "📖 REMEDIATION GUIDE: dockerignore-missing\n1. Root Cause: The project contains Dockerfile or compose files but lacks a `.dockerignore` file, leading to excessive build context and secret leaks.\n2. Diagnosis: Check project root for `.dockerignore`.\n3. Canonical Solution: Run `npm run auditor:fix` or `auditor fix` to automatically scaffold the canonical `.dockerignore` file.\n4. Example / Auto-fix command:\n   `npm run auditor:fix`",
				"dockerignore-missing-pattern": "📖 REMEDIATION GUIDE: dockerignore-missing-pattern\n1. Root Cause: Critical ignore patterns (`node_modules`, `.git`, `scratch`, `.env*`) are missing from `.dockerignore`.\n2. Diagnosis: Inspect existing `.dockerignore` against mandatory exclusions.\n3. Canonical Solution: Run `npm run auditor:fix` to append missing patterns without modifying existing rules.\n4. Example / Auto-fix command:\n   `npm run auditor:fix`"
			},
			coverage: { include: [".dockerignore"] },
			projectRoot
		});
	}
	async runAudit() {
		if (!isDockerProjectContext(this.projectRoot)) {
			this.markSkipped("No Dockerfile or Docker configuration detected in project");
			return;
		}
		const isFix = this.isFixActive();
		let configFile = null;
		this.runSubAuditorSync("dockerignore-missing", () => {
			configFile = this.resolveConfigFile(DOCKER_CONFIG_REQUIREMENT);
		});
		if (!configFile) {
			const ensured = await this.runSubAuditor("dockerignore-missing", () => this.ensureConfigFile(DOCKER_CONFIG_REQUIREMENT));
			if (!ensured) {
				this.markRuleNotApplicable("dockerignore-missing-pattern", "Missing .dockerignore file");
				return;
			}
			configFile = ensured.resolvedPath;
		}
		const resolvedPath = configFile;
		const relPath = path.relative(this.projectRoot, resolvedPath) || DOCKER_CONFIG_REQUIREMENT.file;
		this.recordScanned(relPath);
		let rawContent;
		try {
			rawContent = fs.readFileSync(resolvedPath, "utf8");
		} catch {
			this.runSubAuditorSync("dockerignore-missing", () => {
				this.addViolation({
					ruleId: "dockerignore-missing",
					severity: "error",
					file: relPath,
					line: 1,
					message: `No se pudo leer ${relPath}.`
				});
			});
			return;
		}
		const lines = rawContent.split(/\r?\n/).map((l) => l.trim());
		const existingPatterns = new Set(lines.filter((l) => l && !l.startsWith("#")));
		let modified = false;
		const toAppend = [];
		this.runSubAuditorSync("dockerignore-missing-pattern", () => {
			for (const pattern of MANDATORY_DOCKER_IGNORE_PATTERNS) if (!(existingPatterns.has(pattern) || pattern.endsWith("*") && [...existingPatterns].some((ep) => ep.startsWith(pattern.slice(0, -1))))) {
				if (isFix) {
					toAppend.push(pattern);
					modified = true;
				} else this.addViolation({
					ruleId: "dockerignore-missing-pattern",
					severity: "error",
					file: relPath,
					line: 1,
					message: `Pattern "${pattern}" is mandatory in .dockerignore for security and isolation.`
				});
			}
		});
		if (isFix && modified && toAppend.length > 0) {
			const addition = "\n" + toAppend.join("\n") + "\n";
			fs.appendFileSync(resolvedPath, addition, "utf8");
		}
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateDockerConfigAuditor());
export { CANONICAL_DOCKERIGNORE_CONTENT, CANONICAL_DOCKERIGNORE_LINES, DOCKER_CONFIG_REQUIREMENT, DOCKER_CONFIG_RULES, DOCKER_FILE_CANDIDATES, MANDATORY_DOCKER_IGNORE_PATTERNS, ValidateDockerConfigAuditor, isDockerProjectContext };

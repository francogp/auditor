import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { GitIgnoreMatcher } from "../../core/gitignoreMatcher.js";
import { evaluateGenericCommandViolation, loadPackageScriptsAndBins } from "../../core/npmCommandUtils.js";
import { extractScriptCommands } from "../../core/scriptCommandExtractors.js";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/architecture/validate_script_commands.ts
/**
* src/suites/architecture/validate_script_commands.ts
*
* SCRIPT & PIPELINE COMMANDS VALIDATOR (Node.js 26+)
*
* Recursively audits executable scripts and infrastructure pipelines (.sh, .ps1, .bat, .cmd,
* Dockerfiles, .github/workflows/, and maintenance scripts) and guarantees that:
* 1. Every invoked `npm run <script>` strictly exists in `package.json.scripts`.
* 2. Every direct `npm <cmd>` is a valid npm lifecycle or builtin command.
* 3. Every `npx <bin>` references a binary installed in node_modules/.bin or declared in package.json.
*
* Enforces loud, immediate failures (severity: 'error', fix: 'none') to prevent runtime
* deployment crashes caused by missing or unmigrated npm scripts.
*/
const SCRIPT_COMMANDS_RULES = [
	"script-cmd-unregistered-npm",
	"script-cmd-invalid-npm-syntax",
	"script-cmd-unregistered-npx"
];
const SHELL_AND_BATCH_EXTENSIONS = /* @__PURE__ */ new Set([
	".sh",
	".bash",
	".zsh",
	".ps1",
	".bat",
	".cmd"
]);
const SCRIPTS_DIR_EXTENSIONS = /* @__PURE__ */ new Set([
	".sh",
	".bash",
	".zsh",
	".ps1",
	".bat",
	".cmd",
	".ts",
	".js",
	".mjs",
	".cjs"
]);
function isCandidateScriptPath(file, rootDir) {
	const relPosix = path.relative(rootDir, file).split(path.sep).join(path.posix.sep);
	const ext = path.extname(file).toLowerCase();
	if (SHELL_AND_BATCH_EXTENSIONS.has(ext)) return !relPosix.startsWith("src/") && !relPosix.startsWith("tests/");
	return relPosix.startsWith("scripts/") || relPosix.includes("/scripts/");
}
function isDockerfile(fileName) {
	const lower = fileName.toLowerCase();
	return lower === "dockerfile" || lower.startsWith("dockerfile.") || lower === "containerfile" || fileName.endsWith(".dockerfile");
}
const CANDIDATE_DOCKER_DIRS = [
	".",
	"deploy",
	"infra"
];
function collectDockerfiles(rootDir) {
	const dockerfiles = [];
	for (const d of CANDIDATE_DOCKER_DIRS) {
		const absDir = path.resolve(rootDir, d);
		if (!fs.existsSync(absDir)) continue;
		try {
			const entries = fs.readdirSync(absDir, { withFileTypes: true });
			for (const entry of entries) if (entry.isFile() && isDockerfile(entry.name)) dockerfiles.push(path.resolve(absDir, entry.name));
		} catch {}
	}
	return dockerfiles;
}
function collectWorkflowFiles(rootDir) {
	const workflowFiles = [];
	const workflowsDir = path.resolve(rootDir, ".github", "workflows");
	if (!fs.existsSync(workflowsDir)) return workflowFiles;
	try {
		const entries = fs.readdirSync(workflowsDir, { withFileTypes: true });
		for (const entry of entries) if (entry.isFile() && (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml"))) workflowFiles.push(path.resolve(workflowsDir, entry.name));
	} catch {}
	return workflowFiles;
}
var ValidateScriptCommandsAuditor = class extends BaseAuditor {
	rootDir;
	gitIgnoreMatcher;
	constructor(options = {}) {
		const root = options.projectRoot || process.cwd();
		super({
			usesThirdPartyTool: false,
			requiredPermissions: [],
			ruleCapabilities: createRuleCapabilities(SCRIPT_COMMANDS_RULES, {
				speed: "light",
				phase: "setup",
				fix: "none",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			id: "validate_script_commands",
			name: "Script & Pipeline Commands Validator",
			description: "Valida comandos npm y npx en scripts y CI/CD",
			family: "architecture",
			packageName: "ScriptCommands",
			configKey: "paths",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			icon: "🐚",
			ruleIds: SCRIPT_COMMANDS_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(SCRIPT_COMMANDS_RULES, "setup"),
			ruleDescriptions: {
				"script-cmd-unregistered-npm": "Script npm run no registrado",
				"script-cmd-invalid-npm-syntax": "Comando npm directo no válido",
				"script-cmd-unregistered-npx": "Binario npx no registrado"
			},
			ruleRemediations: {
				"script-cmd-unregistered-npm": "Causa Raíz:\nUn script ejecutable (.sh, .ps1, Dockerfile o pipeline de CI/CD en .github/workflows/) intenta ejecutar \"npm run <script>\", pero \"<script>\" no está registrado en el bloque \"scripts\" de package.json.\n\nDiagnóstico:\nRevisa el archivo y línea donde se ejecuta el comando. Comprueba si el script fue renombrado (ej. \"build:prod\" migrado a \"build:deploy\") o si se omitió definirlo en package.json.\n\nSolución Canónica:\n1. Si el script fue renombrado, actualiza la invocación en el script ejecutable para apuntar al nombre canónico registrado.\n2. Si el script es válido y requerido, agrégalo a \"scripts\" en package.json.\n3. Si fue un error tipográfico, corrige el nombre en el archivo ejecutable.",
				"script-cmd-invalid-npm-syntax": "Causa Raíz:\nSe invocó directamente \"npm <nombre>\" en un script cuando \"<nombre>\" no es un comando nativo del CLI de npm (como \"test\", \"install\", \"ci\") y se omitió la palabra clave \"run\".\nEn npm, los scripts personalizados definidos por el usuario en package.json requieren obligatoriamente el subcomando \"run\" (ej. \"npm run build\").\n\nDiagnóstico:\nBusca la línea del script que ejecuta \"npm <nombre>\".\n\nSolución Canónica:\nReemplaza \"npm <nombre>\" por \"npm run <nombre>\" (o \"vp run <nombre>\").",
				"script-cmd-unregistered-npx": "Causa Raíz:\nUn script ejecutable o pipeline invoca \"npx <binario>\", pero el binario no está instalado en node_modules/.bin ni declarado como dependencia en package.json.\nPor mandato de arquitectura y seguridad de la cadena de suministro, invocar npx para descargar binarios al vuelo en scripts está estrictamente prohibido sin declarar la dependencia explícita.\n\nDiagnóstico:\nExamina el binario invocado tras \"npx\".\n\nSolución Canónica:\n1. Si invoca herramientas nativas de Vite+ (ej. \"npx vite\"), reemplázala por el comando oficial \"vp dev\" o su script canónico en package.json.\n2. Para otras herramientas, instálalas en devDependencies mediante \"npm install -D <paquete>\" e invócalas mediante su script en package.json.\n3. Si se trata de una utilidad provista globalmente por la imagen o el entorno anfitrión, regístrala en \"config.scriptCommands.allowedNpxBinaries\" en .auditor/audit.config.ts tras aprobación."
			},
			coverage: { include: [
				"**/*.sh",
				"**/*.bash",
				"**/*.zsh",
				"**/*.ps1",
				"**/*.bat",
				"**/*.cmd",
				"**/Dockerfile*",
				"**/*.dockerfile",
				"**/Containerfile",
				".github/workflows/**/*.{yml,yaml}",
				"scripts/**/*.{ts,js}"
			] },
			projectRoot: root
		});
		this.rootDir = root;
		this.gitIgnoreMatcher = new GitIgnoreMatcher(root);
	}
	async runAudit() {
		const config = getAuditConfig(this.rootDir);
		if (config.scriptCommands?.enabled === false) {
			this.markSkipped("Desactivado en config (scriptCommands.enabled = false)");
			return;
		}
		const { scripts, declaredBins, installedBins } = loadPackageScriptsAndBins(this.rootDir);
		const customExemptGlobs = (config.coverage?.exemptGlobs ?? []).map((e) => e.glob);
		const scriptExemptGlobs = config.scriptCommands?.exemptGlobs ?? [];
		const env = {
			scripts,
			declaredBins,
			installedBins,
			allowedNpx: /* @__PURE__ */ new Set([...config.documentation?.allowedNpxBinaries ?? [], ...config.scriptCommands?.allowedNpxBinaries ?? []])
		};
		const candidateFiles = this.collectScriptFiles();
		if (candidateFiles.length === 0) {
			for (const rule of SCRIPT_COMMANDS_RULES) this.markRuleNotApplicable(rule, "No se encontraron scripts ejecutables para auditar");
			return;
		}
		const scannedFiles = this.readScannedFiles(candidateFiles, customExemptGlobs, scriptExemptGlobs);
		this.reportViolations("script-cmd-unregistered-npm", "unregistered-npm", scannedFiles, env);
		this.reportViolations("script-cmd-invalid-npm-syntax", "invalid-npm-syntax", scannedFiles, env);
		this.reportViolations("script-cmd-unregistered-npx", "unregistered-npx", scannedFiles, env);
	}
	readScannedFiles(candidateFiles, customExemptGlobs, scriptExemptGlobs) {
		const scannedFiles = [];
		for (const absFile of candidateFiles) {
			const relPosix = path.relative(this.rootDir, absFile).split(path.sep).join(path.posix.sep);
			if (this.gitIgnoreMatcher.isIgnored(absFile)) continue;
			if (this.isExempt(relPosix, customExemptGlobs, scriptExemptGlobs)) continue;
			this.recordScanned(relPosix);
			let content;
			try {
				content = fs.readFileSync(absFile, "utf8");
			} catch {
				continue;
			}
			const commands = extractScriptCommands(content, relPosix);
			if (commands.length > 0) scannedFiles.push({
				relPosix,
				commands
			});
		}
		return scannedFiles;
	}
	reportViolations(ruleId, targetKind, scannedFiles, env) {
		this.runSubAuditorSync(ruleId, () => {
			for (const file of scannedFiles) for (const cmd of file.commands) {
				const v = evaluateGenericCommandViolation(cmd, env);
				if (!v || v.kind !== targetKind) continue;
				const message = targetKind === "unregistered-npm" ? cmd.type === "npm-run" ? `El script '${file.relPosix}' (línea ${v.line}) ejecuta 'npm run ${cmd.target}', pero el script no está registrado en package.json.scripts.` : `El script '${file.relPosix}' (línea ${v.line}) ejecuta 'npm test', pero no hay un script 'test' registrado en package.json.scripts.` : `El script '${file.relPosix}' (línea ${v.line}): ${v.message}`;
				this.addViolation({
					ruleId,
					severity: "error",
					file: file.relPosix,
					line: v.line,
					message,
					context: v.context
				});
			}
		});
	}
	isExempt(relPosix, customExempt, scriptExempt) {
		const allExempt = [...customExempt, ...scriptExempt];
		for (const glob of allExempt) if (path.posix.matchesGlob(relPosix, glob)) return true;
		return relPosix.includes("fixtures/") || relPosix.startsWith("tests/fixtures/");
	}
	collectScriptFiles() {
		const collected = /* @__PURE__ */ new Set();
		const scannableFiles = this.context.collectFiles(["."], SCRIPTS_DIR_EXTENSIONS);
		for (const file of scannableFiles) if (isCandidateScriptPath(file, this.rootDir)) collected.add(file);
		for (const file of collectDockerfiles(this.rootDir)) collected.add(file);
		for (const file of collectWorkflowFiles(this.rootDir)) collected.add(file);
		return Array.from(collected);
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateScriptCommandsAuditor());
//#endregion
export { SCRIPT_COMMANDS_RULES, ValidateScriptCommandsAuditor as ScriptCommandsAuditor, ValidateScriptCommandsAuditor };

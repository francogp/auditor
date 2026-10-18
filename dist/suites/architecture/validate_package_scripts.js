import { buildRatchetConfig } from "../../core/auditConfigDefaults.js";
import { loadAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { collectAllPackageScriptRequirements } from "../../cli/auditScanner.js";
import { getPackageJson, writePackageJson } from "../../core/packageJson.js";
import { describeBaselineDefect, resolveGitCommit } from "../../cli/auditRatchet.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
//#region src/suites/architecture/validate_package_scripts.ts
/**
* src/suites/architecture/validate_package_scripts.ts
*
* PACKAGE SCRIPTS & BUILD CHAINING INTEGRITY AUDITOR (Node.js 26+)
*
* Validates package.json scripts hygiene, build pipeline chaining (pre-audit + post-audit),
* warning ratchet references and baselines, and canonical script naming.
*
* Usage:
*   node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* src/suites/architecture/validate_package_scripts.ts
*/
enableCompileCache();
const PACKAGE_SCRIPTS_RULES = [
	"package-scripts-missing-file",
	"package-scripts-build-missing-audit",
	"package-scripts-removed-commit-gate",
	"package-scripts-invalid-production-ref",
	"package-scripts-invalid-ratchet-baseline",
	"package-scripts-missing-recommended",
	"package-scripts-obsolete"
];
const REMOVED_COMMIT_GATE_PATTERN = /audit:for-commit|auditor-commit|audit_for_commit/u;
const FIXABLE_COMMIT_GATE_PATTERN = /\b(?:(?:npm|pnpm|bun|yarn)\s+run\s+audit:for-commit|auditor-commit)\b/gu;
const REMOVED_COMMIT_GATE_SCRIPT = "audit:for-commit";
function resolvePackageScriptsTarget(target) {
	if (typeof target === "string") return { projectRoot: target };
	return target ?? {};
}
var ValidatePackageScriptsAuditor = class extends BaseAuditor {
	constructor(targetPathOrOptions) {
		const scriptOpts = resolvePackageScriptsTarget(targetPathOrOptions);
		const resolvedRoot = scriptOpts.projectRoot ?? process.cwd();
		super({
			usesThirdPartyTool: false,
			projectRoot: resolvedRoot,
			ruleCapabilities: createRuleCapabilities(PACKAGE_SCRIPTS_RULES, {
				speed: "light",
				phase: "setup",
				fix: "priority",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}, [
				"package-scripts-removed-commit-gate",
				"package-scripts-build-missing-audit",
				"package-scripts-missing-recommended",
				"package-scripts-obsolete"
			]),
			fixableRuleIds: [
				"package-scripts-removed-commit-gate",
				"package-scripts-build-missing-audit",
				"package-scripts-missing-recommended",
				"package-scripts-obsolete"
			],
			fix: scriptOpts.fix,
			id: "validate_package_scripts",
			name: "Package Scripts & Build Chaining Validator",
			description: "Valida scripts en package.json y encadenamiento del build",
			family: "architecture",
			ruleIds: PACKAGE_SCRIPTS_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(PACKAGE_SCRIPTS_RULES, "setup"),
			packageName: "Scripts",
			icon: "📦",
			configKey: "packageScripts",
			defaultConfig: {
				enabled: true,
				enforceBuildAudit: true,
				recommendedScripts: true
			},
			criticalConfig: {},
			ruleDescriptions: {
				"package-scripts-missing-file": "package.json ausente o inválido",
				"package-scripts-build-missing-audit": "Falta auditor en script build",
				"package-scripts-removed-commit-gate": "Script usa audit:for-commit eliminado",
				"package-scripts-invalid-production-ref": "Ref de producción no resuelve en git",
				"package-scripts-invalid-ratchet-baseline": "Línea base del ratchet inválida",
				"package-scripts-missing-recommended": "Falta script recomendado en package",
				"package-scripts-obsolete": "Script legado u obsoleto en package.json"
			},
			ruleRemediations: {
				"package-scripts-missing-file": "Causa Raíz:\nEl archivo package.json no existe en la raíz del proyecto o contiene un error de sintaxis JSON no recuperable.\n\nDiagnóstico:\nVerifica si el archivo package.json está presente en process.cwd() y valida que sea un JSON bien formado sin comas sobrantes.\n\nSolución Canónica:\n1. Crear o restaurar package.json mediante \"npm init -y\" si se trata de un nuevo paquete.\n2. Corregir cualquier error sintáctico con un formateador JSON.",
				"package-scripts-build-missing-audit": "Causa Raíz:\nEl script \"build\" en package.json no encadena la auditoría estricta previa a la compilación (\"npm run auditor:full\") ni la validación de artefactos generados post-compilación (\"npm run auditor:post-build\").\nSin este encadenamiento, se permite generar artefactos o bundles distribuidos que contienen defectos arquitectónicos o de tipado ocultos.\n\nDiagnóstico:\nRevisa \"scripts.build\" en package.json. Debe contener la secuencia completa: auditor previo -> compilación -> auditor posterior.\n\nSolución Canónica:\n1. Ejecuta \"npm run auditor:fix\" o \"auditor fix\". El auditor reescribirá automáticamente el script \"build\" encadenando los comandos oficiales.\n2. O bien, configúralo manualmente:\n   \"build\": \"npm run auditor:full && vp build && npm run auditor:post-build\"",
				"package-scripts-removed-commit-gate": "Causa Raíz:\nUno de los scripts en package.json invoca el gate legado \"audit:for-commit\".\nEse comando fue deprecado y unificado en el auditor estándar, que aplica automáticamente tolerancia cero (0 errores y 0 warnings tolerados salvo ratchet).\n\nDiagnóstico:\nBusca menciones de \"audit:for-commit\" en los scripts de package.json.\n\nSolución Canónica:\n1. Ejecuta \"npm run auditor:fix\" para migrar el script automáticamente.\n2. Reemplaza la llamada por \"npm run auditor\" o \"auditor\".",
				"package-scripts-invalid-production-ref": "Causa Raíz:\nLa referencia git configurada para el ratchet de advertencias (\"ratchet.productionRef\", por ejemplo \"origin/main\") no resuelve a ningún commit en el repositorio local.\nEsto ocurre con frecuencia en entornos de CI cuando se clona con un checkout shallow (depth: 1) o cuando la rama remota no ha sido descargada.\n\nDiagnóstico:\nEjecuta \"git rev-parse <productionRef>\" en la terminal para comprobar si el commit existe localmente.\n\nSolución Canónica:\n1. En CI/CD (GitHub Actions), configurar \"actions/checkout\" con \"fetch-depth: 0\" para traer el historial completo.\n2. En local, ejecutar \"git fetch origin main\" para descargar las referencias remotas.\n3. Si la rama principal tiene otro nombre, ajústala en .auditor/audit.config.ts en \"ratchet.productionRef\".",
				"package-scripts-invalid-ratchet-baseline": "Causa Raíz:\nEl archivo de línea base de advertencias (\".auditor/audit-baseline.json\") está corrupto, tiene una estructura inválida o hace referencia a reglas inexistentes.\n\nDiagnóstico:\nRevisa el mensaje de error para identificar el defecto específico en el archivo de baseline.\n\nSolución Canónica:\n1. Ejecuta \"auditor --ratchet-baseline\" desde la rama principal limpia para regenerar el archivo canónico.\n2. Si no deseas utilizar el ratchet de advertencias, desactívalo en .auditor/audit.config.ts mediante \"ratchet: { enabled: false }\".",
				"package-scripts-missing-recommended": "Causa Raíz:\nFaltan uno o más scripts canónicos del ecosistema del auditor en el bloque \"scripts\" de package.json (ej. auditor, auditor:fix, auditor:full, auditor:watch, auditor:post-build, auditor:lint, auditor:dupes, auditor:magic, auditor:motion, auditor:o1, auditor:update, build:deploy).\n\nDiagnóstico:\nEl mensaje de advertencia indica qué scripts específicos faltan o están desactualizados respecto al catálogo canónico del auditor.\n\nSolución Canónica:\n1. Ejecuta \"npm run auditor:fix\" o \"auditor fix\". El auditor inyectará y sincronizará automáticamente todos los scripts mandatorios en package.json.\n2. Consulta la lista oficial de scripts en la documentación del framework.",
				"package-scripts-obsolete": "Causa Raíz:\nSe detectaron scripts obsoletos o legados en package.json o en workflows de CI/CD (.github/workflows):\n- Invocación directa de \"vitest\" o \"vite\" en proyectos donde Vite+ (\"vp\") es el estándar mandatorio.\n- Nombres legados como \"audit\", \"auditor:build\", \"auditor:precommit\", \"build:prod\".\n\nDiagnóstico:\nExamina los scripts marcados en el reporte de la auditoría.\n\nSolución Canónica:\n1. Ejecuta \"npm run auditor:fix\" o \"auditor fix\". El auditor migrará automáticamente los comandos a \"vp test\", \"vp build\", \"vp dev\", \"auditor:post-build\", \"auditor:full\" y \"build:deploy\".\n2. En workflows de GitHub Actions, actualiza las llamadas a \"npm run build:deploy\"."
			},
			coverage: { include: [
				"package.json",
				".auditor/audit-baseline.json",
				".github/workflows/**"
			] }
		});
	}
	async runAudit() {
		const config = await loadAuditConfig(this.projectRoot);
		if (config.packageScripts?.enabled === false) {
			this.markSkipped("Desactivado en config (packageScripts.enabled = false)");
			return;
		}
		let pkg = null;
		this.runSubAuditorSync("package-scripts-missing-file", () => {
			const pkgPath = path.resolve(this.projectRoot, "package.json");
			if (fs.existsSync(pkgPath)) this.recordScanned("package.json");
			pkg = this.loadPackageJson(pkgPath);
		});
		if (!pkg) {
			for (const r of PACKAGE_SCRIPTS_RULES) if (r !== "package-scripts-missing-file") this.runSubAuditorSync(r, () => {
				this.markRuleNotApplicable(r, "package.json no disponible o inválido");
			});
			return;
		}
		let modified = false;
		this.runSubAuditorSync("package-scripts-removed-commit-gate", () => {
			if (pkg.scripts && this.verifyRemovedCommitGate(pkg.scripts)) modified = true;
		});
		this.runSubAuditorSync("package-scripts-obsolete", () => {
			if (pkg.scripts) {
				if (this.verifyLintScript(pkg.scripts)) modified = true;
				if (this.verifyVitePlusScripts(pkg.scripts, pkg)) modified = true;
				if (this.pruneObsoleteAuditorScripts(pkg.scripts)) modified = true;
			}
			this.verifyCiWorkflows();
		});
		this.runSubAuditorSync("package-scripts-build-missing-audit", () => {
			if (this.verifyBuildScript(pkg, config)) modified = true;
		});
		await this.runSubAuditor("package-scripts-missing-recommended", async () => {
			if (await this.verifyRecommendedScripts(pkg, config)) modified = true;
		});
		if (modified) writePackageJson(this.projectRoot, pkg);
		this.runSubAuditorSync("package-scripts-invalid-production-ref", () => {
			this.verifyProductionRef(config);
		});
		this.runSubAuditorSync("package-scripts-invalid-ratchet-baseline", () => {
			this.verifyRatchetBaseline(config);
		});
	}
	loadPackageJson(pkgPath) {
		if (!fs.existsSync(pkgPath)) {
			this.addViolation({
				ruleId: "package-scripts-missing-file",
				severity: "error",
				filePath: "package.json",
				line: 1,
				message: "Configuration error: package.json does not exist in project root.",
				context: "package.json"
			});
			return null;
		}
		const parsed = getPackageJson(this.projectRoot, true);
		if (!parsed) {
			this.addViolation({
				ruleId: "package-scripts-missing-file",
				severity: "error",
				filePath: "package.json",
				line: 1,
				message: "Configuration error: package.json could not be parsed as valid JSON.",
				context: "package.json"
			});
			return null;
		}
		return parsed;
	}
	checkBuildScriptChainsPreAudit(buildScript) {
		if (REMOVED_COMMIT_GATE_PATTERN.test(buildScript)) return true;
		if (/\bauditor:precommit\b|\bpreset=precommit\b/.test(buildScript)) return false;
		return /\bauditor(?:\.js|\.ts)?(?::full|\s+(?:speed=full|--speed=full|full)|\s|$|[&;])/.test(buildScript) || /\b(?:npm|pnpm|bun|vp)\s+run\s+auditor(?::full|\s|$|[&;])/.test(buildScript);
	}
	checkBuildScriptChainsPostAudit(buildScript) {
		if (/\bauditor:build\b|\bpreset=build\b/.test(buildScript)) return false;
		return /\b(?:npm|pnpm|bun|vp)\s+run\s+auditor:post-build(?:\s|$|[&;])/.test(buildScript) || /\bauditor-post-build(?:\.js|\.ts)?(?:\s|$|[&;])/.test(buildScript) || /\bauditor\s+(?:phase=post-build|--phase=post-build|post-build)(?:\s|$|[&;])/.test(buildScript);
	}
	verifyBuildScript(pkg, config) {
		if (config.packageScripts?.enforceBuildAudit === false) return false;
		const buildScript = pkg.scripts?.build;
		if (!buildScript) {
			if (this.isFixActive()) {
				pkg.scripts = pkg.scripts ?? {};
				pkg.scripts.build = "npm run auditor:full && npm run auditor:post-build";
				return true;
			}
			this.addViolation({
				ruleId: "package-scripts-build-missing-audit",
				severity: "error",
				filePath: "package.json",
				line: 1,
				message: "Build script in package.json is missing or does not chain auditor before and after compilation. Expected \"npm run auditor:full && ... && npm run auditor:post-build\".",
				context: "package.json:scripts.build"
			});
			return false;
		}
		if (this.isFixActive()) {
			let rewritten = buildScript;
			if (/\b(?:npm|pnpm|bun|vp)\s+run\s+(?:audit:build|auditor:build)\b/.test(rewritten)) rewritten = rewritten.replaceAll(/\b((?:npm|pnpm|bun|vp)\s+run\s+)(?:audit:build|auditor:build)\b/g, "$1auditor:post-build");
			if (/\bauditor\s+preset=build\b/.test(rewritten)) rewritten = rewritten.replaceAll(/\bauditor\s+preset=build\b/g, "auditor phase=post-build");
			if (/\b(?:npm|pnpm|bun|vp)\s+run\s+(?:audit:precommit|auditor:precommit|audit)\b/.test(rewritten)) rewritten = rewritten.replaceAll(/\b((?:npm|pnpm|bun|vp)\s+run\s+)(?:audit:precommit|auditor:precommit|audit)\b/g, "$1auditor:full");
			if (/\bauditor\s+preset=precommit\b/.test(rewritten)) rewritten = rewritten.replaceAll(/\bauditor\s+preset=precommit\b/g, "auditor speed=full");
			if (!this.checkBuildScriptChainsPreAudit(rewritten)) rewritten = `npm run auditor:full && ${rewritten}`;
			if (!this.checkBuildScriptChainsPostAudit(rewritten)) rewritten = `${rewritten} && npm run auditor:post-build`;
			if (rewritten !== buildScript) {
				pkg.scripts.build = rewritten;
				return true;
			}
		}
		const hasPre = this.checkBuildScriptChainsPreAudit(buildScript);
		const hasPost = this.checkBuildScriptChainsPostAudit(buildScript);
		if (!hasPre || !hasPost) {
			const missingPart = !hasPre && !hasPost ? "does not chain auditor:full before compilation nor auditor:post-build after compilation" : !hasPre ? "does not chain auditor:full before compilation" : "does not chain auditor:post-build after compilation";
			this.addViolation({
				ruleId: "package-scripts-build-missing-audit",
				severity: "error",
				filePath: "package.json",
				line: 1,
				message: `Build script in package.json ${missingPart}. Expected "npm run auditor:full && ... && npm run auditor:post-build".`,
				context: buildScript
			});
			return false;
		}
		return false;
	}
	verifyLintScript(scripts) {
		let modified = false;
		if (scripts.lint && /\b(?:npm|pnpm|bun)\s+run\s+audit:lint\b/.test(scripts.lint)) {
			if (this.isFixActive()) {
				scripts.lint = scripts.lint.replaceAll(/\b((?:npm|pnpm|bun)\s+run\s+)audit:lint\b/g, "$1auditor:lint");
				modified = true;
			}
		}
		return modified;
	}
	verifyVitePlusScripts(scripts, pkg) {
		if (!(fs.existsSync(path.resolve(this.projectRoot, "vite.config.ts")) || Boolean(pkg.dependencies?.["vite-plus"] || pkg.devDependencies?.["vite-plus"]))) return false;
		let modified = false;
		for (const [name, command] of Object.entries(scripts)) {
			let migrated = command;
			if (/\bvitest\s+run\b/.test(migrated)) migrated = migrated.replaceAll(/\bvitest\s+run\b/g, "vp test");
			else if (/\bvitest\b/.test(migrated) && !/\bvp\s+test\b/.test(migrated)) migrated = migrated.replaceAll(/\bvitest\b/g, "vp test");
			if (/\bvite\s+build\b/.test(migrated)) migrated = migrated.replaceAll(/\bvite\s+build\b/g, "vp build");
			if (/\bvite\s+preview\b/.test(migrated)) migrated = migrated.replaceAll(/\bvite\s+preview\b/g, "vp preview");
			if (/\bvite\s+dev\b/.test(migrated)) migrated = migrated.replaceAll(/\bvite\s+dev\b/g, "vp dev");
			else if (/\bvite\b/.test(migrated) && !/\b(?:vp|vite-plus|@vitejs)\b/.test(migrated)) migrated = migrated.replaceAll(/\bvite\b/g, "vp dev");
			if (migrated !== command) {
				if (this.isFixActive()) {
					scripts[name] = migrated;
					modified = true;
				} else this.addViolation({
					ruleId: "package-scripts-obsolete",
					severity: "warning",
					filePath: "package.json",
					line: 1,
					message: `Script "${name}" en package.json utiliza binarios legados de Vite/Vitest ("${command}"). En proyectos gobernados por Vite+, debe utilizar el binario unificado "vp" (ej. "${migrated}"). Ejecuta "auditor fix" para migrarlo automáticamente.`,
					context: `${name}: "${command}" -> "${migrated}"`
				});
			}
		}
		return modified;
	}
	isObsoleteAuditorScript(name, command) {
		if (name === "audit" || name === "init-agent" || name === "sync:env" || name === "env:setup" || name === "env:check" || name === "audit:family:documentation" || name === "auditor:sync-env" || name === "auditor:precommit" || name === "auditor:build" || name === "build:prod") return true;
		if (name.startsWith("audit:")) return true;
		if (name.startsWith("validate:") && (command.includes("auditor") || command.includes("scripts/auditors") || command.includes("src/suites"))) return true;
		return false;
	}
	pruneObsoleteAuditorScripts(scripts) {
		let modified = false;
		for (const [name, command] of Object.entries(scripts)) if (this.isObsoleteAuditorScript(name, command)) {
			if (this.isFixActive()) {
				delete scripts[name];
				modified = true;
			} else this.addViolation({
				ruleId: "package-scripts-obsolete",
				severity: "warning",
				filePath: "package.json",
				line: 1,
				message: `Script obsoleto o legado del auditor detectado en package.json: "${name}". Ejecuta "auditor fix" para sanear automáticamente.`,
				context: `${name}: ${command}`
			});
		}
		return modified;
	}
	verifyCiWorkflows() {
		const workflowsDir = path.resolve(this.projectRoot, ".github", "workflows");
		if (!fs.existsSync(workflowsDir)) return;
		let entries;
		try {
			entries = fs.readdirSync(workflowsDir, { withFileTypes: true });
		} catch {
			return;
		}
		const LEGACY_WORKFLOW_TOKEN = /\b(?:build:prod|auditor-build-prod|auditor:build|auditor:precommit)\b/;
		for (const entry of entries) {
			if (!entry.isFile() || !entry.name.endsWith(".yml") && !entry.name.endsWith(".yaml")) continue;
			const fullPath = path.join(workflowsDir, entry.name);
			const relPath = path.posix.join(".github/workflows", entry.name);
			this.recordScanned(relPath);
			const content = fs.readFileSync(fullPath, "utf8");
			if (!LEGACY_WORKFLOW_TOKEN.test(content)) continue;
			if (this.isFixActive()) {
				const updated = content.replaceAll(/\bbuild:prod\b/g, "build:deploy").replaceAll(/\bauditor-build-prod\b/g, "auditor-build-deploy").replaceAll(/\bauditor:build\b/g, "auditor:post-build").replaceAll(/\bauditor:precommit\b/g, "auditor:full");
				if (updated !== content) fs.writeFileSync(fullPath, updated, "utf8");
			} else this.addViolation({
				ruleId: "package-scripts-obsolete",
				severity: "warning",
				filePath: relPath,
				line: 1,
				message: `Workflow CI/CD "${relPath}" utiliza comandos obsoletos (build:prod, auditor:build o auditor:precommit). Ejecuta "auditor fix" para migrarlos a build:deploy, auditor:post-build y auditor:full.`,
				context: relPath
			});
		}
	}
	resolveTargetScriptCommand(command, isSelfPackage) {
		if (!isSelfPackage) return command;
		const SELF_RUNNER = "node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* --allow-child-process --allow-addons src/cli/audit_full.ts";
		if (command === "auditor") return SELF_RUNNER;
		if (command.startsWith("auditor ")) return `${SELF_RUNNER} ${command.slice(8)}`;
		if (command === "auditor-build-deploy") return "node --experimental-strip-types src/cli/build_deploy.ts";
		return command;
	}
	isScriptCommandOutdated(existingCmd) {
		return /\b(?:preset=lint|preset=precommit|preset=build|auditor-build-prod|build_prod\.ts|audit_build\.ts)\b/.test(existingCmd);
	}
	async getMissingOrOutdatedRecommendedScripts(scripts, config, isSelfPackage) {
		const allRequirements = await collectAllPackageScriptRequirements(this.projectRoot, config);
		const seenNames = /* @__PURE__ */ new Set();
		const missingOrOutdated = [];
		for (const req of allRequirements) {
			if (seenNames.has(req.name)) continue;
			seenNames.add(req.name);
			if (typeof req.isApplicable === "function" && !req.isApplicable(config, this.projectRoot)) continue;
			const existing = scripts[req.name];
			if (!existing || this.isScriptCommandOutdated(existing)) missingOrOutdated.push([req.name, this.resolveTargetScriptCommand(req.command, isSelfPackage)]);
		}
		return missingOrOutdated;
	}
	async verifyRecommendedScripts(pkg, config) {
		if (config.packageScripts?.recommendedScripts === false) return false;
		const isSelfPackage = pkg.name === "@francogp/auditor";
		const scripts = pkg.scripts ?? {};
		const missingOrOutdated = await this.getMissingOrOutdatedRecommendedScripts(scripts, config, isSelfPackage);
		if (missingOrOutdated.length === 0) return false;
		if (this.isFixActive()) {
			pkg.scripts = pkg.scripts ?? {};
			for (const [scriptName, scriptCmd] of missingOrOutdated) pkg.scripts[scriptName] = scriptCmd;
			return true;
		}
		for (const [scriptName, scriptCmd] of missingOrOutdated) this.addViolation({
			ruleId: "package-scripts-missing-recommended",
			severity: "warning",
			filePath: "package.json",
			line: 1,
			message: `Missing or outdated recommended auditor script "${scriptName}" in package.json (expected "${scriptName}": "${scriptCmd}"). Run "auditor fix" to update automatically.`,
			context: scriptName
		});
		return false;
	}
	verifyRemovedCommitGate(scripts) {
		let modified = false;
		for (const [name, command] of Object.entries(scripts)) {
			if (!REMOVED_COMMIT_GATE_PATTERN.test(name) && !REMOVED_COMMIT_GATE_PATTERN.test(command)) continue;
			if (this.isFixActive() && name === REMOVED_COMMIT_GATE_SCRIPT) {
				delete scripts[name];
				modified = true;
				continue;
			}
			const rewritten = command.replaceAll(FIXABLE_COMMIT_GATE_PATTERN, "auditor");
			if (this.isFixActive() && !REMOVED_COMMIT_GATE_PATTERN.test(rewritten)) {
				scripts[name] = rewritten;
				modified = true;
				continue;
			}
			this.addViolation({
				ruleId: "package-scripts-removed-commit-gate",
				severity: "error",
				filePath: "package.json",
				line: 1,
				message: `Script "${name}" references the removed audit:for-commit gate. Use "auditor" (npm run auditor), which now enforces 0 errors and 0 new warnings via the warning ratchet.`,
				context: `${name}: ${command}`
			});
		}
		return modified;
	}
	verifyProductionRef(config) {
		const ratchet = buildRatchetConfig(config.ratchet);
		if (!ratchet.enabled || resolveGitCommit(this.projectRoot, ratchet.productionRef)) return;
		this.addViolation({
			ruleId: "package-scripts-invalid-production-ref",
			severity: "error",
			filePath: "package.json",
			line: 1,
			message: `Warning ratchet production ref '${ratchet.productionRef}' does not resolve to a git commit. Run 'git fetch' (CI: checkout with full history) or set 'ratchet.productionRef' in audit.config.ts.`,
			context: `ratchet.productionRef=${ratchet.productionRef}`
		});
	}
	verifyRatchetBaseline(config) {
		const ratchet = buildRatchetConfig(config.ratchet);
		if (!ratchet.enabled || !fs.existsSync(path.resolve(this.projectRoot, ratchet.baselineFile))) return;
		this.recordScanned(ratchet.baselineFile);
		const defect = describeBaselineDefect(this.projectRoot, ratchet.baselineFile);
		if (defect === null) return;
		this.addViolation({
			ruleId: "package-scripts-invalid-ratchet-baseline",
			severity: "error",
			filePath: ratchet.baselineFile,
			line: 1,
			message: defect,
			context: ratchet.baselineFile
		});
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidatePackageScriptsAuditor());
//#endregion
export { PACKAGE_SCRIPTS_RULES, ValidatePackageScriptsAuditor as PackageScriptsAuditor, ValidatePackageScriptsAuditor };

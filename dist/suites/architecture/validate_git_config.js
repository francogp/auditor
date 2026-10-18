import { isProductionEnvironment } from "../../core/auditorEnvironment.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
//#region src/suites/architecture/validate_git_config.ts
/**
* src/suites/architecture/validate_git_config.ts
*
* SSoT GIT CONFIGURATION & HYGIENE AUDITOR (Node.js 26+ Native)
*
* Verifies that the local Git repository (.git/config) enforces standard repository
* settings: core.filemode = false, core.autocrlf = input, and core.eol = lf.
* In --fix mode, automatically configures these settings locally via git config.
*/
enableCompileCache();
const GIT_CONFIG_RULES = [
	"git-config-filemode",
	"git-config-autocrlf",
	"git-config-eol"
];
const REQUIRED_GIT_CONFIGS = [
	{
		key: "core.filemode",
		expected: "false",
		ruleId: "git-config-filemode"
	},
	{
		key: "core.autocrlf",
		expected: "input",
		ruleId: "git-config-autocrlf"
	},
	{
		key: "core.eol",
		expected: "lf",
		ruleId: "git-config-eol"
	}
];
function getLocalGitConfig(key, projectRoot) {
	try {
		const res = spawnSync("git", [
			"config",
			"--local",
			"--get",
			key
		], {
			cwd: projectRoot,
			encoding: "utf8",
			stdio: [
				"ignore",
				"pipe",
				"ignore"
			]
		});
		if (res.status === 0 && res.stdout) return res.stdout.trim();
		return null;
	} catch {
		return null;
	}
}
function setLocalGitConfig(key, value, projectRoot) {
	try {
		return spawnSync("git", [
			"config",
			"--local",
			key,
			value
		], {
			cwd: projectRoot,
			encoding: "utf8",
			stdio: [
				"ignore",
				"ignore",
				"ignore"
			]
		}).status === 0;
	} catch {
		return false;
	}
}
var ValidateGitConfigAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		super({
			usesThirdPartyTool: false,
			ruleCapabilities: createRuleCapabilities(GIT_CONFIG_RULES, {
				speed: "light",
				phase: "setup",
				fix: "priority",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}, [...GIT_CONFIG_RULES]),
			fixableRuleIds: [...GIT_CONFIG_RULES],
			id: "validate_git_config",
			name: "Git Configuration Validator",
			description: "Valida y sincroniza configuración local de Git",
			family: "architecture",
			ruleIds: GIT_CONFIG_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(GIT_CONFIG_RULES, "setup"),
			packageName: "Git",
			configKey: "paths",
			defaultConfig: {},
			criticalConfig: {},
			icon: "🌿",
			ruleDescriptions: {
				"git-config-filemode": "core.filemode debe ser false en repo",
				"git-config-autocrlf": "core.autocrlf debe ser input en repo",
				"git-config-eol": "core.eol debe ser lf en repo"
			},
			ruleRemediations: {
				"git-config-filemode": "1. Causa Raíz: La propiedad local `core.filemode` no está configurada como `false` en Git, lo que en entornos Windows provoca que Git detecte falsas diferencias de permisos de ejecución (+x) en archivos fuente.\n2. Diagnóstico: Ejecuta `git config --local core.filemode` en la terminal para inspeccionar el valor actual.\n3. Solución Canónica: Configura el repositorio para ignorar cambios de modo de archivo en el sistema de archivos local ejecutando `git config --local core.filemode false` o ejecutando el auto-fix del auditor.\n4. Ejemplo:\ngit config --local core.filemode false\nO ejecuta:\nnpm run auditor:fix",
				"git-config-autocrlf": "1. Causa Raíz: La propiedad local `core.autocrlf` no está configurada como `input`, lo que puede provocar que los commits introduzcan saltos de línea Windows (CRLF) en el repositorio remoto.\n2. Diagnóstico: Ejecuta `git config --local core.autocrlf` en la terminal.\n3. Solución Canónica: Configura `core.autocrlf input` para que Git convierta CRLF a LF al hacer commit, preservando saltos LF limpios.\n4. Ejemplo:\ngit config --local core.autocrlf input\nO ejecuta:\nnpm run auditor:fix",
				"git-config-eol": "1. Causa Raíz: La propiedad local `core.eol` no está fijada como `lf`, permitiendo que herramientas locales generen inconsistencias en los finales de línea de archivos fuente y scripts.\n2. Diagnóstico: Ejecuta `git config --local core.eol` en la terminal.\n3. Solución Canónica: Establece `core.eol lf` en la configuración local de Git.\n4. Ejemplo:\ngit config --local core.eol lf\nO ejecuta:\nnpm run auditor:fix"
			},
			coverage: { include: ["package.json"] },
			...options
		});
	}
	async runAudit() {
		if (isProductionEnvironment()) {
			this.markSkipped("Git config omitido en entorno de producción (AUDITOR_ENV=production)");
			return;
		}
		this.recordScanned("package.json");
		const gitPath = path.resolve(this.projectRoot, ".git");
		if (!fs.existsSync(gitPath)) {
			for (const r of GIT_CONFIG_RULES) this.markRuleNotApplicable(r, "No es un repositorio Git (.git no encontrado)");
			return;
		}
		for (const item of REQUIRED_GIT_CONFIGS) this.runSubAuditorSync(item.ruleId, () => {
			let currentVal = getLocalGitConfig(item.key, this.projectRoot);
			if (currentVal !== item.expected && this.isFixActive()) {
				if (setLocalGitConfig(item.key, item.expected, this.projectRoot)) currentVal = getLocalGitConfig(item.key, this.projectRoot);
			}
			if (currentVal !== item.expected) this.addViolation({
				ruleId: item.ruleId,
				file: ".git/config",
				line: 1,
				message: `${item.key} debe ser "${item.expected}" en el repositorio local (detectado: "${currentVal ?? "no configurado"}").`,
				severity: "error",
				context: `${item.key} = ${currentVal ?? "unset"}`
			});
		});
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateGitConfigAuditor());
//#endregion
export { GIT_CONFIG_RULES, REQUIRED_GIT_CONFIGS, ValidateGitConfigAuditor, getLocalGitConfig, setLocalGitConfig };

import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { BaseAuditor, FileScanAuditor, createRuleCapabilities, matchesSinglePattern } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import { lintSource } from "@secretlint/core";
import { rules } from "@secretlint/secretlint-rule-preset-recommend";
//#region src/suites/architecture/validate_secret_leaks.ts
/**
* src/suites/architecture/validate_secret_leaks.ts
*
* SECRET LEAKS & CREDENTIALS AUDITOR (Node.js 26+ Native)
* Scans repository files for leaked credentials, API tokens, cryptographic private keys,
* database URLs with passwords, and cloud access keys using @secretlint/core.
*
* Rules:
*   - secret-leak-detected: Detects exposed API keys, tokens, basic auth credentials, and cloud secrets.
*   - secret-leak-private-key: Detects unencrypted private cryptographic keys (RSA, EC, OPENSSH).
*/
enableCompileCache();
const SECRET_LEAKS_RULES = ["secret-leak-detected", "secret-leak-private-key"];
const SECRET_SCAN_EXTENSIONS = /* @__PURE__ */ new Set([
	".ts",
	".js",
	".vue",
	".cjs",
	".mjs",
	".json",
	".yaml",
	".yml"
]);
function buildSecretLintConfig() {
	return { rules: rules.map((rule) => ({
		id: rule.meta.id,
		rule,
		options: {}
	})) };
}
/**
* Maps a single secretlint message to a canonical AuditFinding.
*/
function mapSecretLintMessageToFinding(msg, relPath) {
	return {
		suiteId: "validate_secret_leaks",
		suiteName: "Secret Leaks & Credentials Auditor",
		ruleId: msg.messageId === "PrivateKey" || msg.ruleId.includes("privatekey") ? "secret-leak-private-key" : "secret-leak-detected",
		ruleDescription: "Secretos: Credencial o clave expuesta",
		severity: "error",
		file: relPath,
		line: msg.loc?.start?.line ?? 1,
		col: msg.loc?.start?.column ?? 1,
		context: msg.ruleId,
		message: msg.message
	};
}
var ValidateSecretLeaksAuditor = class extends FileScanAuditor {
	secretLintConfig;
	constructor(options = {}) {
		const effectiveRoot = options.projectRoot ?? process.cwd();
		super({
			usesThirdPartyTool: false,
			ruleCapabilities: createRuleCapabilities(SECRET_LEAKS_RULES, {
				speed: "light",
				phase: "normal",
				fix: "none",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			id: "validate_secret_leaks",
			name: "Secret Leaks & Credentials Auditor",
			description: "Detecta credenciales, tokens y secretos expuestos",
			family: "architecture",
			packageName: "Secretos",
			icon: "🔑",
			ruleIds: SECRET_LEAKS_RULES,
			ruleDescriptions: {
				"secret-leak-detected": "Token, secreto o credencial expuesta",
				"secret-leak-private-key": "Clave criptográfica privada expuesta"
			},
			ruleRemediations: {
				"secret-leak-detected": "Guía de diagnóstico y remediación para secret-leak-detected. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"secret-leak-private-key": "Guía de diagnóstico y remediación para secret-leak-private-key. Revisa la incidencia detectada y ajusta el código correspondiente."
			},
			roots: options.roots,
			allowedExtensions: SECRET_SCAN_EXTENSIONS,
			projectRoot: effectiveRoot,
			configKey: "secretLeaks.enabled",
			defaultConfig: {
				enabled: true,
				maskSecrets: true
			},
			criticalConfig: {}
		});
		this.secretLintConfig = buildSecretLintConfig();
	}
	async runAudit() {
		if (this.isSuiteGatingDisabled("Secret leaks audit desactivado en config")) return;
		await super.runAudit();
	}
	async scanFile(relPath, content) {
		const config = getAuditConfig(this.projectRoot);
		const exemptGlobs = config.secretLeaks?.exemptGlobs ?? [];
		for (const glob of exemptGlobs) if (matchesSinglePattern(relPath, glob)) return;
		const maskSecrets = config.secretLeaks?.maskSecrets ?? true;
		const ext = path.extname(relPath) || ".txt";
		let messages = [];
		try {
			messages = (await lintSource({
				source: {
					filePath: relPath,
					content,
					ext,
					contentType: "text"
				},
				options: {
					config: this.secretLintConfig,
					maskSecrets
				}
			})).messages;
		} catch {}
		this.runSubAuditorSync("secret-leak-detected", () => {
			const regularMessages = messages.filter((msg) => msg.messageId !== "PrivateKey" && !msg.ruleId.includes("privatekey"));
			for (const msg of regularMessages) {
				const finding = mapSecretLintMessageToFinding(msg, relPath);
				this.addViolation({
					ruleId: "secret-leak-detected",
					severity: finding.severity,
					file: finding.file,
					line: finding.line,
					col: finding.col,
					context: finding.context,
					message: finding.message
				});
			}
		});
		this.runSubAuditorSync("secret-leak-private-key", () => {
			const keyMessages = messages.filter((msg) => msg.messageId === "PrivateKey" || msg.ruleId.includes("privatekey"));
			for (const msg of keyMessages) {
				const finding = mapSecretLintMessageToFinding(msg, relPath);
				this.addViolation({
					ruleId: "secret-leak-private-key",
					severity: finding.severity,
					file: finding.file,
					line: finding.line,
					col: finding.col,
					context: finding.context,
					message: finding.message
				});
			}
		});
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateSecretLeaksAuditor());
//#endregion
export { SECRET_LEAKS_RULES, SECRET_SCAN_EXTENSIONS, ValidateSecretLeaksAuditor, mapSecretLintMessageToFinding };

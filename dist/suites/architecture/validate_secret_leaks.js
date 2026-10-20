import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { BaseAuditor, FileScanAuditor, createRuleCapabilities, createUniformRemediationPhases, matchesSinglePattern } from "../../core/auditorBase.js";
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
			requiredPermissions: [],
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
			ruleRemediationPhases: createUniformRemediationPhases(SECRET_LEAKS_RULES, "behavior"),
			ruleDescriptions: {
				"secret-leak-detected": "Token, secreto o credencial expuesta",
				"secret-leak-private-key": "Clave criptográfica privada expuesta"
			},
			ruleRemediations: {
				"secret-leak-detected": "📖 GUÍA DE REMEDIACIÓN: secret-leak-detected\n1. Causa Raíz: El analizador de seguridad (`@secretlint`) detectó una credencial, token de API, cadena de conexión o firma secreta expuesta en texto plano dentro del código o configuración.\n2. Diagnóstico: Revisa la línea y columna señaladas. El valor o formato coincide con patrones conocidos de proveedores (GitHub, AWS, Google Cloud, Slack, Stripe, JWT, etc.).\n3. Solución Canónica:\n   a) Revoca o invalida inmediatamente la credencial en el panel del proveedor si alguna vez fue commiteada.\n   b) Mueve el secreto a variables de entorno (`.env.local` excluido por `.gitignore` o gestores de secretos de CI/CD).\n   c) Si es un fixture sintético en un test unitario, altera el prefijo o entropía de la cadena para no activar heurísticas de secretos reales, o añade la excepción correspondiente en la configuración.\n4. Ejemplo:\n   ❌ Expuesto: `const API_TOKEN = \"sk_live_secret12345\";`\n   ✅ Seguro:   `const API_TOKEN = process.env.API_TOKEN ?? \"\";`",
				"secret-leak-private-key": "📖 GUÍA DE REMEDIACIÓN: secret-leak-private-key\n1. Causa Raíz: Se encontró un bloque de clave criptográfica privada (`-----BEGIN PRIVATE KEY-----`, o similar) dentro del repositorio.\n2. Diagnóstico: Comprueba el archivo y la línea del hallazgo.\n3. Solución Canónica:\n   a) Retira el bloque de clave privada de los archivos fuente de inmediato y revoca los certificados asociados.\n   b) Inyecta la clave en tiempo de ejecución a través de variables de entorno o almacenes de claves protegidos (KMS, Vault).\n   c) Si es un certificado público o mock de pruebas sin valor criptográfico real, utiliza fixtures seguros en `tests/fixtures/`.\n4. Ejemplo:\n   ❌ Expuesto: Clave PEM pegada directamente en el archivo fuente.\n   ✅ Seguro:   `const privateKey = process.env.AUTH_PRIVATE_KEY;`"
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

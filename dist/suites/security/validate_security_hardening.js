import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { isTestPath } from "../../core/auditTestPredicates.js";
import "../../core/auditConfig.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import { BaseAuditor, FileScanAuditor, LIGHT_RULE_CAPABILITIES, createUniformRemediationPhases, createUniformRuleCapabilities, resolveFileScanRoots } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
//#region src/suites/security/validate_security_hardening.ts
enableCompileCache();
const SECURITY_HARDENING_RULES = [
	"hardcoded-secrets",
	"insecure-random",
	"vulnerable-regex-redos",
	"raw-html-injection",
	"missing-csrf-token",
	"eval-or-function-constructor",
	"permissive-cors",
	"unvalidated-redirect"
];
const SCANNABLE_EXTS = /* @__PURE__ */ new Set([
	".ts",
	".js",
	".vue",
	".html"
]);
var ValidateSecurityHardeningAuditor = class extends FileScanAuditor {
	constructor(options = {}) {
		const { effectiveRoot, targetRoots } = resolveFileScanRoots(options);
		const config = getAuditConfig(effectiveRoot);
		super({
			usesThirdPartyTool: false,
			id: "validate_security_hardening",
			name: "Security Hardening & Threat Boundary Auditor",
			description: "Endurecimiento de seguridad, OWASP Top 10 y SSRF",
			family: "security",
			packageName: "SecHarden",
			icon: "🛡️",
			configKey: "securityHardening.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			roots: targetRoots,
			allowedExtensions: SCANNABLE_EXTS,
			ruleIds: SECURITY_HARDENING_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(SECURITY_HARDENING_RULES, "behavior"),
			ruleDescriptions: {
				"hardcoded-secrets": "Secret o token hardcodeado en código",
				"insecure-random": "Math.random() para valores sensibles",
				"vulnerable-regex-redos": "Expresión regular vulnerable a ReDoS",
				"raw-html-injection": "Inyección HTML con v-html o innerHTML",
				"missing-csrf-token": "Formulario POST sin token CSRF",
				"eval-or-function-constructor": "Uso de eval() o new Function() dinámico",
				"permissive-cors": "CORS permisivo con origen '*'",
				"unvalidated-redirect": "Redirección abierta sin validar ruta"
			},
			ruleRemediations: {
				"hardcoded-secrets": "Guía de diagnóstico y remediación para hardcoded-secrets. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"insecure-random": "Guía de diagnóstico y remediación para insecure-random. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"vulnerable-regex-redos": "Guía de diagnóstico y remediación para vulnerable-regex-redos. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"raw-html-injection": "Guía de diagnóstico y remediación para raw-html-injection. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"missing-csrf-token": "Guía de diagnóstico y remediación para missing-csrf-token. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"eval-or-function-constructor": "Guía de diagnóstico y remediación para eval-or-function-constructor. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"permissive-cors": "Guía de diagnóstico y remediación para permissive-cors. Revisa la incidencia detectada y ajusta el código correspondiente.",
				"unvalidated-redirect": "Guía de diagnóstico y remediación para unvalidated-redirect. Revisa la incidencia detectada y ajusta el código correspondiente."
			},
			ruleCapabilities: createUniformRuleCapabilities(SECURITY_HARDENING_RULES, LIGHT_RULE_CAPABILITIES),
			projectRoot: effectiveRoot,
			coverage: deriveCoverageFromRoots(targetRoots, SCANNABLE_EXTS, effectiveRoot),
			exemptPaths: config.securityHardening?.exemptPaths
		});
	}
	scanFile(relPath, content) {
		const lines = content.split("\n");
		const isTest = isTestPath(relPath);
		this.runSubAuditorSync("hardcoded-secrets", () => {
			if (!isTest && !content.includes("secret-ok")) this.auditHardcodedSecrets(relPath, content, lines);
		});
		this.runSubAuditorSync("insecure-random", () => {
			if (!isTest && !content.includes("random-ok")) this.auditInsecureRandom(relPath, content, lines);
		});
		this.runSubAuditorSync("vulnerable-regex-redos", () => {
			if (!isTest && !content.includes("redos-ok")) this.auditVulnerableRegexRedos(relPath, content, lines);
		});
		this.runSubAuditorSync("raw-html-injection", () => {
			if (!content.includes("html-injection-ok")) this.auditRawHtmlInjection(relPath, content, lines);
		});
		this.runSubAuditorSync("missing-csrf-token", () => {
			if (!content.includes("csrf-ok")) this.auditMissingCsrfToken(relPath, content, lines);
		});
		this.runSubAuditorSync("eval-or-function-constructor", () => {
			if (!isTest && !content.includes("eval-ok")) this.auditEvalOrFunctionConstructor(relPath, content, lines);
		});
		this.runSubAuditorSync("permissive-cors", () => {
			if (!content.includes("cors-ok")) this.auditPermissiveCors(relPath, content, lines);
		});
		this.runSubAuditorSync("unvalidated-redirect", () => {
			if (!content.includes("redirect-ok")) this.auditUnvalidatedRedirect(relPath, content, lines);
		});
	}
	scanSecurityPattern(relPath, content, lines, pattern, escapeHatch, ruleId, message, filter) {
		let match;
		pattern.lastIndex = 0;
		while ((match = pattern.exec(content)) !== null) {
			if (filter && !filter(match)) continue;
			const line = this.getLineNumber(content, match.index);
			const lineText = lines[line - 1] ?? "";
			const prevLineText = line > 1 ? lines[line - 2] ?? "" : "";
			if (lineText.includes(escapeHatch) || prevLineText.includes(escapeHatch)) continue;
			this.addViolation({
				ruleId,
				severity: "error",
				message,
				file: relPath,
				line
			});
		}
	}
	auditHardcodedSecrets(relPath, content, lines) {
		for (const pat of [
			/-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
			/(?:bearer\s+|jwt\s*[:=]\s*['"])(eyJ[\w-]{20,}\.[\w-]{20,})/gi,
			/(?:api_key|apiSecret|client_secret)\s*[:=]\s*['"]([\w-]{24,})['"]/gi,
			/password\s*[:=]\s*['"](?!example|password|test|placeholder|admin)[\w!@#$%^&*()+]{8,}['"]/gi
		]) this.scanSecurityPattern(relPath, content, lines, pat, "secret-ok", "hardcoded-secrets", "Credencial, token o secret hardcodeado en código fuente");
	}
	auditInsecureRandom(relPath, content, lines) {
		this.scanSecurityPattern(relPath, content, lines, /(?:token|secret|salt|password|nonce|csrf|sessionId|auth)\w*\s*[:=][^;]*Math\.random\(\)/gi, "random-ok", "insecure-random", "Uso de Math.random() para generar valores sensibles o tokens; utilizar crypto seguro");
	}
	auditVulnerableRegexRedos(relPath, content, lines) {
		this.scanSecurityPattern(relPath, content, lines, /\/([^/\n\r]*\([^\n\r()]+[+*]\)[+*][^/\n\r]*)\/[gimuy]*/g, "redos-ok", "vulnerable-regex-redos", "Expresión regular vulnerable a ReDoS por cuantificadores anidados");
	}
	auditRawHtmlInjection(relPath, content, lines) {
		this.scanSecurityPattern(relPath, content, lines, /v-html\s*=\s*["']([^"']+)["']/g, "html-injection-ok", "raw-html-injection", "Directiva v-html sin sanitización con DOMPurify (riesgo de XSS)", (m) => {
			const expr = m[1] ?? "";
			return !expr.includes("DOMPurify.sanitize") && !expr.includes("sanitizeHtml");
		});
		this.scanSecurityPattern(relPath, content, lines, /\.innerHTML\s*=\s*([^;\n]+)/g, "html-injection-ok", "raw-html-injection", "Asignación directa a innerHTML sin sanitizar mediante DOMPurify (riesgo de XSS)", (m) => {
			const assigned = (m[1] ?? "").trim();
			if (assigned === "''" || assigned === "\"\"" || assigned === "``") return false;
			if (/^['"]\s*['"]$/.test(assigned)) return false;
			return !assigned.includes("DOMPurify.sanitize") && !assigned.includes("sanitizeHtml");
		});
	}
	auditMissingCsrfToken(relPath, content, lines) {
		this.scanSecurityPattern(relPath, content, lines, /<form\s+([^>]*?method=["']post["'][^>]*)>([\s\S]*?)<\/form>/gi, "csrf-ok", "missing-csrf-token", "Formulario con método POST sin token de protección CSRF", (m) => {
			const inner = m[2] ?? "";
			return !/csrf|token|_csrf/i.test(inner);
		});
	}
	auditEvalOrFunctionConstructor(relPath, content, lines) {
		this.scanSecurityPattern(relPath, content, lines, /\b(?:eval\s*\(|new\s+Function\s*\()/g, "eval-ok", "eval-or-function-constructor", "Ejecución de código dinámico prohibida (eval o new Function)");
	}
	auditPermissiveCors(relPath, content, lines) {
		this.scanSecurityPattern(relPath, content, lines, /cors\(\s*\{\s*origin\s*:\s*['"]\*['"]|Access-Control-Allow-Origin['"]?\s*[:=]\s*['"]\*['"]/gi, "cors-ok", "permissive-cors", "Configuración CORS permisiva con origen '*' expuesta en API");
	}
	auditUnvalidatedRedirect(relPath, content, lines) {
		this.scanSecurityPattern(relPath, content, lines, /res\.redirect\s*\(\s*(?:req\.query|req\.body)|location\.href\s*=\s*(?:req\.query|new\s+URLSearchParams)/gi, "redirect-ok", "unvalidated-redirect", "Redirección abierta a parámetro de usuario sin validación de destino");
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateSecurityHardeningAuditor());
//#endregion
export { SECURITY_HARDENING_RULES, ValidateSecurityHardeningAuditor };

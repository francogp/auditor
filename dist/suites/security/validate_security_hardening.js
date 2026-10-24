import { getAuditConfig } from "../../core/auditConfigLoader.js";
import { isTestPath } from "../../core/auditTestPredicates.js";
import "../../core/auditConfig.js";
import { deriveCoverageFromRoots } from "../../core/auditCoverage.js";
import { BaseAuditor, FileScanAuditor, LIGHT_RULE_CAPABILITIES, createUniformRemediationPhases, createUniformRuleCapabilities, resolveFileScanRoots } from "../../core/auditorBase.js";
import { enableCompileCache } from "node:module";
// src/suites/security/validate_security_hardening.ts
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
		const securityRoots = resolveFileScanRoots(options);
		const secConfig = getAuditConfig(securityRoots.effectiveRoot);
		super({
			id: "validate_security_hardening",
			name: "Security Hardening & Threat Boundary Auditor",
			description: "Security hardening, OWASP Top 10, and SSRF",
			family: "security",
			packageName: "SecHarden",
			icon: "🛡️",
			configKey: "securityHardening.enabled",
			defaultConfig: { enabled: true },
			criticalConfig: {},
			requiredPermissions: [],
			usesThirdPartyTool: false,
			roots: securityRoots.targetRoots,
			allowedExtensions: SCANNABLE_EXTS,
			ruleIds: SECURITY_HARDENING_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(SECURITY_HARDENING_RULES, "behavior"),
			ruleDescriptions: {
				"hardcoded-secrets": "Hardcoded secret or token in code",
				"insecure-random": "Weak random for sensitive values",
				"vulnerable-regex-redos": "Regex vulnerable to ReDoS",
				"raw-html-injection": "HTML injection via v-html or innerHTML",
				"missing-csrf-token": "POST form missing CSRF token",
				"eval-or-function-constructor": "Eval or Function constructor",
				"permissive-cors": "Permissive CORS with origin '*'",
				"unvalidated-redirect": "Open redirect without validation"
			},
			ruleRemediations: {
				"hardcoded-secrets": "📖 REMEDIATION GUIDE: hardcoded-secrets\n1. Root Cause: A hardcoded string matching an API key, secret token, password, or credential was detected in source code. This exposes credentials to leakages and security vulnerabilities.\n2. Diagnosis: Locate the variable or constant at the reported line.\n3. Canonical Solution:\n   a) Move secrets to environment variables (`process.env.VAR_NAME` or `.env.local` ignored by git).\n   b) If this is dummy test data, isolate the fixture in `tests/` or break up the string so it does not match live token patterns.\n4. Example / Auto-fix command:\n   ❌ Incorrect: Embedding static private keys or raw API keys in source.\n   ✅ Correct:   `const apiKey = process.env.API_KEY ?? \"\";`",
				"insecure-random": "📖 REMEDIATION GUIDE: insecure-random\n1. Root Cause: Cryptographically weak pseudo-random generation was used for sensitive identifiers, session tokens, or keys. Such generators are predictable (CWE-330).\n2. Diagnosis: Review the random generator at the reported line.\n3. Canonical Solution:\n   a) Use the native cryptographically secure random API: `crypto.randomUUID()` or `crypto.getRandomValues()` (`node:crypto` or `window.crypto`).\n   b) In UI/game animations without security requirements, isolate styling logic in components.\n4. Example / Auto-fix command:\n   ❌ Incorrect: Generating authentication tokens with pseudorandom numbers.\n   ✅ Correct:   `const token = crypto.randomUUID();`",
				"vulnerable-regex-redos": "📖 REMEDIATION GUIDE: vulnerable-regex-redos\n1. Root Cause: A regular expression contains nested quantifiers or ambiguous patterns (e.g., repeated grouping with inner repetition) that trigger catastrophic backtracking (ReDoS, CWE-1333) when processing adversarial inputs.\n2. Diagnosis: Inspect the regex pattern at the reported line.\n3. Canonical Solution:\n   a) Rewrite the regex to eliminate overlapping or nested repetitions.\n   b) Use a linear procedural parser for complex validation rules.\n4. Example / Auto-fix command:\n   ❌ Vulnerable: Nested repetition quantifiers such as `(group+)+`.\n   ✅ Secure:     Linear matching such as `^[a-zA-Z0-9]+$` without nested backtracking.",
				"raw-html-injection": "📖 REMEDIATION GUIDE: raw-html-injection\n1. Root Cause: Direct binding of unescaped markup to dynamic elements introduces Cross-Site Scripting (XSS, CWE-79) attack vectors.\n2. Diagnosis: Examine the direct HTML binding or assignment at the reported line.\n3. Canonical Solution:\n   a) Replace unescaped HTML binding with safe text interpolation `{{ variable }}` or text directives.\n   b) If rendering rich HTML from a trusted source is required, sanitize the string with a validated library (e.g., DOMPurify) before binding.\n4. Example / Auto-fix command:\n   ❌ Vulnerable: Rendering unescaped dynamic HTML directly.\n   ✅ Secure:     Sanitizing with `DOMPurify.sanitize(content)` before rendering.",
				"missing-csrf-token": "📖 REMEDIATION GUIDE: missing-csrf-token\n1. Root Cause: An HTML form submitting state mutations via POST/PUT lacks a CSRF protection token or header (CWE-352).\n2. Diagnosis: Inspect the `<form method=\"POST\">` element.\n3. Canonical Solution:\n   a) Include a hidden input containing the CSRF token or configure the `X-CSRF-Token` header in AJAX requests.\n   b) For API-driven endpoints, communicate via Bearer tokens or SameSite=Strict cookies.\n4. Example / Auto-fix command:\n   - Add: `<input type=\"hidden\" name=\"_csrf\" :value=\"csrfToken\" />`",
				"eval-or-function-constructor": "📖 REMEDIATION GUIDE: eval-or-function-constructor\n1. Root Cause: Dynamic code evaluation evaluates strings as executable code, permitting arbitrary code execution (CWE-95).\n2. Diagnosis: Locate the dynamic code execution call at the reported line.\n3. Canonical Solution: Eliminate dynamic code evaluation. Use object dictionaries, pure functions, dedicated parsers (e.g. `JSON.parse`), or state machines.\n4. Example / Auto-fix command:\n   ❌ Vulnerable: Dynamic evaluation of untrusted strings.\n   ✅ Secure:     `const result = mathEvaluator.parse(expression);`",
				"permissive-cors": "📖 REMEDIATION GUIDE: permissive-cors\n1. Root Cause: CORS headers are configured with the overly permissive wildcard `Access-Control-Allow-Origin: *`, allowing arbitrary third-party origins to access internal resources.\n2. Diagnosis: Check the CORS header configuration in the middleware or server file.\n3. Canonical Solution: Restrict allowed origins to an explicit whitelist of trusted domains or the current host origin.\n4. Example / Auto-fix command:\n   ❌ Insecure: `res.setHeader(\"Access-Control-Allow-Origin\", \"*\");`\n   ✅ Secure:   `res.setHeader(\"Access-Control-Allow-Origin\", allowedOrigins.includes(origin) ? origin : \"\");`",
				"unvalidated-redirect": "📖 REMEDIATION GUIDE: unvalidated-redirect\n1. Root Cause: Navigation redirects to an external URL without verifying that the destination belongs to a trusted domain (Open Redirect, CWE-601).\n2. Diagnosis: Review the redirection logic and how the destination URL is constructed.\n3. Canonical Solution: Validate that the URL begins with `/` (relative path) or belongs to an allowed whitelist before navigating.\n4. Example / Auto-fix command:\n   ❌ Insecure: Direct unvalidated redirection to user-supplied query parameters.\n   ✅ Secure:   `if (isInternalUrl(returnUrl)) window.location.href = returnUrl;`"
			},
			ruleCapabilities: createUniformRuleCapabilities(SECURITY_HARDENING_RULES, LIGHT_RULE_CAPABILITIES),
			projectRoot: securityRoots.effectiveRoot,
			coverage: deriveCoverageFromRoots(securityRoots.targetRoots, SCANNABLE_EXTS, securityRoots.effectiveRoot),
			exemptPaths: secConfig.securityHardening?.exemptPaths
		});
	}
	scanFile(relPath, content) {
		const lines = content.split("\n");
		const isTest = isTestPath(relPath);
		this.runSubAuditorSync("hardcoded-secrets", () => {
			if (!isTest) this.auditHardcodedSecrets(relPath, content, lines);
		});
		this.runSubAuditorSync("insecure-random", () => {
			if (!isTest) this.auditInsecureRandom(relPath, content, lines);
		});
		this.runSubAuditorSync("vulnerable-regex-redos", () => {
			if (!isTest) this.auditVulnerableRegexRedos(relPath, content, lines);
		});
		this.runSubAuditorSync("raw-html-injection", () => {
			this.auditRawHtmlInjection(relPath, content, lines);
		});
		this.runSubAuditorSync("missing-csrf-token", () => {
			this.auditMissingCsrfToken(relPath, content, lines);
		});
		this.runSubAuditorSync("eval-or-function-constructor", () => {
			if (!isTest) this.auditEvalOrFunctionConstructor(relPath, content, lines);
		});
		this.runSubAuditorSync("permissive-cors", () => {
			this.auditPermissiveCors(relPath, content, lines);
		});
		this.runSubAuditorSync("unvalidated-redirect", () => {
			this.auditUnvalidatedRedirect(relPath, content, lines);
		});
	}
	scanSecurityPattern(relPath, content, _lines, pattern, ruleId, message, filter) {
		let match;
		pattern.lastIndex = 0;
		while ((match = pattern.exec(content)) !== null) {
			if (filter && !filter(match)) continue;
			const line = this.getLineNumber(content, match.index);
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
		]) this.scanSecurityPattern(relPath, content, lines, pat, "hardcoded-secrets", "Hardcoded credential, token, or secret detected in source code");
	}
	auditInsecureRandom(relPath, content, lines) {
		this.scanSecurityPattern(relPath, content, lines, /(?:token|secret|salt|password|nonce|csrf|sessionId|auth)\w*\s*[:=][^;]*Math\.random\(\)/gi, "insecure-random", "Use of Math.random() for sensitive values or tokens; use cryptographically secure random values instead");
	}
	auditVulnerableRegexRedos(relPath, content, lines) {
		this.scanSecurityPattern(relPath, content, lines, /\/([^/\n\r]*\([^\n\r()]+[+*]\)[+*][^/\n\r]*)\/[gimuy]*/g, "vulnerable-regex-redos", "Regular expression vulnerable to ReDoS due to nested quantifiers");
	}
	auditRawHtmlInjection(relPath, content, lines) {
		this.scanSecurityPattern(relPath, content, lines, /v-html\s*=\s*["']([^"']+)["']/g, "raw-html-injection", "Direct v-html directive without DOMPurify sanitization (XSS risk)", (m) => {
			const expr = m[1] ?? "";
			return !expr.includes("DOMPurify.sanitize") && !expr.includes("sanitizeHtml");
		});
		this.scanSecurityPattern(relPath, content, lines, /\.innerHTML\s*=\s*([^;\n]+)/g, "raw-html-injection", "Direct assignment to innerHTML without sanitization via DOMPurify (XSS risk)", (m) => {
			const assigned = (m[1] ?? "").trim();
			if (/^(['"`])\s*\1$/.test(assigned)) return false;
			return !assigned.includes("DOMPurify.sanitize") && !assigned.includes("sanitizeHtml");
		});
	}
	auditMissingCsrfToken(relPath, content, lines) {
		this.scanSecurityPattern(relPath, content, lines, /<form\s+([^>]*?method=["']post["'][^>]*)>([\s\S]*?)<\/form>/gi, "missing-csrf-token", "Form with POST method missing CSRF protection token", (m) => {
			const inner = m[2] ?? "";
			return !/csrf|token|_csrf/i.test(inner);
		});
	}
	auditEvalOrFunctionConstructor(relPath, content, lines) {
		this.scanSecurityPattern(relPath, content, lines, /\b(?:eval\s*\(|new\s+Function\s*\()/g, "eval-or-function-constructor", "Dynamic code execution prohibited (eval or new Function)");
	}
	auditPermissiveCors(relPath, content, lines) {
		this.scanSecurityPattern(relPath, content, lines, /cors\(\s*\{\s*origin\s*:\s*['"]\*['"]|Access-Control-Allow-Origin['"]?\s*[:=]\s*['"]\*['"]/gi, "permissive-cors", "Permissive CORS configuration with origin '*' exposed in API");
	}
	auditUnvalidatedRedirect(relPath, content, lines) {
		this.scanSecurityPattern(relPath, content, lines, /res\.redirect\s*\(\s*(?:req\.query|req\.body)|location\.href\s*=\s*(?:req\.query|new\s+URLSearchParams)/gi, "unvalidated-redirect", "Open redirect to user-controlled parameter without target validation");
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateSecurityHardeningAuditor());
export { SECURITY_HARDENING_RULES, ValidateSecurityHardeningAuditor };

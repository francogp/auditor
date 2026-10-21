import { getAuditConfig } from "../../core/auditConfigLoader.js";
import "../../core/auditConfig.js";
import { BaseAuditor, createRuleCapabilities, createUniformRemediationPhases } from "../../core/auditorBase.js";
import { runNpmCommandSync } from "../../core/npmCommandUtils.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
//#region src/suites/architecture/validate_dependency_vulnerabilities.ts
/**
* src/suites/architecture/validate_dependency_vulnerabilities.ts
*
* DEPENDENCY VULNERABILITIES & CVE AUDITOR (Node.js 26+ Native)
* Scans installed dependency tree for known security advisories and CVEs
* via npm audit --json, with graceful offline handling and configurable severity gating.
*
* Rules:
*   - dependency-cve-critical: Critical security vulnerabilities detected in package dependencies.
*   - dependency-cve-high: High security vulnerabilities detected in package dependencies.
*   - dependency-cve-moderate: Moderate security vulnerabilities detected in package dependencies.
*/
enableCompileCache();
const NPM_AUDIT_TIMEOUT_MS = 3e4;
const NPM_AUDIT_MAX_BUFFER_BYTES = 10485760;
const DEPENDENCY_VULNERABILITIES_RULES = [
	"dependency-cve-critical",
	"dependency-cve-high",
	"dependency-cve-moderate"
];
/**
* Invokes npm audit --json synchronously with bounded timeout and safe error capture.
*/
function runNpmAudit(projectRoot, omitDev = true) {
	const args = ["audit", "--json"];
	if (omitDev) args.push("--omit=dev");
	let proc;
	try {
		proc = runNpmCommandSync(args, {
			cwd: projectRoot,
			encoding: "utf-8",
			stdio: [
				"ignore",
				"pipe",
				"pipe"
			],
			timeout: NPM_AUDIT_TIMEOUT_MS,
			maxBuffer: NPM_AUDIT_MAX_BUFFER_BYTES
		});
	} catch (err) {
		return {
			stdout: "",
			error: err instanceof Error ? err : new Error(String(err))
		};
	}
	const stdout = proc.stdout ? proc.stdout.trim() : "";
	if (stdout.startsWith("{")) return { stdout };
	if (proc.error) return {
		stdout: "",
		error: proc.error
	};
	if (proc.status !== 0) {
		const errMsg = proc.stderr ? proc.stderr.trim() : `npm audit exit code ${proc.status}`;
		return {
			stdout: "",
			error: new Error(errMsg)
		};
	}
	return {
		stdout,
		error: void 0
	};
}
function mapSeverityToRuleId(sev) {
	if (sev === "critical") return "dependency-cve-critical";
	if (sev === "high") return "dependency-cve-high";
	if (sev === "moderate") return "dependency-cve-moderate";
	return null;
}
function computeFindingSeverity(sev, failOn) {
	if (failOn === "critical") return sev === "critical" ? "error" : "warning";
	if (failOn === "high") return sev === "critical" || sev === "high" ? "error" : "warning";
	return "error";
}
function extractAdvisoryDetails(vuln, pkgName) {
	const advisory = vuln.via.find((v) => typeof v !== "string");
	return {
		title: advisory?.title ?? `${vuln.severity} security advisory in ${pkgName}`,
		url: advisory?.url ? ` (${advisory.url})` : ""
	};
}
/**
* Parses npm audit JSON into canonical AuditFindings.
*/
function parseNpmAuditReport(json, allowList, failOn = "critical") {
	const findings = [];
	const vulns = json.vulnerabilities ?? {};
	for (const [pkgName, vuln] of Object.entries(vulns)) {
		if (allowList.has(pkgName)) continue;
		const ruleId = mapSeverityToRuleId(vuln.severity);
		if (!ruleId) continue;
		const findingSeverity = computeFindingSeverity(vuln.severity, failOn);
		const { title, url } = extractAdvisoryDetails(vuln, pkgName);
		findings.push({
			suiteId: "validate_dependency_vulnerabilities",
			suiteName: "Dependency Vulnerabilities & CVE Auditor",
			ruleId,
			ruleDescription: "Dependencies: Detected CVE vulnerability",
			severity: findingSeverity,
			file: "package-lock.json",
			line: 1,
			context: pkgName,
			message: `[${vuln.severity.toUpperCase()}] ${pkgName}: ${title}${url}`
		});
	}
	return findings;
}
var ValidateDependencyVulnerabilitiesAuditor = class extends BaseAuditor {
	constructor(options = {}) {
		super({
			usesThirdPartyTool: true,
			requiredPermissions: ["--allow-child-process"],
			thirdPartyToolPolicy: {
				toolName: "npm audit",
				fallbackBehavior: "throw"
			},
			projectRoot: options.projectRoot,
			ruleCapabilities: createRuleCapabilities(DEPENDENCY_VULNERABILITIES_RULES, {
				speed: ["heavy", "full"],
				phase: "setup",
				fix: "none",
				md: false,
				ast: false,
				changedOnly: false,
				critical: false
			}),
			id: "validate_dependency_vulnerabilities",
			name: "Dependency Vulnerabilities & CVE Auditor",
			description: "Detects vulnerabilities and CVE security advisories",
			family: "architecture",
			packageName: "Dependencies",
			icon: "🛡️",
			ruleIds: DEPENDENCY_VULNERABILITIES_RULES,
			ruleRemediationPhases: createUniformRemediationPhases(DEPENDENCY_VULNERABILITIES_RULES, "hygiene"),
			ruleDescriptions: {
				"dependency-cve-critical": "Critical vulnerability in package",
				"dependency-cve-high": "High vulnerability in package",
				"dependency-cve-moderate": "Moderate vulnerability detected"
			},
			ruleRemediations: {
				"dependency-cve-critical": "1. Root Cause:\nA critical security vulnerability (CVE with CVSS score >= 9.0) was detected in one of the dependencies installed in node_modules.\nCritical vulnerabilities typically allow remote code execution (RCE), unauthorized privilege escalation, or complete environment compromise.\n\n2. Diagnosis:\nThe violation message reports the vulnerable package name, the GitHub Advisory / CVE URL, and the affected dependency chain.\n\n3. Canonical Solution:\n1. Run \"npm audit\" to inspect the detailed security report.\n2. If a safe patch is available, run \"npm audit fix\".\n3. If the vulnerability originates from a direct dependency, update it in package.json to a secure release (\"npm install <package>@latest\").\n4. If confirmed as a false positive in an isolated, non-risky environment, register it explicitly in \"config.dependencyVulnerabilities.allowList\" in .auditor/audit.config.ts after human review.\n\n4. Example / Auto-fix command:\nnpm audit fix",
				"dependency-cve-high": "1. Root Cause:\nA high severity vulnerability (CVSS 7.0 - 8.9) was detected in project dependencies.\nCommon causes include Regular Expression Denial of Service (ReDoS), Cross-Site Scripting (XSS), or authentication bypass in third-party libraries.\n\n2. Diagnosis:\nReview the advisory URL provided in the violation message.\n\n3. Canonical Solution:\n1. Run \"npm audit fix\" to safely update to semver-compatible patched versions.\n2. Upgrade the top-level dependency that introduces the vulnerable package.\n\n4. Example / Auto-fix command:\nnpm audit fix",
				"dependency-cve-moderate": "1. Root Cause:\nA moderate severity vulnerability (CVSS 4.0 - 6.9) was detected in installed dependencies.\n\n2. Diagnosis:\nCheck the package and the recommended patched version in the npm audit advisory.\n\n3. Canonical Solution:\n1. Run \"npm audit fix\" or update the affected package with \"npm update <package>\".\n2. In environments gated strictly on critical issues, configure \"config.dependencyVulnerabilities.failOn\" to \"critical\" or \"high\" in .auditor/audit.config.ts.\n\n4. Example / Auto-fix command:\nnpm audit fix"
			},
			coverage: { include: ["package.json", "package-lock.json"] },
			configKey: "dependencyVulnerabilities.enabled",
			defaultConfig: {
				enabled: true,
				failOn: "critical"
			},
			criticalConfig: {}
		});
	}
	async runAudit() {
		if (this.isSuiteGatingDisabled("Dependency vulnerability audit disabled")) return;
		const pkgJsonRelative = "package.json";
		if (fs.existsSync(path.resolve(this.projectRoot, pkgJsonRelative))) this.recordScanned(pkgJsonRelative);
		const lockfileRelative = "package-lock.json";
		if (fs.existsSync(path.resolve(this.projectRoot, lockfileRelative))) this.recordScanned(lockfileRelative);
		const config = getAuditConfig(this.projectRoot);
		const omitDev = !config.dependencyVulnerabilities?.includeDev;
		const failOn = config.dependencyVulnerabilities?.failOn ?? "critical";
		const allowList = new Set(config.dependencyVulnerabilities?.allowList ?? []);
		const tier = this.getExecutionTier();
		const cacheDir = path.resolve(this.projectRoot, "scratch/audits/architecture");
		const cacheFile = path.join(cacheDir, "npm_audit_cache.json");
		const lockfilePath = path.resolve(this.projectRoot, lockfileRelative);
		let lockfileHash = "";
		if (fs.existsSync(lockfilePath)) try {
			lockfileHash = crypto.createHash("sha256").update(fs.readFileSync(lockfilePath, "utf-8")).digest("hex");
		} catch {}
		if (tier !== "full" && lockfileHash && fs.existsSync(cacheFile)) try {
			const cached = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
			if (cached.hash === lockfileHash && Array.isArray(cached.findings)) {
				this.context.logProgress("⚡ Reusing cached vulnerability report (unchanged package-lock.json)");
				this.applyAuditFindings(cached.findings);
				return;
			}
		} catch {}
		const { stdout, error } = runNpmAudit(this.projectRoot, omitDev);
		if (error || !stdout) {
			this.context.logProgress("⚠️  Could not connect to npm registry for audit (offline mode)");
			for (const ruleId of DEPENDENCY_VULNERABILITIES_RULES) this.runSubAuditorSync(ruleId, () => {
				this.markRuleNotApplicable(ruleId, "No connection to npm registry (offline)");
			});
			return;
		}
		let report;
		try {
			report = JSON.parse(stdout);
		} catch {
			throw new Error(`[validate_dependency_vulnerabilities] Failed to parse JSON output from 'npm audit'. Received output: ${stdout.trim().slice(0, 300)}`);
		}
		const findings = parseNpmAuditReport(report, allowList, failOn);
		if (lockfileHash) try {
			fs.mkdirSync(cacheDir, { recursive: true });
			fs.writeFileSync(cacheFile, JSON.stringify({
				hash: lockfileHash,
				findings
			}, null, 2), "utf-8");
		} catch {}
		this.applyAuditFindings(findings);
	}
	applyAuditFindings(findings) {
		for (const ruleId of DEPENDENCY_VULNERABILITIES_RULES) this.runSubAuditorSync(ruleId, () => {
			const matching = findings.filter((f) => f.ruleId === ruleId);
			for (const f of matching) this.addViolation({
				ruleId: f.ruleId,
				severity: f.severity,
				file: f.file ?? "package-lock.json",
				line: f.line ?? 1,
				context: f.context ?? f.ruleId,
				message: f.message
			});
		});
	}
};
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateDependencyVulnerabilitiesAuditor());
//#endregion
export { DEPENDENCY_VULNERABILITIES_RULES, ValidateDependencyVulnerabilitiesAuditor, parseNpmAuditReport, runNpmAudit };

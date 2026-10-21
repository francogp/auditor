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

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor,
  createUniformRemediationPhases, createRuleCapabilities } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { runNpmCommandSync } from '../../core/npmCommandUtils.ts';
import type { NpmAuditSeverityLevel } from '../../core/auditConfigTypes.ts';
import type { AuditFinding, FindingSeverity } from '../../core/auditContract.ts';

enableCompileCache();

const NPM_AUDIT_TIMEOUT_MS = 30_000;
const NPM_AUDIT_MAX_BUFFER_BYTES = 10_485_760;

export const DEPENDENCY_VULNERABILITIES_RULES = [
  'dependency-cve-critical',
  'dependency-cve-high',
  'dependency-cve-moderate'
] as const;
export type DependencyVulnerabilitiesRuleId = (typeof DEPENDENCY_VULNERABILITIES_RULES)[number];

export interface NpmAuditVulnItem {
  readonly name: string;
  readonly severity: NpmAuditSeverityLevel;
  readonly isDirect: boolean;
  readonly via: readonly (
    | string
    | { readonly title?: string; readonly url?: string; readonly range?: string }
  )[];
  readonly range: string;
  readonly effects: readonly string[];
}

export interface NpmAuditReport {
  readonly vulnerabilities?: Record<string, NpmAuditVulnItem>;
}

/**
 * Invokes npm audit --json synchronously with bounded timeout and safe error capture.
 */
export function runNpmAudit(
  projectRoot: string,
  omitDev = true
): { stdout: string; error?: Error } {
  const args = ['audit', '--json'];
  if (omitDev) {
    args.push('--omit=dev');
  }
  let proc;
  try {
    proc = runNpmCommandSync(args, {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: NPM_AUDIT_TIMEOUT_MS,
      maxBuffer: NPM_AUDIT_MAX_BUFFER_BYTES
    });
  } catch (err: unknown) {
    return { stdout: '', error: err instanceof Error ? err : new Error(String(err)) };
  }

  const stdout = proc.stdout ? proc.stdout.trim() : '';
  if (stdout.startsWith('{')) {
    return { stdout };
  }
  if (proc.error) {
    return { stdout: '', error: proc.error };
  }
  if (proc.status !== 0) {
    const errMsg = proc.stderr ? proc.stderr.trim() : `npm audit exit code ${proc.status}`;
    return { stdout: '', error: new Error(errMsg) };
  }
  return { stdout, error: undefined };
}

function mapSeverityToRuleId(sev: NpmAuditSeverityLevel): DependencyVulnerabilitiesRuleId | null {
  if (sev === 'critical') return 'dependency-cve-critical';
  if (sev === 'high') return 'dependency-cve-high';
  if (sev === 'moderate') return 'dependency-cve-moderate';
  return null;
}

function computeFindingSeverity(
  sev: NpmAuditSeverityLevel,
  failOn: NpmAuditSeverityLevel
): FindingSeverity {
  if (failOn === 'critical') {
    return sev === 'critical' ? 'error' : 'warning';
  }
  if (failOn === 'high') {
    return sev === 'critical' || sev === 'high' ? 'error' : 'warning';
  }
  return 'error';
}

function extractAdvisoryDetails(
  vuln: NpmAuditVulnItem,
  pkgName: string
): { title: string; url: string } {
  const advisory = vuln.via.find(
    (v): v is { readonly title?: string; readonly url?: string } => typeof v !== 'string'
  );
  const title = advisory?.title ?? `${vuln.severity} security advisory in ${pkgName}`;
  const url = advisory?.url ? ` (${advisory.url})` : '';
  return { title, url };
}

/**
 * Parses npm audit JSON into canonical AuditFindings.
 */
export function parseNpmAuditReport(
  json: NpmAuditReport,
  allowList: ReadonlySet<string>,
  failOn: NpmAuditSeverityLevel = 'critical'
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const vulns = json.vulnerabilities ?? {};

  for (const [pkgName, vuln] of Object.entries(vulns)) {
    if (allowList.has(pkgName)) continue;

    const ruleId = mapSeverityToRuleId(vuln.severity);
    if (!ruleId) continue;

    const findingSeverity = computeFindingSeverity(vuln.severity, failOn);
    const { title, url } = extractAdvisoryDetails(vuln, pkgName);

    findings.push({
      suiteId: 'validate_dependency_vulnerabilities',
      suiteName: 'Dependency Vulnerabilities & CVE Auditor',
      ruleId,
      ruleDescription: 'Dependencies: Detected CVE vulnerability',
      severity: findingSeverity,
      file: 'package-lock.json',
      line: 1,
      context: pkgName,
      message: `[${vuln.severity.toUpperCase()}] ${pkgName}: ${title}${url}`
    });
  }

  return findings;
}

export class ValidateDependencyVulnerabilitiesAuditor extends BaseAuditor<DependencyVulnerabilitiesRuleId> {
  constructor(options: { projectRoot?: string } = {}) {
    super({
      usesThirdPartyTool: true,
      requiredPermissions: ['--allow-child-process'],
      thirdPartyToolPolicy: {
        toolName: 'npm audit',
        fallbackBehavior: 'throw'
      },
      projectRoot: options.projectRoot,
      ruleCapabilities: createRuleCapabilities(DEPENDENCY_VULNERABILITIES_RULES, {
        speed: ['heavy', 'full'],
        phase: 'setup',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_dependency_vulnerabilities',
      name: 'Dependency Vulnerabilities & CVE Auditor',
      description: 'Detects vulnerabilities and CVE security advisories',
      family: 'architecture',
      packageName: 'Dependencies',
      icon: '🛡️',
      ruleIds: DEPENDENCY_VULNERABILITIES_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(DEPENDENCY_VULNERABILITIES_RULES, 'hygiene'),
      ruleDescriptions: {
        'dependency-cve-critical': 'Critical vulnerability in package',
        'dependency-cve-high': 'High vulnerability in package',
        'dependency-cve-moderate': 'Moderate vulnerability detected'
      },
      ruleRemediations: {
        'dependency-cve-critical':
          '1. Root Cause:\n' +
          'A critical security vulnerability (CVE with CVSS score >= 9.0) was detected in one of the dependencies installed in node_modules.\n' +
          'Critical vulnerabilities typically allow remote code execution (RCE), unauthorized privilege escalation, or complete environment compromise.\n\n' +
          '2. Diagnosis:\n' +
          'The violation message reports the vulnerable package name, the GitHub Advisory / CVE URL, and the affected dependency chain.\n\n' +
          '3. Canonical Solution:\n' +
          '1. Run "npm audit" to inspect the detailed security report.\n' +
          '2. If a safe patch is available, run "npm audit fix".\n' +
          '3. If the vulnerability originates from a direct dependency, update it in package.json to a secure release ("npm install <package>@latest").\n' +
          '4. If confirmed as a false positive in an isolated, non-risky environment, register it explicitly in "config.dependencyVulnerabilities.allowList" in .auditor/audit.config.ts after human review.\n\n' +
          '4. Example / Auto-fix command:\n' +
          'npm audit fix',
        'dependency-cve-high':
          '1. Root Cause:\n' +
          'A high severity vulnerability (CVSS 7.0 - 8.9) was detected in project dependencies.\n' +
          'Common causes include Regular Expression Denial of Service (ReDoS), Cross-Site Scripting (XSS), or authentication bypass in third-party libraries.\n\n' +
          '2. Diagnosis:\n' +
          'Review the advisory URL provided in the violation message.\n\n' +
          '3. Canonical Solution:\n' +
          '1. Run "npm audit fix" to safely update to semver-compatible patched versions.\n' +
          '2. Upgrade the top-level dependency that introduces the vulnerable package.\n\n' +
          '4. Example / Auto-fix command:\n' +
          'npm audit fix',
        'dependency-cve-moderate':
          '1. Root Cause:\n' +
          'A moderate severity vulnerability (CVSS 4.0 - 6.9) was detected in installed dependencies.\n\n' +
          '2. Diagnosis:\n' +
          'Check the package and the recommended patched version in the npm audit advisory.\n\n' +
          '3. Canonical Solution:\n' +
          '1. Run "npm audit fix" or update the affected package with "npm update <package>".\n' +
          '2. In environments gated strictly on critical issues, configure "config.dependencyVulnerabilities.failOn" to "critical" or "high" in .auditor/audit.config.ts.\n\n' +
          '4. Example / Auto-fix command:\n' +
          'npm audit fix'
      },
      coverage: {
        include: ['package.json', 'package-lock.json']
      },
      configKey: 'dependencyVulnerabilities.enabled',
      defaultConfig: { enabled: true, failOn: 'critical' },
      criticalConfig: {}
    });
  }

  public override async runAudit(): Promise<void> {
    if (this.isSuiteGatingDisabled('Dependency vulnerability audit disabled')) {
      return;
    }

    const pkgJsonRelative = 'package.json';
    if (fs.existsSync(path.resolve(this.projectRoot, pkgJsonRelative))) {
      this.recordScanned(pkgJsonRelative);
    }
    const lockfileRelative = 'package-lock.json';
    if (fs.existsSync(path.resolve(this.projectRoot, lockfileRelative))) {
      this.recordScanned(lockfileRelative);
    }

    const config = getAuditConfig(this.projectRoot);
    const omitDev = !config.dependencyVulnerabilities?.includeDev;
    const failOn = config.dependencyVulnerabilities?.failOn ?? 'critical';
    const allowList = new Set(config.dependencyVulnerabilities?.allowList ?? []);
    const tier = this.getExecutionTier();

    const cacheDir = path.resolve(this.projectRoot, 'scratch/audits/architecture');
    const cacheFile = path.join(cacheDir, 'npm_audit_cache.json');
    const lockfilePath = path.resolve(this.projectRoot, lockfileRelative);
    let lockfileHash = '';
    if (fs.existsSync(lockfilePath)) {
      try {
        lockfileHash = crypto
          .createHash('sha256')
          .update(fs.readFileSync(lockfilePath, 'utf-8'))
          .digest('hex');
      } catch {
        // catch-ok: fallback to unhashed execution
      }
    }

    if (tier !== 'full' && lockfileHash && fs.existsSync(cacheFile)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8')) as {
          hash: string;
          findings: AuditFinding[];
        };
        if (cached.hash === lockfileHash && Array.isArray(cached.findings)) {
          this.context.logProgress(
            '⚡ Reusing cached vulnerability report (unchanged package-lock.json)'
          );
          this.applyAuditFindings(cached.findings);
          return;
        }
      } catch {
        // catch-ok: corrupt cache, fallback to live audit
      }
    }

    const { stdout, error } = runNpmAudit(this.projectRoot, omitDev);
    if (error || !stdout) {
      // catch-ok: Offline development environment or network lookup failure
      this.context.logProgress(
        '⚠️  Could not connect to npm registry for audit (offline mode)'
      );
      for (const ruleId of DEPENDENCY_VULNERABILITIES_RULES) {
        this.runSubAuditorSync(ruleId, () => {
          this.markRuleNotApplicable(ruleId, 'No connection to npm registry (offline)');
        });
      }
      return;
    }

    let report: NpmAuditReport;
    try {
      report = JSON.parse(stdout);
    } catch {
      throw new Error(
        `[validate_dependency_vulnerabilities] Failed to parse JSON output from 'npm audit'. ` +
          `Received output: ${stdout.trim().slice(0, 300)}`
      );
    }

    const findings = parseNpmAuditReport(report, allowList, failOn);
    if (lockfileHash) {
      try {
        fs.mkdirSync(cacheDir, { recursive: true });
        fs.writeFileSync(
          cacheFile,
          JSON.stringify({ hash: lockfileHash, findings }, null, 2),
          'utf-8'
        );
      } catch {
        // catch-ok: write failure in restricted filesystem
      }
    }

    this.applyAuditFindings(findings);
  }

  private applyAuditFindings(findings: readonly AuditFinding[]): void {
    for (const ruleId of DEPENDENCY_VULNERABILITIES_RULES) {
      this.runSubAuditorSync(ruleId, () => {
        const matching = findings.filter((f) => f.ruleId === ruleId);
        for (const f of matching) {
          this.addViolation({
            ruleId: f.ruleId as DependencyVulnerabilitiesRuleId,
            severity: f.severity,
            file: f.file ?? 'package-lock.json',
            line: f.line ?? 1,
            context: f.context ?? f.ruleId,
            message: f.message
          });
        }
      });
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateDependencyVulnerabilitiesAuditor());

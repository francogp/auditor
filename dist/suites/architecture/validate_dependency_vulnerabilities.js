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
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, createRuleCapabilities } from "../../core/auditorBase.js";
import { getAuditConfig } from "../../core/auditConfig.js";
enableCompileCache();
const NPM_AUDIT_TIMEOUT_MS = 30_000;
const NPM_AUDIT_MAX_BUFFER_BYTES = 10_485_760;
export const DEPENDENCY_VULNERABILITIES_RULES = [
    'dependency-cve-critical',
    'dependency-cve-high',
    'dependency-cve-moderate'
];
/**
 * Invokes npm audit --json synchronously with bounded timeout and safe error capture.
 */
export function runNpmAudit(projectRoot, omitDev = true) {
    const args = ['audit', '--json'];
    if (omitDev) {
        args.push('--omit=dev');
    }
    try {
        const stdout = childProcess.execFileSync('npm', args, {
            cwd: projectRoot,
            encoding: 'utf-8',
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: NPM_AUDIT_TIMEOUT_MS,
            maxBuffer: NPM_AUDIT_MAX_BUFFER_BYTES
        });
        return { stdout };
    }
    catch (err) {
        const execErr = err;
        if (typeof execErr.stdout === 'string' && execErr.stdout.trim().startsWith('{')) {
            return { stdout: execErr.stdout };
        }
        return { stdout: '', error: err instanceof Error ? err : new Error(String(err)) };
    }
}
function mapSeverityToRuleId(sev) {
    if (sev === 'critical')
        return 'dependency-cve-critical';
    if (sev === 'high')
        return 'dependency-cve-high';
    if (sev === 'moderate')
        return 'dependency-cve-moderate';
    return null;
}
function computeFindingSeverity(sev, failOn) {
    if (failOn === 'critical') {
        return sev === 'critical' ? 'error' : 'warning';
    }
    if (failOn === 'high') {
        return sev === 'critical' || sev === 'high' ? 'error' : 'warning';
    }
    return 'error';
}
function extractAdvisoryDetails(vuln, pkgName) {
    const advisory = vuln.via.find((v) => typeof v !== 'string');
    const title = advisory?.title ?? `Aviso de seguridad ${vuln.severity} en ${pkgName}`;
    const url = advisory?.url ? ` (${advisory.url})` : '';
    return { title, url };
}
/**
 * Parses npm audit JSON into canonical AuditFindings.
 */
export function parseNpmAuditReport(json, allowList, failOn = 'critical') {
    const findings = [];
    const vulns = json.vulnerabilities ?? {};
    for (const [pkgName, vuln] of Object.entries(vulns)) {
        if (allowList.has(pkgName))
            continue;
        const ruleId = mapSeverityToRuleId(vuln.severity);
        if (!ruleId)
            continue;
        const findingSeverity = computeFindingSeverity(vuln.severity, failOn);
        const { title, url } = extractAdvisoryDetails(vuln, pkgName);
        findings.push({
            suiteId: 'validate_dependency_vulnerabilities',
            suiteName: 'Dependency Vulnerabilities & CVE Auditor',
            ruleId,
            ruleDescription: 'Dependencias: Vulnerabilidad CVE detectada',
            severity: findingSeverity,
            file: 'package-lock.json',
            line: 1,
            context: pkgName,
            message: `[${vuln.severity.toUpperCase()}] ${pkgName}: ${title}${url}`
        });
    }
    return findings;
}
export class ValidateDependencyVulnerabilitiesAuditor extends BaseAuditor {
    constructor(options = {}) {
        super({
            usesThirdPartyTool: true,
            thirdPartyToolPolicy: {
                toolName: "npm audit",
                fallbackBehavior: "throw"
            },
            projectRoot: options.projectRoot,
            ruleCapabilities: createRuleCapabilities(DEPENDENCY_VULNERABILITIES_RULES, {
                speed: ['heavy', 'full'],
                phase: 'normal',
                fix: 'none',
                md: false,
                ast: false,
                changedOnly: false,
                critical: false
            }),
            id: 'validate_dependency_vulnerabilities',
            name: 'Dependency Vulnerabilities & CVE Auditor',
            description: 'Detecta vulnerabilidades y avisos de seguridad CVE',
            family: 'architecture',
            packageName: 'Dependencias',
            icon: '🛡️',
            ruleIds: DEPENDENCY_VULNERABILITIES_RULES,
            ruleDescriptions: {
                'dependency-cve-critical': 'Vulnerabilidad crítica en paquete',
                'dependency-cve-high': 'Vulnerabilidad de severidad alta',
                'dependency-cve-moderate': 'Vulnerabilidad moderada detectada'
            },
            ruleRemediations: {
                'dependency-cve-critical': 'Guía de diagnóstico y remediación para dependency-cve-critical. Revisa la incidencia detectada y ajusta el código correspondiente.',
                'dependency-cve-high': 'Guía de diagnóstico y remediación para dependency-cve-high. Revisa la incidencia detectada y ajusta el código correspondiente.',
                'dependency-cve-moderate': 'Guía de diagnóstico y remediación para dependency-cve-moderate. Revisa la incidencia detectada y ajusta el código correspondiente.',
            },
            coverage: {
                include: ['package.json', 'package-lock.json']
            },
            configKey: 'dependencyVulnerabilities.enabled',
            defaultConfig: { enabled: true, failOn: 'critical' },
            criticalConfig: {},
        });
    }
    async runAudit() {
        if (this.isSuiteGatingDisabled('Auditoría de vulnerabilidades de dependencias desactivada')) {
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
                lockfileHash = crypto.createHash('sha256').update(fs.readFileSync(lockfilePath, 'utf-8')).digest('hex');
            }
            catch {
                // catch-ok: fallback to unhashed execution
            }
        }
        if (tier !== 'full' && lockfileHash && fs.existsSync(cacheFile)) {
            try {
                const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
                if (cached.hash === lockfileHash && Array.isArray(cached.findings)) {
                    this.context.logProgress('⚡ Reutilizando reporte de vulnerabilidades auditado (package-lock.json sin cambios)');
                    this.applyAuditFindings(cached.findings);
                    return;
                }
            }
            catch {
                // catch-ok: corrupt cache, fallback to live audit
            }
        }
        const { stdout, error } = runNpmAudit(this.projectRoot, omitDev);
        if (error || !stdout) {
            // catch-ok: Offline development environment or network lookup failure
            this.context.logProgress('⚠️  No se pudo conectar con el registro npm para audit (modo offline)');
            for (const ruleId of DEPENDENCY_VULNERABILITIES_RULES) {
                this.runSubAuditorSync(ruleId, () => {
                    this.markRuleNotApplicable(ruleId, 'Sin conexión con registro npm (offline)');
                });
            }
            return;
        }
        let report;
        try {
            report = JSON.parse(stdout);
        }
        catch {
            throw new Error(`[validate_dependency_vulnerabilities] Error al interpretar la salida JSON de 'npm audit'. ` +
                `Salida recibida: ${stdout.trim().slice(0, 300)}`);
        }
        const findings = parseNpmAuditReport(report, allowList, failOn);
        if (lockfileHash) {
            try {
                fs.mkdirSync(cacheDir, { recursive: true });
                fs.writeFileSync(cacheFile, JSON.stringify({ hash: lockfileHash, findings }, null, 2), 'utf-8');
            }
            catch {
                // catch-ok: write failure in restricted filesystem
            }
        }
        this.applyAuditFindings(findings);
    }
    applyAuditFindings(findings) {
        for (const ruleId of DEPENDENCY_VULNERABILITIES_RULES) {
            this.runSubAuditorSync(ruleId, () => {
                const matching = findings.filter(f => f.ruleId === ruleId);
                for (const f of matching) {
                    this.addViolation({
                        ruleId: f.ruleId,
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
//# sourceMappingURL=validate_dependency_vulnerabilities.js.map
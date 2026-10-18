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
  const title = advisory?.title ?? `Aviso de seguridad ${vuln.severity} en ${pkgName}`;
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

export class ValidateDependencyVulnerabilitiesAuditor extends BaseAuditor<DependencyVulnerabilitiesRuleId> {
  constructor(options: { projectRoot?: string } = {}) {
    super({
      usesThirdPartyTool: true,
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
      description: 'Detecta vulnerabilidades y avisos de seguridad CVE',
      family: 'architecture',
      packageName: 'Dependencias',
      icon: '🛡️',
      ruleIds: DEPENDENCY_VULNERABILITIES_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(DEPENDENCY_VULNERABILITIES_RULES, 'hygiene'),
      ruleDescriptions: {
        'dependency-cve-critical': 'Vulnerabilidad crítica en paquete',
        'dependency-cve-high': 'Vulnerabilidad de severidad alta',
        'dependency-cve-moderate': 'Vulnerabilidad moderada detectada'
      },
      ruleRemediations: {
        'dependency-cve-critical':
          'Causa Raíz:\n' +
          'Se detectó una vulnerabilidad de seguridad crítica (CVE con puntuación CVSS >= 9.0) en una de las dependencias instaladas en el árbol de node_modules.\n' +
          'Las vulnerabilidades críticas habitualmente permiten ejecución remota de código (RCE), elevación de privilegios no autorizada o secuestro completo del entorno.\n\n' +
          'Diagnóstico:\n' +
          'El mensaje reporta el nombre del paquete vulnerable, la ruta del aviso de seguridad de GitHub Advisory / CVE y la cadena de dependencias afectadas.\n\n' +
          'Solución Canónica:\n' +
          '1. Ejecuta "npm audit" para inspeccionar el informe detallado de npm.\n' +
          '2. Si existe un parche seguro disponible, ejecuta "npm audit fix".\n' +
          '3. Si la vulnerabilidad proviene de una dependencia directa, actualízala en package.json a una versión no vulnerable ("npm install <paquete>@latest").\n' +
          '4. Si se confirma como falso positivo o entorno estrictamente aislado y sin riesgo, regístralo explícitamente en "config.dependencyVulnerabilities.allowList" en .auditor/audit.config.ts tras aprobación humana.',
        'dependency-cve-high':
          'Causa Raíz:\n' +
          'Se detectó una vulnerabilidad de severidad alta (CVSS 7.0 - 8.9) en las dependencias del proyecto.\n' +
          'Generalmente corresponde a denegación de servicio (ReDoS), Cross-Site Scripting (XSS) o bypass de autenticación en librerías utilizadas.\n\n' +
          'Diagnóstico:\n' +
          'Revisa el advisory URL provisto en el mensaje de error.\n\n' +
          'Solución Canónica:\n' +
          '1. Ejecuta "npm audit fix" para actualizar de forma segura a versiones con parche compatible.\n' +
          '2. Actualiza la dependencia principal que introduce la librería vulnerable.',
        'dependency-cve-moderate':
          'Causa Raíz:\n' +
          'Se detectó una vulnerabilidad de severidad moderada (CVSS 4.0 - 6.9) en dependencias instaladas.\n\n' +
          'Diagnóstico:\n' +
          'Revisa el paquete y la versión parcheada recomendada en el aviso de npm audit.\n\n' +
          'Solución Canónica:\n' +
          '1. Ejecuta "npm audit fix" o actualiza el paquete afectado mediante "npm update <paquete>".\n' +
          '2. En entornos donde solo se bloquee ante fallos críticos, se puede calibrar "config.dependencyVulnerabilities.failOn" a "critical" o "high" en .auditor/audit.config.ts.'
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
            '⚡ Reutilizando reporte de vulnerabilidades auditado (package-lock.json sin cambios)'
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
        '⚠️  No se pudo conectar con el registro npm para audit (modo offline)'
      );
      for (const ruleId of DEPENDENCY_VULNERABILITIES_RULES) {
        this.runSubAuditorSync(ruleId, () => {
          this.markRuleNotApplicable(ruleId, 'Sin conexión con registro npm (offline)');
        });
      }
      return;
    }

    let report: NpmAuditReport;
    try {
      report = JSON.parse(stdout);
    } catch {
      throw new Error(
        `[validate_dependency_vulnerabilities] Error al interpretar la salida JSON de 'npm audit'. ` +
          `Salida recibida: ${stdout.trim().slice(0, 300)}`
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

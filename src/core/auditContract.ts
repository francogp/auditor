/**
 * packages/auditor/src/core/auditContract.ts
 * 
 * STANDARD AUDIT CONTRACT (Node.js 26+)
 * Defines the immutable data structures, family types, and standard outputs
 * required for all sub-auditors and the general audit orchestrator.
 */

import path from 'node:path';
import {
  getAuditConfig,
  DEFAULT_MAX_AUDIT_STALENESS_MINUTES,
  type CustomAuditFamilyConfig,
  type AuditEngineConfig
} from './auditConfig.ts';

export const BUILTIN_AUDIT_FAMILIES = [
  'architecture',
  'domain_data',
  'persistence',
  'documentation'
] as const;

export const AUDIT_FAMILIES = [
  'architecture',
  'domain_data',
  'persistence',
  'documentation'
] as const;

export type BuiltinAuditFamily = (typeof BUILTIN_AUDIT_FAMILIES)[number];
export type AuditFamily = BuiltinAuditFamily | (string & {});

export interface FamilyMetadata {
  key: string;
  title: string;
  order: number;
  icon: string;
  description: string;
}

export const FAMILY_METADATA: Record<string, FamilyMetadata> = {
  architecture: {
    key: 'architecture',
    title: 'ESTÁNDARES ESTÁTICOS, AST Y ARQUITECTURA',
    order: 1,
    icon: '📁',
    description: 'Reglas de calidad de código, AST, Fallow intelligence y dependencias.'
  },
  domain_data: {
    key: 'domain_data',
    title: 'TIPOS DE DOMINIO Y BASES DE DATOS CANÓNICAS',
    order: 2,
    icon: '🔒',
    description: 'Validación de tipos de dominio estrictos (/domain-type-first), cuadros tarifarios y fórmulas.'
  },
  persistence: {
    key: 'persistence',
    title: 'PERSISTENCIA, SQL Y MIGRACIONES',
    order: 3,
    icon: '💾',
    description: 'Integridad sintáctica de migraciones PostgreSQL/Supabase/SQLite y políticas RLS.'
  },
  documentation: {
    key: 'documentation',
    title: 'DOCUMENTACIÓN Y ESTRUCTURA DOX',
    order: 4,
    icon: '📚',
    description: 'Integridad de enlaces relativos en markdown e índices DOX (AGENTS.md).'
  }
};

export const DEFAULT_CUSTOM_FAMILY_ORDER = 90;
export const FALLBACK_FAMILY_ORDER = 99;

export function resolveFamilyMetadata(familyKey: string, customFamilies?: readonly CustomAuditFamilyConfig[]): FamilyMetadata {
  if (FAMILY_METADATA[familyKey]) {
    return FAMILY_METADATA[familyKey]!;
  }
  const custom = customFamilies?.find(f => f.key === familyKey);
  if (custom) {
    return {
      key: custom.key,
      title: custom.title,
      order: custom.order ?? DEFAULT_CUSTOM_FAMILY_ORDER,
      icon: custom.icon ?? '⚙️',
      description: custom.description ?? `Validaciones específicas de la familia ${custom.key}.`
    };
  }
  return {
    key: familyKey,
    title: familyKey.toUpperCase(),
    order: FALLBACK_FAMILY_ORDER,
    icon: '⚙️',
    description: `Familia de auditoría ${familyKey}.`
  };
}

export function getActiveFamilies(customFamilies?: readonly CustomAuditFamilyConfig[]): readonly string[] {
  const customKeys = (customFamilies ?? []).map(f => f.key);
  return Array.from(new Set([...AUDIT_FAMILIES, ...customKeys]));
}

export type FindingSeverity = 'error' | 'warning' | 'info';

export interface AuditFinding {
  severity: FindingSeverity;
  message: string;
  file?: string;
  line?: number;
  col?: number;
  ruleId?: string;
  ruleDescription?: string;
  suiteId?: string;
  suiteName?: string;
  context?: string;
}

export const AUDIT_STATUSES = ['passed', 'failed', 'skipped'] as const;
export type AuditExecutionStatus = (typeof AUDIT_STATUSES)[number];

export interface SubAuditorStep {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
}

export interface SubAuditorReport {
  readonly id: string;
  readonly name: string;
  readonly status: 'passed' | 'warning' | 'failed';
  readonly count: number;
  readonly detail?: string;
}

export interface ICompositeAuditor {
  getSubAuditors(): readonly SubAuditorStep[];
}

export interface StandardAuditResult {
  id: string;
  name: string;
  description: string;
  family: AuditFamily;
  status: AuditExecutionStatus;
  durationMs: number;
  metrics: Record<string, number | string>;
  findings: AuditFinding[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
    totalFilesScanned?: number;
  };
  subAuditors?: readonly SubAuditorReport[];
  isBuiltin?: boolean;
  icon?: string;
}

export interface AuditorCapabilities {
  /** Whether the sub-auditor implements automated repairs when invoked with --fix */
  readonly fix: boolean;
  /** Whether the sub-auditor participates in the fast lint preset runs (preset=lint / npm run audit:lint) */
  readonly lint: boolean;
  /** Whether the sub-auditor participates in the markdown/documentation preset runs (preset=md / npm run audit:md) */
  readonly md: boolean;
  /** Whether the sub-auditor requires the shared in-memory TypeScript AST context */
  readonly ast: boolean;
  /** Whether the sub-auditor supports incremental git diff scoping via --changed-since */
  readonly changedSince: boolean;
  /** Whether the sub-auditor is computationally heavy or resource-intensive (e.g. vector ML, type check) */
  readonly heavy: boolean;
  /** Whether the sub-auditor requires pre-compiled production artifacts in dist/ */
  readonly requiresBuild: boolean;
}

export interface GitIgnoreRequirement {
  readonly id: string;
  readonly pattern: string;
  readonly samplePath?: string;
  readonly reason: string;
  readonly isApplicable?: (config: AuditEngineConfig) => boolean;
}

export interface AuditTaskDefinition {
  id: string;
  name: string;
  description?: string;
  family: AuditFamily;
  scriptPath: string;
  command: string;
  args: string[];
  fast?: boolean;
  order?: number;
  timeoutMs?: number;
  shell?: boolean;
  requiresAst?: boolean;
  isBuiltin?: boolean;
  icon?: string;
  capabilities?: AuditorCapabilities;
  gitIgnoreEntries?: readonly GitIgnoreRequirement[];
}

export interface AuditTaskDescriptor {
  id?: string;
  name?: string;
  family?: AuditFamily;
  fast?: boolean;
  order?: number;
  timeoutMs?: number;
  permissions?: string[];
  extraArgs?: string[];
  requiresAst?: boolean;
  capabilities?: AuditorCapabilities;
}

export type AuditRunMode = 'full' | 'preset' | 'family' | 'suites' | 'single';

export interface AuditRunMetadata {
  version: string;
  timestamp: string;
  isFullAudit: boolean;
  runMode: AuditRunMode;
  preset: string | null;
  targetFamily: string | null;
  totalDiscoveredSuites: number;
  executedSuiteCount: number;
  executedSuites: string[];
  omittedSuites: string[];
  skipSimilar?: boolean;
  environment: {
    nodeVersion: string;
    platform: string;
    cwd: string;
  };
}

export interface AuditFileSummary {
  file: string;
  errors: number;
  warnings: number;
  findings: AuditFinding[];
}

export interface AuditByFileReport {
  meta: AuditRunMetadata;
  status: AuditExecutionStatus;
  summary: ConsolidatedAuditReport['summary'];
  totalAffectedFiles: number;
  files: Record<string, AuditFileSummary>;
}

export interface ConsolidatedAuditReport {
  meta: AuditRunMetadata;
  status: AuditExecutionStatus;
  summary: {
    totalViolations: number;
    errors: number;
    warnings: number;
    suitesTotal: number;
    suitesPassed: number;
    suitesFailed: number;
    durationMs: number;
  };
  families: Record<AuditFamily, {
    title: string;
    suites: StandardAuditResult[];
  }>;
  allFindings: AuditFinding[];
  findingsByFile?: Record<string, AuditFinding[]>;
}

/**
 * Normalizes a file path from an AuditFinding into a clean relative POSIX path.
 */
export function normalizeFindingPath(filePath?: string, cwd: string = process.cwd()): string {
  if (!filePath) return 'General';
  const rel = path.isAbsolute(filePath) ? path.relative(cwd, filePath) : filePath;
  return rel.split(path.sep).join(path.posix.sep).replace(/^[\\/]+/, '') || 'General';
}

/**
 * Stably sorts an array of AuditFinding instances by:
 * 1. Normalized relative file path (case-insensitive ASC)
 * 2. Line number (ASC, missing/undefined at top = 0)
 * 3. Column number (ASC)
 * 4. Severity ('error' first, then 'warning')
 * 5. Rule ID (ASC)
 */
export function sortFindingsByFileAndLine(findings: readonly AuditFinding[], cwd: string = process.cwd()): AuditFinding[] {
  return [...findings].sort((a, b) => {
    const fileA = normalizeFindingPath(a.file, cwd).toLowerCase();
    const fileB = normalizeFindingPath(b.file, cwd).toLowerCase();
    if (fileA !== fileB) {
      return fileA.localeCompare(fileB);
    }
    const lineA = a.line ?? 0;
    const lineB = b.line ?? 0;
    if (lineA !== lineB) {
      return lineA - lineB;
    }
    const colA = a.col ?? 0;
    const colB = b.col ?? 0;
    if (colA !== colB) {
      return colA - colB;
    }
    const sevScoreA = a.severity === 'error' ? 0 : 1;
    const sevScoreB = b.severity === 'error' ? 0 : 1;
    if (sevScoreA !== sevScoreB) {
      return sevScoreA - sevScoreB;
    }
    return (a.ruleId ?? '').localeCompare(b.ruleId ?? '');
  });
}

/**
 * Groups an array of AuditFindings into a map indexed by normalized relative file path,
 * where findings within each file are guaranteed sorted by line number ascending.
 */
export function groupFindingsByFileMap(findings: readonly AuditFinding[], cwd: string = process.cwd()): Record<string, AuditFileSummary> {
  const sorted = sortFindingsByFileAndLine(findings, cwd);
  const map: Record<string, AuditFileSummary> = {};
  for (const f of sorted) {
    const norm = normalizeFindingPath(f.file, cwd);
    if (!map[norm]) {
      map[norm] = {
        file: norm,
        errors: 0,
        warnings: 0,
        findings: []
      };
    }
    if (f.severity === 'error') {
      map[norm].errors++;
    } else {
      map[norm].warnings++;
    }
    map[norm].findings.push(f);
  }
  return map;
}

export const ONE_MINUTE_MS = 60000;
export const MAX_AUDIT_STALENESS_MS = DEFAULT_MAX_AUDIT_STALENESS_MINUTES * ONE_MINUTE_MS;

export interface AssertAuditorOptions {
  maxAgeMs?: number;
  allowStale?: boolean;
  projectRoot?: string;
}

function assertAuditFreshness(
  meta: ConsolidatedAuditReport['meta'],
  consumerName: string,
  options: AssertAuditorOptions
): void {
  if (options.allowStale) return;
  const config = getAuditConfig(options.projectRoot);
  const configuredMinutes = config.runner?.maxStalenessMinutes ?? DEFAULT_MAX_AUDIT_STALENESS_MINUTES;
  const maxAge = options.maxAgeMs ?? (configuredMinutes * ONE_MINUTE_MS);
  try {
    const auditInstant = Temporal.Instant.from(meta.timestamp);
    const now = Temporal.Now.instant();
    const elapsedMs = now.since(auditInstant).total({ unit: 'millisecond' });
    if (elapsedMs > maxAge) {
      const elapsedMins = Math.max(1, Math.round(now.since(auditInstant).total({ unit: 'minute' })));
      const limitMins = Math.round(maxAge / ONE_MINUTE_MS);
      throw new Error(
        `[${consumerName}] scratch/audits/latest_audit.json está OBSOLETO (${elapsedMins} minutos de antigüedad, límite: ${limitMins} min). ` +
        `El código fuente puede haber cambiado desde la última auditoría. 👉 DEBES ejecutar 'npm run audit' para refrescar el reporte.`
      );
    }
  } catch (err) {
    if ((err as Error).message.includes('OBSOLETO')) throw err;
    throw new Error(
      `[${consumerName}] scratch/audits/latest_audit.json contiene un timestamp inválido ('${meta.timestamp}'). Ejecuta 'npm run audit' para regenerarlo.`,
      { cause: err }
    );
  }
}

function assertAuditSuiteExecuted(
  meta: ConsolidatedAuditReport['meta'],
  requiredSuiteId: string,
  consumerName: string
): void {
  const wasExecuted = Array.isArray(meta.executedSuites) && meta.executedSuites.includes(requiredSuiteId);
  const wasOmitted = Array.isArray(meta.omittedSuites) && meta.omittedSuites.includes(requiredSuiteId);

  if (!wasExecuted || wasOmitted) {
    const modeDesc = meta.runMode === 'preset' ? `preset=${meta.preset}` : (meta.runMode === 'family' ? `family=${meta.targetFamily}` : meta.runMode);
    throw new Error(
      `[${consumerName}] La suite requerida '${requiredSuiteId}' NO fue ejecutada en la última auditoría. ` +
      `latest_audit.json fue generado por una corrida PARCIAL (${modeDesc}, ${meta.executedSuiteCount}/${meta.totalDiscoveredSuites} suites ejecutadas). ` +
      `👉 DEBES ejecutar 'npm run audit' (completo) o 'npm run audit task=${requiredSuiteId}' para obtener datos válidos.`
    );
  }
}

/**
 * Asserts that a required auditor was executed in the consolidated audit report
 * and that the report is fresh (generated within the last 5 minutes).
 * Throws a fatal descriptive error if the audit is partial, the suite was omitted,
 * or the report is stale.
 */
export function assertAuditorExecuted(
  report: Partial<ConsolidatedAuditReport> | null | undefined,
  requiredSuiteId: string,
  consumerName: string,
  options: AssertAuditorOptions = {}
): void {
  if (!report || !report.meta) {
    throw new Error(
      `[${consumerName}] scratch/audits/latest_audit.json no contiene la cabecera de metadatos 'meta'. ` +
      `Es posible que provenga de una versión obsoleta o esté corrupto. Ejecuta 'npm run audit' para regenerarlo.`
    );
  }

  assertAuditFreshness(report.meta as ConsolidatedAuditReport['meta'], consumerName, options);
  assertAuditSuiteExecuted(report.meta as ConsolidatedAuditReport['meta'], requiredSuiteId, consumerName);
}

export function groupResultsByFamily(
  results: readonly StandardAuditResult[],
  initialFamilies?: readonly AuditFamily[]
): Map<AuditFamily, StandardAuditResult[]> {
  const byFamily = new Map<AuditFamily, StandardAuditResult[]>();
  if (initialFamilies) {
    for (const f of initialFamilies) byFamily.set(f, []);
  }
  for (const r of results) {
    if (!byFamily.has(r.family)) byFamily.set(r.family, []);
    byFamily.get(r.family)!.push(r);
  }
  return byFamily;
}


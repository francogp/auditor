/**
 * packages/auditor/src/core/auditContract.ts
 * 
 * STANDARD AUDIT CONTRACT (Node.js 26+)
 * Defines the immutable data structures, family types, and standard outputs
 * required for all sub-auditors and the general audit orchestrator.
 */

import type { CustomAuditFamilyConfig } from './auditConfig.ts';

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

export function resolveFamilyMetadata(familyKey: string, customFamilies?: readonly CustomAuditFamilyConfig[]): FamilyMetadata {
  if (FAMILY_METADATA[familyKey]) {
    return FAMILY_METADATA[familyKey]!;
  }
  const custom = customFamilies?.find(f => f.key === familyKey);
  if (custom) {
    return {
      key: custom.key,
      title: custom.title,
      order: custom.order ?? 90,
      icon: custom.icon ?? '⚙️',
      description: custom.description ?? `Validaciones específicas de la familia ${custom.key}.`
    };
  }
  return {
    key: familyKey,
    title: familyKey.toUpperCase(),
    order: 99,
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
  ruleId?: string;
  ruleDescription?: string;
  suiteId?: string;
  suiteName?: string;
  context?: string;
}

export const AUDIT_STATUSES = ['passed', 'failed'] as const;
export type AuditExecutionStatus = (typeof AUDIT_STATUSES)[number];

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
  environment: {
    nodeVersion: string;
    platform: string;
    cwd: string;
  };
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
}

export const MAX_AUDIT_STALENESS_MS = 5 * 60 * 1000; // 5 minutes

export interface AssertAuditorOptions {
  maxAgeMs?: number;
  allowStale?: boolean;
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

  const { meta } = report;

  // 1. Anti-Staleness Check (Max 5 minutes)
  if (!options.allowStale) {
    const maxAge = options.maxAgeMs ?? MAX_AUDIT_STALENESS_MS;
    try {
      const auditInstant = Temporal.Instant.from(meta.timestamp);
      const now = Temporal.Now.instant();
      const elapsedMs = now.since(auditInstant).total({ unit: 'millisecond' });
      if (elapsedMs > maxAge) {
        const elapsedMins = Math.max(1, Math.round(now.since(auditInstant).total({ unit: 'minute' })));
        const limitMins = Math.round(maxAge / (60 * 1000));
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

  // 2. Execution & Omission Check
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

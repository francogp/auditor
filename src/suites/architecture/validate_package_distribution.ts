import fs from 'node:fs';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { enableCompileCache } from 'node:module';
import { publint, type Message } from 'publint';
import { formatMessage } from 'publint/utils';
import { BaseAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import type { AuditFinding } from '../../core/auditContract.ts';

enableCompileCache();

export type PackageDistributionRuleId =
  | 'pkg-distribution-invalid-exports'
  | 'pkg-distribution-missing-types'
  | 'pkg-distribution-dual-package-hazard';

export const PACKAGE_DISTRIBUTION_RULES: readonly PackageDistributionRuleId[] = [
  'pkg-distribution-invalid-exports',
  'pkg-distribution-missing-types',
  'pkg-distribution-dual-package-hazard'
] as const;

export type PublintMessageLike = Message;

/**
 * Maps a publint message code to a canonical PackageDistributionRuleId.
 */
export function mapPublintCodeToRuleId(code: string): PackageDistributionRuleId {
  const upper = code.toUpperCase();
  if (upper.includes('TYPES')) {
    return 'pkg-distribution-missing-types';
  }
  if (upper.includes('DUAL') || upper.includes('CJS') || upper.includes('ESM')) {
    return 'pkg-distribution-dual-package-hazard';
  }
  return 'pkg-distribution-invalid-exports';
}

export type PublintPkg = Parameters<typeof formatMessage>[1];

/**
 * Parses publint messages into canonical AuditFindings.
 */
export function parsePublintMessages(
  messages: readonly PublintMessageLike[],
  pkg: PublintPkg,
  _projectRoot: string = process.cwd()
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const msg of messages) {
    if (msg.type !== 'error' && msg.type !== 'warning') {
      continue;
    }

    const ruleId = mapPublintCodeToRuleId(msg.code);
    let formatted: string;
    try {
      formatted = formatMessage(msg, pkg) ?? '';
    } catch {
      formatted = `${msg.code}: ${JSON.stringify(msg.args ?? {})}`;
    }
    const cleanMessage = stripVTControlCharacters(formatted).trim();

    findings.push({
      suiteId: 'validate_package_distribution',
      suiteName: 'Package Distribution & Exports Hygiene Auditor',
      ruleId,
      ruleDescription: 'Distribución: Export map o tipos inválidos',
      severity: msg.type === 'error' ? 'error' : 'warning',
      file: 'package.json',
      line: 1,
      context: msg.code,
      message: cleanMessage || `Error de empaquetado en exports: ${msg.code}`
    });
  }

  return findings;
}

export class ValidatePackageDistributionAuditor extends BaseAuditor<PackageDistributionRuleId> {
  constructor(options: { projectRoot?: string } = {}) {
    const effectiveRoot = options.projectRoot ?? process.cwd();
    super({
      capabilities: { requiresBuild: true },
      id: 'validate_package_distribution',
      name: 'Package Distribution & Exports Hygiene Auditor',
      description: 'Valida export maps y tipos .d.ts de distribución',
      family: 'architecture',
      packageName: 'Distribución',
      icon: '📦',
      ruleIds: PACKAGE_DISTRIBUTION_RULES,
      ruleDescriptions: {
        'pkg-distribution-invalid-exports': 'Export map de package.json inválido',
        'pkg-distribution-missing-types': 'Falta .d.ts para entrypoint público',
        'pkg-distribution-dual-package-hazard': 'Incompatibilidad dual ESM y CJS'
      },
      coverage: {
        include: ['package.json', 'dist/**']
      },
      projectRoot: effectiveRoot
    });
  }

  public override async runAudit(): Promise<void> {
    const config = getAuditConfig(this.projectRoot);
    if (config.packageDistribution?.enabled === false) {
      for (const r of PACKAGE_DISTRIBUTION_RULES) {
        this.markRuleNotApplicable(r, 'Package distribution desactivado');
      }
      return;
    }

    for (const r of PACKAGE_DISTRIBUTION_RULES) {
      this.markRuleEvaluated(r);
    }
    this.recordScanned('package.json');

    const targetPkgDir = config.packageDistribution?.pkgDir
      ? path.resolve(this.projectRoot, config.packageDistribution.pkgDir)
      : this.projectRoot;

    const pkgJsonPath = path.resolve(targetPkgDir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) {
      this.addViolation({
        ruleId: 'pkg-distribution-invalid-exports',
        severity: 'error',
        file: 'package.json',
        line: 1,
        context: 'package.json',
        message: `No se encontró package.json en el directorio de distribución: ${targetPkgDir}`
      });
      return;
    }

    let pkgJson: Record<string, unknown>;
    try {
      pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
    } catch (err: unknown) {
      this.addViolation({
        ruleId: 'pkg-distribution-invalid-exports',
        severity: 'error',
        file: 'package.json',
        line: 1,
        context: 'package.json',
        message: `package.json contiene JSON inválido: ${err instanceof Error ? err.message : String(err)}`
      });
      return;
    }

    const level = config.packageDistribution?.level ?? 'warning';
    const result = await publint({
      pkgDir: targetPkgDir,
      level
    });

    const findings = parsePublintMessages(result.messages, pkgJson, this.projectRoot);
    for (const finding of findings) {
      this.addViolation({
        ruleId: (finding.ruleId as PackageDistributionRuleId) ?? 'pkg-distribution-invalid-exports',
        severity: finding.severity,
        file: finding.file ?? 'package.json',
        line: finding.line ?? 1,
        context: finding.context ?? finding.message,
        message: finding.message
      });
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidatePackageDistributionAuditor());

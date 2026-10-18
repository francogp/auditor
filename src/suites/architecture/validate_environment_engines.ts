/**
 * src/suites/architecture/validate_environment_engines.ts
 *
 * SSoT ENVIRONMENT ENGINES & RUNTIME AUDITOR (Node.js 26+ Native)
 *
 * Verifies that package.json declares engines.node and engines.npm satisfying or
 * exceeding the @francogp/auditor engine floor, and that the active runtime matches.
 * In --fix mode, automatically repairs package.json engines or invokes the canonical
 * setup script (setup-windows.ps1 / setup-linux.sh) to align the environment.
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import {
  BaseAuditor,
  createUniformRemediationPhases,
  type AuditorOptions,
  createRuleCapabilities
} from '../../core/auditorBase.ts';
import {
  parseSemver,
  compareVersions,
  getAuditorEngines,
  type SemverVersion,
  type AuditorEngineSpecs
} from '../../cli/check_environment.ts';
import { getPackageJson, writePackageJson, type PackageJsonDTO } from '../../core/packageJson.ts';
import { runNpmCommandSync } from '../../core/npmCommandUtils.ts';

enableCompileCache();

export const ENVIRONMENT_ENGINES_RULES = [
  'environment-engines-missing',
  'environment-engines-below-floor',
  'environment-runtime-mismatch'
] as const;

export type EnvironmentEnginesRuleId = (typeof ENVIRONMENT_ENGINES_RULES)[number];

export interface EnvironmentEnginesConfig {
  readonly enabled?: boolean;
}

export interface EngineAvailability {
  readonly hasNodeEngine: boolean;
  readonly hasNpmEngine: boolean;
}

export interface EngineFloorCheckResult {
  readonly nodeReq: SemverVersion;
  readonly npmReq: SemverVersion;
}

export function detectNpmVersion(): string {
  const npmUserAgent = process.env.npm_config_user_agent || '';
  const match = npmUserAgent.match(/npm\/([0-9.]+)/);
  if (match?.[1]) {
    return match[1];
  }
  try {
    const res = runNpmCommandSync(['--version'], { encoding: 'utf8' });
    if (res.status === 0 && res.stdout) {
      return res.stdout.trim();
    }
  } catch {
    // catch-ok: fallback when npm CLI is inaccessible directly
  }
  return '0.0.0';
}

export function extractBaseNodeVersion(engineStr: string): string {
  const v = parseSemver(engineStr);
  if (v.major === 0 && v.minor === 0 && v.patch === 0) return '';
  return `${v.major}.${v.minor}.${v.patch}`;
}

export function syncNodeVersion(projectRoot: string, targetNodeEngine: string): boolean {
  const baseVersion = extractBaseNodeVersion(targetNodeEngine);
  if (!baseVersion) return false;
  const nodeVersionPath = path.resolve(projectRoot, '.node-version');
  const currentContent = fs.existsSync(nodeVersionPath)
    ? fs.readFileSync(nodeVersionPath, 'utf8').trim()
    : '';
  let updated = false;
  if (currentContent !== baseVersion) {
    fs.writeFileSync(nodeVersionPath, `${baseVersion}\n`, 'utf8');
    updated = true;
  }
  const legacyNvmrc = path.resolve(projectRoot, '.nvmrc');
  if (fs.existsSync(legacyNvmrc)) {
    try {
      fs.rmSync(legacyNvmrc, { force: true });
    } catch {
      // catch-ok
    }
  }
  return updated;
}

export class ValidateEnvironmentEnginesAuditor extends BaseAuditor<EnvironmentEnginesRuleId> {
  constructor(options: Partial<AuditorOptions<EnvironmentEnginesRuleId>> = {}) {
    super({
      usesThirdPartyTool: false,
      ruleCapabilities: createRuleCapabilities(
        ENVIRONMENT_ENGINES_RULES,
        {
          speed: 'light',
          phase: 'setup',
          fix: 'priority',
          md: false,
          ast: false,
          changedOnly: false,
          critical: false
        },
        ['environment-engines-missing', 'environment-engines-below-floor']
      ),
      fixableRuleIds: ['environment-engines-missing', 'environment-engines-below-floor'],
      id: 'validate_environment_engines',
      name: 'Environment Engines & Runtime Validator',
      description: 'Valida versiones de Node.js y npm en package.json',
      family: 'architecture',
      ruleIds: ENVIRONMENT_ENGINES_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(ENVIRONMENT_ENGINES_RULES, 'setup'),
      packageName: 'Entorno',
      configKey: 'environment.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '⚡',
      ruleDescriptions: {
        'environment-engines-missing': 'Falta engines en package.json',
        'environment-engines-below-floor': 'Motores inferiores al piso auditor',
        'environment-runtime-mismatch': 'Versión activa no coincide con engines'
      },
      ruleRemediations: {
        'environment-engines-missing':
          'Guía de diagnóstico y remediación para environment-engines-missing. Revisa la incidencia detectada y ajusta el código correspondiente.',
        'environment-engines-below-floor':
          'Guía de diagnóstico y remediación para environment-engines-below-floor. Revisa la incidencia detectada y ajusta el código correspondiente.',
        'environment-runtime-mismatch':
          'Guía de diagnóstico y remediación para environment-runtime-mismatch. Revisa la incidencia detectada y ajusta el código correspondiente.'
      },
      coverage: { include: ['package.json'] },
      ...options
    });
  }

  private validatePackageJson(pkgPath: string): PackageJsonDTO | null {
    if (!fs.existsSync(pkgPath)) {
      this.addViolation({
        ruleId: 'environment-engines-missing',
        file: 'package.json',
        message: `package.json no encontrado en ${this.projectRoot}.`,
        severity: 'error',
        fixable: false
      });
      return null;
    }

    const pkg = getPackageJson(this.projectRoot, true);
    if (!pkg) {
      this.addViolation({
        ruleId: 'environment-engines-missing',
        file: 'package.json',
        message: 'package.json no contiene un JSON válido.',
        severity: 'error',
        fixable: false
      });
      return null;
    }
    return pkg;
  }

  private auditMissingEngines(engines: EngineAvailability): void {
    if (!engines.hasNodeEngine || !engines.hasNpmEngine) {
      const isWin = process.platform === 'win32';
      const setupScript = isWin ? '.\\setup-windows.ps1' : './setup-linux.sh';
      this.addViolation({
        ruleId: 'environment-engines-missing',
        file: 'package.json',
        message: `package.json debe declarar explícitamente "engines.node" y "engines.npm". Ejecuta "auditor fix" o ${setupScript} para sincronizar el entorno.`,
        severity: 'error',
        fixable: true
      });
    }
  }

  private auditEnginesBelowFloor(
    currentNodeEngine: string,
    currentNpmEngine: string,
    auditorEngines: AuditorEngineSpecs,
    minNodeReq: SemverVersion,
    minNpmReq: SemverVersion
  ): EngineFloorCheckResult {
    let nodeEngineReq: SemverVersion = { major: 0, minor: 0, patch: 0 };
    let npmEngineReq: SemverVersion = { major: 0, minor: 0, patch: 0 };

    if (currentNodeEngine && currentNpmEngine) {
      nodeEngineReq = parseSemver(currentNodeEngine);
      npmEngineReq = parseSemver(currentNpmEngine);

      const isNodeAdequate = compareVersions(nodeEngineReq, minNodeReq);
      const isNpmAdequate = compareVersions(npmEngineReq, minNpmReq);

      if (!isNodeAdequate || !isNpmAdequate) {
        const isWin = process.platform === 'win32';
        const updateScript = isWin ? '.\\update-windows.ps1' : './update-linux.sh';
        this.addViolation({
          ruleId: 'environment-engines-below-floor',
          file: 'package.json',
          message:
            `Versiones de motores en package.json inferiores al piso del auditor ` +
            `(Node: ${auditorEngines.node}, npm: ${auditorEngines.npm}). ` +
            `Ejecuta "auditor fix" o ${updateScript} para actualizar el entorno a la última versión.`,
          severity: 'error',
          fixable: true
        });
      }
    }

    return { nodeReq: nodeEngineReq, npmReq: npmEngineReq };
  }

  private auditRuntimeMismatch(
    pkg: PackageJsonDTO,
    auditorEngines: AuditorEngineSpecs,
    nodeEngineReq: SemverVersion,
    npmEngineReq: SemverVersion,
    minNodeReq: SemverVersion,
    minNpmReq: SemverVersion
  ): void {
    const runtimeNode = parseSemver(process.versions.node);
    const rawNpmVer = detectNpmVersion();
    const runtimeNpm = parseSemver(rawNpmVer);

    const targetNodeReq = nodeEngineReq.major > 0 ? nodeEngineReq : minNodeReq;
    const targetNpmReq = npmEngineReq.major > 0 ? npmEngineReq : minNpmReq;

    const isNodeMatch = compareVersions(runtimeNode, targetNodeReq);
    const isNpmMatch = runtimeNpm.major === 0 || compareVersions(runtimeNpm, targetNpmReq);

    if (!isNodeMatch || !isNpmMatch) {
      const isWin = process.platform === 'win32';
      const setupScript = isWin ? '.\\setup-windows.ps1' : './setup-linux.sh';
      const updateScript = isWin ? '.\\update-windows.ps1' : './update-linux.sh';
      this.addViolation({
        ruleId: 'environment-runtime-mismatch',
        file: 'package.json',
        message:
          `Entorno de ejecución desalineado. ` +
          `Detectado Node v${process.versions.node} / npm ${rawNpmVer}, ` +
          `requerido Node ${pkg.engines?.node ?? auditorEngines.node} / npm ${pkg.engines?.npm ?? auditorEngines.npm}. ` +
          `Ejecuta ${setupScript} (o vp env use) para alinear tu terminal, o ${updateScript} para actualizar a la última versión.`,
        severity: 'error',
        fixable: false
      });
    }
  }

  private repairEnginesInPackageJson(
    pkg: PackageJsonDTO,
    auditorEngines: AuditorEngineSpecs,
    minNodeReq: SemverVersion,
    minNpmReq: SemverVersion
  ): PackageJsonDTO {
    const currentNode = pkg.engines?.node?.trim() ?? '';
    const currentNpm = pkg.engines?.npm?.trim() ?? '';
    const isNodeOk =
      currentNode.length > 0 && compareVersions(parseSemver(currentNode), minNodeReq);
    const isNpmOk = currentNpm.length > 0 && compareVersions(parseSemver(currentNpm), minNpmReq);

    if (isNodeOk && isNpmOk) {
      syncNodeVersion(this.projectRoot, currentNode);
      return pkg;
    }

    const updatedEngines: Record<string, string> = {
      ...(pkg.engines ?? {}),
      node: isNodeOk ? currentNode : auditorEngines.node,
      npm: isNpmOk ? currentNpm : auditorEngines.npm
    };
    const updatedPkg: PackageJsonDTO = {
      ...pkg,
      engines: updatedEngines
    };
    writePackageJson(this.projectRoot, updatedPkg);
    syncNodeVersion(this.projectRoot, updatedEngines.node!);
    return updatedPkg;
  }

  public override async runAudit(): Promise<void> {
    const pkgPath = path.resolve(this.projectRoot, 'package.json');
    this.recordScanned('package.json');

    const auditorEngines = getAuditorEngines();
    const minNodeReq = parseSemver(auditorEngines.node);
    const minNpmReq = parseSemver(auditorEngines.npm);

    let pkg = this.validatePackageJson(pkgPath);
    if (!pkg) {
      this.runSubAuditorSync('environment-engines-missing', () => {});
      this.runSubAuditorSync('environment-engines-below-floor', () => {
        this.markRuleNotApplicable(
          'environment-engines-below-floor',
          'package.json ausente o inválido'
        );
      });
      this.runSubAuditorSync('environment-runtime-mismatch', () => {
        this.markRuleNotApplicable(
          'environment-runtime-mismatch',
          'package.json ausente o inválido'
        );
      });
      return;
    }

    if (this.isFixActive()) {
      pkg = this.repairEnginesInPackageJson(pkg, auditorEngines, minNodeReq, minNpmReq);
    }

    const hasNodeEngine =
      typeof pkg.engines?.node === 'string' && pkg.engines.node.trim().length > 0;
    const hasNpmEngine = typeof pkg.engines?.npm === 'string' && pkg.engines.npm.trim().length > 0;

    this.runSubAuditorSync('environment-engines-missing', () => {
      this.auditMissingEngines({ hasNodeEngine, hasNpmEngine });
    });

    let belowFloorResult!: ReturnType<typeof this.auditEnginesBelowFloor>;
    this.runSubAuditorSync('environment-engines-below-floor', () => {
      belowFloorResult = this.auditEnginesBelowFloor(
        pkg.engines?.node ?? '',
        pkg.engines?.npm ?? '',
        auditorEngines,
        minNodeReq,
        minNpmReq
      );
    });

    this.runSubAuditorSync('environment-runtime-mismatch', () => {
      this.auditRuntimeMismatch(
        pkg,
        auditorEngines,
        belowFloorResult.nodeReq,
        belowFloorResult.npmReq,
        minNodeReq,
        minNpmReq
      );
    });
  }
}

// CLI entrypoint
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateEnvironmentEnginesAuditor());

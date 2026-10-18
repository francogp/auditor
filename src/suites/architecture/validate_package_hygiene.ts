import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import {
  BaseAuditor,
  createUniformRemediationPhases,
  getEffectiveScannableRoots,
  createRuleCapabilities
} from '../../core/auditorBase.ts';
import { getAuditConfig, AUDIT_CONFIG_FILE } from '../../core/auditConfig.ts';
import type { AuditConfig } from '../../core/auditConfigTypes.ts';
import type { AuditFinding } from '../../core/auditContract.ts';
import { executeCliAndReadJson, resolvePackageBin } from '../../cli/cliUtils.ts';
import { getPackageJson } from '../../core/packageJson.ts';
import { toPosixRelative } from '../../core/safePath.ts';

enableCompileCache();

export const PACKAGE_HYGIENE_RULES = [
  'package-unused-dependency',
  'package-unlisted-dependency',
  'package-unused-binary',
  'package-lockfile-integrity'
] as const;
export type PackageHygieneRuleId = (typeof PACKAGE_HYGIENE_RULES)[number];

export interface KnipIssueItem {
  readonly name: string;
  readonly line?: number;
  readonly col?: number;
  readonly pos?: number;
}

export interface KnipFileIssues {
  readonly file: string;
  readonly dependencies?: readonly KnipIssueItem[];
  readonly devDependencies?: readonly KnipIssueItem[];
  readonly optionalPeerDependencies?: readonly KnipIssueItem[];
  readonly unlisted?: readonly KnipIssueItem[];
  readonly binaries?: readonly KnipIssueItem[];
  readonly unresolved?: readonly KnipIssueItem[];
}

export interface KnipReport {
  readonly issues?: readonly KnipFileIssues[];
}

export function extractReferencedScriptDependencies(projectRoot: string): Set<string> {
  const referenced = new Set<string>();
  const pkg = getPackageJson(projectRoot);
  if (!pkg) return referenced;

  try {
    const scripts = pkg.scripts ? Object.values(pkg.scripts).join(' ') : '';
    const allDeps = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {})
    ];

    for (const dep of allDeps) {
      const cleanName = dep.startsWith('@') ? dep.split('/')[1] || dep : dep;
      const rootBin = cleanName.replace(/-cli$/, '');
      const escapedDep = dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedClean = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const escapedRoot = rootBin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(
        `(?:^|[\\s"'\`;&|])(?:${escapedDep}|${escapedClean}|${escapedRoot})(?:[\\s"'\`;&|]|$)`,
        'i'
      );
      if (pattern.test(scripts)) {
        referenced.add(dep);
      }
    }
  } catch {
    // catch-ok: Ignore parse errors
  }
  return referenced;
}

function parseUnusedDeps(
  fileIssue: KnipFileIssues,
  relFile: string,
  scriptReferencedDeps: ReadonlySet<string>
): AuditFinding[] {
  const allUnused = [
    ...(fileIssue.dependencies ?? []),
    ...(fileIssue.devDependencies ?? []),
    ...(fileIssue.optionalPeerDependencies ?? [])
  ];
  const findings: AuditFinding[] = [];
  for (const dep of allUnused) {
    if (scriptReferencedDeps.has(dep.name)) continue;
    findings.push({
      suiteId: 'validate_package_hygiene',
      suiteName: 'Package & Dependency Hygiene Auditor',
      ruleId: 'package-unused-dependency',
      ruleDescription: 'Dependencias: Dependencia no utilizada en package',
      severity: 'error',
      file: relFile,
      line: dep.line ?? 1,
      col: dep.col ?? 1,
      context: dep.name,
      message: `Dependencia no utilizada declarada en package.json: "${dep.name}"`
    });
  }
  return findings;
}

function parseUnlistedDeps(fileIssue: KnipFileIssues, relFile: string): AuditFinding[] {
  return (fileIssue.unlisted ?? []).map((unlisted) => ({
    suiteId: 'validate_package_hygiene',
    suiteName: 'Package & Dependency Hygiene Auditor',
    ruleId: 'package-unlisted-dependency',
    ruleDescription: 'Dependencias: Dependencia fantasma no declarada',
    severity: 'error',
    file: relFile,
    line: unlisted.line ?? 1,
    col: unlisted.col ?? 1,
    context: unlisted.name,
    message: `Dependencia fantasma no declarada en package.json importada en código: "${unlisted.name}"`
  }));
}

export function extractOwnPackageBinaries(projectRoot: string): Set<string> {
  const binaries = new Set<string>();
  const pkg = getPackageJson(projectRoot);
  if (!pkg) return binaries;

  if (typeof pkg.bin === 'string') {
    if (pkg.name) {
      binaries.add(pkg.name.replace(/^@[^/]+\//, ''));
    }
  } else if (pkg.bin && typeof pkg.bin === 'object') {
    for (const binName of Object.keys(pkg.bin)) {
      binaries.add(binName);
    }
  }
  return binaries;
}

function parseUnusedBinaries(
  fileIssue: KnipFileIssues,
  relFile: string,
  ownBinaries: ReadonlySet<string> = new Set()
): AuditFinding[] {
  return (fileIssue.binaries ?? [])
    .filter((bin) => !ownBinaries.has(bin.name))
    .map((bin) => ({
      suiteId: 'validate_package_hygiene',
      suiteName: 'Package & Dependency Hygiene Auditor',
      ruleId: 'package-unused-binary',
      ruleDescription: 'Dependencias: Binario o script no referenciado',
      severity: 'error',
      file: relFile,
      line: bin.line ?? 1,
      col: bin.col ?? 1,
      context: bin.name,
      message: `Binario o script ejecutable no referenciado en el proyecto: "${bin.name}"`
    }));
}

/**
 * Parses raw JSON output from Knip into canonical AuditFindings.
 */
export function parseKnipIssues(
  report: KnipReport | readonly KnipFileIssues[],
  projectRoot: string = process.cwd(),
  isPathIgnored?: (relPath: string) => boolean
): AuditFinding[] {
  const issues: readonly KnipFileIssues[] = Array.isArray(report)
    ? report
    : report && 'issues' in report && Array.isArray(report.issues)
      ? report.issues
      : [];
  const findings: AuditFinding[] = [];
  const scriptReferencedDeps = extractReferencedScriptDependencies(projectRoot);
  const ownBinaries = extractOwnPackageBinaries(projectRoot);

  for (const fileIssue of issues) {
    const rawFile = fileIssue.file || 'package.json';
    const relFile = toPosixRelative(projectRoot, rawFile);

    if (relFile !== 'package.json' && isPathIgnored?.(relFile)) {
      continue;
    }

    findings.push(...parseUnusedDeps(fileIssue, relFile, scriptReferencedDeps));
    findings.push(...parseUnlistedDeps(fileIssue, relFile));
    findings.push(...parseUnusedBinaries(fileIssue, relFile, ownBinaries));
  }

  return findings;
}

/**
 * Validates package-lock.json integrity, version standards, and absence of insecure HTTP registries.
 */
export function verifyLockfileIntegrity(
  projectRoot: string,
  isFixMode = false
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const lockfilePath = path.resolve(projectRoot, 'package-lock.json');
  const pkgJsonPath = path.resolve(projectRoot, 'package.json');

  if (!fs.existsSync(pkgJsonPath)) {
    return findings;
  }

  if (!fs.existsSync(lockfilePath)) {
    findings.push({
      suiteId: 'validate_package_hygiene',
      suiteName: 'Package & Dependency Hygiene Auditor',
      ruleId: 'package-lockfile-integrity',
      ruleDescription: 'Dependencias: Lockfile corrupto o inseguro',
      severity: 'error',
      file: 'package-lock.json',
      line: 1,
      context: 'package-lock.json',
      message: 'No se encontró package-lock.json. El proyecto debe versionar el lockfile.'
    });
    return findings;
  }

  let rawContent: string;
  try {
    rawContent = fs.readFileSync(lockfilePath, 'utf-8');
  } catch (err: unknown) {
    findings.push({
      suiteId: 'validate_package_hygiene',
      suiteName: 'Package & Dependency Hygiene Auditor',
      ruleId: 'package-lockfile-integrity',
      ruleDescription: 'Dependencias: Lockfile corrupto o inseguro',
      severity: 'error',
      file: 'package-lock.json',
      line: 1,
      context: 'package-lock.json',
      message: `Error al leer package-lock.json: ${err instanceof Error ? err.message : String(err)}`
    });
    return findings;
  }

  // 1. Check for unresolved merge conflict markers
  const conflictMatch = /^(?:<<<<<<<|=======|>>>>>>>)/m.exec(rawContent);
  if (conflictMatch) {
    findings.push({
      suiteId: 'validate_package_hygiene',
      suiteName: 'Package & Dependency Hygiene Auditor',
      ruleId: 'package-lockfile-integrity',
      ruleDescription: 'Dependencias: Lockfile corrupto o inseguro',
      severity: 'error',
      file: 'package-lock.json',
      line: 1,
      context: 'merge-conflict',
      message: 'package-lock.json contiene marcadores de conflicto de merge sin resolver.'
    });
    return findings;
  }

  let lockfileJson: Record<string, unknown>;
  try {
    lockfileJson = JSON.parse(rawContent);
  } catch (err: unknown) {
    findings.push({
      suiteId: 'validate_package_hygiene',
      suiteName: 'Package & Dependency Hygiene Auditor',
      ruleId: 'package-lockfile-integrity',
      ruleDescription: 'Dependencias: Lockfile corrupto o inseguro',
      severity: 'error',
      file: 'package-lock.json',
      line: 1,
      context: 'json-syntax',
      message: `package-lock.json contiene JSON inválido: ${err instanceof Error ? err.message : String(err)}`
    });
    return findings;
  }

  // 2. Lockfile version check (must be lockfileVersion >= 3 for modern Node 18+)
  const lockfileVersion = lockfileJson.lockfileVersion;
  if (typeof lockfileVersion === 'number' && lockfileVersion < 3) {
    findings.push({
      suiteId: 'validate_package_hygiene',
      suiteName: 'Package & Dependency Hygiene Auditor',
      ruleId: 'package-lockfile-integrity',
      ruleDescription: 'Dependencias: Lockfile corrupto o inseguro',
      severity: 'error',
      file: 'package-lock.json',
      line: 1,
      context: `lockfileVersion: ${lockfileVersion}`,
      message: `lockfileVersion obsoleto (${lockfileVersion}). Se requiere lockfileVersion 3 (Node.js 18+ / npm v9+).`
    });
  }

  // 3. Insecure HTTP registry check (CWE-319 cleartext transmission / MitM hazard)
  if (/"resolved"\s*:\s*"http:\/\//.test(rawContent)) {
    findings.push({
      suiteId: 'validate_package_hygiene',
      suiteName: 'Package & Dependency Hygiene Auditor',
      ruleId: 'package-lockfile-integrity',
      ruleDescription: 'Dependencias: Lockfile corrupto o inseguro',
      severity: 'error',
      file: 'package-lock.json',
      line: 1,
      context: 'insecure-http-resolved',
      message:
        'package-lock.json contiene resoluciones de paquetes insecure vía http:// no cifrado.'
    });
  }

  // 4. Floating git dependencies prohibition in package.json
  let pkgJson: Record<string, unknown> = {};
  try {
    pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
  } catch {
    // catch-ok: Ignore parse errors
  }

  const packages = (lockfileJson.packages as Record<string, unknown>) || {};
  const rootPackage = (packages[''] as Record<string, unknown>) || {};

  auditFloatingGitDependencies(
    pkgJson,
    rootPackage,
    lockfileJson,
    pkgJsonPath,
    lockfilePath,
    isFixMode,
    findings
  );

  const allDeclaredDeps: Record<string, string> = {
    ...(pkgJson.dependencies as Record<string, string>),
    ...(pkgJson.devDependencies as Record<string, string>)
  };

  verifyLockfileRootDepsSync(rootPackage, allDeclaredDeps, findings);

  return findings;
}

function resolveAuditorSemverTag(): string {
  try {
    const selfPkgPath = path.resolve(import.meta.dirname, '../../../package.json');
    if (fs.existsSync(selfPkgPath)) {
      const selfPkg = JSON.parse(fs.readFileSync(selfPkgPath, 'utf-8')) as {
        version?: string;
      };
      if (selfPkg.version) {
        return selfPkg.version.split('-')[0]!;
      }
    }
  } catch {
    // catch-ok: fallback
  }
  return '0.0.0';
}

function auditFloatingGitDependencies(
  pkgJson: Record<string, unknown>,
  rootPackage: Record<string, unknown>,
  lockfileJson: Record<string, unknown>,
  pkgJsonPath: string,
  lockfilePath: string,
  isFixMode: boolean,
  findings: AuditFinding[]
): void {
  let pkgModified = false;
  let lockModified = false;
  const semverTag = isFixMode ? resolveAuditorSemverTag() : '';

  for (const section of ['dependencies', 'devDependencies'] as const) {
    const deps = pkgJson[section] as Record<string, string> | undefined;
    if (!deps) continue;
    for (const [depName, spec] of Object.entries(deps)) {
      if (
        typeof spec !== 'string' ||
        (!spec.includes('#semver:') && !/#(?:main|master|dev|develop)$/.test(spec))
      ) {
        continue;
      }
      if (isFixMode && depName === '@francogp/auditor') {
        const pinnedSpec = spec.replace(/#.*$/, `#v${semverTag}`);
        deps[depName] = pinnedSpec;
        pkgModified = true;
        const rootSection = rootPackage[section] as Record<string, string> | undefined;
        if (rootSection && rootSection[depName]) {
          rootSection[depName] = pinnedSpec;
          lockModified = true;
        }
        continue;
      }
      findings.push({
        suiteId: 'validate_package_hygiene',
        suiteName: 'Package & Dependency Hygiene Auditor',
        ruleId: 'package-lockfile-integrity',
        ruleDescription: 'Dependencias: Lockfile corrupto o inseguro',
        severity: 'error',
        file: 'package.json',
        line: 1,
        context: `${depName}: ${spec}`,
        message: `La dependencia "${depName}" utiliza un rango git flotante ("${spec}"). Para garantizar despliegues deterministas con 'npm ci', debes fijar un tag exacto (ej. "github:org/repo#vX.Y.Z") o un commit SHA.`
      });
    }
  }

  if (pkgModified) {
    fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf-8');
  }
  if (lockModified) {
    fs.writeFileSync(lockfilePath, JSON.stringify(lockfileJson, null, 2) + '\n', 'utf-8');
  }
}

function verifyLockfileRootDepsSync(
  rootPackage: Record<string, unknown>,
  allDeclaredDeps: Record<string, string>,
  findings: AuditFinding[]
): void {
  if (!rootPackage || typeof rootPackage !== 'object') return;
  const rootDeps: Record<string, string> = {
    ...(rootPackage.dependencies as Record<string, string>),
    ...(rootPackage.devDependencies as Record<string, string>)
  };

  for (const [depName, expectedSpec] of Object.entries(allDeclaredDeps)) {
    const lockedSpec = rootDeps[depName];
    if (!lockedSpec) {
      findings.push({
        suiteId: 'validate_package_hygiene',
        suiteName: 'Package & Dependency Hygiene Auditor',
        ruleId: 'package-lockfile-integrity',
        ruleDescription: 'Dependencias: Lockfile corrupto o inseguro',
        severity: 'error',
        file: 'package-lock.json',
        line: 1,
        context: `${depName}: missing`,
        message: `La dependencia "${depName}" declarada en package.json no está registrada en package-lock.json. Ejecuta "npm install" para sincronizar el lockfile.`
      });
    } else if (lockedSpec !== expectedSpec) {
      findings.push({
        suiteId: 'validate_package_hygiene',
        suiteName: 'Package & Dependency Hygiene Auditor',
        ruleId: 'package-lockfile-integrity',
        ruleDescription: 'Dependencias: Lockfile corrupto o inseguro',
        severity: 'error',
        file: 'package-lock.json',
        line: 1,
        context: `${depName}: ${expectedSpec} vs ${lockedSpec}`,
        message: `La dependencia "${depName}" en package.json ("${expectedSpec}") difiere de package-lock.json ("${lockedSpec}"). Ejecuta "npm install" para sincronizar el lockfile.`
      });
    }
  }
}

export class ValidatePackageHygieneAuditor extends BaseAuditor<PackageHygieneRuleId> {
  constructor(options: { projectRoot?: string; fix?: boolean } = {}) {
    const effectiveRoot = options.projectRoot ?? process.cwd();
    super({
      usesThirdPartyTool: true,
      thirdPartyToolPolicy: {
        toolName: 'knip',
        fallbackBehavior: 'violation',
        fallbackRuleId: 'package-unlisted-dependency'
      },
      ruleCapabilities: createRuleCapabilities(
        PACKAGE_HYGIENE_RULES,
        {
          speed: ['heavy', 'full'],
          phase: 'setup',
          fix: 'normal',
          md: false,
          ast: false,
          changedOnly: false,
          critical: false
        },
        ['package-unused-dependency']
      ),
      fixableRuleIds: ['package-unused-dependency'],
      fix: options.fix,
      id: 'validate_package_hygiene',
      name: 'Package & Dependency Hygiene Auditor',
      description: 'Higiene de dependencias huérfanas y fantasmas',
      family: 'architecture',
      packageName: 'Dependencias',
      configKey: 'packageHygiene.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '📦',
      ruleIds: PACKAGE_HYGIENE_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(PACKAGE_HYGIENE_RULES, 'hygiene'),
      ruleDescriptions: {
        'package-unused-dependency': 'Dependencia no utilizada en package',
        'package-unlisted-dependency': 'Dependencia fantasma no declarada',
        'package-unused-binary': 'Binario o script no referenciado',
        'package-lockfile-integrity': 'Lockfile corrupto o inseguro'
      },
      ruleRemediations: {
        'package-unused-dependency':
          '1. Causa Raíz: Se declaró una librería en `dependencies` o `devDependencies` de `package.json` que no es importada en ningún archivo fuente ni invocada en scripts o herramientas de compilación.\n2. Diagnóstico: Revisa el reporte para identificar el paquete huérfano. Comprueba con Fallow o búsqueda global si existe alguna mención o uso real.\n3. Solución Canónica: Elimina la dependencia innecesaria ejecutando `npm uninstall <paquete>` para reducir el tamaño del árbol de dependencias y la superficie de ataque.\n4. Ejemplo:\nnpm uninstall <paquete-huerfano>',
        'package-unlisted-dependency':
          '1. Causa Raíz: El código fuente importa un paquete externo (phantom dependency) que no está formalmente declarado en `dependencies` o `devDependencies` de `package.json`, funcionando solo accidentalmente por hoisting en `node_modules`.\n2. Diagnóstico: Observa la ruta y el nombre del paquete reportado en la violación.\n3. Solución Canónica: Instala y declara explícitamente el paquete en `package.json` mediante `npm install <paquete>` o `npm install -D <paquete>`.\n4. Ejemplo:\nnpm install <paquete>\nO para herramientas de desarrollo:\nnpm install -D <paquete>',
        'package-unused-binary':
          '1. Causa Raíz: Un script o binario declarado en el campo `bin` de `package.json` apunta a un archivo inexistente, no ejecutable o sin uso.\n2. Diagnóstico: Inspecciona el campo `bin` de `package.json` y verifica que el archivo de destino exista en disco y cuente con hashbang (`#!/usr/bin/env node`).\n3. Solución Canónica: Corrige la ruta al archivo ejecutable compilado en `dist/` o elimina la entrada del campo `bin` si el paquete ya no expone ese comando CLI.\n4. Ejemplo:\n"bin": {\n  "auditor": "dist/cli/index.js"\n}',
        'package-lockfile-integrity':
          '1. Causa Raíz: `package-lock.json` está desincronizado con respecto a las versiones y rangos declarados en `package.json`, o presenta resoluciones inconsistentes.\n2. Diagnóstico: Verifica discrepancias entre los paquetes instalados y las declaraciones de `package.json`.\n3. Solución Canónica: Ejecuta `npm install` para regenerar y sincronizar limpiamente el lockfile sin romper contratos de dependencias.\n4. Ejemplo:\nnpm install'
      },
      coverage: {
        include: ['package.json', 'package-lock.json']
      },
      projectRoot: effectiveRoot
    });
  }

  public override async runAudit(): Promise<void> {
    if (this.isSuiteGatingDisabled('Package hygiene desactivado en config')) {
      return;
    }

    this.recordScanned('package.json');
    if (fs.existsSync(path.resolve(this.projectRoot, 'package-lock.json'))) {
      this.recordScanned('package-lock.json');
    }

    this.runSubAuditorSync('package-lockfile-integrity', () => {
      const lockFindings = verifyLockfileIntegrity(this.projectRoot, this.isFixActive());
      for (const lf of lockFindings) {
        this.addViolation({
          ruleId: lf.ruleId as PackageHygieneRuleId,
          severity: lf.severity,
          file: lf.file,
          line: lf.line,
          col: lf.col,
          context: lf.context,
          message: lf.message
        });
      }
    });

    const config = getAuditConfig(this.projectRoot);
    const scratchDir = path.resolve(this.projectRoot, 'scratch/audits/architecture');
    const cacheDir = path.resolve(this.projectRoot, 'scratch/cache');
    fs.mkdirSync(scratchDir, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });

    const rawOutPath = path.resolve(scratchDir, 'knip-raw.json');
    const cachePath = path.resolve(cacheDir, 'knip');

    if (fs.existsSync(rawOutPath)) {
      try {
        fs.unlinkSync(rawOutPath);
      } catch {
        // catch-ok: Best effort cleanup of stale raw report
      }
    }

    const ephemeralConfigPath = this.buildEphemeralKnipConfig(config, scratchDir);
    const report = this.executeKnip(ephemeralConfigPath, cachePath, rawOutPath);
    if (!report) {
      this.markRuleEvaluated('package-unlisted-dependency');
      this.markRuleEvaluated('package-unused-dependency');
      this.markRuleEvaluated('package-unused-binary');
      return;
    }

    const findings = parseKnipIssues(report, this.projectRoot, (p) => this.isPathIgnored(p));
    for (const ruleId of [
      'package-unused-dependency',
      'package-unlisted-dependency',
      'package-unused-binary'
    ] as const) {
      this.runSubAuditorSync(ruleId, () => {
        for (const finding of findings) {
          const mappedRuleId =
            (finding.ruleId as PackageHygieneRuleId) ?? 'package-unused-dependency';
          if (mappedRuleId !== ruleId) continue;
          if (finding.file && finding.file !== 'package.json' && this.isPathIgnored(finding.file)) {
            continue;
          }
          this.addViolation({
            ruleId,
            severity: finding.severity,
            file: finding.file ?? 'package.json',
            line: finding.line ?? 1,
            context: finding.context ?? finding.message,
            message: finding.message
          });
        }
      });
    }
  }

  private readFallowConfigData(): { fallowEntries: string[]; fallowIgnoredDeps: string[] } {
    const fallowConfigPath = path.resolve(this.projectRoot, '.fallowrc.json');
    let fallowIgnoredDeps: string[] = []; // no-domain: Non-domain utility collection or data structure
    let fallowEntries: string[] = [];
    if (fs.existsSync(fallowConfigPath)) {
      try {
        const fallowJson = JSON.parse(fs.readFileSync(fallowConfigPath, 'utf-8'));
        if (Array.isArray(fallowJson.ignoreDependencies)) {
          fallowIgnoredDeps = fallowJson.ignoreDependencies;
        }
        if (Array.isArray(fallowJson.entry)) {
          fallowEntries = fallowJson.entry;
        }
      } catch {
        // catch-ok: Best effort read of fallow ignoreDependencies
      }
    }
    return { fallowEntries, fallowIgnoredDeps };
  }

  private buildEphemeralKnipConfig(config: AuditConfig, scratchDir: string): string {
    const { fallowEntries, fallowIgnoredDeps } = this.readFallowConfigData();
    const customIgnoredDeps = config.packageHygiene?.ignoreDependencies ?? [];
    const scriptReferencedDeps = Array.from(extractReferencedScriptDependencies(this.projectRoot));
    const implicitTestDeps: string[] = []; // no-domain: Non-domain utility collection or data structure
    const viteConfigPath = path.resolve(this.projectRoot, 'vite.config.ts');
    if (fs.existsSync(viteConfigPath)) {
      try {
        const viteContent = fs.readFileSync(viteConfigPath, 'utf-8');
        if (viteContent.includes("'v8'") || viteContent.includes('"v8"')) {
          implicitTestDeps.push('@vitest/coverage-v8');
        }
        if (viteContent.includes("'istanbul'") || viteContent.includes('"istanbul"')) {
          implicitTestDeps.push('@vitest/coverage-istanbul');
        }
      } catch {
        // catch-ok: error reading vite.config.ts
      }
    }
    const allIgnoredDeps = Array.from(
      new Set([
        ...fallowIgnoredDeps,
        ...customIgnoredDeps,
        ...scriptReferencedDeps,
        ...implicitTestDeps
      ])
    );
    const customIgnoredBinaries = config.packageHygiene?.ignoreBinaries ?? [];
    const ownBinaries = Array.from(extractOwnPackageBinaries(this.projectRoot));
    const vitePlusConfigExists = fs.existsSync(path.resolve(this.projectRoot, 'vite.config.ts'));
    let hasVitePlusDependency = false;
    const pkgJsonPath = path.resolve(this.projectRoot, 'package.json');
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkgRaw = fs.readFileSync(pkgJsonPath, 'utf-8');
        const parsed = JSON.parse(pkgRaw);
        hasVitePlusDependency = Boolean(
          parsed.dependencies?.['vite-plus'] || parsed.devDependencies?.['vite-plus']
        );
      } catch {
        // catch-ok: best effort read of package.json
      }
    }
    const vitePlusBinaries =
      vitePlusConfigExists || hasVitePlusDependency
        ? (['vite', 'vitest', 'tsdown', 'oxlint', 'oxfmt', 'vp'] as const)
        : [];

    const allIgnoredBinaries = Array.from(
      new Set([...customIgnoredBinaries, ...ownBinaries, ...vitePlusBinaries])
    );

    const customEntry = config.packageHygiene?.entry;
    const effectiveEntry =
      customEntry && customEntry.length > 0
        ? [...customEntry]
        : fallowEntries.length > 0
          ? fallowEntries
          : ['src/index.{ts,js}', 'src/main.{ts,js}', 'index.html', AUDIT_CONFIG_FILE];

    const scannableRoots = getEffectiveScannableRoots(config);
    const customProject = config.packageHygiene?.project;
    const effectiveProject =
      customProject && customProject.length > 0
        ? [...customProject]
        : [
            ...scannableRoots.map((r) => `${r}/**/*.{ts,vue,js,mjs,cjs,json}`),
            '*.{ts,js,mjs,cjs,json}'
          ];

    const ephemeralConfig = {
      $schema: 'https://unpkg.com/knip@6/overview/configuration-schema.json',
      entry: effectiveEntry,
      project: effectiveProject,
      ignore: [
        'dist/**',
        'scratch/**',
        'coverage/**',
        'skills/**',
        '.agents/**',
        '**/*.d.ts',
        ...(config.paths.ignoredDirs?.flatMap((d) => [`${d}/**`, d]) ?? []),
        ...(config.paths.ignoredPatterns ?? []),
        ...(config.paths.ignoreGlobs ?? [])
      ],
      ignoreDependencies: allIgnoredDeps,
      ignoreBinaries: allIgnoredBinaries
    };

    const ephemeralConfigPath = path.resolve(scratchDir, 'knip-ephemeral.json');
    fs.writeFileSync(ephemeralConfigPath, JSON.stringify(ephemeralConfig, null, 2), 'utf-8');
    return ephemeralConfigPath;
  }

  private executeKnip(
    ephemeralConfigPath: string,
    cachePath: string,
    rawOutPath: string
  ): KnipReport | null {
    const tier = this.getExecutionTier();
    const cliFlags = [
      '--config',
      ephemeralConfigPath,
      '--dependencies',
      '--reporter',
      'json',
      '--cache',
      '--cache-location',
      cachePath
    ];

    if (tier === 'full') {
      cliFlags.push('--include-libs');
    }

    if (this.fixMode) {
      cliFlags.push('--fix', '--fix-type', 'dependencies');
    }

    const resolvedBin = resolvePackageBin('knip', {
      projectRoot: this.projectRoot,
      fallbackRelativeBin: 'bin/knip.js'
    });

    const command = resolvedBin ? process.execPath : 'knip';
    const finalArgs = resolvedBin ? [resolvedBin, ...cliFlags] : [...cliFlags];

    return executeCliAndReadJson<KnipReport>(command, finalArgs, rawOutPath, {
      cwd: this.projectRoot,
      shell: !resolvedBin
    });
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidatePackageHygieneAuditor());

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import ts from 'typescript';
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
      ruleDescription: 'Dependencies: Unused dependencies in package.json',
      severity: 'error',
      file: relFile,
      line: dep.line ?? 1,
      col: dep.col ?? 1,
      context: dep.name,
      message: `Unused dependency declared in package.json: "${dep.name}"`
    });
  }
  return findings;
}

function parseUnlistedDeps(fileIssue: KnipFileIssues, relFile: string): AuditFinding[] {
  return (fileIssue.unlisted ?? []).map((unlisted) => ({
    suiteId: 'validate_package_hygiene',
    suiteName: 'Package & Dependency Hygiene Auditor',
    ruleId: 'package-unlisted-dependency',
    ruleDescription: 'Dependencies: Undeclared phantom dependency',
    severity: 'error',
    file: relFile,
    line: unlisted.line ?? 1,
    col: unlisted.col ?? 1,
    context: unlisted.name,
    message: `Phantom dependency not declared in package.json imported in code: "${unlisted.name}"`
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
      ruleDescription: 'Dependencies: Unreferenced binary or script',
      severity: 'error',
      file: relFile,
      line: bin.line ?? 1,
      col: bin.col ?? 1,
      context: bin.name,
      message: `Unreferenced executable script or binary in project: "${bin.name}"`
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
      ruleDescription: 'Dependencies: Corrupted or insecure lockfile',
      severity: 'error',
      file: 'package-lock.json',
      line: 1,
      context: 'package-lock.json',
      message: 'package-lock.json not found. The project must commit its lockfile.'
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
      ruleDescription: 'Dependencies: Corrupted or insecure lockfile',
      severity: 'error',
      file: 'package-lock.json',
      line: 1,
      context: 'package-lock.json',
      message: `Error reading package-lock.json: ${err instanceof Error ? err.message : String(err)}`
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
      ruleDescription: 'Dependencies: Corrupted or insecure lockfile',
      severity: 'error',
      file: 'package-lock.json',
      line: 1,
      context: 'merge-conflict',
      message: 'package-lock.json contains unresolved merge conflict markers.'
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
      ruleDescription: 'Dependencies: Corrupted or insecure lockfile',
      severity: 'error',
      file: 'package-lock.json',
      line: 1,
      context: 'json-syntax',
      message: `package-lock.json contains invalid JSON: ${err instanceof Error ? err.message : String(err)}`
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
      ruleDescription: 'Dependencies: Corrupted or insecure lockfile',
      severity: 'error',
      file: 'package-lock.json',
      line: 1,
      context: `lockfileVersion: ${lockfileVersion}`,
      message: `Outdated lockfileVersion (${lockfileVersion}). Requires lockfileVersion 3 (Node.js 18+ / npm v9+).`
    });
  }

  // 3. Insecure HTTP registry check (CWE-319 cleartext transmission / MitM hazard)
  if (/"resolved"\s*:\s*"http:\/\//.test(rawContent)) {
    findings.push({
      suiteId: 'validate_package_hygiene',
      suiteName: 'Package & Dependency Hygiene Auditor',
      ruleId: 'package-lockfile-integrity',
      ruleDescription: 'Dependencies: Corrupted or insecure lockfile',
      severity: 'error',
      file: 'package-lock.json',
      line: 1,
      context: 'insecure-http-resolved',
      message:
        'package-lock.json contains insecure package resolutions via unencrypted http://.'
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
        ruleDescription: 'Dependencies: Corrupted or insecure lockfile',
        severity: 'error',
        file: 'package.json',
        line: 1,
        context: `${depName}: ${spec}`,
        message: `Dependency "${depName}" uses a floating git range ("${spec}"). To guarantee deterministic deployments with 'npm ci', you must pin an exact tag (e.g. "github:org/repo#vX.Y.Z") or a commit SHA.`
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
        ruleDescription: 'Dependencies: Corrupted or insecure lockfile',
        severity: 'error',
        file: 'package-lock.json',
        line: 1,
        context: `${depName}: missing`,
        message: `Dependency "${depName}" declared in package.json is not registered in package-lock.json. Run "npm install" to synchronize the lockfile.`
      });
    } else if (lockedSpec !== expectedSpec) {
      findings.push({
        suiteId: 'validate_package_hygiene',
        suiteName: 'Package & Dependency Hygiene Auditor',
        ruleId: 'package-lockfile-integrity',
        ruleDescription: 'Dependencies: Corrupted or insecure lockfile',
        severity: 'error',
        file: 'package-lock.json',
        line: 1,
        context: `${depName}: ${expectedSpec} vs ${lockedSpec}`,
        message: `Dependency "${depName}" in package.json ("${expectedSpec}") differs from package-lock.json ("${lockedSpec}"). Run "npm install" to synchronize the lockfile.`
      });
    }
  }
}

function toPosixGlobPattern(targetPath: string): string {
  const norm = targetPath.split(path.sep).join(path.posix.sep);
  return norm.endsWith(path.posix.sep) ? `${norm}**` : path.posix.join(norm, '**');
}

export class ValidatePackageHygieneAuditor extends BaseAuditor<PackageHygieneRuleId> {
  constructor(options: { projectRoot?: string; fix?: boolean } = {}) {
    const effectiveRoot = options.projectRoot ?? process.cwd();
    super({
      usesThirdPartyTool: true,
      requiredPermissions: ['--allow-child-process'],
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
      description: 'Hygiene of orphaned and phantom dependencies',
      family: 'architecture',
      packageName: 'Dependencies',
      configKey: 'packageHygiene.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '📦',
      ruleIds: PACKAGE_HYGIENE_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(PACKAGE_HYGIENE_RULES, 'hygiene'),
      ruleDescriptions: {
        'package-unused-dependency': 'Unused dependency in package',
        'package-unlisted-dependency': 'Undeclared phantom dependency',
        'package-unused-binary': 'Unreferenced binary or script',
        'package-lockfile-integrity': 'Corrupted or insecure lockfile'
      },
      ruleRemediations: {
        'package-unused-dependency':
          '📖 REMEDIATION GUIDE: package-unused-dependency\n' +
          '1. Root Cause: A package was declared in `dependencies` or `devDependencies` of `package.json` that is never imported in source code nor invoked in scripts or build tooling.\n' +
          '2. Diagnosis: Review the report to identify the orphaned package. Verify with Fallow or global search if any references exist.\n' +
          '3. Canonical Solution: Remove the unused dependency by running `npm uninstall <package>` to minimize dependency bloat and attack surface.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm uninstall <orphaned-package>`',
        'package-unlisted-dependency':
          '📖 REMEDIATION GUIDE: package-unlisted-dependency\n' +
          '1. Root Cause: Source code imports a third-party package (phantom dependency) that is not formally declared in `dependencies` or `devDependencies` of `package.json`, functioning only coincidentally due to `node_modules` hoisting.\n' +
          '2. Diagnosis: Inspect the reported path and package name in the violation.\n' +
          '3. Canonical Solution: Explicitly declare the package in `package.json` via `npm install <package>` or `npm install -D <package>`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm install <package>` or `npm install -D <package>`',
        'package-unused-binary':
          '📖 REMEDIATION GUIDE: package-unused-binary\n' +
          '1. Root Cause: A script or executable declared in `bin` of `package.json` points to a non-existent, non-executable, or unreferenced file.\n' +
          '2. Diagnosis: Inspect the `bin` field of `package.json` and ensure the target file exists and includes a valid shebang (`#!/usr/bin/env node`).\n' +
          '3. Canonical Solution: Correct the executable path in `dist/` or remove the `bin` entry if no longer exposing a CLI binary.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `"bin": { "auditor": "dist/cli/index.js" }`',
        'package-lockfile-integrity':
          '📖 REMEDIATION GUIDE: package-lockfile-integrity\n' +
          '1. Root Cause: `package-lock.json` is out of sync with declared versions and ranges in `package.json`, or contains invalid/insecure resolutions.\n' +
          '2. Diagnosis: Check discrepancies between installed packages and declarations in `package.json`.\n' +
          '3. Canonical Solution: Run `npm install` to regenerate and cleanly synchronize the lockfile without breaking dependency contracts.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm install`'
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

    const findings = parseKnipIssues(
      report,
      this.projectRoot,
      (p) => this.isPathIgnored(p) || this.isPathExempt(p)
    );
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
          if (
            finding.file &&
            finding.file !== 'package.json' &&
            (this.isPathIgnored(finding.file) || this.isPathExempt(finding.file))
          ) {
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

  private resolveFallowIgnoredDependencies(): readonly string[] {
    const fallowConfigPath = path.resolve(this.projectRoot, '.fallowrc.json');
    if (!fs.existsSync(fallowConfigPath)) return [];
    try {
      const rawFallow = fs.readFileSync(fallowConfigPath, 'utf-8');
      const parsedFallow = JSON.parse(rawFallow);
      return Array.isArray(parsedFallow.ignoreDependencies) ? parsedFallow.ignoreDependencies : [];
    } catch {
      return [];
    }
  }

  private resolveImplicitCoverageDependencies(): readonly string[] {
    const deps: string[] = []; // no-domain: Dynamic list of coverage packages
    const viteConfigPath = path.resolve(this.projectRoot, 'vite.config.ts');
    if (!fs.existsSync(viteConfigPath)) return deps;
    try {
      const viteContent = fs.readFileSync(viteConfigPath, 'utf-8');
      if (viteContent.includes("'v8'") || viteContent.includes('"v8"')) {
        deps.push('@vitest/coverage-v8');
      }
      if (viteContent.includes("'istanbul'") || viteContent.includes('"istanbul"')) {
        deps.push('@vitest/coverage-istanbul');
      }
    } catch {
      // catch-ok: best effort read
    }
    return deps;
  }

  private hasVitePlusDependencyOrConfig(): boolean {
    if (fs.existsSync(path.resolve(this.projectRoot, 'vite.config.ts'))) return true;
    const pkgJsonPath = path.resolve(this.projectRoot, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) return false;
    try {
      const pkgRaw = fs.readFileSync(pkgJsonPath, 'utf-8');
      const parsed = JSON.parse(pkgRaw);
      return Boolean(parsed.dependencies?.['vite-plus'] || parsed.devDependencies?.['vite-plus']);
    } catch {
      return false;
    }
  }

  private buildEphemeralKnipConfig(config: AuditConfig, scratchDir: string): string {
    const customIgnoredDeps = config.packageHygiene?.ignoreDependencies ?? [];
    const fallowIgnoredDeps = this.resolveFallowIgnoredDependencies();
    const scriptReferencedDeps = Array.from(extractReferencedScriptDependencies(this.projectRoot));
    const implicitTestDeps = this.resolveImplicitCoverageDependencies();
    const allIgnoredDeps = Array.from(
      new Set([
        ...customIgnoredDeps,
        ...fallowIgnoredDeps,
        ...scriptReferencedDeps,
        ...implicitTestDeps
      ])
    );
    const customIgnoredBinaries = config.packageHygiene?.ignoreBinaries ?? [];
    const ownBinaries = Array.from(extractOwnPackageBinaries(this.projectRoot));
    const vitePlusBinaries = this.hasVitePlusDependencyOrConfig()
      ? (['vite', 'vitest', 'tsdown', 'oxlint', 'oxfmt', 'vp'] as const)
      : [];

    const allIgnoredBinaries = Array.from(
      new Set([...customIgnoredBinaries, ...ownBinaries, ...vitePlusBinaries])
    );

    const customEntry = config.packageHygiene?.entry;
    const effectiveEntry =
      customEntry && customEntry.length > 0
        ? [...customEntry]
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
        ...(config.paths.ignoredDirs?.flatMap((d) => [toPosixGlobPattern(d), d.split(path.sep).join(path.posix.sep)]) ?? []),
        ...(config.paths.ignoredPatterns?.map((p) => p.split(path.sep).join(path.posix.sep)) ?? []),
        ...(config.paths.ignoreGlobs?.map((g) => g.split(path.sep).join(path.posix.sep)) ?? []),
        ...(this.extraIgnorePatterns?.map((g) => g.split(path.sep).join(path.posix.sep)) ?? []),
        ...(this.exemptPaths?.map(toPosixGlobPattern) ?? [])
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

    if (tsconfigHasReferences(this.projectRoot)) {
      cliFlags.push('--use-tsconfig-files');
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

/**
 * Detects whether the host root `tsconfig.json` declares project `references`.
 * Parsed with the TypeScript JSONC reader (no regex) so comments and trailing commas are tolerated.
 */
export function tsconfigHasReferences(projectRoot: string): boolean {
  const tsconfigPath = path.resolve(projectRoot, 'tsconfig.json');
  if (!fs.existsSync(tsconfigPath)) return false;
  const parsed = ts.parseConfigFileTextToJson(tsconfigPath, fs.readFileSync(tsconfigPath, 'utf-8'));
  const references = (parsed.config as { references?: unknown } | undefined)?.references;
  return Array.isArray(references) && references.length > 0;
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidatePackageHygieneAuditor());

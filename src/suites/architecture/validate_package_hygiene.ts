import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import type { AuditFinding } from '../../core/auditContract.ts';
import { executeCliAndReadJson, resolvePackageBin } from '../../cli/cliUtils.ts';

enableCompileCache();

export type PackageHygieneRuleId =
  | 'package-unused-dependency'
  | 'package-unlisted-dependency'
  | 'package-unused-binary';

export const PACKAGE_HYGIENE_RULES: readonly PackageHygieneRuleId[] = [
  'package-unused-dependency',
  'package-unlisted-dependency',
  'package-unused-binary'
] as const;

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

/**
 * Parses raw JSON output from Knip into canonical AuditFindings.
 */
export function parseKnipIssues(
  report: KnipReport | readonly KnipFileIssues[],
  projectRoot: string = process.cwd()
): AuditFinding[] {
  const issues: readonly KnipFileIssues[] = Array.isArray(report)
    ? report
    : (report && 'issues' in report && Array.isArray(report.issues) ? report.issues : []);
  const findings: AuditFinding[] = [];

  for (const fileIssue of issues) {
    const rawFile = fileIssue.file || 'package.json';
    const relFile = path.isAbsolute(rawFile)
      ? path.relative(projectRoot, rawFile).replace(/\\/g, '/')
      : rawFile.replace(/\\/g, '/');

    // Unused dependencies & devDependencies
    const allUnused = [
      ...(fileIssue.dependencies ?? []),
      ...(fileIssue.devDependencies ?? []),
      ...(fileIssue.optionalPeerDependencies ?? [])
    ];

    for (const dep of allUnused) {
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

    // Unlisted (phantom) dependencies
    for (const unlisted of fileIssue.unlisted ?? []) {
      findings.push({
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
      });
    }

    // Unused package binaries
    for (const bin of fileIssue.binaries ?? []) {
      findings.push({
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
      });
    }
  }

  return findings;
}

export class ValidatePackageHygieneAuditor extends BaseAuditor<PackageHygieneRuleId> {
  private readonly fixMode: boolean;

  constructor(options: { projectRoot?: string; fix?: boolean } = {}) {
    const effectiveRoot = options.projectRoot ?? process.cwd();
    super({
      capabilities: { fix: true, heavy: true },
      id: 'validate_package_hygiene',
      name: 'Package & Dependency Hygiene Auditor',
      description: 'Higiene de dependencias huérfanas y fantasmas',
      family: 'architecture',
      packageName: 'Dependencias',
      icon: '📦',
      ruleIds: PACKAGE_HYGIENE_RULES,
      ruleDescriptions: {
        'package-unused-dependency': 'Dependencia no utilizada en package',
        'package-unlisted-dependency': 'Dependencia fantasma no declarada',
        'package-unused-binary': 'Binario o script no referenciado'
      },
      projectRoot: effectiveRoot
    });
    this.fixMode = options.fix ?? false;
  }

  public override async runAudit(): Promise<void> {
    const config = getAuditConfig(this.projectRoot);
    if (config.packageHygiene?.enabled === false) {
      return;
    }

    const scratchDir = path.resolve(this.projectRoot, 'scratch/audits/architecture');
    const cacheDir = path.resolve(this.projectRoot, 'scratch/cache');
    fs.mkdirSync(scratchDir, { recursive: true });
    fs.mkdirSync(cacheDir, { recursive: true });

    const rawOutPath = path.resolve(scratchDir, 'knip-raw.json');
    const ephemeralConfigPath = path.resolve(scratchDir, 'knip-ephemeral.json');
    const cachePath = path.resolve(cacheDir, 'knip');

    if (fs.existsSync(rawOutPath)) {
      try {
        fs.unlinkSync(rawOutPath);
      } catch {
        // catch-ok: Best effort cleanup of stale raw report
      }
    }

    // Read ignoreDependencies from .fallowrc.json if present
    const fallowConfigPath = path.resolve(this.projectRoot, '.fallowrc.json');
    let fallowIgnoredDeps: string[] = [];
    if (fs.existsSync(fallowConfigPath)) {
      try {
        const fallowJson = JSON.parse(fs.readFileSync(fallowConfigPath, 'utf-8'));
        if (Array.isArray(fallowJson.ignoreDependencies)) {
          fallowIgnoredDeps = fallowJson.ignoreDependencies;
        }
      } catch {
        // catch-ok: Best effort read of fallow ignoreDependencies
      }
    }

    const customIgnoredDeps = config.packageHygiene?.ignoreDependencies ?? [];
    const allIgnoredDeps = Array.from(new Set([...fallowIgnoredDeps, ...customIgnoredDeps]));
    const customIgnoredBinaries = config.packageHygiene?.ignoreBinaries ?? [];

    const ephemeralConfig = {
      $schema: 'https://unpkg.com/knip@5/overview/configuration-schema.json',
      entry: [
        'src/index.ts',
        'src/cli/*.ts',
        'src/core/*.ts',
        'src/plugin/*.ts',
        'src/analyzers/*.ts',
        'src/suites/**/*.ts',
        'audit.config.ts'
      ],
      project: [
        'src/**/*.{ts,vue,js}',
        'tests/**/*.{ts,vue,js}',
        'scripts/**/*.{ts,js}'
      ],
      ignore: [
        'dist/**',
        'scratch/**',
        'coverage/**',
        'skills/**',
        '.agents/**',
        '**/*.d.ts',
        ...(config.paths.ignoreGlobs ?? [])
      ],
      ignoreDependencies: allIgnoredDeps,
      ignoreBinaries: customIgnoredBinaries
    };

    fs.writeFileSync(ephemeralConfigPath, JSON.stringify(ephemeralConfig, null, 2), 'utf-8');

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

    if (this.fixMode) {
      cliFlags.push('--fix', '--fix-type', 'dependencies');
    }

    const resolvedBin = resolvePackageBin('knip', {
      projectRoot: this.projectRoot,
      fallbackRelativeBin: 'bin/knip.js'
    });

    const command = resolvedBin ? process.execPath : 'npx';
    const finalArgs = resolvedBin
      ? [resolvedBin, ...cliFlags]
      : ['--yes', 'knip', ...cliFlags];

    const report = executeCliAndReadJson<KnipReport>(command, finalArgs, rawOutPath, {
      cwd: this.projectRoot,
      shell: !resolvedBin
    });
    if (!report) {
      return;
    }

    const findings = parseKnipIssues(report, this.projectRoot);
    for (const finding of findings) {
      this.addViolation({
        ruleId: (finding.ruleId as PackageHygieneRuleId) ?? 'package-unused-dependency',
        severity: finding.severity,
        file: finding.file ?? 'package.json',
        line: finding.line ?? 1,
        context: finding.context ?? finding.message,
        message: finding.message
      });
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidatePackageHygieneAuditor());

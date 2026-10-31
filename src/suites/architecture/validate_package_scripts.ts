/**
 * src/suites/architecture/validate_package_scripts.ts
 *
 * PACKAGE SCRIPTS & BUILD CHAINING INTEGRITY AUDITOR (Node.js 26+)
 *
 * Validates package.json scripts hygiene, build pipeline chaining (pre-audit + post-audit),
 * warning ratchet references and baselines, and canonical script naming.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* src/suites/architecture/validate_package_scripts.ts
 */

import fs from 'node:fs';
import { enableCompileCache } from 'node:module';
import path from 'node:path';

import { resolveGitCommit, describeBaselineDefect } from '../../cli/auditRatchet.ts';
import { collectAllPackageScriptRequirements } from '../../cli/auditScanner.ts';
import {
  loadAuditConfig,
  buildRatchetConfig,
  type AuditEngineConfig
} from '../../core/auditConfig.ts';
import type {
  AuditorPackageScriptRequirement,
  RuleFixContext,
  AnyRuleFixerFn
} from '../../core/auditContract.ts';
import {
  BaseAuditor,
  createUniformRemediationPhases,
  createRuleCapabilities
} from '../../core/auditorBase.ts';
import { getPackageJson, writePackageJson, type PackageJsonDTO } from '../../core/packageJson.ts';
import { DEFAULT_PERMISSIONS } from '../../core/permissionGuard.ts';

enableCompileCache();

export const PACKAGE_SCRIPTS_RULES = [
  'package-scripts-missing-file',
  'package-scripts-build-missing-audit',
  'package-scripts-removed-commit-gate',
  'package-scripts-invalid-production-ref',
  'package-scripts-invalid-ratchet-baseline',
  'package-scripts-missing-recommended',
  'package-scripts-obsolete'
] as const;

export type PackageScriptsRuleId = (typeof PACKAGE_SCRIPTS_RULES)[number];

const REMOVED_COMMIT_GATE_PATTERN = /audit:for-commit|auditor-commit|audit_for_commit/u;
const FIXABLE_COMMIT_GATE_PATTERN =
  /\b(?:(?:npm|pnpm|bun|yarn)\s+run\s+audit:for-commit|auditor-commit)\b/gu;
const REMOVED_COMMIT_GATE_SCRIPT = 'audit:for-commit';

export interface ValidatePackageScriptsOptions {
  readonly projectRoot?: string;
}

interface BuildScriptDefectOptions {
  hasPre: boolean;
  hasPost: boolean;
}

interface MutablePackageJson {
  name?: string;
  scripts?: Record<string, string>;
  [key: string]: unknown;
}

export async function fixRemovedCommitGate(
  context: RuleFixContext<'package-scripts-removed-commit-gate'>
): Promise<boolean> {
  return runPackageScriptsRepair(context.projectRoot, (auditor, pkg) =>
    auditor.verifyRemovedCommitGate(pkg.scripts ?? {}, true)
  );
}

async function runPackageScriptsRepair(
  projectRoot: string,
  repairFn: (
    auditor: ValidatePackageScriptsAuditor,
    pkg: PackageJsonDTO,
    config: AuditEngineConfig
  ) => boolean | Promise<boolean>
): Promise<boolean> {
  const pkg = getPackageJson(projectRoot);
  if (!pkg) return false;
  const config = await loadAuditConfig(projectRoot);
  const auditor = new ValidatePackageScriptsAuditor({ projectRoot });
  if (await repairFn(auditor, pkg, config)) {
    writePackageJson(projectRoot, pkg);
    return true;
  }
  return false;
}

export async function fixBuildScriptChaining(
  context: RuleFixContext<'package-scripts-build-missing-audit'>
): Promise<boolean> {
  return runPackageScriptsRepair(context.projectRoot, (auditor, pkg, config) =>
    auditor.verifyBuildScript(pkg, config, true)
  );
}

export async function fixMissingRecommendedScripts(
  context: RuleFixContext<'package-scripts-missing-recommended'>
): Promise<boolean> {
  return runPackageScriptsRepair(context.projectRoot, (auditor, pkg, config) =>
    auditor.verifyRecommendedScripts(pkg, config, true)
  );
}

export async function fixObsoleteScripts(
  context: RuleFixContext<'package-scripts-obsolete'>
): Promise<boolean> {
  return runPackageScriptsRepair(context.projectRoot, (auditor, pkg) => {
    let modified = false;
    if (auditor.verifyLintScript(pkg.scripts ?? {}, true)) modified = true;
    if (auditor.verifyVitePlusScripts(pkg.scripts ?? {}, pkg, true)) modified = true;
    if (auditor.pruneObsoleteAuditorScripts(pkg.scripts ?? {}, true)) modified = true;
    if (auditor.verifyCiWorkflows(true)) modified = true;
    return modified;
  });
}

const PACKAGE_SCRIPTS_FIXERS: Partial<Record<PackageScriptsRuleId, AnyRuleFixerFn>> = {
  'package-scripts-removed-commit-gate': fixRemovedCommitGate,
  'package-scripts-obsolete': fixObsoleteScripts,
  'package-scripts-build-missing-audit': fixBuildScriptChaining,
  'package-scripts-missing-recommended': fixMissingRecommendedScripts
};

export class ValidatePackageScriptsAuditor extends BaseAuditor<PackageScriptsRuleId> {
  public constructor(options: ValidatePackageScriptsOptions = {}) {
    const resolvedRoot = options.projectRoot ?? process.cwd();

    super({
      ruleFixers: PACKAGE_SCRIPTS_FIXERS,
      usesThirdPartyTool: false,
      requiredPermissions: [],
      projectRoot: resolvedRoot,
      ruleCapabilities: createRuleCapabilities(PACKAGE_SCRIPTS_RULES, {
        speed: 'light',
        phase: 'setup',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_package_scripts',
      name: 'Package Scripts & Build Chaining Validator',
      description: 'Validates package.json scripts and build pipeline',
      family: 'architecture',
      ruleIds: PACKAGE_SCRIPTS_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(PACKAGE_SCRIPTS_RULES, 'setup'),
      packageName: 'Scripts',
      icon: '📦',
      configKey: 'packageScripts',
      defaultConfig: { enabled: true, enforceBuildAudit: true, recommendedScripts: true },
      criticalConfig: {},
      ruleDescriptions: {
        'package-scripts-missing-file': 'Missing or invalid package.json',
        'package-scripts-build-missing-audit': 'Missing auditor in build script',
        'package-scripts-removed-commit-gate': 'Script uses obsolete commit gate',
        'package-scripts-invalid-production-ref': 'Production ref does not resolve in git',
        'package-scripts-invalid-ratchet-baseline': 'Invalid ratchet baseline',
        'package-scripts-missing-recommended': 'Missing recommended script in package',
        'package-scripts-obsolete': 'Legacy or obsolete script in package.json'
      },
      ruleRemediations: {
        'package-scripts-missing-file':
          '📖 REMEDIATION GUIDE: package-scripts-missing-file\n' +
          '1. Root Cause: package.json does not exist in project root or contains an unrecoverable JSON syntax error.\n' +
          '2. Diagnosis: Verify that package.json exists in project root and is well-formed JSON.\n' +
          '3. Canonical Solution: Create or restore package.json using "npm init -y" or fix JSON syntax errors.\n' +
          '4. Example / Auto-fix command:\n' +
          '   npm init -y',
        'package-scripts-build-missing-audit':
          '📖 REMEDIATION GUIDE: package-scripts-build-missing-audit\n' +
          '1. Root Cause: The "build" script in package.json does not chain strict pre-build auditing ("npm run auditor:full") and post-build artifact validation ("npm run auditor:post-build").\n' +
          '2. Diagnosis: Inspect scripts.build in package.json. It must contain the complete chain: pre-audit -> build -> post-audit.\n' +
          '3. Canonical Solution: Run "npm run auditor:fix" to automatically configure the canonical build script.\n' +
          '4. Example / Auto-fix command:\n' +
          '   "build": "npm run auditor:full && vp build && npm run auditor:post-build"',
        'package-scripts-removed-commit-gate':
          '📖 REMEDIATION GUIDE: package-scripts-removed-commit-gate\n' +
          '1. Root Cause: A script in package.json invokes the deprecated "audit:for-commit" gate.\n' +
          '2. Diagnosis: Search for "audit:for-commit" in package.json scripts.\n' +
          '3. Canonical Solution: Run "npm run auditor:fix" or replace the invocation with "npm run auditor" or "auditor".\n' +
          '4. Example / Auto-fix command:\n' +
          '   npm run auditor:fix',
        'package-scripts-invalid-production-ref':
          '📖 REMEDIATION GUIDE: package-scripts-invalid-production-ref\n' +
          '1. Root Cause: The configured git ref for the warning ratchet ("ratchet.productionRef") does not resolve in the local repository.\n' +
          '2. Diagnosis: Run "git rev-parse <productionRef>" to check if the commit exists locally.\n' +
          '3. Canonical Solution: In CI/CD, set fetch-depth: 0 on checkout. Locally, run "git fetch origin main".\n' +
          '4. Example / Auto-fix command:\n' +
          '   git fetch origin main',
        'package-scripts-invalid-ratchet-baseline':
          '📖 REMEDIATION GUIDE: package-scripts-invalid-ratchet-baseline\n' +
          '1. Root Cause: The warning ratchet baseline file (".auditor/audit-baseline.json") is corrupt, invalid, or references non-existent rules.\n' +
          '2. Diagnosis: Inspect the error message to identify the specific defect in the baseline file.\n' +
          '3. Canonical Solution: Run "auditor --ratchet-baseline" from a clean main branch to regenerate the file.\n' +
          '4. Example / Auto-fix command:\n' +
          '   npm run auditor -- --ratchet-baseline',
        'package-scripts-missing-recommended':
          '📖 REMEDIATION GUIDE: package-scripts-missing-recommended\n' +
          '1. Root Cause: Mandatory canonical scripts from the auditor ecosystem are missing in package.json scripts.\n' +
          '2. Diagnosis: The warning message specifies which required scripts are missing.\n' +
          '3. Canonical Solution: Run "npm run auditor:fix" to inject and synchronize all mandatory scripts.\n' +
          '4. Example / Auto-fix command:\n' +
          '   npm run auditor:fix',
        'package-scripts-obsolete':
          '📖 REMEDIATION GUIDE: package-scripts-obsolete\n' +
          '1. Root Cause: Obsolete or legacy scripts were detected in package.json or CI/CD workflows.\n' +
          '2. Diagnosis: Examine the flagged scripts in the audit report.\n' +
          '3. Canonical Solution: Run "npm run auditor:fix" to migrate scripts to Vite+ and canonical auditor commands.\n' +
          '4. Example / Auto-fix command:\n' +
          '   npm run auditor:fix'
      },
      coverage: {
        include: ['package.json', '.auditor/audit-baseline.json', '.github/workflows/**']
      }
    });
  }

  public override async runAudit(): Promise<void> {
    const config = await loadAuditConfig(this.projectRoot);
    if (config.packageScripts?.enabled === false) {
      this.markSkipped('Disabled in config (packageScripts.enabled = false)');
      return;
    }

    let pkg: {
      name?: string;
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      [key: string]: unknown;
    } | null = null;
    this.runSubAuditorSync('package-scripts-missing-file', () => {
      const pkgPath = path.resolve(this.projectRoot, 'package.json');
      if (fs.existsSync(pkgPath)) {
        this.recordScanned('package.json');
      }
      pkg = this.loadPackageJson(pkgPath);
    });
    if (!pkg) {
      for (const r of PACKAGE_SCRIPTS_RULES) {
        if (r !== 'package-scripts-missing-file') {
          this.runSubAuditorSync(r, () => {
            this.markRuleNotApplicable(r, 'package.json no disponible o inválido');
          });
        }
      }
      return;
    }

    let modified = false;
    this.runSubAuditorSync('package-scripts-removed-commit-gate', () => {
      if (pkg!.scripts && this.verifyRemovedCommitGate(pkg!.scripts)) modified = true;
    });

    this.runSubAuditorSync('package-scripts-obsolete', () => {
      if (pkg!.scripts) {
        if (this.verifyLintScript(pkg!.scripts)) modified = true;
        if (this.verifyVitePlusScripts(pkg!.scripts, pkg!)) modified = true;
        if (this.pruneObsoleteAuditorScripts(pkg!.scripts)) modified = true;
      }
      this.verifyCiWorkflows();
    });

    this.runSubAuditorSync('package-scripts-build-missing-audit', () => {
      if (this.verifyBuildScript(pkg!, config)) modified = true;
    });

    await this.runSubAuditor('package-scripts-missing-recommended', async () => {
      if (await this.verifyRecommendedScripts(pkg!, config)) modified = true;
    });

    if (modified) {
      writePackageJson(this.projectRoot, pkg);
    }

    this.runSubAuditorSync('package-scripts-invalid-production-ref', () => {
      this.verifyProductionRef(config);
    });

    this.runSubAuditorSync('package-scripts-invalid-ratchet-baseline', () => {
      this.verifyRatchetBaseline(config);
    });
  }

  private loadPackageJson(pkgPath: string): {
    name?: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    [key: string]: unknown;
  } | null {
    if (!fs.existsSync(pkgPath)) {
      this.addViolation({
        ruleId: 'package-scripts-missing-file',
        severity: 'error',
        file: 'package.json',
        line: 1,
        message: 'Configuration error: package.json does not exist in project root.',
        context: 'package.json'
      });
      return null;
    }

    const parsed = getPackageJson(this.projectRoot, true);
    if (!parsed) {
      this.addViolation({
        ruleId: 'package-scripts-missing-file',
        severity: 'error',
        file: 'package.json',
        line: 1,
        message: 'Configuration error: package.json could not be parsed as valid JSON.',
        context: 'package.json'
      });
      return null;
    }
    return parsed;
  }

  private checkBuildScriptChainsPreAudit(buildScript: string): boolean {
    if (REMOVED_COMMIT_GATE_PATTERN.test(buildScript)) return true;
    if (/\bauditor:precommit\b|\bpreset=precommit\b/.test(buildScript)) return false;
    return (
      /\bauditor(?:\.js|\.ts)?(?::full|\s+(?:speed=full|--speed=full|full)|\s|$|[&;])/.test(
        buildScript
      ) || /\b(?:npm|pnpm|bun|vp)\s+run\s+auditor(?::full|\s|$|[&;])/.test(buildScript)
    );
  }

  private checkBuildScriptChainsPostAudit(buildScript: string): boolean {
    if (/\bauditor:build\b|\bpreset=build\b/.test(buildScript)) return false;
    return (
      /\b(?:npm|pnpm|bun|vp)\s+run\s+auditor:post-build(?:\s|$|[&;])/.test(buildScript) ||
      /\bauditor-post-build(?:\.js|\.ts)?(?:\s|$|[&;])/.test(buildScript) ||
      /\bauditor\s+(?:phase=post-build|--phase=post-build|post-build)(?:\s|$|[&;])/.test(
        buildScript
      )
    );
  }

  private rewriteBuildScript(buildScript: string): string {
    let rewritten = buildScript;
    if (/\b(?:npm|pnpm|bun|vp)\s+run\s+(?:audit:build|auditor:build)\b/.test(rewritten)) {
      rewritten = rewritten.replaceAll(
        /\b((?:npm|pnpm|bun|vp)\s+run\s+)(?:audit:build|auditor:build)\b/g,
        '$1auditor:post-build'
      );
    }
    if (/\bauditor\s+preset=build\b/.test(rewritten)) {
      rewritten = rewritten.replaceAll(/\bauditor\s+preset=build\b/g, 'auditor phase=post-build');
    }
    if (
      /\b(?:npm|pnpm|bun|vp)\s+run\s+(?:audit:precommit|auditor:precommit|audit)\b/.test(rewritten)
    ) {
      rewritten = rewritten.replaceAll(
        /\b((?:npm|pnpm|bun|vp)\s+run\s+)(?:audit:precommit|auditor:precommit|audit)\b/g,
        '$1auditor:full'
      );
    }
    if (/\bauditor\s+preset=precommit\b/.test(rewritten)) {
      rewritten = rewritten.replaceAll(/\bauditor\s+preset=precommit\b/g, 'auditor speed=full');
    }
    if (/\bvp\s+run\s+auditor:full\b/.test(rewritten)) {
      rewritten = rewritten.replaceAll(/\bvp\s+run\s+auditor:full\b/g, 'npm run auditor:full');
    }
    if (/\bvp\s+run\s+auditor:post-build\b/.test(rewritten)) {
      rewritten = rewritten.replaceAll(
        /\bvp\s+run\s+auditor:post-build\b/g,
        'npm run auditor:post-build'
      );
    }
    if (!this.checkBuildScriptChainsPreAudit(rewritten)) {
      rewritten = `npm run auditor:full && ${rewritten}`;
    }
    if (!this.checkBuildScriptChainsPostAudit(rewritten)) {
      rewritten = `${rewritten} && npm run auditor:post-build`;
    }
    return rewritten;
  }

  private describeBuildScriptDefect(options: BuildScriptDefectOptions): string {
    if (!options.hasPre && !options.hasPost) {
      return 'does not chain auditor:full before compilation nor auditor:post-build after compilation';
    }
    if (!options.hasPre) {
      return 'does not chain auditor:full before compilation';
    }
    if (!options.hasPost) {
      return 'does not chain auditor:post-build after compilation';
    }
    return 'uses "vp run" instead of "npm run" for auditor chaining, which deactivates Vite+ cache';
  }

  public verifyBuildScript(
    pkg: { scripts?: Record<string, string> },
    config: AuditEngineConfig,
    isFix = this.isFixActive()
  ): boolean {
    if (config.packageScripts?.enforceBuildAudit === false) return false;

    const buildScript = pkg.scripts?.build;
    if (!buildScript) {
      if (isFix) {
        pkg.scripts = pkg.scripts ?? {};
        pkg.scripts.build = 'npm run auditor:full && npm run auditor:post-build';
        return true;
      }
      this.addViolation({
        ruleId: 'package-scripts-build-missing-audit',
        severity: 'error',
        file: 'package.json',
        line: 1,
        message:
          'Build script in package.json is missing or does not chain auditor before and after compilation. Expected "npm run auditor:full && ... && npm run auditor:post-build".',
        context: 'package.json:scripts.build'
      });
      return false;
    }

    if (isFix) {
      const rewritten = this.rewriteBuildScript(buildScript);
      if (rewritten !== buildScript) {
        pkg.scripts!.build = rewritten;
        return true;
      }
    }

    const hasPre = this.checkBuildScriptChainsPreAudit(buildScript);
    const hasPost = this.checkBuildScriptChainsPostAudit(buildScript);
    const usesVpRunForAuditor = /\bvp\s+run\s+auditor:(?:full|post-build)\b/.test(buildScript);

    if (!hasPre || !hasPost || usesVpRunForAuditor) {
      const missingPart = this.describeBuildScriptDefect({ hasPre, hasPost });
      this.addViolation({
        ruleId: 'package-scripts-build-missing-audit',
        severity: 'error',
        file: 'package.json',
        line: 1,
        message: `Build script in package.json ${missingPart}. Expected "npm run auditor:full && ... && npm run auditor:post-build".`,
        context: buildScript
      });
      return false;
    }

    return false;
  }

  public verifyLintScript(scripts: Record<string, string>, isFix = this.isFixActive()): boolean {
    let modified = false;
    if (scripts.lint && /\b(?:npm|pnpm|bun)\s+run\s+audit:lint\b/.test(scripts.lint)) {
      if (isFix) {
        scripts.lint = scripts.lint.replaceAll(
          /\b((?:npm|pnpm|bun)\s+run\s+)audit:lint\b/g,
          '$1auditor:lint'
        );
        modified = true;
      }
    }
    return modified;
  }

  public verifyVitePlusScripts(
    scripts: Record<string, string>,
    pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> },
    isFix = this.isFixActive()
  ): boolean {
    const isVitePlusProject =
      fs.existsSync(path.resolve(this.projectRoot, 'vite.config.ts')) ||
      Boolean(pkg.dependencies?.['vite-plus'] || pkg.devDependencies?.['vite-plus']);

    if (!isVitePlusProject) return false;

    let modified = false;

    for (const [name, command] of Object.entries(scripts)) {
      let migrated = command;

      // Migrate vitest run / vitest -> vp test
      if (/\bvitest\s+run\b/.test(migrated)) {
        migrated = migrated.replaceAll(/\bvitest\s+run\b/g, 'vp test');
      } else if (/\bvitest\b/.test(migrated) && !/\bvp\s+test\b/.test(migrated)) {
        migrated = migrated.replaceAll(/\bvitest\b/g, 'vp test');
      }

      // Migrate vite build -> vp build
      if (/\bvite\s+build\b/.test(migrated)) {
        migrated = migrated.replaceAll(/\bvite\s+build\b/g, 'vp build');
      }

      // Migrate vite preview -> vp preview
      if (/\bvite\s+preview\b/.test(migrated)) {
        migrated = migrated.replaceAll(/\bvite\s+preview\b/g, 'vp preview');
      }

      // Migrate vite dev or direct vite invocation -> vp dev
      if (/\bvite\s+dev\b/.test(migrated)) {
        migrated = migrated.replaceAll(/\bvite\s+dev\b/g, 'vp dev');
      } else if (/\bvite\b/.test(migrated) && !/\b(?:vp|vite-plus|@vitejs)\b/.test(migrated)) {
        migrated = migrated.replaceAll(/\bvite\b/g, 'vp dev');
      }

      if (migrated !== command) {
        if (isFix) {
          scripts[name] = migrated;
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'package-scripts-obsolete',
            severity: 'warning',
            file: 'package.json',
            line: 1,
            message: `Script "${name}" in package.json uses legacy Vite/Vitest binaries ("${command}"). In projects governed by Vite+, use the unified "vp" binary (e.g. "${migrated}"). Run "auditor fix" to migrate automatically.`,
            context: `${name}: "${command}" -> "${migrated}"`
          });
        }
      }
    }

    return modified;
  }

  private isObsoleteAuditorScript(name: string, command: string): boolean {
    const obsoleteScriptNames: ReadonlySet<string> = new Set([
      'audit',
      'init-agent',
      'sync:env',
      'env:setup',
      'env:check',
      'audit:family:documentation',
      'auditor:sync-env',
      'auditor:precommit',
      'auditor:build',
      'build:prod'
    ]);
    if (obsoleteScriptNames.has(name)) {
      return true;
    }
    if (name.startsWith('audit:')) {
      return true;
    }
    if (
      name.startsWith('validate:') &&
      (command.includes('auditor') ||
        command.includes('scripts/auditors') ||
        command.includes('src/suites'))
    ) {
      return true;
    }
    return false;
  }

  public pruneObsoleteAuditorScripts(
    scripts: Record<string, string>,
    isFix = this.isFixActive()
  ): boolean {
    let modified = false;
    for (const [name, command] of Object.entries(scripts)) {
      if (this.isObsoleteAuditorScript(name, command)) {
        if (isFix) {
          delete scripts[name];
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'package-scripts-obsolete',
            severity: 'warning',
            file: 'package.json',
            line: 1,
            message: `Obsolete or legacy auditor script detected in package.json: "${name}". Run "auditor fix" to clean up automatically.`,
            context: `${name}: ${command}`
          });
        }
      }
    }
    return modified;
  }

  public verifyCiWorkflows(isFix = this.isFixActive()): boolean {
    const workflowsDir = path.resolve(this.projectRoot, '.github', 'workflows');
    if (!fs.existsSync(workflowsDir)) return false;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(workflowsDir, { withFileTypes: true });
    } catch {
      // Ignore unreadable workflows directory
      return false;
    }

    let modified = false;
    const LEGACY_WORKFLOW_TOKEN =
      /\b(?:build:prod|auditor-build-prod|auditor:build|auditor:precommit)\b/;
    for (const entry of entries) {
      if (!entry.isFile() || (!entry.name.endsWith('.yml') && !entry.name.endsWith('.yaml')))
        continue;
      const fullPath = path.join(workflowsDir, entry.name);
      const relPath = path.posix.join('.github/workflows', entry.name);
      this.recordScanned(relPath);
      const content = fs.readFileSync(fullPath, 'utf8');
      if (!LEGACY_WORKFLOW_TOKEN.test(content)) continue;

      if (isFix) {
        const updated = content
          .replaceAll(/\bbuild:prod\b/g, 'build:deploy')
          .replaceAll(/\bauditor-build-prod\b/g, 'auditor-build-deploy')
          .replaceAll(/\bauditor:build\b/g, 'auditor:post-build')
          .replaceAll(/\bauditor:precommit\b/g, 'auditor:full');
        if (updated !== content) {
          fs.writeFileSync(fullPath, updated, 'utf8');
          modified = true;
        }
      } else {
        this.addViolation({
          ruleId: 'package-scripts-obsolete',
          severity: 'warning',
          file: relPath,
          line: 1,
          message: `CI/CD Workflow "${relPath}" uses obsolete commands (build:prod, auditor:build, or auditor:precommit). Run "auditor fix" to migrate them to build:deploy, auditor:post-build, and auditor:full.`,
          context: relPath
        });
      }
    }
    return modified;
  }

  private buildCanonicalScriptCommand(
    req: AuditorPackageScriptRequirement,
    isSelfPackage: boolean
  ): string {
    const command = req.command;
    if (!isSelfPackage) return command;

    if (command === 'auditor' || command.startsWith('auditor ')) {
      const basePermFlags = [
        '--disable-warning=PERM0002',
        ...DEFAULT_PERMISSIONS.filter((p) => p !== '--allow-addons')
      ];
      const extraPerms = req.permissions ?? [];
      const flags = Array.from(new Set([...basePermFlags, ...extraPerms])).join(' ');
      const runner = `node ${flags} src/cli/audit_full.ts`;
      if (command === 'auditor') return runner;
      return `${runner} ${command.slice('auditor '.length)}`;
    }

    if (command === 'auditor-build-deploy') {
      return 'node --experimental-strip-types src/cli/build_deploy.ts';
    }

    return command;
  }

  private isScriptCommandOutdated(existingCmd: string): boolean {
    return /\b(?:preset=lint|preset=precommit|preset=build|auditor-build-prod|build_prod\.ts|audit_build\.ts)\b/.test(
      existingCmd
    );
  }

  private async getMissingOrOutdatedRecommendedScripts(
    scripts: Record<string, string>,
    config: AuditEngineConfig,
    isSelfPackage: boolean
  ): Promise<[string, string][]> {
    const allRequirements = await collectAllPackageScriptRequirements(this.projectRoot, config);
    const seenNames = new Set<string>();
    const missingOrOutdated: [string, string][] = [];

    for (const req of allRequirements) {
      if (seenNames.has(req.name)) continue;
      seenNames.add(req.name);

      const existing = scripts[req.name];
      if (existing) {
        if (this.isScriptCommandOutdated(existing)) {
          missingOrOutdated.push([req.name, this.buildCanonicalScriptCommand(req, isSelfPackage)]);
        }
        continue;
      }

      if (typeof req.isApplicable === 'function' && !req.isApplicable(config, this.projectRoot)) {
        continue;
      }
      missingOrOutdated.push([req.name, this.buildCanonicalScriptCommand(req, isSelfPackage)]);
    }
    return missingOrOutdated;
  }

  public async verifyRecommendedScripts(
    pkg: MutablePackageJson,
    config: AuditEngineConfig,
    isFix = this.isFixActive()
  ): Promise<boolean> {
    if (config.packageScripts?.recommendedScripts === false) return false;

    const isSelfPackage = pkg.name === '@francogp/auditor';
    const scripts = pkg.scripts ?? {};
    const missingOrOutdated = await this.getMissingOrOutdatedRecommendedScripts(
      scripts,
      config,
      isSelfPackage
    );
    if (missingOrOutdated.length === 0) return false;

    if (isFix) {
      pkg.scripts = pkg.scripts ?? {};
      for (const [scriptName, scriptCmd] of missingOrOutdated) {
        pkg.scripts[scriptName] = scriptCmd;
      }
      return true;
    }

    for (const [scriptName, scriptCmd] of missingOrOutdated) {
      this.addViolation({
        ruleId: 'package-scripts-missing-recommended',
        severity: 'warning',
        file: 'package.json',
        line: 1,
        message: `Missing or outdated recommended auditor script "${scriptName}" in package.json (expected "${scriptName}": "${scriptCmd}"). Run "auditor fix" to update automatically.`,
        context: scriptName
      });
    }
    return false;
  }

  public verifyRemovedCommitGate(
    scripts: Record<string, string>,
    isFix = this.isFixActive()
  ): boolean {
    let modified = false;
    for (const [name, command] of Object.entries(scripts)) {
      if (!REMOVED_COMMIT_GATE_PATTERN.test(name) && !REMOVED_COMMIT_GATE_PATTERN.test(command))
        continue;
      if (isFix && name === REMOVED_COMMIT_GATE_SCRIPT) {
        delete scripts[name];
        modified = true;
        continue;
      }
      const rewritten = command.replaceAll(FIXABLE_COMMIT_GATE_PATTERN, 'auditor');
      if (isFix && !REMOVED_COMMIT_GATE_PATTERN.test(rewritten)) {
        scripts[name] = rewritten;
        modified = true;
        continue;
      }
      this.addViolation({
        ruleId: 'package-scripts-removed-commit-gate',
        severity: 'error',
        file: 'package.json',
        line: 1,
        message: `Script "${name}" references the removed audit:for-commit gate. Use "auditor" (npm run auditor), which now enforces 0 errors and 0 new warnings via the warning ratchet.`,
        context: `${name}: ${command}`
      });
    }
    return modified;
  }

  private verifyProductionRef(config: AuditEngineConfig): void {
    const ratchet = buildRatchetConfig(config.ratchet);
    if (!ratchet.enabled || resolveGitCommit(this.projectRoot, ratchet.productionRef)) return;
    this.addViolation({
      ruleId: 'package-scripts-invalid-production-ref',
      severity: 'error',
      file: 'package.json',
      line: 1,
      message: `Warning ratchet production ref '${ratchet.productionRef}' does not resolve to a git commit. Run 'git fetch' (CI: checkout with full history) or set 'ratchet.productionRef' in audit.config.ts.`,
      context: `ratchet.productionRef=${ratchet.productionRef}`
    });
  }

  private verifyRatchetBaseline(config: AuditEngineConfig): void {
    const ratchet = buildRatchetConfig(config.ratchet);
    if (!ratchet.enabled || !fs.existsSync(path.resolve(this.projectRoot, ratchet.baselineFile)))
      return;
    this.recordScanned(ratchet.baselineFile);
    const defect = describeBaselineDefect(this.projectRoot, ratchet.baselineFile);
    if (defect === null) return;
    this.addViolation({
      ruleId: 'package-scripts-invalid-ratchet-baseline',
      severity: 'error',
      file: ratchet.baselineFile,
      line: 1,
      message: defect,
      context: ratchet.baselineFile
    });
  }
}

export { ValidatePackageScriptsAuditor as PackageScriptsAuditor };

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ValidatePackageScriptsAuditor());

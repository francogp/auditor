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
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '../../core/auditorBase.ts';
import {
  loadAuditConfig,
  buildRatchetConfig,
  type AuditEngineConfig
} from '../../core/auditConfig.ts';
import { collectAllPackageScriptRequirements } from '../../cli/auditScanner.ts';
import { resolveGitCommit, describeBaselineDefect } from '../../cli/auditRatchet.ts';
import { getPackageJson } from '../../core/packageJson.ts';

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
const FIXABLE_COMMIT_GATE_PATTERN = /\b(?:(?:npm|pnpm|bun|yarn)\s+run\s+audit:for-commit|auditor-commit)\b/gu;
const REMOVED_COMMIT_GATE_SCRIPT = 'audit:for-commit';

export interface ValidatePackageScriptsOptions {
  projectRoot?: string;
  fix?: boolean;
}

function resolvePackageScriptsTarget(target?: string | ValidatePackageScriptsOptions): ValidatePackageScriptsOptions {
  if (typeof target === 'string') return { projectRoot: target };
  return target ?? {};
}

export class ValidatePackageScriptsAuditor extends BaseAuditor<PackageScriptsRuleId> {
  constructor(targetPathOrOptions?: string | ValidatePackageScriptsOptions) {
    const scriptOpts = resolvePackageScriptsTarget(targetPathOrOptions);
    const resolvedRoot = scriptOpts.projectRoot ?? process.cwd();

    super({
      projectRoot: resolvedRoot,
      capabilities: {
        fix: true,
        fixPriority: true,
        lint: true,
        md: false,
        ast: false,
        changedSince: false,
        heavy: false,
        requiresBuild: false,
        postRun: false
      },
      fixableRuleIds: [
        'package-scripts-removed-commit-gate',
        'package-scripts-build-missing-audit',
        'package-scripts-missing-recommended',
        'package-scripts-obsolete'
      ],
      fix: scriptOpts.fix,
      id: 'validate_package_scripts',
      name: 'Package Scripts & Build Chaining Validator',
      description: 'Valida scripts en package.json y encadenamiento del build',
      family: 'architecture',
      ruleIds: PACKAGE_SCRIPTS_RULES,
      packageName: 'Scripts',
      icon: '📦',
      configKey: 'packageScripts',
      defaultConfig: { enabled: true, enforceBuildAudit: true, recommendedScripts: true },
      ruleDescriptions: {
        'package-scripts-missing-file': 'package.json ausente o inválido',
        'package-scripts-build-missing-audit': 'Falta auditor en script build',
        'package-scripts-removed-commit-gate': 'Script usa audit:for-commit eliminado',
        'package-scripts-invalid-production-ref': 'Ref de producción no resuelve en git',
        'package-scripts-invalid-ratchet-baseline': 'Línea base del ratchet inválida',
        'package-scripts-missing-recommended': 'Falta script recomendado en package',
        'package-scripts-obsolete': 'Script legado u obsoleto en package.json'
      },
      coverage: {
        include: ['package.json', '.auditor/audit-baseline.json']
      }
    });
  }

  public override async runAudit(): Promise<void> {
    for (const r of PACKAGE_SCRIPTS_RULES) {
      this.markRuleEvaluated(r);
    }

    const config = await loadAuditConfig(this.projectRoot);
    if (config.packageScripts?.enabled === false) {
      this.markSkipped('Desactivado en config (packageScripts.enabled = false)');
      return;
    }

    const pkgPath = path.resolve(this.projectRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      this.recordScanned('package.json');
    }

    const pkg = this.loadPackageJson(pkgPath);
    if (!pkg) return;

    let modified = false;
    if (pkg.scripts) {
      if (this.verifyRemovedCommitGate(pkg.scripts)) modified = true;
      if (this.verifyLintScript(pkg.scripts)) modified = true;
      if (this.pruneObsoleteAuditorScripts(pkg.scripts)) modified = true;
    }
    if (this.verifyBuildScript(pkg, config)) modified = true;
    if (await this.verifyRecommendedScripts(pkg, config)) modified = true;

    if (modified) {
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    }

    this.verifyProductionRef(config);
    this.verifyRatchetBaseline(config);
  }

  private loadPackageJson(pkgPath: string): { scripts?: Record<string, string>; [key: string]: unknown } | null {
    if (!fs.existsSync(pkgPath)) {
      this.addViolation({
        ruleId: 'package-scripts-missing-file',
        severity: 'error',
        filePath: 'package.json',
        line: 1,
        message: 'Configuration error: package.json does not exist in project root.',
        context: 'package.json'
      });
      return null;
    }

    try {
      return getPackageJson(this.projectRoot) as Record<string, unknown>;
    } catch (_err) {
      this.addViolation({
        ruleId: 'package-scripts-missing-file',
        severity: 'error',
        filePath: 'package.json',
        line: 1,
        message: 'Configuration error: package.json could not be parsed as valid JSON.',
        context: 'package.json'
      });
      return null;
    }
  }

  private checkBuildScriptChainsPreAudit(buildScript: string): boolean {
    if (REMOVED_COMMIT_GATE_PATTERN.test(buildScript)) return true;
    return (
      /\bauditor(?:\.js|\.ts)?(?:\s|$|[&;])/.test(buildScript) ||
      /\b(?:npm|pnpm|bun)\s+run\s+auditor(?:\s|$|[&;])/.test(buildScript)
    );
  }

  private checkBuildScriptChainsPostAudit(buildScript: string): boolean {
    return (
      /\b(?:npm|pnpm|bun)\s+run\s+auditor:build(?:\s|$|[&;])/.test(buildScript) ||
      /\bauditor-build(?:\.js|\.ts)?(?:\s|$|[&;])/.test(buildScript) ||
      /\bauditor\s+preset=build(?:\s|$|[&;])/.test(buildScript)
    );
  }

  private verifyBuildScript(pkg: { scripts?: Record<string, string> }, config: AuditEngineConfig): boolean {
    if (config.packageScripts?.enforceBuildAudit === false) return false;

    const buildScript = pkg.scripts?.build;
    if (!buildScript) {
      if (this.isFixActive()) {
        pkg.scripts = pkg.scripts ?? {};
        pkg.scripts.build = 'auditor && npm run auditor:build';
        return true;
      }
      this.addViolation({
        ruleId: 'package-scripts-build-missing-audit',
        severity: 'error',
        filePath: 'package.json',
        line: 1,
        message: 'Build script in package.json is missing or does not chain auditor before and after compilation. Expected "auditor && ... && npm run auditor:build".',
        context: 'package.json:scripts.build'
      });
      return false;
    }

    if (this.isFixActive()) {
      let rewritten = buildScript;
      if (/\b(?:npm|pnpm|bun)\s+run\s+audit:build\b/.test(rewritten)) {
        rewritten = rewritten.replaceAll(/\b((?:npm|pnpm|bun)\s+run\s+)audit:build\b/g, '$1auditor:build');
      }
      if (/\b(?:npm|pnpm|bun)\s+run\s+audit\b/.test(rewritten)) {
        rewritten = rewritten.replaceAll(/\b((?:npm|pnpm|bun)\s+run\s+)audit\b/g, '$1auditor');
      }
      if (!this.checkBuildScriptChainsPreAudit(rewritten)) {
        rewritten = `auditor && ${rewritten}`;
      }
      if (!this.checkBuildScriptChainsPostAudit(rewritten)) {
        rewritten = `${rewritten} && npm run auditor:build`;
      }
      if (rewritten !== buildScript) {
        pkg.scripts!.build = rewritten;
        return true;
      }
    }

    const hasPre = this.checkBuildScriptChainsPreAudit(buildScript);
    const hasPost = this.checkBuildScriptChainsPostAudit(buildScript);

    if (!hasPre || !hasPost) {
      const missingPart = !hasPre && !hasPost
        ? 'does not chain auditor before compilation nor post-build auditor after compilation'
        : (!hasPre ? 'does not chain auditor before compilation' : 'does not chain post-build auditor after compilation');
      this.addViolation({
        ruleId: 'package-scripts-build-missing-audit',
        severity: 'error',
        filePath: 'package.json',
        line: 1,
        message: `Build script in package.json ${missingPart}. Expected "npm run auditor && ... && npm run auditor:build".`,
        context: buildScript
      });
      return false;
    }

    return false;
  }

  private verifyLintScript(scripts: Record<string, string>): boolean {
    let modified = false;
    if (scripts.lint && /\b(?:npm|pnpm|bun)\s+run\s+audit:lint\b/.test(scripts.lint)) {
      if (this.isFixActive()) {
        scripts.lint = scripts.lint.replaceAll(/\b((?:npm|pnpm|bun)\s+run\s+)audit:lint\b/g, '$1auditor:lint');
        modified = true;
      }
    }
    return modified;
  }

  private isObsoleteAuditorScript(name: string, command: string): boolean {
    if (
      name === 'audit' ||
      name === 'init-agent' ||
      name === 'sync:env' ||
      name === 'env:setup' ||
      name === 'env:check' ||
      name === 'audit:family:documentation' ||
      name === 'auditor:sync-env'
    ) {
      return true;
    }
    if (name.startsWith('audit:')) {
      return true;
    }
    if (
      name.startsWith('validate:') &&
      (command.includes('auditor') || command.includes('scripts/auditors') || command.includes('src/suites'))
    ) {
      return true;
    }
    return false;
  }

  private pruneObsoleteAuditorScripts(scripts: Record<string, string>): boolean {
    let modified = false;
    for (const [name, command] of Object.entries(scripts)) {
      if (this.isObsoleteAuditorScript(name, command)) {
        if (this.isFixActive()) {
          delete scripts[name];
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'package-scripts-obsolete',
            severity: 'warning',
            filePath: 'package.json',
            line: 1,
            message: `Script obsoleto o legado del auditor detectado en package.json: "${name}". Ejecuta "auditor fix" para sanear automáticamente.`,
            context: `${name}: ${command}`
          });
        }
      }
    }
    return modified;
  }

  private async getMissingRecommendedScripts(
    scripts: Record<string, string>,
    config: AuditEngineConfig
  ): Promise<[string, string][]> {
    const allRequirements = await collectAllPackageScriptRequirements(this.projectRoot, config);
    const seenNames = new Set<string>();
    const missing: [string, string][] = [];

    for (const req of allRequirements) {
      if (seenNames.has(req.name)) continue;
      seenNames.add(req.name);

      if (typeof req.isApplicable === 'function' && !req.isApplicable(config, this.projectRoot)) {
        continue;
      }
      if (!scripts[req.name]) {
        missing.push([req.name, req.command]);
      }
    }
    return missing;
  }

  private async verifyRecommendedScripts(pkg: { scripts?: Record<string, string> }, config: AuditEngineConfig): Promise<boolean> {
    if (config.packageScripts?.recommendedScripts === false) return false;

    const scripts = pkg.scripts ?? {};
    const missing = await this.getMissingRecommendedScripts(scripts, config);
    if (missing.length === 0) return false;

    if (this.isFixActive()) {
      pkg.scripts = pkg.scripts ?? {};
      for (const [scriptName, scriptCmd] of missing) {
        if (!pkg.scripts[scriptName]) {
          pkg.scripts[scriptName] = scriptCmd;
        }
      }
      return true;
    }

    for (const [scriptName, scriptCmd] of missing) {
      this.addViolation({
        ruleId: 'package-scripts-missing-recommended',
        severity: 'warning',
        filePath: 'package.json',
        line: 1,
        message: `Missing recommended auditor script "${scriptName}" in package.json (e.g. "${scriptName}": "${scriptCmd}"). Run "auditor fix" to add automatically.`,
        context: scriptName
      });
    }
    return false;
  }

  private verifyRemovedCommitGate(scripts: Record<string, string>): boolean {
    let modified = false;
    for (const [name, command] of Object.entries(scripts)) {
      if (!REMOVED_COMMIT_GATE_PATTERN.test(name) && !REMOVED_COMMIT_GATE_PATTERN.test(command)) continue;
      if (this.isFixActive() && name === REMOVED_COMMIT_GATE_SCRIPT) {
        delete scripts[name];
        modified = true;
        continue;
      }
      const rewritten = command.replaceAll(FIXABLE_COMMIT_GATE_PATTERN, 'auditor');
      if (this.isFixActive() && !REMOVED_COMMIT_GATE_PATTERN.test(rewritten)) {
        scripts[name] = rewritten;
        modified = true;
        continue;
      }
      this.addViolation({
        ruleId: 'package-scripts-removed-commit-gate',
        severity: 'error',
        filePath: 'package.json',
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
      filePath: 'package.json',
      line: 1,
      message: `Warning ratchet production ref '${ratchet.productionRef}' does not resolve to a git commit. Run 'git fetch' (CI: checkout with full history) or set 'ratchet.productionRef' in audit.config.ts.`,
      context: `ratchet.productionRef=${ratchet.productionRef}`
    });
  }

  private verifyRatchetBaseline(config: AuditEngineConfig): void {
    const ratchet = buildRatchetConfig(config.ratchet);
    if (!ratchet.enabled || !fs.existsSync(path.resolve(this.projectRoot, ratchet.baselineFile))) return;
    this.recordScanned(ratchet.baselineFile);
    const defect = describeBaselineDefect(this.projectRoot, ratchet.baselineFile);
    if (defect === null) return;
    this.addViolation({
      ruleId: 'package-scripts-invalid-ratchet-baseline',
      severity: 'error',
      filePath: ratchet.baselineFile,
      line: 1,
      message: defect,
      context: ratchet.baselineFile
    });
  }
}

export { ValidatePackageScriptsAuditor as PackageScriptsAuditor };

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ValidatePackageScriptsAuditor());

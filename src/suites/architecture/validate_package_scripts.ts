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
import { BaseAuditor, createRuleCapabilities } from '../../core/auditorBase.ts';
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
const FIXABLE_COMMIT_GATE_PATTERN =
  /\b(?:(?:npm|pnpm|bun|yarn)\s+run\s+audit:for-commit|auditor-commit)\b/gu;
const REMOVED_COMMIT_GATE_SCRIPT = 'audit:for-commit';

export interface ValidatePackageScriptsOptions {
  projectRoot?: string;
  fix?: boolean;
}

interface MutablePackageJson {
  name?: string;
  scripts?: Record<string, string>;
  [key: string]: unknown;
}

function resolvePackageScriptsTarget(
  target?: string | ValidatePackageScriptsOptions
): ValidatePackageScriptsOptions {
  if (typeof target === 'string') return { projectRoot: target };
  return target ?? {};
}

export class ValidatePackageScriptsAuditor extends BaseAuditor<PackageScriptsRuleId> {
  constructor(targetPathOrOptions?: string | ValidatePackageScriptsOptions) {
    const scriptOpts = resolvePackageScriptsTarget(targetPathOrOptions);
    const resolvedRoot = scriptOpts.projectRoot ?? process.cwd();

    super({
      usesThirdPartyTool: false,
      projectRoot: resolvedRoot,
      ruleCapabilities: createRuleCapabilities(
        PACKAGE_SCRIPTS_RULES,
        {
          speed: 'light',
          phase: 'normal',
          fix: 'priority',
          md: false,
          ast: false,
          changedOnly: false,
          critical: false
        },
        [
          'package-scripts-removed-commit-gate',
          'package-scripts-build-missing-audit',
          'package-scripts-missing-recommended',
          'package-scripts-obsolete'
        ]
      ),
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
      criticalConfig: {},
      ruleDescriptions: {
        'package-scripts-missing-file': 'package.json ausente o inválido',
        'package-scripts-build-missing-audit': 'Falta auditor en script build',
        'package-scripts-removed-commit-gate': 'Script usa audit:for-commit eliminado',
        'package-scripts-invalid-production-ref': 'Ref de producción no resuelve en git',
        'package-scripts-invalid-ratchet-baseline': 'Línea base del ratchet inválida',
        'package-scripts-missing-recommended': 'Falta script recomendado en package',
        'package-scripts-obsolete': 'Script legado u obsoleto en package.json'
      },
      ruleRemediations: {
        'package-scripts-missing-file':
          'Guía de diagnóstico y remediación para package-scripts-missing-file. Revisa la incidencia detectada y ajusta el código correspondiente.',
        'package-scripts-build-missing-audit':
          'Guía de diagnóstico y remediación para package-scripts-build-missing-audit. El script "build" debe encadenar "npm run auditor:full && <compilación> && npm run auditor:post-build". Ejecuta "auditor fix" para repararlo automáticamente.',
        'package-scripts-removed-commit-gate':
          'Guía de diagnóstico y remediación para package-scripts-removed-commit-gate. Revisa la incidencia detectada y ajusta el código correspondiente.',
        'package-scripts-invalid-production-ref':
          'Guía de diagnóstico y remediación para package-scripts-invalid-production-ref. Revisa la incidencia detectada y ajusta el código correspondiente.',
        'package-scripts-invalid-ratchet-baseline':
          'Guía de diagnóstico y remediación para package-scripts-invalid-ratchet-baseline. Revisa la incidencia detectada y ajusta el código correspondiente.',
        'package-scripts-missing-recommended':
          'Guía de diagnóstico y remediación para package-scripts-missing-recommended. Ejecuta "auditor fix" para inyectar automáticamente los comandos oficiales del auditor en package.json.',
        'package-scripts-obsolete':
          'Guía de diagnóstico y remediación para package-scripts-obsolete. Ejecuta "auditor fix" para eliminar o migrar automáticamente comandos obsoletos en package.json y .github/workflows.'
      },
      coverage: {
        include: ['package.json', '.auditor/audit-baseline.json', '.github/workflows/**']
      }
    });
  }

  public override async runAudit(): Promise<void> {
    const config = await loadAuditConfig(this.projectRoot);
    if (config.packageScripts?.enabled === false) {
      this.markSkipped('Desactivado en config (packageScripts.enabled = false)');
      return;
    }

    let pkg: { name?: string; scripts?: Record<string, string>; [key: string]: unknown } | null =
      null;
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
      const pkgPath = path.resolve(this.projectRoot, 'package.json');
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    }

    this.runSubAuditorSync('package-scripts-invalid-production-ref', () => {
      this.verifyProductionRef(config);
    });

    this.runSubAuditorSync('package-scripts-invalid-ratchet-baseline', () => {
      this.verifyRatchetBaseline(config);
    });
  }

  private loadPackageJson(
    pkgPath: string
  ): { name?: string; scripts?: Record<string, string>; [key: string]: unknown } | null {
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
    } catch {
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

  private verifyBuildScript(
    pkg: { scripts?: Record<string, string> },
    config: AuditEngineConfig
  ): boolean {
    if (config.packageScripts?.enforceBuildAudit === false) return false;

    const buildScript = pkg.scripts?.build;
    if (!buildScript) {
      if (this.isFixActive()) {
        pkg.scripts = pkg.scripts ?? {};
        pkg.scripts.build = 'npm run auditor:full && npm run auditor:post-build';
        return true;
      }
      this.addViolation({
        ruleId: 'package-scripts-build-missing-audit',
        severity: 'error',
        filePath: 'package.json',
        line: 1,
        message:
          'Build script in package.json is missing or does not chain auditor before and after compilation. Expected "npm run auditor:full && ... && npm run auditor:post-build".',
        context: 'package.json:scripts.build'
      });
      return false;
    }

    if (this.isFixActive()) {
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
        /\b(?:npm|pnpm|bun|vp)\s+run\s+(?:audit:precommit|auditor:precommit|audit)\b/.test(
          rewritten
        )
      ) {
        rewritten = rewritten.replaceAll(
          /\b((?:npm|pnpm|bun|vp)\s+run\s+)(?:audit:precommit|auditor:precommit|audit)\b/g,
          '$1auditor:full'
        );
      }
      if (/\bauditor\s+preset=precommit\b/.test(rewritten)) {
        rewritten = rewritten.replaceAll(/\bauditor\s+preset=precommit\b/g, 'auditor speed=full');
      }
      if (!this.checkBuildScriptChainsPreAudit(rewritten)) {
        rewritten = `npm run auditor:full && ${rewritten}`;
      }
      if (!this.checkBuildScriptChainsPostAudit(rewritten)) {
        rewritten = `${rewritten} && npm run auditor:post-build`;
      }
      if (rewritten !== buildScript) {
        pkg.scripts!.build = rewritten;
        return true;
      }
    }

    const hasPre = this.checkBuildScriptChainsPreAudit(buildScript);
    const hasPost = this.checkBuildScriptChainsPostAudit(buildScript);

    if (!hasPre || !hasPost) {
      const missingPart =
        !hasPre && !hasPost
          ? 'does not chain auditor:full before compilation nor auditor:post-build after compilation'
          : !hasPre
            ? 'does not chain auditor:full before compilation'
            : 'does not chain auditor:post-build after compilation';
      this.addViolation({
        ruleId: 'package-scripts-build-missing-audit',
        severity: 'error',
        filePath: 'package.json',
        line: 1,
        message: `Build script in package.json ${missingPart}. Expected "npm run auditor:full && ... && npm run auditor:post-build".`,
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
        scripts.lint = scripts.lint.replaceAll(
          /\b((?:npm|pnpm|bun)\s+run\s+)audit:lint\b/g,
          '$1auditor:lint'
        );
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
      name === 'auditor:sync-env' ||
      name === 'auditor:precommit' ||
      name === 'auditor:build' ||
      name === 'build:prod'
    ) {
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

  private verifyCiWorkflows(): void {
    const workflowsDir = path.resolve(this.projectRoot, '.github', 'workflows');
    if (!fs.existsSync(workflowsDir)) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(workflowsDir, { withFileTypes: true });
    } catch {
      // catch-ok: Ignore unreadable workflows directory
      return;
    }

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

      if (this.isFixActive()) {
        const updated = content
          .replaceAll(/\bbuild:prod\b/g, 'build:deploy')
          .replaceAll(/\bauditor-build-prod\b/g, 'auditor-build-deploy')
          .replaceAll(/\bauditor:build\b/g, 'auditor:post-build')
          .replaceAll(/\bauditor:precommit\b/g, 'auditor:full');
        if (updated !== content) {
          fs.writeFileSync(fullPath, updated, 'utf8');
        }
      } else {
        this.addViolation({
          ruleId: 'package-scripts-obsolete',
          severity: 'warning',
          filePath: relPath,
          line: 1,
          message: `Workflow CI/CD "${relPath}" utiliza comandos obsoletos (build:prod, auditor:build o auditor:precommit). Ejecuta "auditor fix" para migrarlos a build:deploy, auditor:post-build y auditor:full.`,
          context: relPath
        });
      }
    }
  }

  private resolveTargetScriptCommand(command: string, isSelfPackage: boolean): string {
    if (!isSelfPackage) return command;
    const SELF_RUNNER =
      'node --permission --experimental-strip-types --allow-fs-read=* --allow-fs-write=* --allow-child-process --allow-addons src/cli/audit_full.ts';
    if (command === 'auditor') return SELF_RUNNER;
    if (command.startsWith('auditor ')) {
      return `${SELF_RUNNER} ${command.slice('auditor '.length)}`;
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

      if (typeof req.isApplicable === 'function' && !req.isApplicable(config, this.projectRoot)) {
        continue;
      }
      const existing = scripts[req.name];
      if (!existing || this.isScriptCommandOutdated(existing)) {
        missingOrOutdated.push([
          req.name,
          this.resolveTargetScriptCommand(req.command, isSelfPackage)
        ]);
      }
    }
    return missingOrOutdated;
  }

  private async verifyRecommendedScripts(
    pkg: MutablePackageJson,
    config: AuditEngineConfig
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

    if (this.isFixActive()) {
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
        filePath: 'package.json',
        line: 1,
        message: `Missing or outdated recommended auditor script "${scriptName}" in package.json (expected "${scriptName}": "${scriptCmd}"). Run "auditor fix" to update automatically.`,
        context: scriptName
      });
    }
    return false;
  }

  private verifyRemovedCommitGate(scripts: Record<string, string>): boolean {
    let modified = false;
    for (const [name, command] of Object.entries(scripts)) {
      if (!REMOVED_COMMIT_GATE_PATTERN.test(name) && !REMOVED_COMMIT_GATE_PATTERN.test(command))
        continue;
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
    if (!ratchet.enabled || !fs.existsSync(path.resolve(this.projectRoot, ratchet.baselineFile)))
      return;
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

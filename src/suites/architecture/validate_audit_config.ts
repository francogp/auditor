/**
 * packages/auditor/src/suites/architecture/validate_audit_config.ts
 *
 * AUDIT CONFIGURATION INTEGRITY VALIDATOR (Node.js 26+)
 *
 * Validates that 100% of files, paths, directories, modules, and extensions
 * declared in audit.config.ts physically exist on disk.
 * Emits severity: 'error' if any referenced path is missing.
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '../../core/auditorBase.ts';
import {
  loadAuditConfig,
  buildRatchetConfig,
  AUDITOR_DIR,
  AUDIT_CONFIG_FILE,
  LEGACY_ROOT_CONFIG_FILES,
  type AuditEngineConfig
} from '../../core/auditConfig.ts';
import type { GitIgnoreRequirement, AuditorConfigFileRequirement } from '../../core/auditContract.ts';
import { GitIgnoreMatcher } from '../../core/gitignoreMatcher.ts';
import { collectAllGitIgnoreRequirements } from '../../cli/auditScanner.ts';
import { resolveGitCommit, describeBaselineDefect } from '../../cli/auditRatchet.ts';
import { migrateLegacyAuditConfig } from '../../cli/migrateAuditConfig.ts';

enableCompileCache();

export function createDefaultAuditConfigContent(packageName = 'Project'): string {
  return `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: '${packageName}',
  paths: {
    srcRoots: ['src'],
    testRoots: ['tests'],
    scriptsRoots: ['scripts']
  },
  documentation: {
    language: 'en'
  }
});
`;
}

export type AuditConfigRuleId =
  | 'audit-config-missing-path'
  | 'audit-config-missing-file'
  | 'audit-config-invalid-extension'
  | 'audit-config-missing-gitignore-entry'
  | 'audit-config-missing-build-audit'
  | 'audit-config-removed-commit-gate'
  | 'audit-config-invalid-production-ref'
  | 'audit-config-invalid-baseline'
  | 'audit-config-missing-recommended-script';

export const AUDIT_CONFIG_RULES: readonly AuditConfigRuleId[] = [
  'audit-config-missing-path',
  'audit-config-missing-file',
  'audit-config-invalid-extension',
  'audit-config-missing-gitignore-entry',
  'audit-config-missing-build-audit',
  'audit-config-removed-commit-gate',
  'audit-config-invalid-production-ref',
  'audit-config-invalid-baseline',
  'audit-config-missing-recommended-script'
] as const;

/** Removed `audit:for-commit` gate (superseded by the warning ratchet built into `auditor`). */
const REMOVED_COMMIT_GATE_PATTERN = /audit:for-commit|auditor-commit|audit_for_commit/u;
const FIXABLE_COMMIT_GATE_PATTERN = /\b(?:(?:npm|pnpm|bun|yarn)\s+run\s+audit:for-commit|auditor-commit)\b/gu;
const REMOVED_COMMIT_GATE_SCRIPT = 'audit:for-commit';

export const ESSENTIAL_AUDITOR_SCRIPTS: Readonly<Record<string, string>> = {
  'audit': 'auditor',
  'audit:fix': 'auditor fix',
  'audit:by-file': 'auditor-by-file',
  'audit:lint': 'auditor preset=lint',
  'audit:md': 'auditor preset=md',
  'audit:build': 'auditor preset=build',
  'auditor:update': 'auditor-update',
  'auditor:version': 'auditor-version'
};

export const PATH_ROOT_KEYS: readonly (keyof AuditEngineConfig['paths'])[] = [
  'srcRoots',
  'testRoots',
  'e2eRoots',
  'integrationRoots',
  'scriptsRoots',
  'codeRoots',
  'dataRoots',
  'constantsRoots',
  'componentsRoots',
  'viewsRoots',
  'storesRoots',
  'composablesRoots',
  'typesRoots',
  'stylesRoots',
  'logicRoots',
  'cliRoots'
];

export interface ValidateAuditConfigOptions {
  projectRoot?: string;
  fix?: boolean;
}

export const AUDIT_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<AuditConfigRuleId> = {
  id: 'audit-config',
  file: AUDIT_CONFIG_FILE,
  candidateFiles: [AUDIT_CONFIG_FILE, '.auditor/audit.config.json'],
  description: 'Configuración del auditor en .auditor/',
  ruleId: 'audit-config-missing-file',
  generateDefaultContent: (ctx) => {
    const legacy = LEGACY_ROOT_CONFIG_FILES.find(f => fs.existsSync(path.resolve(ctx.projectRoot, f)));
    if (legacy) {
      migrateLegacyAuditConfig(ctx.projectRoot);
      const migratedPath = path.resolve(ctx.projectRoot, AUDIT_CONFIG_FILE);
      if (fs.existsSync(migratedPath)) {
        return fs.readFileSync(migratedPath, 'utf-8');
      }
    }
    let pkgName = ctx.packageName || 'Project';
    try {
      const pkgRaw = fs.readFileSync(path.resolve(ctx.projectRoot, 'package.json'), 'utf8');
      const pkg = JSON.parse(pkgRaw) as { name?: string };
      if (pkg.name) pkgName = pkg.name;
    } catch {
      // catch-ok: fallback to 'Project'
    }
    return createDefaultAuditConfigContent(pkgName);
  },
  customMissingMessage: (ctx, file) => {
    const legacy = LEGACY_ROOT_CONFIG_FILES.find(f => fs.existsSync(path.resolve(ctx.projectRoot, f)));
    if (legacy) {
      return `Configuration error: root-level ${legacy} is no longer supported. Run "auditor fix" to move it to ${file}.`;
    }
    return `Configuration error: ${file} does not exist. Run "auditor fix" to initialize default configuration.`;
  },
  customMissingFile: (ctx, defaultFile) => {
    const legacy = LEGACY_ROOT_CONFIG_FILES.find(f => fs.existsSync(path.resolve(ctx.projectRoot, f)));
    return legacy ?? defaultFile;
  }
};

export class ValidateAuditConfigAuditor extends BaseAuditor<AuditConfigRuleId> {
  constructor(targetPathOrOptions?: string | ValidateAuditConfigOptions) {
    const options = typeof targetPathOrOptions === 'string'
      ? { projectRoot: targetPathOrOptions }
      : (targetPathOrOptions ?? {});
    const projectRoot = options.projectRoot || process.cwd();

    super({
      capabilities: { lint: true, fix: true },
      configFiles: [AUDIT_CONFIG_REQUIREMENT],
      fix: options.fix,
      id: 'validate_audit_config',
      name: 'Audit Configuration Integrity Validator',
      description: 'Valida configuración del auditor en .auditor/',
      family: 'architecture',
      ruleIds: AUDIT_CONFIG_RULES,
      packageName: 'Config',
      icon: '⚙️',
      configKey: 'paths',
      ruleDescriptions: {
        'audit-config-missing-path': 'Ruta configurada no existe',
        'audit-config-missing-file': 'Archivo configurado no existe',
        'audit-config-invalid-extension': 'Extensión configurada no existe',
        'audit-config-missing-gitignore-entry': 'Falta entrada en .gitignore',
        'audit-config-missing-build-audit': 'Falta auditor en script build',
        'audit-config-removed-commit-gate': 'Script usa audit:for-commit eliminado',
        'audit-config-invalid-production-ref': 'Ref de producción no resuelve en git',
        'audit-config-invalid-baseline': 'Línea base del ratchet inválida',
        'audit-config-missing-recommended-script': 'Falta script recomendado en package'
      },
      coverage: {
        include: [path.posix.join(AUDITOR_DIR, '**'), '.gitignore', 'package.json']
      },
      projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    for (const r of AUDIT_CONFIG_RULES) {
      this.markRuleEvaluated(r);
    }
    const requirement = this.configFiles[0] ?? AUDIT_CONFIG_REQUIREMENT;
    const ensured = await this.ensureConfigFile(requirement);
    if (!ensured) {
      return;
    }
    this.recordScanned(AUDIT_CONFIG_FILE);
    if (fs.existsSync(path.resolve(this.projectRoot, '.gitignore'))) this.recordScanned('.gitignore');
    if (fs.existsSync(path.resolve(this.projectRoot, 'package.json'))) this.recordScanned('package.json');

    const config = await loadAuditConfig(this.projectRoot);

    this.verifyPathRoots(config);
    this.verifyPersistencePaths(config);
    this.verifyDomainAndStylePaths(config);
    this.verifyExtensionPaths(config);
    await this.verifyGitIgnore(config);
    this.verifyPackageScripts(config);
    this.verifyProductionRef(config);
    this.verifyRatchetBaseline(config);
  }

  /** Validates the committed baseline format when present (its absence is reported by the ratchet itself). */
  private verifyRatchetBaseline(config: AuditEngineConfig): void {
    const ratchet = buildRatchetConfig(config.ratchet);
    if (!ratchet.enabled || !fs.existsSync(path.resolve(this.projectRoot, ratchet.baselineFile))) return;
    this.recordScanned(ratchet.baselineFile);
    const defect = describeBaselineDefect(this.projectRoot, ratchet.baselineFile);
    if (defect === null) return;
    this.addViolation({
      ruleId: 'audit-config-invalid-baseline',
      severity: 'error',
      file: ratchet.baselineFile,
      line: 1,
      message: defect,
      context: ratchet.baselineFile
    });
  }

  private verifyProductionRef(config: AuditEngineConfig): void {
    const ratchet = buildRatchetConfig(config.ratchet);
    if (!ratchet.enabled || resolveGitCommit(this.projectRoot, ratchet.productionRef)) return;
    this.addViolation({
      ruleId: 'audit-config-invalid-production-ref',
      severity: 'error',
      file: AUDIT_CONFIG_FILE,
      line: 1,
      message: `Warning ratchet production ref '${ratchet.productionRef}' does not resolve to a git commit. Run 'git fetch' (CI: checkout with full history) or set 'ratchet.productionRef' in audit.config.ts.`,
      context: `ratchet.productionRef=${ratchet.productionRef}`
    });
  }

  /** Flags scripts still invoking the removed `audit:for-commit` gate. Returns true when fix mode rewrote them. */
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
        ruleId: 'audit-config-removed-commit-gate',
        severity: 'error',
        file: 'package.json',
        line: 1,
        message: `Script "${name}" references the removed audit:for-commit gate. Use "auditor" (npm run audit), which now enforces 0 errors and 0 new warnings via the warning ratchet.`,
        context: `${name}: ${command}`
      });
    }
    return modified;
  }

  private handleMissingGitIgnoreFile(gitignorePath: string, requirements: readonly GitIgnoreRequirement[]): void {
    if (this.isFixActive()) {
      const contentLines = [
        '# Auditor tool caches (Added by @francogp/auditor)',
        ...requirements.map(e => e.pattern),
        ''
      ];
      fs.writeFileSync(gitignorePath, contentLines.join('\n'), 'utf8');
      return;
    }

    this.addViolation({
      ruleId: 'audit-config-missing-file',
      severity: 'error',
      file: '.gitignore',
      line: 1,
      message: 'Configuration error: .gitignore does not exist in project root.',
      context: '.gitignore'
    });
  }

  private appendMissingGitIgnoreEntries(gitignorePath: string, missing: readonly GitIgnoreRequirement[]): void {
    let existingContent = fs.readFileSync(gitignorePath, 'utf8');
    if (existingContent.length > 0 && !existingContent.endsWith('\n')) {
      existingContent += '\n';
    }
    const additionLines = [
      '# Auditor tool caches (Added by @francogp/auditor)',
      ...missing.map(e => e.pattern),
      ''
    ];
    fs.writeFileSync(gitignorePath, existingContent + (existingContent.endsWith('\n\n') ? '' : '\n') + additionLines.join('\n'), 'utf8');
  }

  private async verifyGitIgnore(config: AuditEngineConfig): Promise<void> {
    const gitignorePath = path.resolve(this.projectRoot, '.gitignore');
    const allRequirements = await collectAllGitIgnoreRequirements(this.projectRoot, config);
    const applicable = allRequirements.filter(req => (req.isApplicable ? req.isApplicable(config) : true));

    if (!fs.existsSync(gitignorePath)) {
      this.handleMissingGitIgnoreFile(gitignorePath, applicable);
      return;
    }

    const matcher = new GitIgnoreMatcher(this.projectRoot, gitignorePath);
    const missing = applicable.filter(req => {
      const probe = req.samplePath ?? (req.pattern.endsWith('/') ? `${req.pattern}probe.tmp` : req.pattern);
      return !matcher.isIgnored(probe);
    });

    if (missing.length === 0) return;

    if (this.isFixActive()) {
      this.appendMissingGitIgnoreEntries(gitignorePath, missing);
      return;
    }

    for (const req of missing) {
      this.addViolation({
        ruleId: 'audit-config-missing-gitignore-entry',
        severity: 'error',
        file: '.gitignore',
        line: 1,
        message: `Missing required .gitignore entry for ${req.id} (${req.reason}). Expected "${req.pattern}" in .gitignore.`,
        context: req.pattern
      });
    }
  }

  private checkPathExists(relPath: string, ruleId: AuditConfigRuleId, description: string): boolean {
    const normalized = relPath.trim();
    if (!normalized) return true;

    const resolved = path.resolve(this.projectRoot, normalized);
    if (!fs.existsSync(resolved)) {
      this.addViolation({
        ruleId,
        severity: 'error',
        file: AUDIT_CONFIG_FILE,
        line: 1,
        message: `Configuration error in ${AUDIT_CONFIG_FILE}: Referenced ${description} "${normalized}" does not exist on disk.`,
        context: normalized
      });
      return false;
    }
    return true;
  }

  private verifyPathRoots(config: AuditEngineConfig): void {
    const rawPaths = config._rawPaths ?? config.paths;
    if (!rawPaths) return;

    for (const key of PATH_ROOT_KEYS) {
      const val = (rawPaths as Record<string, unknown>)[key]; // open-record: Generic configuration dictionary
      if (Array.isArray(val)) {
        for (const item of val) {
          if (typeof item === 'string') {
            this.checkPathExists(item, 'audit-config-missing-path', `directory in paths.${String(key)}`);
          }
        }
      }
    }
  }

  private verifyPersistencePaths(config: AuditEngineConfig): void {
    const rawPersistence = config._rawConfig?.persistence;
    if (config.paths?.migrationsDir && config.persistence?.engine !== 'none') {
      if (config._rawPaths?.migrationsDir) {
        this.checkPathExists(config.paths.migrationsDir, 'audit-config-missing-path', 'migrations directory');
      }
    }

    if (rawPersistence?.supabaseDir) {
      this.checkPathExists(rawPersistence.supabaseDir, 'audit-config-missing-path', 'supabase directory');
    }

    if (Array.isArray(rawPersistence?.allowedDatabaseDirs)) {
      for (const d of rawPersistence.allowedDatabaseDirs) {
        this.checkPathExists(d, 'audit-config-missing-path', 'database directory');
      }
    }

    if (Array.isArray(rawPersistence?.allowedDatabaseFiles)) {
      for (const f of rawPersistence.allowedDatabaseFiles) {
        this.checkPathExists(f, 'audit-config-missing-file', 'database file');
      }
    }

    if (Array.isArray(rawPersistence?.authorizedSaveFiles)) {
      for (const f of rawPersistence.authorizedSaveFiles) {
        this.checkPathExists(f, 'audit-config-missing-file', 'authorized save file');
      }
    }
  }

  private verifyDomainPaths(config: AuditEngineConfig): void {
    const rawDomain = config._rawConfig?.domain;
    if (rawDomain?.zLayersFile) {
      this.checkPathExists(rawDomain.zLayersFile, 'audit-config-missing-file', 'domain z-layers file');
    }
    if (rawDomain?.timezoneHelperModule) {
      this.checkPathExists(rawDomain.timezoneHelperModule, 'audit-config-missing-file', 'timezone helper module');
    }
    if (rawDomain?.loggerModule) {
      this.checkPathExists(rawDomain.loggerModule, 'audit-config-missing-file', 'logger module');
    }
    if (Array.isArray(rawDomain?.o1CatalogPatterns)) {
      for (const pattern of rawDomain.o1CatalogPatterns) {
        if (pattern.definingFile) {
          this.checkPathExists(pattern.definingFile, 'audit-config-missing-file', `O(1) pattern defining file for '${pattern.name}'`);
        }
      }
    }
  }

  private verifyStylesPaths(config: AuditEngineConfig): void {
    const rawStyles = config._rawConfig?.styles;
    if (config.styles?.zLayersEnabled !== false && rawStyles) {
      if (rawStyles.baseScssFile) {
        this.checkPathExists(rawStyles.baseScssFile, 'audit-config-missing-file', 'styles base SCSS file');
      }
      if (rawStyles.zLayersScssFile) {
        this.checkPathExists(rawStyles.zLayersScssFile, 'audit-config-missing-file', 'styles z-layers SCSS file');
      }
      if (rawStyles.zLayersTsFile) {
        this.checkPathExists(rawStyles.zLayersTsFile, 'audit-config-missing-file', 'styles z-layers TS file');
      }
    }

    if (rawStyles?.buttonGovernance?.buttonsScssFile) {
      this.checkPathExists(rawStyles.buttonGovernance.buttonsScssFile, 'audit-config-missing-file', 'button governance SCSS file');
    }

    if (Array.isArray(rawStyles?.heavyEffectPaths)) {
      for (const p of rawStyles.heavyEffectPaths) {
        this.checkPathExists(p, 'audit-config-missing-path', 'heavy effect path');
      }
    }
  }

  private verifyDomainAndStylePaths(config: AuditEngineConfig): void {
    this.verifyDomainPaths(config);
    this.verifyStylesPaths(config);
  }

  private verifyExtensionPaths(config: AuditEngineConfig): void {
    const rawExtensions = config._rawConfig?.extensions ?? config.extensions;
    if (!Array.isArray(rawExtensions)) return;

    for (const ext of rawExtensions) {
      if (typeof ext === 'string') {
        this.checkPathExists(ext, 'audit-config-invalid-extension', 'extension file or directory');
      }
    }
  }

  private loadPackageJson(pkgPath: string): { scripts?: Record<string, string>; [key: string]: unknown } | null {
    if (!fs.existsSync(pkgPath)) {
      this.addViolation({
        ruleId: 'audit-config-missing-file',
        severity: 'error',
        file: 'package.json',
        line: 1,
        message: 'Configuration error: package.json does not exist in project root.',
        context: 'package.json'
      });
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    } catch (_err) {
      this.addViolation({
        ruleId: 'audit-config-missing-file',
        severity: 'error',
        file: 'package.json',
        line: 1,
        message: 'Configuration error: package.json could not be parsed as valid JSON.',
        context: 'package.json'
      });
      return null;
    }
  }

  private checkBuildScriptChainsAuditor(buildScript: string): boolean {
    if (REMOVED_COMMIT_GATE_PATTERN.test(buildScript)) return true;
    return (
      /\bauditor(\.js|\.ts)?(\s|$|[&;])/.test(buildScript) ||
      /\b(npm|pnpm|bun)\s+run\s+audit(\s|$|[&;])/.test(buildScript)
    );
  }

  private verifyBuildScript(pkg: { scripts?: Record<string, string> }, config: AuditEngineConfig): boolean {
    if (config.packageScripts?.enforceBuildAudit === false) return false;

    const buildScript = pkg.scripts?.build;
    if (!buildScript) {
      if (this.isFixActive()) {
        pkg.scripts = pkg.scripts ?? {};
        pkg.scripts.build = 'auditor';
        return true;
      }
      this.addViolation({
        ruleId: 'audit-config-missing-build-audit',
        severity: 'error',
        file: 'package.json',
        line: 1,
        message: 'Build script in package.json is missing or does not chain auditor before compilation. Expected "auditor && ..." or "npm run audit && ...".',
        context: 'package.json:scripts.build'
      });
      return false;
    }

    if (!this.checkBuildScriptChainsAuditor(buildScript)) {
      if (this.isFixActive()) {
        pkg.scripts!.build = `auditor && ${buildScript}`;
        return true;
      }
      this.addViolation({
        ruleId: 'audit-config-missing-build-audit',
        severity: 'error',
        file: 'package.json',
        line: 1,
        message: 'Build script in package.json does not chain auditor before compilation. Expected "auditor && ..." or "npm run audit && ...".',
        context: buildScript
      });
    }

    return false;
  }

  private getMissingRecommendedScripts(scripts: Record<string, string>, config: AuditEngineConfig): [string, string][] {
    const missing: [string, string][] = [];
    for (const [scriptName, scriptCmd] of Object.entries(ESSENTIAL_AUDITOR_SCRIPTS)) {
      if (!scripts[scriptName]) {
        missing.push([scriptName, scriptCmd]);
      }
    }

    if (Array.isArray(config.packageScripts?.extraRequiredScripts)) {
      for (const reqScript of config.packageScripts.extraRequiredScripts) {
        if (!scripts[reqScript]) {
          missing.push([reqScript, `auditor task=${reqScript}`]);
        }
      }
    }
    return missing;
  }

  private verifyRecommendedScripts(pkg: { scripts?: Record<string, string> }, config: AuditEngineConfig): boolean {
    if (config.packageScripts?.recommendedScripts === false) return false;

    const scripts = pkg.scripts ?? {};
    const missing = this.getMissingRecommendedScripts(scripts, config);
    if (missing.length === 0) return false;

    if (this.isFixActive()) {
      pkg.scripts = pkg.scripts ?? {};
      for (const [scriptName, scriptCmd] of missing) {
        pkg.scripts[scriptName] = scriptCmd;
      }
      return true;
    }

    for (const [scriptName, scriptCmd] of missing) {
      this.addViolation({
        ruleId: 'audit-config-missing-recommended-script',
        severity: 'warning',
        file: 'package.json',
        line: 1,
        message: `Missing recommended auditor script "${scriptName}" in package.json (e.g. "${scriptName}": "${scriptCmd}"). Run "auditor fix" to add automatically.`,
        context: scriptName
      });
    }
    return false;
  }

  private verifyPackageScripts(config: AuditEngineConfig): void {
    if (config.packageScripts?.enabled === false) return;

    const pkgPath = path.resolve(this.projectRoot, 'package.json');
    const pkg = this.loadPackageJson(pkgPath);
    if (!pkg) return;

    let modified = pkg.scripts ? this.verifyRemovedCommitGate(pkg.scripts) : false;
    if (this.verifyBuildScript(pkg, config)) modified = true;
    if (this.verifyRecommendedScripts(pkg, config)) modified = true;

    if (modified) {
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    }
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateAuditConfigAuditor());

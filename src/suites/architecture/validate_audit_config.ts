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
  AUDITOR_DIR,
  AUDIT_CONFIG_FILE,
  LEGACY_ROOT_CONFIG_FILES,
  DEFAULT_AUDIT_CONFIG,
  type AuditEngineConfig
} from '../../core/auditConfig.ts';
import type { GitIgnoreRequirement, AuditorConfigFileRequirement, AuditTaskDefinition, AuditorCriticalConfig } from '../../core/auditContract.ts';
import { GitIgnoreMatcher } from '../../core/gitignoreMatcher.ts';
import { discoverAuditors, collectAllGitIgnoreRequirements } from '../../cli/auditScanner.ts';
import { migrateLegacyAuditConfig } from '../../cli/migrateAuditConfig.ts';
import { getPackageJson } from '../../core/packageJson.ts';
import ts from 'typescript';

enableCompileCache();

export function formatSectionObjectLiteral(value: unknown): string {
  const jsonStr = JSON.stringify(value, null, 2);
  return jsonStr
    .split('\n')
    .map((line, idx) => {
      if (idx === 0) return line;
      const unquoted = line.replace(/^(\s*)"([a-z_$][\w$]*)":/i, '$1$2:');
      return `  ${unquoted}`;
    })
    .join('\n');
}

function resolveConfigPath(obj: unknown, pathStr: string): unknown {
  if (typeof obj !== 'object' || obj === null) return undefined;
  const parts = pathStr.split('.');
  let curr: unknown = obj;
  for (const p of parts) {
    if (typeof curr !== 'object' || curr === null) return undefined;
    curr = Reflect.get(curr, p);
  }
  return curr;
}

function setDeepProperty(obj: Record<string, unknown>, pathStr: string, value: unknown): void {
  const parts = pathStr.split('.');
  let curr: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]!;
    if (typeof curr[p] !== 'object' || curr[p] === null) {
      curr[p] = {};
    }
    curr = curr[p] as Record<string, unknown>;
  }
  curr[parts[parts.length - 1]!] = value;
}

function appendMissingSectionsToJsonFile(
  configFilePath: string,
  sectionsToInsert: Record<string, Record<string, unknown>> // open-record: Dictionary of configuration sections
): void {
  try {
    const code = fs.readFileSync(configFilePath, 'utf8');
    const json = JSON.parse(code);
    if (!json || typeof json !== 'object') return;
    for (const [key, value] of Object.entries(sectionsToInsert)) {
      if (Reflect.get(json, key) === undefined) {
        Reflect.set(json, key, value);
      }
    }
    fs.writeFileSync(configFilePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
  } catch {
    // catch-ok: ignore unparseable json config files
  }
}

function findConfigObjectLiteral(source: ts.SourceFile): ts.ObjectLiteralExpression | null {
  let configObj: ts.ObjectLiteralExpression | null = null;
  const visit = (node: ts.Node): void => {
    if (configObj) return;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineAuditConfig' &&
      node.arguments.length > 0 &&
      ts.isObjectLiteralExpression(node.arguments[0]!)
    ) {
      configObj = node.arguments[0];
      return;
    }
    if (ts.isExportAssignment(node) && ts.isObjectLiteralExpression(node.expression)) {
      configObj = node.expression;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return configObj;
}

function appendMissingSectionsFallback(
  configFilePath: string,
  code: string,
  sectionsToInsert: Record<string, Record<string, unknown>> // open-record: Dictionary of configuration sections
): void {
  const lastBrace = code.lastIndexOf('}');
  if (lastBrace === -1) return;
  let snippet = '';
  for (const [key, val] of Object.entries(sectionsToInsert)) {
    snippet += `,\n  ${key}: ${formatSectionObjectLiteral(val)}`;
  }
  snippet += '\n';
  const updated = code.slice(0, lastBrace) + snippet + code.slice(lastBrace);
  fs.writeFileSync(configFilePath, updated, 'utf8');
}

function appendMissingSectionsToTsFile(
  configFilePath: string,
  sectionsToInsert: Record<string, Record<string, unknown>> // open-record: Dictionary of configuration sections
): void {
  const code = fs.readFileSync(configFilePath, 'utf8');
  const source = ts.createSourceFile(configFilePath, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS); // homebrew-ok: in-place AST configuration rewrite
  const configObj = findConfigObjectLiteral(source);

  if (!configObj) {
    appendMissingSectionsFallback(configFilePath, code, sectionsToInsert);
    return;
  }

  const properties = configObj.properties;
  let hasTrailingComma = false;

  if (properties.length > 0) {
    const lastProp = properties[properties.length - 1]!;
    const endOfLastProp = lastProp.getEnd();
    const closeBracePos = code.lastIndexOf('}', configObj.getEnd() - 1);
    const between = code.slice(endOfLastProp, closeBracePos);
    hasTrailingComma = between.includes(',');
  }

  const closeBracePos = code.lastIndexOf('}', configObj.getEnd() - 1);
  if (closeBracePos === -1) return;

  let snippet = '';
  let needsLeadingComma = !hasTrailingComma && properties.length > 0;

  for (const [key, val] of Object.entries(sectionsToInsert)) {
    const prefix = needsLeadingComma ? ',' : '';
    snippet += `${prefix}\n  ${key}: ${formatSectionObjectLiteral(val)}`;
    needsLeadingComma = true;
  }
  snippet += '\n';

  const updated = code.slice(0, closeBracePos) + snippet + code.slice(closeBracePos);
  fs.writeFileSync(configFilePath, updated, 'utf8');
}

export function appendMissingSectionsToConfigFile(
  configFilePath: string,
  sectionsToInsert: Record<string, Record<string, unknown>> // open-record: Dictionary of configuration sections
): void {
  if (configFilePath.endsWith('.json')) {
    appendMissingSectionsToJsonFile(configFilePath, sectionsToInsert);
    return;
  }
  appendMissingSectionsToTsFile(configFilePath, sectionsToInsert);
}

function appendTaskDefaultConfig(
  sections: Record<string, Record<string, unknown>>,
  task: AuditTaskDefinition
): void {
  if (!task.configKey || task.configKey === 'paths' || task.configKey === 'core') return;
  const rootKey = task.configKey.split('.')[0];
  if (!rootKey) return;
  if (!task.defaultConfig || typeof task.defaultConfig !== 'object' || Object.keys(task.defaultConfig).length === 0) return;

  sections[rootKey] = {
    ...sections[rootKey],
    ...task.defaultConfig
  };
}

function collectConfigSectionsFromTasks(tasks: readonly AuditTaskDefinition[]): Record<string, Record<string, unknown>> {
  const sections: Record<string, Record<string, unknown>> = {};
  for (const task of tasks) {
    appendTaskDefaultConfig(sections, task);
  }
  return sections;
}

function renderConfigSectionsCode(sections: Record<string, Record<string, unknown>>): string {
  let customSectionsCode = '';
  for (const [key, value] of Object.entries(sections)) {
    const lines = JSON.stringify(value, null, 2)
      .split('\n')
      .map((line, idx) => (idx === 0 ? line : `  ${line}`))
      .join('\n');
    customSectionsCode += `,\n  ${key}: ${lines}`;
  }
  return customSectionsCode;
}

export function createDefaultAuditConfigContent(
  packageName = 'Project',
  tasks: readonly AuditTaskDefinition[] = []
): string {
  const sections = collectConfigSectionsFromTasks(tasks);
  const customSectionsCode = renderConfigSectionsCode(sections);

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
  }${customSectionsCode}
});
`;
}

interface MissingSectionEntry {
  tasks: AuditTaskDefinition[];
  defaultConfig: Record<string, unknown>; // open-record: Default section configuration mapping
}

function isSectionConfigured(rootKey: string, rawConfig: unknown): boolean {
  if (typeof rawConfig !== 'object' || rawConfig === null) return false;
  if (rootKey === 'stylelint') {
    const stylesConfig = Reflect.get(rawConfig, 'styles');
    const isStylesObject = typeof stylesConfig === 'object' && stylesConfig !== null;
    return (
      Reflect.get(rawConfig, 'stylelint') !== undefined ||
      (isStylesObject && Reflect.get(stylesConfig, 'stylelint') !== undefined) ||
      stylesConfig !== undefined
    );
  }
  return Reflect.get(rawConfig, rootKey) !== undefined;
}

function collectMissingSections(
  tasks: AuditTaskDefinition[],
  rawConfig: unknown
): Map<string, MissingSectionEntry> {
  const missingByRootKey = new Map<string, MissingSectionEntry>();

  for (const task of tasks) {
    if (!task.configKey || task.configKey === 'paths' || task.configKey === 'core' || task.configKey === 'none') {
      continue;
    }
    const rootKey = task.configKey.split('.')[0]!;
    if (!rootKey || isSectionConfigured(rootKey, rawConfig)) {
      continue;
    }

    let entry = missingByRootKey.get(rootKey);
    if (!entry) {
      entry = { tasks: [], defaultConfig: {} };
      missingByRootKey.set(rootKey, entry);
    }
    entry.tasks.push(task);
    if (task.defaultConfig && typeof task.defaultConfig === 'object') {
      Object.assign(entry.defaultConfig, task.defaultConfig);
    }
  }

  return missingByRootKey;
}

export type AuditConfigRuleId =
  | 'audit-config-missing-path'
  | 'audit-config-missing-file'
  | 'audit-config-invalid-extension'
  | 'audit-config-missing-gitignore-entry'
  | 'audit-config-missing-section'
  | 'audit-config-unknown-field'
  | 'audit-config-critical-violation';

export const AUDIT_CONFIG_RULES: readonly AuditConfigRuleId[] = [
  'audit-config-missing-path',
  'audit-config-missing-file',
  'audit-config-invalid-extension',
  'audit-config-missing-gitignore-entry',
  'audit-config-missing-section',
  'audit-config-unknown-field',
  'audit-config-critical-violation'
] as const;

export const PATH_ROOT_KEYS: readonly (keyof AuditEngineConfig['paths'])[] = [
  'srcRoots',
  'testRoots',
  'e2eRoots',
  'integrationRoots',
  'scriptsRoots',
  'codeRoots',
  'dataRoots',
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
  generateDefaultContent: async (ctx) => {
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
      const pkg = getPackageJson(ctx.projectRoot);
      if (pkg?.name) pkgName = pkg.name;
    } catch {
      // catch-ok: fallback to 'Project'
    }
    let tasks: AuditTaskDefinition[] = [];
    try {
      const { discoverAuditors } = await import('../../cli/auditScanner.ts');
      tasks = await discoverAuditors({ projectRoot: ctx.projectRoot });
    } catch {
      // catch-ok: fallback when running isolated
    }
    return createDefaultAuditConfigContent(pkgName, tasks);
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
        'audit-config-missing-section',
        'audit-config-missing-file',
        'audit-config-missing-gitignore-entry',
        'audit-config-critical-violation'
      ],
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
      defaultConfig: {},
      criticalConfig: {},
      ruleDescriptions: {
        'audit-config-missing-path': 'Ruta configurada no existe',
        'audit-config-missing-file': 'Archivo configurado no existe',
        'audit-config-invalid-extension': 'Extensión configurada no existe',
        'audit-config-missing-gitignore-entry': 'Falta entrada en .gitignore',
        'audit-config-missing-section': 'Falta sección en audit.config',
        'audit-config-unknown-field': 'Campo no reconocido en config',
        'audit-config-critical-violation': 'Violación a configuración crítica'
      },
      coverage: {
        include: [path.posix.join(AUDITOR_DIR, '**'), '.gitignore']
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

    const config = await loadAuditConfig(this.projectRoot);
    const baselineFile = config.ratchet?.baselineFile ?? path.posix.join(AUDITOR_DIR, 'audit-baseline.json');
    if (fs.existsSync(path.resolve(this.projectRoot, baselineFile))) {
      this.recordScanned(baselineFile);
    }

    let tasks: AuditTaskDefinition[] = [];
    try {
      tasks = await discoverAuditors({ projectRoot: this.projectRoot });
    } catch {
      // catch-ok: fallback when running in isolated test environments without suite discovery
    }

    await this.verifyRequiredSections(config, tasks);
    await this.verifyCriticalConfigurations(config, tasks);
    this.verifyUnknownFields(config, tasks);
    this.verifyPathRoots(config);
    this.verifyPersistencePaths(config);
    this.verifyDomainAndStylePaths(config);
    this.verifyExtensionPaths(config);
    await this.verifyGitIgnore(config);
  }

  private verifyUnknownFields(config: AuditEngineConfig, tasks: readonly AuditTaskDefinition[]): void {
    const rawConfig = config._rawConfig ?? {};
    if (typeof rawConfig !== 'object' || rawConfig === null) return;

    this.verifyUnknownTopLevelSections(rawConfig as Record<string, unknown>, tasks);
    this.verifyUnknownPathsFields(rawConfig as Record<string, unknown>);
    this.verifyUnknownConstantsFields(rawConfig as Record<string, unknown>);
  }

  private verifyUnknownTopLevelSections(rawConfig: Record<string, unknown>, tasks: readonly AuditTaskDefinition[]): void {
    const validTopLevelKeys = new Set<string>(
      Object.keys(DEFAULT_AUDIT_CONFIG).filter(k => !k.startsWith('_'))
    );
    for (const task of tasks) {
      if (task.configKey && task.configKey !== 'paths' && task.configKey !== 'core' && task.configKey !== 'none') {
        const rootKey = task.configKey.split('.')[0];
        if (rootKey) validTopLevelKeys.add(rootKey);
      }
    }

    for (const key of Object.keys(rawConfig)) {
      if (key.startsWith('_')) continue;
      if (!validTopLevelKeys.has(key)) {
        this.addViolation({
          ruleId: 'audit-config-unknown-field',
          severity: 'error',
          file: AUDIT_CONFIG_FILE,
          line: 1,
          message: `Configuration error in ${AUDIT_CONFIG_FILE}: Unknown or legacy top-level section "${key}". This section is not supported by @francogp/auditor. Please remove it.`,
          context: key
        });
      }
    }
  }

  private verifyUnknownPathsFields(rawConfig: Record<string, unknown>): void {
    const rawPaths = rawConfig.paths;
    if (typeof rawPaths !== 'object' || rawPaths === null) return;

    const validPathKeys = new Set(Object.keys(DEFAULT_AUDIT_CONFIG.paths));
    for (const key of Object.keys(rawPaths)) {
      if (!validPathKeys.has(key)) {
        this.addViolation({
          ruleId: 'audit-config-unknown-field',
          severity: 'error',
          file: AUDIT_CONFIG_FILE,
          line: 1,
          message: `Configuration error in ${AUDIT_CONFIG_FILE}: Unknown or legacy field "paths.${key}". This field is not supported. Please remove it.`,
          context: `paths.${key}`
        });
      }
    }
  }

  private verifyUnknownConstantsFields(rawConfig: Record<string, unknown>): void {
    const rawConstants = rawConfig.constants;
    if (typeof rawConstants !== 'object' || rawConstants === null) return;

    const validConstantsKeys = new Set(Object.keys(DEFAULT_AUDIT_CONFIG.constants ?? {}));
    for (const key of Object.keys(rawConstants)) {
      if (!validConstantsKeys.has(key)) {
        this.addViolation({
          ruleId: 'audit-config-unknown-field',
          severity: 'error',
          file: AUDIT_CONFIG_FILE,
          line: 1,
          message: `Configuration error in ${AUDIT_CONFIG_FILE}: Unknown or legacy field "constants.${key}". This field is not supported. Please remove it.`,
          context: `constants.${key}`
        });
      }
    }
  }

  private async verifyRequiredSections(config: AuditEngineConfig, tasks: readonly AuditTaskDefinition[]): Promise<void> {
    if (tasks.length === 0) return;

    const missingByRootKey = collectMissingSections(tasks as AuditTaskDefinition[], config._rawConfig ?? {});
    if (missingByRootKey.size === 0) return;

    if (this.isFixActive()) {
      this.applyMissingSectionsFix(missingByRootKey);
      return;
    }

    this.reportMissingSectionViolations(missingByRootKey);
  }

  private applyMissingSectionsFix(missingByRootKey: Map<string, MissingSectionEntry>): void {
    const configFilePath = path.resolve(this.projectRoot, AUDIT_CONFIG_FILE);
    if (!fs.existsSync(configFilePath)) return;

    const sectionsToInsert: Record<string, Record<string, unknown>> = {}; // open-record: Sections dictionary
    for (const [rootKey, entry] of missingByRootKey.entries()) {
      sectionsToInsert[rootKey] = Object.keys(entry.defaultConfig).length > 0
        ? entry.defaultConfig
        : { enabled: true };
    }
    appendMissingSectionsToConfigFile(configFilePath, sectionsToInsert);
  }

  private reportMissingSectionViolations(missingByRootKey: Map<string, MissingSectionEntry>): void {
    for (const [rootKey, entry] of missingByRootKey.entries()) {
      const suiteNames = entry.tasks.map(t => t.id).join(', ');
      this.addViolation({
        ruleId: 'audit-config-missing-section',
        severity: 'error',
        file: AUDIT_CONFIG_FILE,
        line: 1,
        message: `Configuration error in ${AUDIT_CONFIG_FILE}: Missing required section "${rootKey}" declared by ${suiteNames}. Run "auditor fix" to add automatically.`,
        context: rootKey
      });
    }
  }

  private resolveTaskSectionContext(
    task: AuditTaskDefinition,
    rawConfig: Record<string, unknown>
  ): { rootKey?: string; sectionConfig?: unknown } {
    const rootKey =
      task.configKey && task.configKey !== 'paths' && task.configKey !== 'core' && task.configKey !== 'none'
        ? task.configKey.split('.')[0]
        : undefined;
    const sectionConfig = rootKey ? rawConfig[rootKey] : undefined;
    return { rootKey, sectionConfig };
  }

  private async repairCriticalMinimum(
    sectionConfig: unknown,
    rawConfig: Record<string, unknown>,
    rootKey: string | undefined,
    propPath: string,
    configuredList: unknown[],
    missing: readonly unknown[],
    repair?: AuditorCriticalConfig['repair']
  ): Promise<void> {
    if (repair) {
      await repair(sectionConfig ?? rawConfig, this.projectRoot);
      return;
    }
    if (rootKey && typeof sectionConfig === 'object' && sectionConfig !== null) {
      const merged = Array.from(new Set([...configuredList, ...missing]));
      setDeepProperty(sectionConfig as Record<string, unknown>, propPath, merged);
      const configFilePath = path.resolve(this.projectRoot, AUDIT_CONFIG_FILE);
      if (fs.existsSync(configFilePath)) {
        appendMissingSectionsToConfigFile(configFilePath, { [rootKey]: sectionConfig as Record<string, unknown> });
      }
    }
  }

  private async verifyTaskMinimumProperty(
    task: AuditTaskDefinition,
    propPath: string,
    minList: readonly unknown[],
    sectionConfig: unknown,
    rawConfig: Record<string, unknown>,
    rootKey: string | undefined,
    rationale: string | undefined,
    repair?: AuditorCriticalConfig['repair']
  ): Promise<void> {
    const configuredVal = resolveConfigPath(sectionConfig, propPath) ?? resolveConfigPath(rawConfig, propPath);
    if (configuredVal === undefined) return;

    const configuredList = Array.isArray(configuredVal) ? configuredVal : [];
    const missing = minList.filter(item => !configuredList.includes(item));
    if (missing.length === 0) return;

    if (this.isFixActive()) {
      await this.repairCriticalMinimum(sectionConfig, rawConfig, rootKey, propPath, configuredList, missing, repair);
    } else {
      this.addViolation({
        ruleId: 'audit-config-critical-violation',
        severity: 'error',
        file: AUDIT_CONFIG_FILE,
        line: 1,
        message: `Configuration error in ${AUDIT_CONFIG_FILE}: [${task.id}] missing required minimum values for "${propPath}": [${missing.join(', ')}]. Rationale: ${rationale}`,
        context: `${task.id}:${propPath}`
      });
    }
  }

  private async verifyTaskCriticalMinimums(
    task: AuditTaskDefinition,
    requiredMinimums: Record<string, readonly unknown[]>,
    sectionConfig: unknown,
    rawConfig: Record<string, unknown>,
    rootKey: string | undefined,
    rationale: string | undefined,
    repair?: AuditorCriticalConfig['repair']
  ): Promise<void> {
    for (const [propPath, minList] of Object.entries(requiredMinimums)) {
      await this.verifyTaskMinimumProperty(task, propPath, minList, sectionConfig, rawConfig, rootKey, rationale, repair);
    }
  }

  private async verifyTaskForbiddenOverrides(
    task: AuditTaskDefinition,
    forbiddenOverrides: Record<string, readonly unknown[]>,
    sectionConfig: unknown,
    rawConfig: Record<string, unknown>,
    rationale: string | undefined,
    repair?: AuditorCriticalConfig['repair']
  ): Promise<void> {
    for (const [propPath, disallowedList] of Object.entries(forbiddenOverrides)) {
      const actualVal = resolveConfigPath(sectionConfig, propPath) ?? resolveConfigPath(rawConfig, propPath);
      if (actualVal !== undefined && disallowedList.includes(actualVal)) {
        if (this.isFixActive() && repair) {
          await repair(sectionConfig ?? rawConfig, this.projectRoot);
        } else {
          this.addViolation({
            ruleId: 'audit-config-critical-violation',
            severity: 'error',
            file: AUDIT_CONFIG_FILE,
            line: 1,
            message: `Configuration error in ${AUDIT_CONFIG_FILE}: [${task.id}] field "${propPath}" is set to disallowed value "${String(actualVal)}". Rationale: ${rationale}`,
            context: `${task.id}:${propPath}`
          });
        }
      }
    }
  }

  private async verifyTaskCustomValidation(
    task: AuditTaskDefinition,
    validate: NonNullable<AuditorCriticalConfig['validate']>,
    sectionConfig: unknown,
    rawConfig: Record<string, unknown>,
    rationale: string | undefined,
    repair?: AuditorCriticalConfig['repair']
  ): Promise<void> {
    const errorMsg = validate(sectionConfig ?? rawConfig, this.projectRoot);
    if (typeof errorMsg === 'string' && errorMsg.trim().length > 0) {
      if (this.isFixActive() && repair) {
        await repair(sectionConfig ?? rawConfig, this.projectRoot);
      } else {
        this.addViolation({
          ruleId: 'audit-config-critical-violation',
          severity: 'error',
          file: AUDIT_CONFIG_FILE,
          line: 1,
          message: `Configuration error in ${AUDIT_CONFIG_FILE}: [${task.id}] ${errorMsg}. Rationale: ${rationale}`,
          context: task.id
        });
      }
    }
  }

  private async verifyTaskCriticalConfig(task: AuditTaskDefinition, rawConfig: Record<string, unknown>): Promise<void> {
    if (!task.criticalConfig) return;
    const { rationale, requiredMinimums, forbiddenOverrides, validate, repair } = task.criticalConfig;
    const { rootKey, sectionConfig } = this.resolveTaskSectionContext(task, rawConfig);

    if (requiredMinimums) {
      await this.verifyTaskCriticalMinimums(task, requiredMinimums, sectionConfig, rawConfig, rootKey, rationale, repair);
    }
    if (forbiddenOverrides) {
      await this.verifyTaskForbiddenOverrides(task, forbiddenOverrides, sectionConfig, rawConfig, rationale, repair);
    }
    if (validate) {
      await this.verifyTaskCustomValidation(task, validate, sectionConfig, rawConfig, rationale, repair);
    }
  }

  protected async verifyCriticalConfigurations(config: AuditEngineConfig, tasks: readonly AuditTaskDefinition[]): Promise<void> {
    const rawConfig = (config._rawConfig ?? {}) as Record<string, unknown>;
    for (const task of tasks) {
      await this.verifyTaskCriticalConfig(task as AuditTaskDefinition, rawConfig);
    }
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
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateAuditConfigAuditor());

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
import { pathToFileURL } from 'node:url';
import { enableCompileCache } from 'node:module';
import {
  BaseAuditor,
  createUniformRemediationPhases,
  createRuleCapabilities
} from '../../core/auditorBase.ts';
import {
  loadAuditConfig,
  AUDITOR_DIR,
  AUDIT_CONFIG_FILE,
  LEGACY_ROOT_CONFIG_FILES,
  DEFAULT_AUDIT_CONFIG,
  type AuditEngineConfig
} from '../../core/auditConfig.ts';
import type {
  GitIgnoreRequirement,
  AuditorConfigFileRequirement,
  AuditTaskDefinition,
  AuditorCriticalConfig
} from '../../core/auditContract.ts';
import {
  findMissingGitIgnoreRequirements,
  appendGitIgnoreEntries
} from '../../core/gitignoreMatcher.ts';
import { discoverAuditors, collectAllGitIgnoreRequirements } from '../../cli/auditScanner.ts';
import { migrateLegacyAuditConfig } from '../../cli/migrateAuditConfig.ts';
import { getPackageJson } from '../../core/packageJson.ts';
import { AUDITOR_VERSION } from '../../core/version.ts';
import {
  detectUnacknowledgedDegradations
} from '../../core/auditConfigDegradations.ts';
import { auditConfigRatchet } from '../../core/configRatchet.ts';
import { normalizePosixPath } from '../../core/safePath.ts';
import { createSyntheticSourceFile } from '../../core/astContext.ts';
import { tryOrNull } from '../../core/safeUtils.ts';
import ts from 'typescript';
import { SyntaxKind } from 'ts-morph';

enableCompileCache();

import {
  dtoValueToTsExpression,
  printTsExpression,
  formatSectionObjectLiteral,
  findConfigObjectLiteral,
  appendMissingSectionsFallback,
  parseAuditConfigFileAst,
  appendMissingSectionsToJsonFile,
  appendMissingSectionsToTsFile,
  appendMissingSectionsToConfigFile,
  findTargetAuditConfigObject,
  syncAuditorVersionInTsFile,
  mutateAuditConfigFileAst
} from '../../core/auditConfigAst.ts';

export {
  dtoValueToTsExpression,
  printTsExpression,
  formatSectionObjectLiteral,
  findConfigObjectLiteral,
  appendMissingSectionsFallback,
  parseAuditConfigFileAst,
  appendMissingSectionsToJsonFile,
  appendMissingSectionsToTsFile,
  appendMissingSectionsToConfigFile,
  findTargetAuditConfigObject,
  syncAuditorVersionInTsFile,
  mutateAuditConfigFileAst
};

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

export function deepMergeDefaultsObject(
  target: Record<string, unknown>,
  defaults: Record<string, unknown>
): void {
  for (const [key, val] of Object.entries(defaults)) {
    if (val === undefined) continue;
    if (
      typeof val === 'object' &&
      val !== null &&
      !Array.isArray(val) &&
      typeof target[key] === 'object' &&
      target[key] !== null &&
      !Array.isArray(target[key])
    ) {
      deepMergeDefaultsObject(
        target[key] as Record<string, unknown>,
        val as Record<string, unknown>
      );
    } else if (target[key] === undefined) {
      target[key] = typeof val === 'object' && val !== null ? structuredClone(val) : val;
    }
  }
}

export function buildTaskExpectedConfigTree(
  tasks: readonly AuditTaskDefinition[]
): Map<string, { tasks: AuditTaskDefinition[]; expectedTree: Record<string, unknown> }> {
  const byRoot = new Map<
    string,
    { tasks: AuditTaskDefinition[]; expectedTree: Record<string, unknown> }
  >();

  for (const task of tasks) {
    const rootConfigKeys: ReadonlySet<string> = new Set(['paths', 'core', 'none']);
    if (!task.configKey || rootConfigKeys.has(task.configKey)) {
      continue;
    }
    if (
      !task.defaultConfig ||
      typeof task.defaultConfig !== 'object' ||
      Object.keys(task.defaultConfig).length === 0
    ) {
      continue;
    }

    const parts = task.configKey.split('.');
    const rootKey = parts[0]!;
    let entry = byRoot.get(rootKey);
    if (!entry) {
      entry = { tasks: [], expectedTree: {} };
      byRoot.set(rootKey, entry);
    }
    entry.tasks.push(task);

    const subParts = parts.slice(1);
    if (
      subParts.length > 0 &&
      (subParts[subParts.length - 1] === 'enabled' ||
        subParts[subParts.length - 1] === 'enforceInAudit' ||
        subParts[subParts.length - 1] === 'zLayersEnabled')
    ) {
      subParts.pop();
    }

    let targetContainer = entry.expectedTree;
    for (const sub of subParts) {
      if (
        typeof targetContainer[sub] !== 'object' ||
        targetContainer[sub] === null ||
        Array.isArray(targetContainer[sub])
      ) {
        targetContainer[sub] = {};
      }
      targetContainer = targetContainer[sub] as Record<string, unknown>;
    }

    deepMergeDefaultsObject(targetContainer, task.defaultConfig as Record<string, unknown>);
  }

  return byRoot;
}

export function collectConfigSectionsFromTasks(
  tasks: readonly AuditTaskDefinition[]
): Record<string, Record<string, unknown>> {
  const sections: Record<string, Record<string, unknown>> = {};
  const byRoot = buildTaskExpectedConfigTree(tasks);
  for (const [rootKey, { expectedTree }] of byRoot.entries()) {
    sections[rootKey] = expectedTree;
  }
  return sections;
}

export function syncAuditorVersionInConfigFile(configFilePath: string, version: string): boolean {
  if (!fs.existsSync(configFilePath)) return false;

  if (configFilePath.endsWith('.json')) {
    try {
      const content = fs.readFileSync(configFilePath, 'utf8');
      const json = JSON.parse(content) as Record<string, unknown>;
      if (json.auditorVersion === version) return false;
      json.auditorVersion = version;
      fs.writeFileSync(configFilePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
      return true;
    } catch {
      return false;
    }
  }

  return syncAuditorVersionInTsFile(configFilePath, version);
}

export function createDefaultAuditConfigContent(
  packageName = 'Project',
  tasks: readonly AuditTaskDefinition[] = []
): string {
  const defaultDto: Record<string, unknown> = {
    name: packageName,
    auditorVersion: AUDITOR_VERSION,
    paths: {
      enabled: true,
      srcRoots: DEFAULT_AUDIT_CONFIG.paths.srcRoots,
      testRoots: DEFAULT_AUDIT_CONFIG.paths.testRoots,
      scriptsRoots: DEFAULT_AUDIT_CONFIG.paths.scriptsRoots
    },
    documentation: {
      enabled: true,
      language: 'en',
      chatLanguage: 'es'
    },
    ...collectConfigSectionsFromTasks(tasks)
  };

  const importDecl = ts.factory.createImportDeclaration(
    undefined,
    ts.factory.createImportClause(
      false,
      undefined,
      ts.factory.createNamedImports([
        ts.factory.createImportSpecifier(
          false,
          undefined,
          ts.factory.createIdentifier('defineAuditConfig')
        )
      ])
    ),
    ts.factory.createStringLiteral('@francogp/auditor', true)
  );

  const exportDecl = ts.factory.createExportAssignment(
    undefined,
    false,
    ts.factory.createCallExpression(
      ts.factory.createIdentifier('defineAuditConfig'),
      undefined,
      [dtoValueToTsExpression(defaultDto)]
    )
  );

  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const dummySource = createSyntheticSourceFile('audit.config.ts');
  const importCode = printer.printNode(ts.EmitHint.Unspecified, importDecl, dummySource);
  const exportCode = printer
    .printNode(ts.EmitHint.Unspecified, exportDecl, dummySource)
    .split('\n')
    .map((line) => line.replace(/^( {4})+/, (m) => ' '.repeat(m.length / 2)))
    .join('\n');

  return `${importCode}\n\n${exportCode}\n`;
}

export interface MissingSectionEntry {
  tasks: AuditTaskDefinition[];
  defaultConfig: Record<string, unknown>; // open-record: Default section configuration mapping
  missingTree: Record<string, unknown>; // open-record: Missing sub-tree dictionary
  missingPaths: string[]; // List of dot-separated paths for missing sections or sub-configurations
}

export function computeMissingConfigDiff(
  expected: unknown,
  current: unknown,
  isRootLevel = true
): unknown | undefined {
  if (current === undefined) {
    if (typeof expected === 'object' && expected !== null) {
      return structuredClone(expected);
    }
    return expected;
  }

  // If the user explicitly disabled this block/sub-block (enabled: false or engine: 'none'), respect the deactivation
  if (
    typeof current === 'object' &&
    current !== null &&
    ((current as Record<string, unknown>).enabled === false ||
      (current as Record<string, unknown>).engine === 'none')
  ) {
    return undefined;
  }

  if (
    typeof expected === 'object' &&
    expected !== null &&
    !Array.isArray(expected) &&
    typeof current === 'object' &&
    current !== null &&
    !Array.isArray(current)
  ) {
    const missingObj: Record<string, unknown> = {};
    for (const [key, expectedVal] of Object.entries(expected)) {
      if (expectedVal === undefined) continue;
      const currentVal = Reflect.get(current, key);

      const isSubConfiguration =
        typeof expectedVal === 'object' && expectedVal !== null && !Array.isArray(expectedVal);

      if (isRootLevel && !isSubConfiguration) {
        // Scalar options of an already configured section are optional and not treated as missing sub-configurations
        continue;
      }

      const diff = computeMissingConfigDiff(expectedVal, currentVal, false);
      if (diff !== undefined) {
        missingObj[key] = diff;
      }
    }
    return Object.keys(missingObj).length > 0 ? missingObj : undefined;
  }

  return undefined;
}

export function extractMissingConfigPaths(
  prefix: string,
  missingTree: Record<string, unknown>,
  currentVal?: unknown
): string[] {
  const paths: string[] = [];
  for (const [key, val] of Object.entries(missingTree)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    const currentChild =
      typeof currentVal === 'object' && currentVal !== null
        ? Reflect.get(currentVal, key)
        : undefined;

    if (currentChild === undefined) {
      paths.push(fullPath);
    } else if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      const subPaths = extractMissingConfigPaths(
        fullPath,
        val as Record<string, unknown>,
        currentChild
      );
      if (subPaths.length > 0) {
        paths.push(...subPaths);
      } else {
        paths.push(fullPath);
      }
    } else {
      paths.push(fullPath);
    }
  }
  return paths;
}

export function collectMissingSections(
  tasks: readonly AuditTaskDefinition[],
  rawConfig: unknown
): Map<string, MissingSectionEntry> {
  const missingByRootKey = new Map<string, MissingSectionEntry>();
  const byRoot = buildTaskExpectedConfigTree(tasks);

  for (const [rootKey, { tasks: rootTasks, expectedTree }] of byRoot.entries()) {
    let currentVal: unknown;
    if (typeof rawConfig === 'object' && rawConfig !== null) {
      if (rootKey === 'stylelint') {
        const stylesConfig = Reflect.get(rawConfig, 'styles') as
          | Record<string, unknown>
          | undefined;
        const stylelintConfig = Reflect.get(rawConfig, 'stylelint');
        currentVal =
          stylelintConfig !== undefined
            ? stylelintConfig
            : stylesConfig && typeof stylesConfig === 'object'
              ? (stylesConfig.stylelint ?? stylesConfig)
              : undefined;
      } else {
        currentVal = Reflect.get(rawConfig, rootKey);
      }
    }

    const missingDiff = computeMissingConfigDiff(expectedTree, currentVal, true) as
      | Record<string, unknown>
      | undefined;

    if (missingDiff && Object.keys(missingDiff).length > 0) {
      const missingPaths = extractMissingConfigPaths(rootKey, missingDiff, currentVal);
      missingByRootKey.set(rootKey, {
        tasks: rootTasks,
        defaultConfig: expectedTree,
        missingTree: missingDiff,
        missingPaths
      });
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
  | 'audit-config-critical-violation'
  | 'audit-config-unacknowledged-degradation'
  | 'audit-config-ratchet-relaxation';

export const AUDIT_CONFIG_RULES: readonly AuditConfigRuleId[] = [
  'audit-config-missing-path',
  'audit-config-missing-file',
  'audit-config-invalid-extension',
  'audit-config-missing-gitignore-entry',
  'audit-config-missing-section',
  'audit-config-unknown-field',
  'audit-config-critical-violation',
  'audit-config-unacknowledged-degradation',
  'audit-config-ratchet-relaxation'
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
  description: 'Auditor configuration in .auditor/',
  ruleId: 'audit-config-missing-file',
  generateDefaultContent: async (ctx) => {
    const legacy = LEGACY_ROOT_CONFIG_FILES.find((f) =>
      fs.existsSync(path.resolve(ctx.projectRoot, f))
    );
    if (legacy) {
      migrateLegacyAuditConfig(ctx.projectRoot);
      const migratedPath = path.resolve(ctx.projectRoot, AUDIT_CONFIG_FILE);
      if (fs.existsSync(migratedPath)) {
        return fs.readFileSync(migratedPath, 'utf-8');
      }
    }
    const pkg = tryOrNull(() => getPackageJson(ctx.projectRoot));
    const pkgName = pkg?.name ?? ctx.packageName ?? 'Project';
    const tasks = await import('../../cli/auditScanner.ts')
      .then((m) => m.discoverAuditors({ projectRoot: ctx.projectRoot }))
      .catch(() => []);
    return createDefaultAuditConfigContent(pkgName, tasks);
  },
  customMissingMessage: (ctx, file) => {
    const legacy = LEGACY_ROOT_CONFIG_FILES.find((f) =>
      fs.existsSync(path.resolve(ctx.projectRoot, f))
    );
    if (legacy) {
      return `Configuration error: root-level ${legacy} is no longer supported. Run "auditor fix" to move it to ${file}.`;
    }
    return `Configuration error: ${file} does not exist. Run "auditor fix" to initialize default configuration.`;
  },
  customMissingFile: (ctx, defaultFile) => {
    const legacy = LEGACY_ROOT_CONFIG_FILES.find((f) =>
      fs.existsSync(path.resolve(ctx.projectRoot, f))
    );
    return legacy ?? defaultFile;
  }
};

export class ValidateAuditConfigAuditor extends BaseAuditor<AuditConfigRuleId> {
  constructor(targetPathOrOptions?: string | ValidateAuditConfigOptions) {
    const options =
      typeof targetPathOrOptions === 'string'
        ? { projectRoot: targetPathOrOptions }
        : (targetPathOrOptions ?? {});
    const projectRoot = options.projectRoot || process.cwd();

    super({
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleCapabilities: createRuleCapabilities(
        AUDIT_CONFIG_RULES,
        {
          speed: 'light',
          phase: 'setup',
          fix: 'priority',
          md: false,
          ast: false,
          changedOnly: false,
          critical: false
        },
        [
          'audit-config-missing-section',
          'audit-config-missing-file',
          'audit-config-missing-gitignore-entry',
          'audit-config-critical-violation',
          'audit-config-unacknowledged-degradation'
        ]
      ),
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
      description: 'Validates auditor configuration in .auditor/',
      family: 'architecture',
      ruleIds: AUDIT_CONFIG_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(AUDIT_CONFIG_RULES, 'setup'),
      packageName: 'Config',
      icon: '⚙️',
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
      ruleDescriptions: {
        'audit-config-missing-path': 'Configured path does not exist',
        'audit-config-missing-file': 'Configured file does not exist',
        'audit-config-invalid-extension': 'Configured extension does not exist',
        'audit-config-missing-gitignore-entry': 'Missing entry in .gitignore',
        'audit-config-missing-section': 'Missing section in audit.config',
        'audit-config-unknown-field': 'Unrecognized field in config',
        'audit-config-critical-violation': 'Critical configuration violation',
        'audit-config-unacknowledged-degradation': 'Undocumented coverage degradation',
        'audit-config-ratchet-relaxation': 'Unauthorized rule relaxation (ratchet)'
      },
      ruleRemediations: {
        'audit-config-missing-path':
          '📖 REMEDIATION GUIDE: audit-config-missing-path\n' +
          '1. Root Cause: A directory path declared in `config.paths` does not exist on the project filesystem.\n' +
          '2. Diagnosis: Compare the paths defined in `.auditor/audit.config.ts` against actual folders in your repository.\n' +
          '3. Canonical Solution: If the directory was renamed or moved, update `.auditor/audit.config.ts`. If optional or not yet created, create the empty directory or remove it from configuration.\n' +
          '4. Example / Auto-fix command:\n' +
          '   Update `.auditor/audit.config.ts` with correct paths.',
        'audit-config-missing-file':
          '📖 REMEDIATION GUIDE: audit-config-missing-file\n' +
          '1. Root Cause: The primary auditor configuration file `.auditor/audit.config.ts` (or `audit.config.json`) was not found.\n' +
          '2. Diagnosis: Check whether `.auditor/audit.config.ts` exists in the project root.\n' +
          '3. Canonical Solution: Run `npm run auditor:fix` or `auditor fix` to automatically generate the canonical configuration file with default settings.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run auditor:fix`',
        'audit-config-invalid-extension':
          '📖 REMEDIATION GUIDE: audit-config-invalid-extension\n' +
          '1. Root Cause: An extension or plugin declared in `config.extensions` could not be resolved on disk, fails compilation, or violates BaseAuditor constructor contracts.\n' +
          '2. Diagnosis: Inspect the target extension file reported in the violation and its runtime compilation/instantiation error message.\n' +
          '3. Canonical Solution: Ensure the extension file exists, compiles cleanly, and subclasses `BaseAuditor`. If missing `requiredPermissions`, declare `requiredPermissions: []` in constructor options. If using `hasLineSuppression`, replace it with `hasPrecedingComment`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   Verify `extensions: ["./scripts/auditors/my_audit.ts"]` in `.auditor/audit.config.ts` and ensure `super({ ..., requiredPermissions: [] })`.',
        'audit-config-missing-gitignore-entry':
          '📖 REMEDIATION GUIDE: audit-config-missing-gitignore-entry\n' +
          '1. Root Cause: Mandatory entries governed by the auditor (e.g., `scratch/`, `coverage/`) are missing from `.gitignore`.\n' +
          '2. Diagnosis: Inspect `.gitignore` against required auditor artifact paths.\n' +
          '3. Canonical Solution: Run `auditor fix` to automatically inject missing gitignore entries, or add them manually.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run auditor:fix`',
        'audit-config-missing-section':
          '📖 REMEDIATION GUIDE: audit-config-missing-section\n' +
          '1. Root Cause: An active sub-auditor requires a specific configuration section in `.auditor/audit.config.ts` that is currently missing.\n' +
          '2. Diagnosis: Identify the missing configuration section mentioned in the report.\n' +
          '3. Canonical Solution: Run `npm run auditor:fix` to automatically inject the missing section with canonical default values via TypeScript AST.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run auditor:fix`',
        'audit-config-unknown-field':
          '📖 REMEDIATION GUIDE: audit-config-unknown-field\n' +
          '1. Root Cause: An unrecognized property or key was found in `.auditor/audit.config.ts` (obsolete or misspelled key).\n' +
          '2. Diagnosis: Review the field name reported in `.auditor/audit.config.ts` for typographical errors.\n' +
          '3. Canonical Solution: Remove obsolete keys or rename them to the canonical modern schema.\n' +
          '4. Example / Auto-fix command:\n' +
          '   Remove unknown property from `.auditor/audit.config.ts`.',
        'audit-config-critical-violation':
          '📖 REMEDIATION GUIDE: audit-config-critical-violation\n' +
          '1. Root Cause: Configuration violates an immutable framework policy (e.g. omitting mandatory strict values or setting prohibited overrides).\n' +
          '2. Diagnosis: Read the technical explanation in the violation message.\n' +
          '3. Canonical Solution: Run `npm run auditor:fix` to restore the immutable required baseline, or update the configuration accordingly.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run auditor:fix`',
        'audit-config-unacknowledged-degradation':
          '📖 REMEDIATION GUIDE: audit-config-unacknowledged-degradation\n' +
          '1. Root Cause: Paths declared in `config.paths` contain files whose silenced rules are not documented in `coverage.acknowledgedDegradations`.\n' +
          '2. Diagnosis: Check unacknowledged degradation paths reported by the auditor.\n' +
          '3. Canonical Solution: Declare acknowledged degradation policies with canonical globs and rationales in `coverage.acknowledgedDegradations`, or remove the silenced rules from source code.\n' +
          '4. Example / Auto-fix command:\n' +
          '   Review and declare in `coverage.acknowledgedDegradations` manually if strictly justified.',
        'audit-config-ratchet-relaxation':
          '📖 REMEDIATION GUIDE: audit-config-ratchet-relaxation\n' +
          '1. Root Cause: Configuration rules or exemptions were relaxed relative to online origin/main without explicit user authorization.\n' +
          '2. Diagnosis: Check the generated RELAX-<8hex> code and the list of relaxed rules, added exemptions, lowered floors, or raised ceilings.\n' +
          '3. Canonical Solution: Hardening rules is permitted with zero friction. To accept a relaxation genuinely requested by the human programmer, confirm the RELAX-<8hex> code directly in Antigravity chat.\n' +
          '4. Example / Auto-fix command:\n' +
          '   Revert the relaxed configuration or ask the human user to confirm RELAX-<8hex> in chat.'
      },
      coverage: {
        include: [path.posix.join(AUDITOR_DIR, '*.{ts,json}'), '.gitignore']
      },
      projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    let ensured: { resolvedPath: string; created: boolean } | null = null;
    await this.runSubAuditor('audit-config-missing-file', async () => {
      const requirement = this.configFiles[0] ?? AUDIT_CONFIG_REQUIREMENT;
      ensured = await this.ensureConfigFile(requirement);
    });

    if (!ensured) {
      return;
    }
    this.recordScanned(AUDIT_CONFIG_FILE);
    if (fs.existsSync(path.resolve(this.projectRoot, '.gitignore')))
      this.recordScanned('.gitignore');

    const config = await loadAuditConfig(this.projectRoot);
    const baselineFile =
      config.ratchet?.baselineFile ?? path.posix.join(AUDITOR_DIR, 'audit-baseline.json');
    if (fs.existsSync(path.resolve(this.projectRoot, baselineFile))) {
      this.recordScanned(baselineFile);
    }

    const tasks = await discoverAuditors({ projectRoot: this.projectRoot }).catch(() => []);

    await this.runSubAuditor('audit-config-missing-section', async () => {
      await this.verifyRequiredSections(config, tasks);
    });

    await this.runSubAuditor('audit-config-critical-violation', async () => {
      await this.verifyCriticalConfigurations(config, tasks);
    });

    this.runSubAuditorSync('audit-config-unacknowledged-degradation', () => {
      this.verifyUnacknowledgedDegradations(config);
    });

    this.runSubAuditorSync('audit-config-unknown-field', () => {
      this.verifyUnknownFields(config, tasks);
    });

    this.runSubAuditorSync('audit-config-missing-path', () => {
      this.verifyPathRoots(config);
      this.verifyPersistencePaths(config);
      this.verifyDomainAndStylePaths(config);
    });

    await this.runSubAuditor('audit-config-invalid-extension', async () => {
      await this.verifyExtensionPaths(config);
    });

    await this.runSubAuditor('audit-config-missing-gitignore-entry', async () => {
      await this.verifyGitIgnore(config);
    });

    this.runSubAuditorSync('audit-config-ratchet-relaxation', () => {
      this.verifyConfigRatchet(config);
    });
  }

  private verifyConfigRatchet(config: AuditEngineConfig): void {
    const ratchetRes = auditConfigRatchet(
      this.projectRoot,
      (config._rawConfig ?? config) as Record<string, unknown>
    );
    if (!ratchetRes.passed) {
      for (const rel of ratchetRes.relaxations) {
        this.addViolation({
          ruleId: 'audit-config-ratchet-relaxation',
          severity: 'error',
          file: rel.file,
          line: 1,
          message: `[Config Ratchet] Unauthorized rule relaxation detected in ${rel.path}: ${rel.description}. Authorization code: '${ratchetRes.relaxationCode}'. Confirm in Antigravity chat to proceed.`,
          context: rel.path
        });
      }
    }
  }

  private verifyUnknownFields(
    config: AuditEngineConfig,
    tasks: readonly AuditTaskDefinition[]
  ): void {
    const rawConfig = config._rawConfig ?? {};
    if (typeof rawConfig !== 'object' || rawConfig === null) return;

    this.verifyUnknownTopLevelSections(rawConfig as Record<string, unknown>, tasks);
    this.verifyUnknownPathsFields(rawConfig as Record<string, unknown>);
    this.verifyUnknownConstantsFields(rawConfig as Record<string, unknown>);
    this.verifyUnknownBundleFields(rawConfig as Record<string, unknown>);
  }

  private verifyUnknownBundleFields(rawConfig: Record<string, unknown>): void {
    const rawBundle = rawConfig.bundle;
    if (typeof rawBundle !== 'object' || rawBundle === null) return;

    const validBundleKeys = new Set([
      'enabled',
      'statsFile',
      'distDir',
      'exemptChunkPrefixes',
      'maxClientChunkWarnBytes',
      'maxClientChunkErrorBytes',
      'budgets',
      'duplicateModuleThresholdBytes',
      'topModulesLimit',
      'forbiddenUiImports'
    ]);

    for (const key of Object.keys(rawBundle)) {
      if (!validBundleKeys.has(key)) {
        this.addViolation({
          ruleId: 'audit-config-unknown-field',
          severity: 'error',
          file: AUDIT_CONFIG_FILE,
          line: 1,
          message: `Configuration error in ${AUDIT_CONFIG_FILE}: Unknown or legacy field "bundle.${key}". This field is not supported. Please remove it.`,
          context: `bundle.${key}`
        });
      }
    }

    const budgets = (rawBundle as Record<string, unknown>).budgets;
    if (Array.isArray(budgets)) {
      const validBudgetKeys = new Set(['name', 'prefix', 'matcher', 'limitBytes']);
      budgets.forEach((budgetEntry, idx) => {
        if (typeof budgetEntry !== 'object' || budgetEntry === null) return;
        for (const bKey of Object.keys(budgetEntry)) {
          if (!validBudgetKeys.has(bKey)) {
            this.addViolation({
              ruleId: 'audit-config-unknown-field',
              severity: 'error',
              file: AUDIT_CONFIG_FILE,
              line: 1,
              message: `Configuration error in ${AUDIT_CONFIG_FILE}: Unknown field "bundle.budgets[${idx}].${bKey}". Canonical fields for ChunkBudgetConfig are 'name', 'prefix', 'matcher', and 'limitBytes'.`,
              context: `bundle.budgets.${bKey}`
            });
          }
        }
      });
    }
  }

  private verifyUnknownTopLevelSections(
    rawConfig: Record<string, unknown>,
    tasks: readonly AuditTaskDefinition[]
  ): void {
    const validTopLevelKeys = new Set<string>(
      Object.keys(DEFAULT_AUDIT_CONFIG).filter((k) => !k.startsWith('_'))
    );
    for (const task of tasks) {
      if (
        task.configKey &&
        task.configKey !== 'paths' &&
        task.configKey !== 'core' &&
        task.configKey !== 'none'
      ) {
        const rootKey = task.configKey.split('.')[0];
        if (rootKey) validTopLevelKeys.add(rootKey);
      }
    }

    for (const key of Object.keys(rawConfig)) {
      if (key.startsWith('_')) continue;
      if (!validTopLevelKeys.has(key)) {
        if (key === 'eslint' && this.isFixActive()) {
          const configFilePath = path.resolve(this.projectRoot, AUDIT_CONFIG_FILE);
          if (this.migrateLegacyEslintConfigSection(configFilePath)) continue;
        }
        this.addViolation({
          ruleId: 'audit-config-unknown-field',
          severity: 'error',
          file: AUDIT_CONFIG_FILE,
          line: 1,
          message: `Configuration error in ${AUDIT_CONFIG_FILE}: Unknown or legacy top-level section "${key}". This section is not supported by @francogp/auditor. Please remove it.`,
          context: key,
          fixable: key === 'eslint'
        });
      }
    }
  }

  private migrateLegacyEslintConfigSection(configFilePath: string): boolean {
    if (!fs.existsSync(configFilePath)) return false;

    if (configFilePath.endsWith('.json')) {
      try {
        const text = fs.readFileSync(configFilePath, 'utf8');
        const json = JSON.parse(text) as Record<string, unknown>;
        if (!('eslint' in json)) return false;
        json.oxlint = json.eslint;
        delete json.eslint;
        if (!('vitePlusConfig' in json)) {
          json.vitePlusConfig = { enabled: true };
        }
        fs.writeFileSync(configFilePath, JSON.stringify(json, null, 2) + '\n', 'utf8');
        return true;
      } catch {
        return false;
      }
    }

    return mutateAuditConfigFileAst(configFilePath, (targetObj) => {
      const eslintProp = targetObj.getProperty('eslint');
      if (!eslintProp) return false;

      if (eslintProp.isKind(SyntaxKind.PropertyAssignment)) {
        eslintProp.getNameNode().replaceWithText('oxlint');
      }

      if (!targetObj.getProperty('vitePlusConfig')) {
        targetObj.addPropertyAssignment({
          name: 'vitePlusConfig',
          initializer: '{ enabled: true }'
        });
      }

      return true;
    });
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

  private async verifyRequiredSections(
    config: AuditEngineConfig,
    tasks: readonly AuditTaskDefinition[]
  ): Promise<void> {
    if (tasks.length === 0) return;

    const rawConfig = (config._rawConfig ?? {}) as Record<string, unknown>;
    const missingByRootKey = collectMissingSections(
      tasks as AuditTaskDefinition[],
      rawConfig
    );
    if (missingByRootKey.size === 0) return;

    if (this.isFixActive()) {
      this.applyMissingSectionsFix(missingByRootKey);
      return;
    }

    this.reportMissingSectionViolations(missingByRootKey, rawConfig);
  }

  private applyMissingSectionsFix(missingByRootKey: Map<string, MissingSectionEntry>): void {
    const configFilePath = path.resolve(this.projectRoot, AUDIT_CONFIG_FILE);
    if (!fs.existsSync(configFilePath)) return;

    const sectionsToInsert: Record<string, Record<string, unknown>> = {}; // open-record: Sections dictionary
    for (const [rootKey, entry] of missingByRootKey.entries()) {
      sectionsToInsert[rootKey] =
        Object.keys(entry.missingTree).length > 0
          ? entry.missingTree
          : Object.keys(entry.defaultConfig).length > 0
            ? entry.defaultConfig
            : { enabled: true };
    }
    appendMissingSectionsToConfigFile(configFilePath, sectionsToInsert);
  }

  private reportMissingSectionViolations(
    missingByRootKey: Map<string, MissingSectionEntry>,
    rawConfig: Record<string, unknown>
  ): void {
    for (const [rootKey, entry] of missingByRootKey.entries()) {
      const suiteNames = entry.tasks.map((t) => t.id).join(', ');
      const isEntireSectionMissing =
        typeof rawConfig !== 'object' || rawConfig === null || Reflect.get(rawConfig, rootKey) === undefined;

      if (isEntireSectionMissing) {
        this.addViolation({
          ruleId: 'audit-config-missing-section',
          severity: 'error',
          file: AUDIT_CONFIG_FILE,
          line: 1,
          message: `Configuration error in ${AUDIT_CONFIG_FILE}: Missing required section "${rootKey}" declared by ${suiteNames}. Run "auditor fix" to add automatically.`,
          context: rootKey,
          fixable: true
        });
      } else {
        for (const missingPath of entry.missingPaths) {
          this.addViolation({
            ruleId: 'audit-config-missing-section',
            severity: 'error',
            file: AUDIT_CONFIG_FILE,
            line: 1,
            message: `Configuration error in ${AUDIT_CONFIG_FILE}: Missing required sub-configuration "${missingPath}" declared by ${suiteNames}. Run "auditor fix" to add automatically.`,
            context: missingPath,
            fixable: true
          });
        }
      }
    }
  }

  private resolveTaskSectionContext(
    task: AuditTaskDefinition,
    rawConfig: Record<string, unknown>
  ): { rootKey?: string; sectionConfig?: unknown } {
    const rootKey =
      task.configKey &&
      task.configKey !== 'paths' &&
      task.configKey !== 'core' &&
      task.configKey !== 'none'
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
        appendMissingSectionsToConfigFile(configFilePath, {
          [rootKey]: sectionConfig as Record<string, unknown>
        });
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
    const configuredVal =
      resolveConfigPath(sectionConfig, propPath) ?? resolveConfigPath(rawConfig, propPath);
    if (configuredVal === undefined) return;

    const configuredList = Array.isArray(configuredVal) ? configuredVal : [];
    const missing = minList.filter((item) => !configuredList.includes(item));
    if (missing.length === 0) return;

    if (this.isFixActive()) {
      await this.repairCriticalMinimum(
        sectionConfig,
        rawConfig,
        rootKey,
        propPath,
        configuredList,
        missing,
        repair
      );
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
      await this.verifyTaskMinimumProperty(
        task,
        propPath,
        minList,
        sectionConfig,
        rawConfig,
        rootKey,
        rationale,
        repair
      );
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
      const actualVal =
        resolveConfigPath(sectionConfig, propPath) ?? resolveConfigPath(rawConfig, propPath);
      if (actualVal !== undefined && disallowedList.includes(actualVal)) {
        if (this.isFixActive() && repair) {
          await repair(sectionConfig ?? rawConfig, this.projectRoot);
        } else {
          this.addViolation({
            ruleId: 'audit-config-critical-violation',
            severity: 'error',
            file: AUDIT_CONFIG_FILE,
            line: 1,
            message: `Configuration error in ${AUDIT_CONFIG_FILE}: [${task.id}] field "${propPath}" is set to disallowed value "${typeof actualVal === 'string' ? actualVal : typeof actualVal === 'number' || typeof actualVal === 'boolean' ? String(actualVal) : JSON.stringify(actualVal)}". Rationale: ${rationale}`,
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

  private async verifyTaskCriticalConfig(
    task: AuditTaskDefinition,
    rawConfig: Record<string, unknown>
  ): Promise<void> {
    if (!task.criticalConfig) return;
    const { rationale, requiredMinimums, forbiddenOverrides, validate, repair } =
      task.criticalConfig;
    const { rootKey, sectionConfig } = this.resolveTaskSectionContext(task, rawConfig);

    if (requiredMinimums) {
      await this.verifyTaskCriticalMinimums(
        task,
        requiredMinimums,
        sectionConfig,
        rawConfig,
        rootKey,
        rationale,
        repair
      );
    }
    if (forbiddenOverrides) {
      await this.verifyTaskForbiddenOverrides(
        task,
        forbiddenOverrides,
        sectionConfig,
        rawConfig,
        rationale,
        repair
      );
    }
    if (validate) {
      await this.verifyTaskCustomValidation(
        task,
        validate,
        sectionConfig,
        rawConfig,
        rationale,
        repair
      );
    }
  }

  public async verifyCriticalConfigurations(
    config: AuditEngineConfig,
    tasks: readonly AuditTaskDefinition[]
  ): Promise<void> {
    const rawConfig = (config._rawConfig ?? {}) as Record<string, unknown>;
    for (const task of tasks) {
      await this.verifyTaskCriticalConfig(task as AuditTaskDefinition, rawConfig);
    }
  }

  private handleMissingGitIgnoreFile(
    gitignorePath: string,
    requirements: readonly GitIgnoreRequirement[]
  ): void {
    if (this.isFixActive()) {
      const contentLines = [
        '# Auditor tool caches (Added by @francogp/auditor)',
        ...requirements.map((e) => e.pattern),
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

  private appendMissingGitIgnoreEntries(
    gitignorePath: string,
    missing: readonly GitIgnoreRequirement[]
  ): void {
    appendGitIgnoreEntries(
      gitignorePath,
      missing.map((e) => e.pattern)
    );
  }

  private async verifyGitIgnore(config: AuditEngineConfig): Promise<void> {
    const gitignorePath = path.resolve(this.projectRoot, '.gitignore');
    const allRequirements = await collectAllGitIgnoreRequirements(this.projectRoot, config);
    const applicable = allRequirements.filter((req) =>
      req.isApplicable ? req.isApplicable(config) : true
    );

    if (!fs.existsSync(gitignorePath)) {
      this.handleMissingGitIgnoreFile(gitignorePath, applicable);
      return;
    }

    const missing = findMissingGitIgnoreRequirements(this.projectRoot, gitignorePath, applicable);

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

  private verifyUnacknowledgedDegradations(config: AuditEngineConfig): void {
    const missing = detectUnacknowledgedDegradations(config, this.projectRoot);
    if (missing.length === 0) return;

    for (const item of missing) {
      this.addViolation({
        ruleId: 'audit-config-unacknowledged-degradation',
        severity: 'error',
        file: AUDIT_CONFIG_FILE,
        line: 1,
        message: `Configuration error in ${AUDIT_CONFIG_FILE}: Path '${item.rootOrFile}' contains ${item.filesCount} code file(s) with silenced rules under policy '${item.policy}', but no matching entry exists in coverage.acknowledgedDegradations. Resolve the silenced rules in source code or declare the degradation manually.`,
        context: `coverage.acknowledgedDegradations.${item.policy}`
      });
    }
  }

  private checkPathExists(
    relPath: string,
    ruleId: AuditConfigRuleId,
    description: string
  ): boolean {
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
            this.checkPathExists(
              item,
              'audit-config-missing-path',
              `directory in paths.${String(key)}`
            );
          }
        }
      }
    }
  }

  private verifyPersistencePaths(config: AuditEngineConfig): void {
    const rawPersistence = config._rawConfig?.persistence;
    if (config.paths?.migrationsDir && config.persistence?.engine !== 'none') {
      if (config._rawPaths?.migrationsDir) {
        this.checkPathExists(
          config.paths.migrationsDir,
          'audit-config-missing-path',
          'migrations directory'
        );
      }
    }

    if (rawPersistence?.supabaseDir) {
      this.checkPathExists(
        rawPersistence.supabaseDir,
        'audit-config-missing-path',
        'supabase directory'
      );
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
      this.checkPathExists(
        rawDomain.zLayersFile,
        'audit-config-missing-file',
        'domain z-layers file'
      );
    }
    if (rawDomain?.timezoneHelperModule) {
      this.checkPathExists(
        rawDomain.timezoneHelperModule,
        'audit-config-missing-file',
        'timezone helper module'
      );
    }
    if (rawDomain?.loggerModule) {
      this.checkPathExists(rawDomain.loggerModule, 'audit-config-missing-file', 'logger module');
    }
    if (Array.isArray(rawDomain?.o1CatalogPatterns)) {
      for (const pattern of rawDomain.o1CatalogPatterns) {
        if (pattern.definingFile) {
          this.checkPathExists(
            pattern.definingFile,
            'audit-config-missing-file',
            `O(1) pattern defining file for '${pattern.name}'`
          );
        }
      }
    }
  }

  private verifyStylesPaths(config: AuditEngineConfig): void {
    const rawStyles = config._rawConfig?.styles;
    if (config.styles?.zLayersEnabled !== false && rawStyles) {
      if (rawStyles.baseScssFile) {
        this.checkPathExists(
          rawStyles.baseScssFile,
          'audit-config-missing-file',
          'styles base SCSS file'
        );
      }
      if (rawStyles.zLayersScssFile) {
        this.checkPathExists(
          rawStyles.zLayersScssFile,
          'audit-config-missing-file',
          'styles z-layers SCSS file'
        );
      }
      if (rawStyles.zLayersTsFile) {
        this.checkPathExists(
          rawStyles.zLayersTsFile,
          'audit-config-missing-file',
          'styles z-layers TS file'
        );
      }
    }

    if (rawStyles?.buttonGovernance?.buttonsScssFile) {
      this.checkPathExists(
        rawStyles.buttonGovernance.buttonsScssFile,
        'audit-config-missing-file',
        'button governance SCSS file'
      );
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

  private resolveExtensionFiles(resolved: string): string[] {
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      return fs
        .readdirSync(resolved)
        .filter((f) => (f.endsWith('.ts') || f.endsWith('.js')) && !f.endsWith('.d.ts'))
        .map((f) => path.join(resolved, f));
    }
    if (stat.isFile() && (resolved.endsWith('.ts') || resolved.endsWith('.js'))) {
      return [resolved];
    }
    return [];
  }

  private checkExtensionStaticContract(targetFile: string, relTarget: string, normalized: string): boolean {
    const fileContent = tryOrNull(() => fs.readFileSync(targetFile, 'utf-8'));
    if (!fileContent) return true;
    const hasContract =
      fileContent.includes('ruleRemediationPhases') || fileContent.includes('remediationPhase');
    if (!hasContract) {
      this.addViolation({
        ruleId: 'audit-config-invalid-extension',
        severity: 'error',
        file: AUDIT_CONFIG_FILE,
        line: 1,
        message: `Configuration error in ${AUDIT_CONFIG_FILE}: Extension '${relTarget}' is missing mandatory 'remediationPhase' or 'ruleRemediationPhases' in its constructor options. Every extension must declare its strategic remediation classification. To remediate: add "remediationPhase: 'contracts'" (or 'setup' | 'prune' | 'dedup' | 'contracts' | 'behavior' | 'hygiene' | 'polish') inside super({ ... }) in '${relTarget}'.`,
        context: normalized
      });
      return false;
    }
    return true;
  }

  private instantiateAuditorClass(AuditorClass: new (opts?: unknown) => BaseAuditor): void {
    let firstErr: unknown;
    try {
      new AuditorClass(this.projectRoot);
      return;
    } catch (err: unknown) {
      firstErr = err;
    }
    try {
      new AuditorClass({ projectRoot: this.projectRoot });
    } catch {
      throw firstErr;
    }
  }

  private isAuditorConstructor(val: unknown): boolean {
    if (typeof val !== 'function' || !val.prototype) return false;
    return (
      val.prototype instanceof BaseAuditor ||
      typeof (val.prototype as Record<string, unknown>).runAudit === 'function' ||
      val.name.endsWith('Auditor')
    );
  }

  private async verifyExtensionRuntime(targetFile: string, relTarget: string, normalized: string): Promise<void> {
    try {
      const fileUrl = pathToFileURL(targetFile).href;
      const mod = (await import(fileUrl)) as Record<string, unknown>;
      for (const val of Object.values(mod)) {
        if (!this.isAuditorConstructor(val)) continue;
        const AuditorClass = val as new (opts?: unknown) => BaseAuditor;
        this.instantiateAuditorClass(AuditorClass);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      let hint = '';
      if (errorMsg.includes('requiredPermissions')) {
        hint = " Hint: declare 'requiredPermissions: []' in constructor options.";
      } else if (errorMsg.includes('hasLineSuppression')) {
        hint = " Hint: 'hasLineSuppression' was eradicated by Zero-Ignore Mandate; replace it with 'hasPrecedingComment'.";
      }
      this.addViolation({
        ruleId: 'audit-config-invalid-extension',
        severity: 'error',
        file: relTarget,
        line: 1,
        message: `Extension '${relTarget}' failed compilation or runtime instantiation: ${errorMsg}.${hint} Fix the extension before continuing.`,
        context: normalized
      });
    }
  }

  private async verifySingleExtensionFile(targetFile: string, normalized: string): Promise<void> {
    const relTarget = normalizePosixPath(path.relative(this.projectRoot, targetFile));
    if (!this.checkExtensionStaticContract(targetFile, relTarget, normalized)) {
      return;
    }
    await this.verifyExtensionRuntime(targetFile, relTarget, normalized);
  }

  private async verifyExtensionPaths(config: AuditEngineConfig): Promise<void> {
    const rawExtensions = config._rawConfig?.extensions ?? config.extensions;
    if (!Array.isArray(rawExtensions)) return;

    for (const ext of rawExtensions) {
      if (typeof ext !== 'string') continue;
      const normalized = ext.trim();
      if (!normalized) continue;

      const exists = this.checkPathExists(
        normalized,
        'audit-config-invalid-extension',
        'extension file or directory'
      );
      if (!exists) continue;

      const resolved = path.resolve(this.projectRoot, normalized);
      let targetFiles: string[] = [];
      try {
        targetFiles = this.resolveExtensionFiles(resolved);
      } catch (err: unknown) {
        this.addViolation({
          ruleId: 'audit-config-invalid-extension',
          severity: 'error',
          file: AUDIT_CONFIG_FILE,
          line: 1,
          message: `Configuration error in ${AUDIT_CONFIG_FILE}: Failed to inspect extension '${normalized}': ${err instanceof Error ? err.message : String(err)}.`,
          context: normalized
        });
        continue;
      }

      for (const targetFile of targetFiles) {
        await this.verifySingleExtensionFile(targetFile, normalized);
      }
    }
  }
}

export async function enforceCriticalConfigurations(
  projectRoot: string,
  tasks: readonly AuditTaskDefinition[]
): Promise<boolean> {
  try {
    const auditor = new ValidateAuditConfigAuditor({ projectRoot, fix: true });
    const config = await loadAuditConfig(projectRoot);
    await auditor.verifyCriticalConfigurations(config, tasks);
    return true;
  } catch {
    return false;
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateAuditConfigAuditor());

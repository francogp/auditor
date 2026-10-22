/**
 * src/suites/architecture/validate_tsconfig.ts
 *
 * TSCONFIG CONFIGURATION & MANDATORY STRICT BASELINE AUDITOR (Node.js 26+ Native)
 *
 * Enforces strict, uncompromised TypeScript compiler configuration:
 *   1. Guarantees tsconfig.json exists on disk; auto-scaffolds in --fix mode.
 *   2. Guarantees valid JSON syntax without corruption.
 *   3. Enforces the Anti-Castration Mandate: strict: true, noImplicitAny: true,
 *      noUncheckedIndexedAccess: true, and moduleResolution: "bundler" | "node16" | "nodenext".
 *   4. Barred permissive or deprecated options (suppressImplicitAnyIndexErrors, noImplicitThis: false).
 *   5. Guarantees that include covers the primary source directory (src).
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import {
  BaseAuditor,
  type AuditorOptions,
  createUniformRuleCapabilities,
  createUniformRemediationPhases
} from '../../core/auditorBase.ts';
import type { AuditorConfigFileRequirement } from '../../core/auditContract.ts';
import { safeReadFileSync, tryOrNull } from '../../core/safeUtils.ts';

import ts from 'typescript';

enableCompileCache();

export const TSCONFIG_RULES = [
  'tsconfig-missing',
  'tsconfig-syntax',
  'tsconfig-missing-strict-compiler-option',
  'tsconfig-banned-option',
  'tsconfig-missing-source-include'
] as const;

export type TsConfigRuleId = (typeof TSCONFIG_RULES)[number];

export interface TsCompilerOptionsShape {
  target?: string;
  module?: string;
  moduleResolution?: string;
  strict?: boolean;
  noImplicitAny?: boolean;
  noUncheckedIndexedAccess?: boolean;
  verbatimModuleSyntax?: boolean;
  useUnknownInCatchVariables?: boolean;
  noPropertyAccessFromIndexSignature?: boolean;
  exactOptionalPropertyTypes?: boolean;
  isolatedModules?: boolean;
  skipLibCheck?: boolean;
  esModuleInterop?: boolean;
  resolveJsonModule?: boolean;
  suppressImplicitAnyIndexErrors?: boolean;
  noImplicitThis?: boolean;
  [key: string]: unknown;
}

export interface TsConfigShape {
  compilerOptions?: TsCompilerOptionsShape;
  include?: string[];
  exclude?: string[];
  references?: Array<{ path: string }>;
  [key: string]: unknown;
}

export const CANONICAL_TSCONFIG: TsConfigShape = {
  compilerOptions: {
    target: 'ESNext',
    module: 'ESNext',
    moduleResolution: 'bundler',
    strict: true,
    noImplicitAny: true,
    noUncheckedIndexedAccess: true,
    verbatimModuleSyntax: true,
    useUnknownInCatchVariables: true,
    isolatedModules: true,
    skipLibCheck: true,
    esModuleInterop: true,
    resolveJsonModule: true
  },
  include: ['src/**/*', 'tests/**/*'],
  exclude: ['node_modules', 'dist', 'scratch']
};

export const MANDATORY_STRICT_OPTIONS: readonly (keyof TsCompilerOptionsShape)[] = [
  'strict',
  'noImplicitAny',
  'noUncheckedIndexedAccess',
  'verbatimModuleSyntax',
  'useUnknownInCatchVariables'
] as const;

export const VALID_MODULE_RESOLUTIONS = [
  'bundler',
  'node16',
  'nodenext'
] as const;

export const VALID_TARGETS = [
  'es2025',
  'esnext'
] as const;

export const BANNED_COMPILER_OPTIONS = [
  'suppressImplicitAnyIndexErrors'
] as const;

export const TSCONFIG_REQUIREMENT: AuditorConfigFileRequirement<TsConfigRuleId> = {
  id: 'tsconfig-config',
  file: 'tsconfig.json',
  candidateFiles: ['tsconfig.json'],
  description: 'Strict TypeScript compiler configuration',
  ruleId: 'tsconfig-missing',
  generateDefaultContent: () => JSON.stringify(CANONICAL_TSCONFIG, null, 2) + '\n'
};

export class ValidateTsconfigAuditor extends BaseAuditor<TsConfigRuleId> {
  constructor(
    rootsOrOptions?:
      | readonly string[]
      | (Partial<AuditorOptions<TsConfigRuleId>> & {
          projectRoot?: string;
          fix?: boolean;
          configFile?: string;
        }),
    maybeProjectRoot?: string
  ) {
    const optionsObj =
      rootsOrOptions && !Array.isArray(rootsOrOptions)
        ? (rootsOrOptions as Partial<AuditorOptions<TsConfigRuleId>> & {
            projectRoot?: string;
            fix?: boolean;
            configFile?: string;
          })
        : undefined;
    const projectRoot = optionsObj?.projectRoot ?? maybeProjectRoot ?? process.cwd();

    const configRequirement: AuditorConfigFileRequirement<TsConfigRuleId> = {
      ...TSCONFIG_REQUIREMENT,
      ...(optionsObj?.configFile
        ? {
            file: optionsObj.configFile,
            candidateFiles: [optionsObj.configFile]
          }
        : {})
    };

    super({
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleCapabilities: createUniformRuleCapabilities(TSCONFIG_RULES, {
        speed: 'light',
        phase: 'setup',
        fix: 'priority',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      fixableRuleIds: [
        'tsconfig-missing',
        'tsconfig-missing-strict-compiler-option',
        'tsconfig-banned-option',
        'tsconfig-missing-source-include'
      ],
      configFiles: [configRequirement],
      id: 'validate_tsconfig',
      name: 'TypeScript Configuration Validator',
      description: 'Validates tsconfig.json strict baseline',
      icon: '📘',
      family: 'architecture',
      ruleIds: TSCONFIG_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(TSCONFIG_RULES, 'setup'),
      packageName: 'TSConfig',
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
      ruleDescriptions: {
        'tsconfig-missing': 'Missing tsconfig.json file',
        'tsconfig-syntax': 'Syntax error in tsconfig.json',
        'tsconfig-missing-strict-compiler-option': 'Missing strict compiler option',
        'tsconfig-banned-option': 'Banned option in tsconfig',
        'tsconfig-missing-source-include': 'Include does not cover src sources'
      },
      ruleRemediations: {
        'tsconfig-missing':
          '📖 REMEDIATION GUIDE: tsconfig-missing\n' +
          '1. Root Cause: The `tsconfig.json` file is missing from the root of the project.\n' +
          '2. Diagnosis: Check project root for `tsconfig.json`.\n' +
          '3. Canonical Solution: Run `npm run auditor:fix` or `auditor fix` to auto-scaffold the strict canonical TypeScript configuration.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run auditor:fix`',
        'tsconfig-syntax':
          '📖 REMEDIATION GUIDE: tsconfig-syntax\n' +
          '1. Root Cause: `tsconfig.json` contains JSON syntax errors or invalid characters.\n' +
          '2. Diagnosis: Inspect `tsconfig.json`, checking for trailing commas or mismatched quotes.\n' +
          '3. Canonical Solution: Fix JSON syntax errors in `tsconfig.json` or run `npm run fmt`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   Validate syntax with JSON parser or `npm run fmt`.',
        'tsconfig-missing-strict-compiler-option':
          '📖 REMEDIATION GUIDE: tsconfig-missing-strict-compiler-option\n' +
          '1. Root Cause: Mandatory strict options are omitted or downgraded (`strict`, `noImplicitAny`, `noUncheckedIndexedAccess`, `target >= ES2025`).\n' +
          '2. Diagnosis: Check `compilerOptions` in `tsconfig.json` against required strict settings.\n' +
          '3. Canonical Solution: Run `npm run auditor:fix` to re-inject strict compiler defaults, or configure them manually.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run auditor:fix`',
        'tsconfig-banned-option':
          '📖 REMEDIATION GUIDE: tsconfig-banned-option\n' +
          '1. Root Cause: A banned permissive option was detected (e.g., `suppressImplicitAnyIndexErrors`, `noImplicitThis: false`).\n' +
          '2. Diagnosis: Look for permissive overrides in `compilerOptions`.\n' +
          '3. Canonical Solution: Run `npm run auditor:fix` to remove banned options and resolve underlying type errors properly.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run auditor:fix`',
        'tsconfig-missing-source-include':
          '📖 REMEDIATION GUIDE: tsconfig-missing-source-include\n' +
          '1. Root Cause: The `include` array in `tsconfig.json` does not cover primary source directories (`src/**/*`).\n' +
          '2. Diagnosis: Check the `include` glob patterns in `tsconfig.json`.\n' +
          '3. Canonical Solution: Add `"src/**/*"` to `include` in `tsconfig.json` or run `npm run auditor:fix`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run auditor:fix`'
      },
      coverage: {
        include: ['tsconfig*.json']
      },
      projectRoot,
      fix: optionsObj?.fix,
      ...optionsObj
    });
  }

  public override async runAudit(): Promise<void> {
    const isFix = this.isFixActive();
    let configFile: string | null = null;
    this.runSubAuditorSync('tsconfig-missing', () => {
      configFile = this.resolveConfigFile(TSCONFIG_REQUIREMENT);
    });

    if (!configFile) {
      const ensured = await this.runSubAuditor('tsconfig-missing', () =>
        this.ensureConfigFile(TSCONFIG_REQUIREMENT)
      );
      if (!ensured) {
        this.markRuleNotApplicable('tsconfig-syntax', 'Missing tsconfig.json file');
        this.markRuleNotApplicable('tsconfig-missing-strict-compiler-option', 'Missing tsconfig.json file');
        this.markRuleNotApplicable('tsconfig-banned-option', 'Missing tsconfig.json file');
        this.markRuleNotApplicable('tsconfig-missing-source-include', 'Missing tsconfig.json file');
        return;
      }
      configFile = ensured.resolvedPath;
    }

    const resolvedPath = configFile;

    const relPath = path.relative(this.projectRoot, resolvedPath) || TSCONFIG_REQUIREMENT.file;
    this.recordScanned(relPath);

    const extraTsconfigs: string[] = []; // no-domain: Discovered secondary tsconfig.*.json filenames
    const entries = tryOrNull(() => fs.readdirSync(this.projectRoot)) ?? [];
    for (const entry of entries) {
      if (/^tsconfig\..+\.json$/.test(entry)) {
        this.recordScanned(entry);
        extraTsconfigs.push(entry);
      }
    }

    const rawContent = safeReadFileSync(resolvedPath);
    if (!rawContent) {
      this.markRuleNotApplicable('tsconfig-syntax', 'Could not read file');
      this.markRuleNotApplicable('tsconfig-missing-strict-compiler-option', 'Could not read file');
      this.markRuleNotApplicable('tsconfig-banned-option', 'Could not read file');
      this.markRuleNotApplicable('tsconfig-missing-source-include', 'Could not read file');
      return;
    }

    let parsed: TsConfigShape | undefined;
    const extraParsed = new Map<string, TsConfigShape>();
    this.runSubAuditorSync('tsconfig-syntax', () => {
      const parseRes = ts.parseConfigFileTextToJson(relPath, rawContent);
      if (parseRes.error || !parseRes.config || typeof parseRes.config !== 'object') {
        this.addViolation({
          ruleId: 'tsconfig-syntax',
          severity: 'error',
          file: relPath,
          line: 1,
          message: `JSON syntax error in ${relPath}.`
        });
      } else {
        parsed = parseRes.config as TsConfigShape;
      }

      for (const extraFile of extraTsconfigs) {
        const extraFullPath = path.resolve(this.projectRoot, extraFile);
        try {
          const extraRaw = fs.readFileSync(extraFullPath, 'utf8');
          const extraRes = ts.parseConfigFileTextToJson(extraFile, extraRaw);
          if (extraRes.error || !extraRes.config || typeof extraRes.config !== 'object') {
            this.addViolation({
              ruleId: 'tsconfig-syntax',
              severity: 'error',
              file: extraFile,
              line: 1,
              message: `JSON syntax error in ${extraFile}.`
            });
          } else {
            extraParsed.set(extraFile, extraRes.config as TsConfigShape);
          }
        } catch {
          this.addViolation({
            ruleId: 'tsconfig-syntax',
            severity: 'error',
            file: extraFile,
            line: 1,
            message: `JSON syntax error in ${extraFile}.`
          });
        }
      }
    });

    if (!parsed) {
      this.markRuleNotApplicable('tsconfig-missing-strict-compiler-option', 'Invalid JSON syntax');
      this.markRuleNotApplicable('tsconfig-banned-option', 'Invalid JSON syntax');
      this.markRuleNotApplicable('tsconfig-missing-source-include', 'Invalid JSON syntax');
      return;
    }

    let modified = false;
    const parsedConfig = parsed;
    const compilerOptions = parsedConfig.compilerOptions ?? {};

    // 1. Check mandatory strict options
    this.runSubAuditorSync('tsconfig-missing-strict-compiler-option', () => {
      for (const opt of MANDATORY_STRICT_OPTIONS) {
        if (compilerOptions[opt] !== true) {
          if (isFix) {
            compilerOptions[opt] = true;
            modified = true;
          } else {
            this.addViolation({
              ruleId: 'tsconfig-missing-strict-compiler-option',
              severity: 'error',
              file: relPath,
              line: 1,
              message: `compilerOptions.${opt} must be true according to the strict baseline.`
            });
          }
        }
      }

      // Check moduleResolution
      const modRes = compilerOptions.moduleResolution
        ? String(compilerOptions.moduleResolution).toLowerCase()
        : '';
      const isVitePlusProject =
        fs.existsSync(path.resolve(this.projectRoot, 'vite.config.ts')) ||
        fs.existsSync(path.resolve(this.projectRoot, '.auditor/audit.config.ts'));

      if (isVitePlusProject && modRes !== 'bundler') {
        if (isFix) {
          compilerOptions.moduleResolution = 'bundler';
          compilerOptions.allowImportingTsExtensions = true;
          compilerOptions.noEmit = true;
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'tsconfig-missing-strict-compiler-option',
            severity: 'error',
            file: relPath,
            line: 1,
            message: `compilerOptions.moduleResolution must be "bundler" in Vite+ projects to allow direct TypeScript imports (.ts).`
          });
        }
      } else if (!VALID_MODULE_RESOLUTIONS.some((v) => v === modRes)) {
        if (isFix) {
          compilerOptions.moduleResolution = 'bundler';
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'tsconfig-missing-strict-compiler-option',
            severity: 'error',
            file: relPath,
            line: 1,
            message: `compilerOptions.moduleResolution must be "bundler", "node16", or "nodenext".`
          });
        }
      }

      // Check target (minimum ES2025 / ESNext standard for Node.js 26+)
      const targetOpt = compilerOptions.target
        ? String(compilerOptions.target).toLowerCase()
        : '';
      if (!VALID_TARGETS.some((v) => v === targetOpt)) {
        if (isFix) {
          compilerOptions.target = 'ES2025';
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'tsconfig-missing-strict-compiler-option',
            severity: 'error',
            file: relPath,
            line: 1,
            message: `compilerOptions.target must be "ES2025" or "ESNext" according to the Node 26+ strict baseline.`
          });
        }
      }
    });

    // 2. Check banned options
    this.runSubAuditorSync('tsconfig-banned-option', () => {
      for (const banned of BANNED_COMPILER_OPTIONS) {
        if (compilerOptions[banned] !== undefined) {
          if (isFix) {
            delete compilerOptions[banned];
            modified = true;
          } else {
            this.addViolation({
              ruleId: 'tsconfig-banned-option',
              severity: 'error',
              file: relPath,
              line: 1,
              message: `compilerOptions.${banned} is prohibited by repository quality standards.`
            });
          }
        }
      }

      if (compilerOptions.noImplicitThis === false) {
        if (isFix) {
          delete compilerOptions.noImplicitThis;
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'tsconfig-banned-option',
            severity: 'error',
            file: relPath,
            line: 1,
            message:
              'compilerOptions.noImplicitThis: false is prohibited. Must be true or removed.'
          });
        }
      }

      for (const [extraFile, extraCfg] of extraParsed.entries()) {
        const extraOpts = extraCfg.compilerOptions ?? {};
        let extraModified = false;
        for (const banned of BANNED_COMPILER_OPTIONS) {
          if (extraOpts[banned] !== undefined) {
            if (isFix) {
              delete extraOpts[banned];
              extraModified = true;
            } else {
              this.addViolation({
                ruleId: 'tsconfig-banned-option',
                severity: 'error',
                file: extraFile,
                line: 1,
                message: `compilerOptions.${banned} is prohibited by repository quality standards.`
              });
            }
          }
        }
        if (isFix && extraModified) {
          extraCfg.compilerOptions = extraOpts;
          fs.writeFileSync(
            path.resolve(this.projectRoot, extraFile),
            JSON.stringify(extraCfg, null, 2) + '\n',
            'utf8'
          );
        }
      }
    });

    // 3. Check include covers src
    this.runSubAuditorSync('tsconfig-missing-source-include', () => {
      if (parsedConfig.include && Array.isArray(parsedConfig.include)) {
        const hasSrc = parsedConfig.include.some(
          (p) =>
            p === 'src' ||
            p.startsWith('src/') ||
            p === './src' ||
            p.startsWith('./src/')
        );
        if (!hasSrc) {
          if (isFix) {
            parsedConfig.include.unshift('src/**/*');
            modified = true;
          } else {
            this.addViolation({
              ruleId: 'tsconfig-missing-source-include',
              severity: 'error',
              file: relPath,
              line: 1,
              message: 'The include array in tsconfig.json must cover the src/ directory.'
            });
          }
        }

        if (isFix) {
          const deadLegacyConfigs = [
            'vitest.config.ts',
            'vitest.config.js',
            'vitest.config.mjs'
          ] as const;
          const filtered = parsedConfig.include.filter(
            (p) =>
              !deadLegacyConfigs.some((f) => f === p) ||
              fs.existsSync(path.resolve(this.projectRoot, p))
          );
          if (filtered.length !== parsedConfig.include.length) {
            parsedConfig.include = filtered;
            modified = true;
          }
        }
      } else if (parsedConfig.include !== undefined) {
        if (isFix) {
          parsedConfig.include = ['src/**/*', 'tests/**/*'];
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'tsconfig-missing-source-include',
            severity: 'error',
            file: relPath,
            line: 1,
            message: 'The include property must be an array of glob patterns.'
          });
        }
      }
    });

    if (isFix && modified) {
      parsedConfig.compilerOptions = compilerOptions;
      fs.writeFileSync(resolvedPath, JSON.stringify(parsedConfig, null, 2) + '\n', 'utf8');
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateTsconfigAuditor());

/**
 * src/suites/architecture/validate_npmrc_config.ts
 *
 * NPMRC CONFIGURATION & REPRODUCIBILITY BASELINE AUDITOR (Node.js 26+ Native)
 *
 * Enforces standardized npm package manager runtime configuration across .npmrc:
 *   1. Guarantees .npmrc exists on disk; auto-scaffolds in --fix mode.
 *   2. Guarantees mandatory reproducibility directives:
 *      - engine-strict=true (enforces package.json engines)
 *      - package-lock=true (ensures deterministic tree resolution)
 *   3. Preserves existing private tokens, custom registries, and comments without destruction.
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

enableCompileCache();

export const NPMRC_CONFIG_RULES = [
  'npmrc-config-missing',
  'npmrc-config-missing-setting'
] as const;

export type NpmrcConfigRuleId = (typeof NPMRC_CONFIG_RULES)[number];

export const CANONICAL_NPMRC_LINES = [
  '# Estandares de reproducibilidad de paquetes (francogp/auditor)',
  'engine-strict=true',
  'package-lock=true',
  ''
] as const;

export const CANONICAL_NPMRC_CONTENT = CANONICAL_NPMRC_LINES.join('\n');

export const MANDATORY_NPMRC_SETTINGS: readonly { key: string; expected: string }[] = [
  { key: 'engine-strict', expected: 'true' },
  { key: 'package-lock', expected: 'true' }
] as const;

export const NPMRC_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<NpmrcConfigRuleId> = {
  id: 'npmrc-config',
  file: '.npmrc',
  candidateFiles: ['.npmrc'],
  description: 'Reproducibility and engine configuration for npm (.npmrc)',
  ruleId: 'npmrc-config-missing',
  generateDefaultContent: () => CANONICAL_NPMRC_CONTENT
};

export class ValidateNpmrcConfigAuditor extends BaseAuditor<NpmrcConfigRuleId> {
  constructor(
    rootsOrOptions?:
      | readonly string[]
      | (Partial<AuditorOptions<NpmrcConfigRuleId>> & {
          projectRoot?: string;
          fix?: boolean;
          configFile?: string;
        }),
    maybeProjectRoot?: string
  ) {
    const optionsObj =
      rootsOrOptions && !Array.isArray(rootsOrOptions)
        ? (rootsOrOptions as Partial<AuditorOptions<NpmrcConfigRuleId>> & {
            projectRoot?: string;
            fix?: boolean;
            configFile?: string;
          })
        : undefined;
    const projectRoot = optionsObj?.projectRoot ?? maybeProjectRoot ?? process.cwd();

    const configRequirement: AuditorConfigFileRequirement<NpmrcConfigRuleId> = {
      ...NPMRC_CONFIG_REQUIREMENT,
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
      ruleCapabilities: createUniformRuleCapabilities(NPMRC_CONFIG_RULES, {
        speed: 'light',
        phase: 'setup',
        fix: 'priority',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      fixableRuleIds: [
        'npmrc-config-missing',
        'npmrc-config-missing-setting'
      ],
      configFiles: [configRequirement],
      id: 'validate_npmrc_config',
      name: 'NPMRC Configuration Validator',
      description: 'Validates reproducibility directives in .npmrc',
      icon: '📦',
      family: 'architecture',
      ruleIds: NPMRC_CONFIG_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(NPMRC_CONFIG_RULES, 'setup'),
      packageName: 'NPMRC',
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
      ruleDescriptions: {
        'npmrc-config-missing': 'Missing .npmrc file',
        'npmrc-config-missing-setting': 'Missing mandatory directive'
      },
      ruleRemediations: {
        'npmrc-config-missing':
          '📖 REMEDIATION GUIDE: npmrc-config-missing\n' +
          '1. Root Cause: The `.npmrc` file does not exist in the project root.\n' +
          '2. Diagnosis: Check project root for `.npmrc`.\n' +
          '3. Canonical Solution: Run `npm run auditor:fix` or `auditor fix` to auto-scaffold canonical reproducibility directives.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run auditor:fix`',
        'npmrc-config-missing-setting':
          '📖 REMEDIATION GUIDE: npmrc-config-missing-setting\n' +
          '1. Root Cause: Critical directives are missing from `.npmrc` (engine-strict=true, package-lock=true).\n' +
          '2. Diagnosis: Inspect existing `.npmrc` directives against mandatory settings.\n' +
          '3. Canonical Solution: Run `npm run auditor:fix` or `auditor fix` to append or correct directives while preserving registries and tokens.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run auditor:fix`'
      },
      coverage: {
        include: ['.npmrc']
      },
      projectRoot,
      fix: optionsObj?.fix,
      ...optionsObj
    });
  }

  public override async runAudit(): Promise<void> {
    const isFix = this.isFixActive();
    let configFile: string | null = null;
    this.runSubAuditorSync('npmrc-config-missing', () => {
      configFile = this.resolveConfigFile(NPMRC_CONFIG_REQUIREMENT);
    });

    if (!configFile) {
      const ensured = await this.runSubAuditor('npmrc-config-missing', () =>
        this.ensureConfigFile(NPMRC_CONFIG_REQUIREMENT)
      );
      if (!ensured) {
        this.markRuleNotApplicable('npmrc-config-missing-setting', 'Missing .npmrc file');
        return;
      }
      configFile = ensured.resolvedPath;
    }

    const resolvedPath = configFile;

    const relPath =
      path.relative(this.projectRoot, resolvedPath) || NPMRC_CONFIG_REQUIREMENT.file;
    this.recordScanned(relPath);
    let rawContent: string;
    try {
      rawContent = fs.readFileSync(resolvedPath, 'utf8');
    } catch {
      this.runSubAuditorSync('npmrc-config-missing', () => {
        this.addViolation({
          ruleId: 'npmrc-config-missing',
          severity: 'error',
          file: relPath,
          line: 1,
          message: `No se pudo leer ${relPath}.`
        });
      });
      return;
    }

    const lines = rawContent.split(/\r?\n/);
    const parsedSettings = new Map<string, { value: string; lineIndex: number }>();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trim() ?? '';
      if (!line || line.startsWith('#') || line.startsWith(';')) continue;
      const eqIdx = line.indexOf('=');
      if (eqIdx > 0) {
        const key = line.slice(0, eqIdx).trim();
        const value = line.slice(eqIdx + 1).trim();
        parsedSettings.set(key, { value, lineIndex: i });
      }
    }

    let modified = false;

    this.runSubAuditorSync('npmrc-config-missing-setting', () => {
      for (const req of MANDATORY_NPMRC_SETTINGS) {
        const found = parsedSettings.get(req.key);
        if (!found || found.value !== req.expected) {
          if (isFix) {
            if (found !== undefined) {
              lines[found.lineIndex] = `${req.key}=${req.expected}`;
            } else {
              lines.push(`${req.key}=${req.expected}`);
            }
            modified = true;
          } else {
            this.addViolation({
              ruleId: 'npmrc-config-missing-setting',
              severity: 'error',
              file: relPath,
              line: found ? found.lineIndex + 1 : 1,
              message: `Directive "${req.key}=${req.expected}" is required in .npmrc.`
            });
          }
        }
      }
    });

    if (isFix && modified) {
      const output = lines.join('\n').trimEnd() + '\n';
      fs.writeFileSync(resolvedPath, output, 'utf8');
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateNpmrcConfigAuditor());

/**
 * src/suites/documentation/validate_markdown_lint_config.ts
 *
 * MARKDOWNLINT CONFIGURATION & MANDATORY BASELINE AUDITOR (Node.js 26+ Native)
 *
 * Enforces standardized documentation hygiene rules across .markdownlint.json:
 *   1. Guarantees .markdownlint.json exists on disk; auto-scaffolds in --fix mode.
 *   2. Guarantees valid JSON syntax without corruption.
 *   3. Enforces standard documentation baseline:
 *      - default: true
 *      - MD033 allowed_elements: ["br"]
 *      - MD024 siblings_only: true
 *      - MD007 indent: 2
 *      - MD013: false (no hard line length wrapping)
 */

import fs from 'node:fs';
import { enableCompileCache } from 'node:module';
import path from 'node:path';

import type { AuditorConfigFileRequirement } from '../../core/auditContract.ts';
import {
  BaseAuditor,
  createUniformRuleCapabilities,
  createUniformRemediationPhases
} from '../../core/auditorBase.ts';

enableCompileCache();

export const MARKDOWNLINT_CONFIG_RULES = [
  'markdownlint-config-missing',
  'markdownlint-config-syntax',
  'markdownlint-config-missing-strict-rule'
] as const;

export type MarkdownLintConfigRuleId = (typeof MARKDOWNLINT_CONFIG_RULES)[number];

export interface MarkdownLintConfigShape {
  default?: boolean;
  MD013?: boolean;
  MD060?: boolean;
  MD033?: boolean | { allowed_elements?: string[] };
  MD024?: boolean | { siblings_only?: boolean };
  MD007?: boolean | { indent?: number };
  [key: string]: unknown;
}

export const CANONICAL_MARKDOWNLINT_CONFIG: MarkdownLintConfigShape = {
  default: true,
  MD013: false,
  MD060: false,
  MD033: {
    allowed_elements: ['br']
  },
  MD024: {
    siblings_only: true
  },
  MD007: {
    indent: 2
  }
};

export const MARKDOWNLINT_CONFIG_REQUIREMENT: AuditorConfigFileRequirement<MarkdownLintConfigRuleId> =
  {
    id: 'markdownlint-config',
    file: '.markdownlint.json',
    candidateFiles: ['.markdownlint.json', '.markdownlint-cli2.jsonc'],
    description: 'Standard markdownlint configuration for documentation',
    ruleId: 'markdownlint-config-missing',
    generateDefaultContent: () => JSON.stringify(CANONICAL_MARKDOWNLINT_CONFIG, null, 2) + '\n'
  };

export interface MarkdownLintConfigAuditorOptions {
  readonly projectRoot?: string;
  readonly configFile?: string;
}

export class ValidateMarkdownLintConfigAuditor extends BaseAuditor<MarkdownLintConfigRuleId> {
  public constructor(options: MarkdownLintConfigAuditorOptions = {}) {
    const projectRoot = options.projectRoot ?? process.cwd();

    const configRequirement: AuditorConfigFileRequirement<MarkdownLintConfigRuleId> = {
      ...MARKDOWNLINT_CONFIG_REQUIREMENT,
      ...(options.configFile
        ? {
            file: options.configFile,
            candidateFiles: [options.configFile]
          }
        : {})
    };

    super({
      ruleFixers: {},
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleCapabilities: createUniformRuleCapabilities(MARKDOWNLINT_CONFIG_RULES, {
        speed: 'light',
        phase: 'setup',
        md: true,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      configFiles: [configRequirement],
      id: 'validate_markdown_lint_config',
      name: 'Markdownlint Configuration Validator',
      description: 'Validates markdownlint configuration baseline',
      icon: '📝',
      family: 'documentation',
      ruleIds: MARKDOWNLINT_CONFIG_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(MARKDOWNLINT_CONFIG_RULES, 'setup'),
      packageName: 'Markdown',
      configKey: 'documentation',
      defaultConfig: {
        enabled: true
      },
      criticalConfig: {},
      ruleDescriptions: {
        'markdownlint-config-missing': 'Missing .markdownlint.json file',
        'markdownlint-config-syntax': 'Configuration syntax error',
        'markdownlint-config-missing-strict-rule': 'Missing mandatory strict rule'
      },
      ruleRemediations: {
        'markdownlint-config-missing':
          '📖 REMEDIATION GUIDE: markdownlint-config-missing\n' +
          '1. Root Cause: Canonical configuration file `.markdownlint.json` does not exist in repository root.\n' +
          '2. Diagnosis: Check whether `.markdownlint.json` exists in project root.\n' +
          '3. Canonical Solution: Run `npm run auditor:fix` to auto-scaffold canonical configuration with the strict baseline.\n' +
          '4. Example / Auto-fix command:\n' +
          '   - Run: `npm run auditor:fix` or `auditor fix`',
        'markdownlint-config-syntax':
          '📖 REMEDIATION GUIDE: markdownlint-config-syntax\n' +
          '1. Root Cause: File `.markdownlint.json` contains JSON syntax errors (trailing commas, unclosed quotes, or corrupt format).\n' +
          '2. Diagnosis: Open `.markdownlint.json` and validate syntax with a JSON parser.\n' +
          '3. Canonical Solution: Correct trailing commas or missing quotes in `.markdownlint.json`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   - Run: `npm run auditor:fix` or format `.markdownlint.json` with `vp run oxfmt`',
        'markdownlint-config-missing-strict-rule':
          '📖 REMEDIATION GUIDE: markdownlint-config-missing-strict-rule\n' +
          '1. Root Cause: Missing mandatory strict baseline rules (MD033 with allowed_elements: ["br"], MD024 with siblings_only: true, etc.) in `.markdownlint.json`.\n' +
          '2. Diagnosis: Compare `.markdownlint.json` against required rules from framework documentation standards.\n' +
          '3. Canonical Solution: Restore strict baseline rules by running auditor mechanical auto-repair.\n' +
          '4. Example / Auto-fix command:\n' +
          '   - Run: `npm run auditor:fix` or `auditor fix`'
      },
      coverage: {
        include: [
          '.markdownlint.json',
          '.markdownlint.yaml',
          '.markdownlint.yml',
          '.markdownlint-cli2.jsonc'
        ]
      },
      projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    const isFix = this.isFixActive();
    let configFile: string | null = null;
    this.runSubAuditorSync('markdownlint-config-missing', () => {
      configFile = this.resolveConfigFile(MARKDOWNLINT_CONFIG_REQUIREMENT);
    });

    if (!configFile) {
      const ensured = await this.runSubAuditor('markdownlint-config-missing', () =>
        this.ensureConfigFile(MARKDOWNLINT_CONFIG_REQUIREMENT)
      );
      if (!ensured) {
        this.markRuleNotApplicable('markdownlint-config-syntax', 'Missing .markdownlint.json file');
        this.markRuleNotApplicable(
          'markdownlint-config-missing-strict-rule',
          'Missing .markdownlint.json file'
        );
        return;
      }
      configFile = ensured.resolvedPath;
    }

    const resolvedPath = configFile;

    const relPath =
      path.relative(this.projectRoot, resolvedPath) || MARKDOWNLINT_CONFIG_REQUIREMENT.file;
    this.recordScanned(relPath);
    let rawContent: string;
    try {
      rawContent = fs.readFileSync(resolvedPath, 'utf8');
    } catch {
      this.markRuleNotApplicable('markdownlint-config-syntax', 'No se pudo leer el archivo');
      this.markRuleNotApplicable(
        'markdownlint-config-missing-strict-rule',
        'No se pudo leer el archivo'
      );
      return;
    }

    let parsed: MarkdownLintConfigShape | undefined;
    this.runSubAuditorSync('markdownlint-config-syntax', () => {
      try {
        parsed = JSON.parse(rawContent) as MarkdownLintConfigShape;
      } catch {
        this.addViolation({
          ruleId: 'markdownlint-config-syntax',
          severity: 'error',
          file: relPath,
          line: 1,
          message: `JSON syntax error in ${relPath}.`
        });
      }
    });

    if (!parsed || typeof parsed !== 'object') {
      this.markRuleNotApplicable('markdownlint-config-missing-strict-rule', 'Invalid JSON syntax');
      return;
    }

    let modified = false;
    const parsedConfig = parsed;

    // Check mandatory strict baseline rules
    this.runSubAuditorSync('markdownlint-config-missing-strict-rule', () => {
      if (parsedConfig.default !== true) {
        if (isFix) {
          parsedConfig.default = true;
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'markdownlint-config-missing-strict-rule',
            severity: 'error',
            file: relPath,
            line: 1,
            message: 'Configuration must define "default": true.'
          });
        }
      }

      // Check MD033 (allowed_elements should include "br")
      const md033 = parsedConfig.MD033;
      const isMd033Ok =
        typeof md033 === 'object' &&
        md033 !== null &&
        Array.isArray(md033.allowed_elements) &&
        md033.allowed_elements.includes('br');

      if (!isMd033Ok && md033 !== false) {
        if (isFix) {
          parsedConfig.MD033 = { allowed_elements: ['br'] };
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'markdownlint-config-missing-strict-rule',
            severity: 'error',
            file: relPath,
            line: 1,
            message: 'MD033 must allow <br> via allowed_elements: ["br"].'
          });
        }
      }

      // Check MD024 (siblings_only: true)
      const md024 = parsedConfig.MD024;
      const isMd024Ok = typeof md024 === 'object' && md024 !== null && md024.siblings_only === true;

      if (!isMd024Ok && md024 !== false) {
        if (isFix) {
          parsedConfig.MD024 = { siblings_only: true };
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'markdownlint-config-missing-strict-rule',
            severity: 'error',
            file: relPath,
            line: 1,
            message:
              'MD024 must configure siblings_only: true to allow duplicate headings across different sections.'
          });
        }
      }

      // Check MD007 (indent: 2)
      const md007 = parsedConfig.MD007;
      const isMd007Ok = typeof md007 === 'object' && md007 !== null && md007.indent === 2;

      if (!isMd007Ok && md007 !== false) {
        if (isFix) {
          parsedConfig.MD007 = { indent: 2 };
          modified = true;
        } else {
          this.addViolation({
            ruleId: 'markdownlint-config-missing-strict-rule',
            severity: 'error',
            file: relPath,
            line: 1,
            message: 'MD007 must configure indent: 2 according to markdown style standards.'
          });
        }
      }
    });

    if (isFix && modified) {
      fs.writeFileSync(resolvedPath, JSON.stringify(parsedConfig, null, 2) + '\n', 'utf8');
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateMarkdownLintConfigAuditor());

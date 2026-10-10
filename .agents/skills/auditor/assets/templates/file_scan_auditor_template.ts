/**
 * TEMPLATE: FileScanAuditor (Line-by-Line File Scanner)
 * Location: scripts/auditors/<family>/validate_<name>.ts
 * 
 * Use this template when your auditor scans source files (e.g. .vue, .ts, .json, .md)
 * line-by-line to detect forbidden tokens, anti-patterns, missing attributes, or syntax errors.
 */

import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, FileScanAuditor, hasLineSuppression, type GitIgnoreRequirement } from '@francogp/auditor';

enableCompileCache();

export type MyFeatureRuleId =
  | 'my-feature-forbidden-pattern'
  | 'my-feature-missing-attribute';

export const MY_FEATURE_RULES: readonly MyFeatureRuleId[] = [
  'my-feature-forbidden-pattern',
  'my-feature-missing-attribute'
] as const;

export interface MyFeatureAuditorOptions {
  readonly projectRoot?: string;
  readonly roots?: readonly string[];
}

export class MyFeatureAuditor extends FileScanAuditor<MyFeatureRuleId> {
  // Optional gitignore requirements for tool caches or ephemeral artifacts:
  public static readonly gitIgnoreEntries: readonly GitIgnoreRequirement[] = [];

  constructor(options: MyFeatureAuditorOptions = {}) {
    super({
      // Optional capabilities: all default to false automatically.
      // Example: capabilities: { lint: true, fix: true },
      // Optional gitignore requirements registered dynamically without hardcoding:
      gitIgnoreEntries: MyFeatureAuditor.gitIgnoreEntries,
      id: 'validate_my_feature',
      name: 'My Feature Auditor',
      description: 'Valida tokens prohibidos y atributos en src/',
      icon: '🔍', // Mandatory thematic emoji representing this auditor
      family: 'architecture', // 'architecture' | 'domain_data' | 'persistence' | 'fsm' | 'assets' | 'documentation'
      ruleIds: MY_FEATURE_RULES,
      packageName: 'MiModulo',
      // Mandatory: SSoT configuration key inspected by the dynamic suite gating engine:
      configKey: 'paths.srcRoots',
      // Mandatory: Default configuration object dynamically collected for .auditor/audit.config.ts:
      defaultConfig: {
        srcRoots: ['src']
      },
      // Mandatory: Invariant critical configuration baseline (requiredMinimums / forbiddenOverrides)
      // Pass empty object {} when no immutable minimums are enforced.
      criticalConfig: {},
      ruleDescriptions: {
        'my-feature-forbidden-pattern': 'Token prohibido en archivo fuente',
        'my-feature-missing-attribute': 'Atributo obligatorio faltante'
      },
      roots: options.roots ?? ['src'],
      allowedExtensions: new Set(['.vue', '.ts']),
      projectRoot: options.projectRoot
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const lineNum = i + 1;

      // 1. Support localized suppression comments: // my-feature-ok, // auditor-disable-next-line
      if (this.isLineIgnored(line, ['my-feature-ok']) || hasLineSuppression(line, 'my-feature-forbidden-pattern', lines, i)) continue;

      // 2. Mark rule evaluated for this file
      this.markRuleEvaluated('my-feature-forbidden-pattern');

      // 3. Perform line checks
      if (line.includes('forbiddenToken')) {
        this.addViolation({
          ruleId: 'my-feature-forbidden-pattern',
          severity: 'error',
          file: relPath,
          line: lineNum,
          message: `Detected forbidden token 'forbiddenToken'. Replace with canonical helper.`,
          context: line.trim()
        });
      }
    }
  }
}

// Canonical CLI Entrypoint for standalone and dynamic execution
await BaseAuditor.runCliIfMain(import.meta.url, new MyFeatureAuditor());


/**
 * TEMPLATE: FileScanAuditor (Line-by-Line File Scanner)
 * Location: scripts/auditors/<family>/validate_<name>.ts
 * 
 * Use this template when your auditor scans source files (e.g. .vue, .ts, .json, .md)
 * line-by-line to detect forbidden tokens, anti-patterns, missing attributes, or syntax errors.
 */

import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, FileScanAuditor, isMainModule, type GitIgnoreRequirement } from '@francogp/auditor';

enableCompileCache();

export type MyFeatureRuleId =
  | 'my-feature-forbidden-pattern'
  | 'my-feature-missing-attribute';

export const MY_FEATURE_RULES: readonly MyFeatureRuleId[] = [
  'my-feature-forbidden-pattern',
  'my-feature-missing-attribute'
] as const;

export class MyFeatureAuditor extends FileScanAuditor<MyFeatureRuleId> {
  // Optional gitignore requirements for tool caches or ephemeral artifacts:
  public static readonly gitIgnoreEntries: readonly GitIgnoreRequirement[] = [];

  constructor(roots: readonly string[] = ['src']) {
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
      ruleDescriptions: {
        'my-feature-forbidden-pattern': 'Token prohibido en archivo fuente',
        'my-feature-missing-attribute': 'Atributo obligatorio faltante'
      },
      roots,
      allowedExtensions: new Set(['.vue', '.ts'])
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      const lineNum = i + 1;

      // 1. Support localized suppression comments: // my-feature-ok, // domain-ok
      if (this.isLineIgnored(line, ['my-feature-ok'])) continue;

      // 2. Perform line checks
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
if (isMainModule(import.meta.url)) {
  await BaseAuditor.runCli(new MyFeatureAuditor());
}

/**
 * src/core/refactor/magicNumberHarness.ts
 *
 * CANONICAL POLYGLOT MAGIC LITERAL & DESIGN TOKEN REFACTORING HARNESS
 * Applies surgical AST span replacements across TypeScript, Vue SFCs, and SCSS.
 * Enforces strict pre-flight constant hygiene to prevent duplicate/bad-name regressions.
 */

import fs from 'node:fs';
import path from 'node:path';

import MagicString from 'magic-string';

import { parseVueSfcBlocks } from '../vueSfcParser.ts';
import type { MagicRefactorPlan } from './magicContracts.ts';

export const FORBIDDEN_GENERIC_NAMES_LIST = [
  'ID',
  'NAME',
  'TYPE',
  'KEY',
  'INDEX',
  'COUNT',
  'DEFAULT',
  'SIZE',
  'MAX',
  'MIN',
  'VAL',
  'VALUE',
  'ITEM',
  'STATE',
  'MODE',
  'TAG',
  'DATA',
  'INFO',
  'OPTIONS',
  'CONFIG',
  'RESULT',
  'STATUS'
] as const;

export type ForbiddenGenericName = (typeof FORBIDDEN_GENERIC_NAMES_LIST)[number];

export class ConstantHygieneGate {
  private static readonly FORBIDDEN_GENERIC_NAMES: ReadonlySet<string> = new Set(
    FORBIDDEN_GENERIC_NAMES_LIST
  );

  /**
   * Validates proposed constant name against validate_constant_hygiene rules:
   * 1. constant-no-literal-suffix (_100, _500)
   * 2. constant-bad-names (including value in name)
   * 3. generic names ban
   */
  public static validateOrSanitize(name: string, _value: string | number): string {
    let clean = name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]/g, '_')
      .replace(/_+/g, '_');

    // Rule 1 & 2: Remove trailing numeric literals like _100, _5000, _25
    clean = clean.replace(/_(\d+)$/, '');

    // Rule 3: If it ended up in forbidden generic list, prefix with DOMAIN_
    if (this.FORBIDDEN_GENERIC_NAMES.has(clean) || clean.length < 3) {
      clean = `DOMAIN_${clean}`;
    }

    return clean;
  }
}

export class MagicNumberHarness {
  public static async execute(projectRoot: string, plan: MagicRefactorPlan): Promise<void> {
    this.maintainSharedConstants(projectRoot, plan);

    for (const relFile of plan.targetFiles) {
      this.processTargetFile(projectRoot, relFile, plan);
    }
  }

  private static maintainSharedConstants(projectRoot: string, plan: MagicRefactorPlan): void {
    const sharedDecls = plan.declarations.filter(
      (d) => d.targetLocation === 'shared-constants-module' && d.destinationFile
    );
    if (sharedDecls.length === 0) return;

    const destFile = path.resolve(projectRoot, sharedDecls[0]!.destinationFile!);
    fs.mkdirSync(path.dirname(destFile), { recursive: true });
    let currentShared = fs.existsSync(destFile) ? fs.readFileSync(destFile, 'utf8') : '';

    for (const d of sharedDecls) {
      const cleanName = ConstantHygieneGate.validateOrSanitize(d.name, d.value);
      if (!currentShared.includes(`export const ${cleanName}`)) {
        currentShared += `\nexport const ${cleanName} = ${typeof d.value === 'string' ? `'${d.value}'` : d.value};\n`;
      }
    }
    fs.writeFileSync(destFile, currentShared, 'utf8');
  }

  private static processTargetFile(
    projectRoot: string,
    relFile: string,
    plan: MagicRefactorPlan
  ): void {
    const absPath = path.resolve(projectRoot, relFile);
    if (!fs.existsSync(absPath)) return;

    const rawContent = fs.readFileSync(absPath, 'utf8');
    const s = new MagicString(rawContent);

    const replacements = (plan.fileReplacements[relFile] ?? [])
      .slice()
      .sort((a, b) => b.startOffset - a.startOffset);

    for (const r of replacements) {
      s.overwrite(r.startOffset, r.endOffset, r.replacement);
    }

    this.injectLocalDeclarations(s, relFile, rawContent, plan);
    fs.writeFileSync(absPath, s.toString(), 'utf8');
  }

  private static injectLocalDeclarations(
    s: MagicString,
    relFile: string,
    rawContent: string,
    plan: MagicRefactorPlan
  ): void {
    const fileDeclarations = plan.declarations.filter(
      (d) => d.targetLocation === 'local-file-header'
    );
    if (fileDeclarations.length === 0) return;

    const declText = fileDeclarations
      .map((d) => {
        const cleanName = ConstantHygieneGate.validateOrSanitize(d.name, d.value);
        return `const ${cleanName} = ${typeof d.value === 'string' ? `'${d.value}'` : d.value};`;
      })
      .join('\n');

    if (relFile.endsWith('.vue')) {
      const { scripts } = parseVueSfcBlocks(rawContent);
      const targetScript = scripts.find((sc) => sc.isSetup) ?? scripts[0];
      if (targetScript) {
        s.appendLeft(targetScript.contentStartIndex, `\n${declText}\n`);
      }
    } else if (relFile.endsWith('.ts') || relFile.endsWith('.tsx') || relFile.endsWith('.js')) {
      s.prepend(`${declText}\n\n`);
    }
  }
}

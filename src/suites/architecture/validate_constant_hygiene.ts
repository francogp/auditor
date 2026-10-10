/**
 * src/suites/architecture/validate_constant_hygiene.ts
 *
 * UNIFIED CONSTANT HYGIENE & DUPLICATION AUDITOR (Node.js 26+ Native)
 *
 * Enforces unified constant declaration architecture and magic number governance:
 *   1. Cross-module duplicate constant detection (identical or divergent values via AST).
 *   2. Strict prohibition of inline magic numbers outside designated data/config roots.
 *   3. Naming convention enforcement: prohibition of value suffixes in constant names.
 *   4. Prohibition of redundant 1:1 constant aliases (const A = B / export const A = B).
 *   5. Prohibition of raw numeric literals in constant suffixes (_100, _600).
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* src/suites/architecture/validate_constant_hygiene.ts
 */

import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { FileScanAuditor } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { detectDuplicateConstants } from '../../analyzers/constantAnalyzer.ts';
import {
  badConstantNames,
  noAliasConstants,
  noLiteralSuffixInConstantName
} from '../../analyzers/constantRules.ts';
import { type SharedAstContext } from '../../core/astContext.ts';
import { normalizePosixPath, toPosixRelative } from '../../core/safePath.ts';
import { isTestPath } from '../../core/auditTestPredicates.ts';
import { parseVueSfcBlocks } from '../../core/vueSfcParser.ts';

enableCompileCache();

export const CONSTANT_HYGIENE_RULES = [
  'duplicate-constant-identical',
  'duplicate-constant-divergent',
  'constant-bad-names',
  'constant-no-alias',
  'constant-no-literal-suffix'
] as const;
export type ConstantHygieneRuleId = (typeof CONSTANT_HYGIENE_RULES)[number];

const P_EXPORT_REDUNDANT_ALIAS = /^\s*export\s+const\s+([A-Z_a-z]\w*)\s*=\s*([A-Z_a-z]\w*)\s*;/gm;

export class ValidateConstantHygieneAuditor extends FileScanAuditor<ConstantHygieneRuleId> {
  private readonly scannedAbsFiles: string[] = [];

  constructor(rootsOrOptions?: readonly string[] | { projectRoot?: string; roots?: readonly string[] }, maybeProjectRoot?: string) {
    const optionsObj = rootsOrOptions && !Array.isArray(rootsOrOptions)
      ? (rootsOrOptions as { projectRoot?: string; roots?: readonly string[] })
      : undefined;
    const effectiveProjectRoot = optionsObj?.projectRoot ?? maybeProjectRoot ?? process.cwd();
    const config = getAuditConfig(effectiveProjectRoot);
    const rawRoots = optionsObj?.roots ?? (Array.isArray(rootsOrOptions) ? rootsOrOptions : (config.paths.srcRoots ?? ['src']));
    const effectiveRoots = rawRoots.map(r => toPosixRelative(effectiveProjectRoot, r));

    super({
      capabilities: {
        fix: false,
        fixPriority: false,
        lint: false,
        md: false,
        ast: true,
        changedSince: false,
        heavy: false,
        requiresBuild: false,
        postRun: false
      },
      id: 'validate_constant_hygiene',
      name: 'Constant Hygiene & Duplicate Validator',
      description: 'Gobernanza de constantes, duplicados y nomenclatura',
      family: 'architecture',
      packageName: 'Constantes',
      configKey: 'constants',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '🔢',
      roots: effectiveRoots,
      allowedExtensions: new Set(['.ts', '.vue']),
      requiresAst: true,
      ruleIds: CONSTANT_HYGIENE_RULES,
      ruleDescriptions: {
        'duplicate-constant-identical': 'Constante idéntica duplicada',
        'duplicate-constant-divergent': 'Constante dispar entre módulos',
        'constant-bad-names': 'Nombre con sufijo de valor',
        'constant-no-alias': 'Alias redundante de constante',
        'constant-no-literal-suffix': 'Sufijo numérico en constante'
      },
      projectRoot: effectiveProjectRoot
    });
  }

  private scanRegexConstantRules(relPath: string, content: string, range: { start: number; end: number }): void {
    const regexChecks = [
      { ruleId: 'constant-bad-names' as const, rule: badConstantNames },
      { ruleId: 'constant-no-literal-suffix' as const, rule: noLiteralSuffixInConstantName },
      { ruleId: 'constant-no-alias' as const, rule: noAliasConstants }
    ];

    let m: RegExpExecArray | null;
    for (const { ruleId, rule } of regexChecks) {
      rule.regex.lastIndex = range.start;
      while ((m = rule.regex.exec(content)) !== null) {
        if (m.index >= range.end) break;
        if (rule.check && !rule.check(content, m, relPath)) {
          continue;
        }
        const message = typeof rule.message === 'function' ? rule.message(m[0]) : rule.message;
        this.addViolationAtMatch({
          ruleId,
          filePath: relPath,
          content,
          matchIndex: m.index,
          message,
          context: m[0]
        });
      }
    }
  }

  private scanRedundantExportAliases(relPath: string, content: string, range: { start: number; end: number }): void {
    let m: RegExpExecArray | null;
    P_EXPORT_REDUNDANT_ALIAS.lastIndex = range.start;
    while ((m = P_EXPORT_REDUNDANT_ALIAS.exec(content)) !== null) {
      if (m.index >= range.end) break;
      const aliasName = m[1];
      const targetName = m[2];
      if (!aliasName || !targetName || aliasName === targetName) continue;
      if (/^(?:true|false|null|undefined|NaN|Infinity|\d+)$/.test(targetName)) continue;
      const norm = normalizePosixPath(relPath).toLowerCase();
      if (norm.includes('node_modules') || isTestPath(norm)) continue;

      const preceding = content.slice(0, m.index);
      const lineText = preceding.split('\n').pop() ?? '';
      const nextNl = content.indexOf('\n', m.index);
      const fullLine = lineText + content.slice(m.index, nextNl === -1 ? undefined : nextNl);
      if (fullLine.includes('// value-ok:') || fullLine.includes('// const-ok:') || fullLine.includes('// json-ok:') || fullLine.includes('// alias-ok:')) continue;

      // Skip if targetName is imported from a .json file or is a json data import
      const isJsonImport = new RegExp(`import\\s+${targetName}\\s+from\\s+['"][^'"]*\\.json['"]`).test(content) || /(?:json|dbjson)$/i.test(targetName);
      if (isJsonImport) continue;

      const line = preceding.split('\n').length;
      const column = lineText.length + 1;

      this.addViolation({
        ruleId: 'constant-no-alias',
        severity: 'error',
        filePath: relPath,
        line,
        column,
        message: `Redefinición redundante 1:1 de constante/función: '${m[0].trim()}'. Usa la constante canónica de origen directamente en lugar de declarar alias passthrough.`,
        context: m[0].trim()
      });
    }
  }

  protected override scanFile(relPath: string, content: string): void {
    const absPath = path.resolve(this.projectRoot, relPath);
    if (!isTestPath(relPath) && !relPath.endsWith('.d.ts')) {
      this.scannedAbsFiles.push(absPath);
    }

    const isVue = relPath.endsWith('.vue');
    const vueBlocks = isVue ? parseVueSfcBlocks(content) : null;
    const scriptRanges: Array<{ start: number; end: number }> = vueBlocks
      ? vueBlocks.scripts.map(s => ({ start: s.contentStartIndex, end: s.contentStartIndex + s.content.length }))
      : [{ start: 0, end: content.length }];

    if (isVue && scriptRanges.length === 0) {
      return;
    }

    for (const range of scriptRanges) {
      this.scanRegexConstantRules(relPath, content, range);
      this.scanRedundantExportAliases(relPath, content, range);
    }
  }

  public override async runAudit(astContext?: SharedAstContext): Promise<void> {
    this.scannedAbsFiles.length = 0;
    await super.runAudit(astContext);

    if (this.scannedAbsFiles.length === 0) {
      this.markRuleNotApplicable('duplicate-constant-identical', 'No se encontraron archivos para verificar duplicación');
      this.markRuleNotApplicable('duplicate-constant-divergent', 'No se encontraron archivos para verificar duplicación');
      return;
    }

    this.markRuleEvaluated('duplicate-constant-identical');
    this.markRuleEvaluated('duplicate-constant-divergent');

    const rawViolations = await detectDuplicateConstants(this.scannedAbsFiles, astContext, this.projectRoot);

    for (const v of rawViolations) {
      const isIdentical = v.message.includes('idéntico');
      const ruleId: ConstantHygieneRuleId = isIdentical
        ? 'duplicate-constant-identical'
        : 'duplicate-constant-divergent';

      this.addViolation({
        ruleId,
        severity: v.severity || 'error',
        filePath: v.file,
        line: v.line || 1,
        message: v.message,
        context: v.context
      });
    }
  }
}

export { ValidateConstantHygieneAuditor as ConstantHygieneAuditor };

// Canonical CLI Entrypoint
await FileScanAuditor.runCliIfMain(import.meta.url, new ValidateConstantHygieneAuditor());

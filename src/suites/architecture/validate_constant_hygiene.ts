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
import { FileScanAuditor,
  createUniformRemediationPhases, createRuleCapabilities, resolveFileScanRoots, type FileScanRootsOptions } from '../../core/auditorBase.ts';
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

  constructor(options: FileScanRootsOptions = {}) {
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(
      options,
      (config) => config.paths.srcRoots ?? []
    );
    const effectiveRoots = targetRoots.map((r) => toPosixRelative(effectiveRoot, r));

    super({
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleCapabilities: createRuleCapabilities(CONSTANT_HYGIENE_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: true,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_constant_hygiene',
      name: 'Constant Hygiene & Duplicate Validator',
      description: 'Constant governance, duplicates, and naming',
      family: 'architecture',
      packageName: 'Constants',
      configKey: 'constants',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '🔢',
      roots: effectiveRoots,
      allowedExtensions: new Set(['.ts', '.vue']),
      requiresAst: true,
      ruleIds: CONSTANT_HYGIENE_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(CONSTANT_HYGIENE_RULES, 'dedup'),
      ruleDescriptions: {
        'duplicate-constant-identical': 'Identical duplicate constant',
        'duplicate-constant-divergent': 'Divergent constant across modules',
        'constant-bad-names': 'Constant name with value suffix',
        'constant-no-alias': 'Redundant constant alias',
        'constant-no-literal-suffix': 'Numeric suffix in constant'
      },
      ruleRemediations: {
        'duplicate-constant-identical':
          '📖 REMEDIATION GUIDE: duplicate-constant-identical\n' +
          '1. Root Cause: Multiple identical constant declarations with the same name and value were found across disparate source files.\n' +
          '2. Diagnosis: Inspect the reported files declaring the identical constant.\n' +
          '3. Canonical Solution: Centralize the constant in a shared domain constants module (e.g. `src/constants/`) and reuse the export.\n' +
          '4. Example / Auto-fix command:\n' +
          '   `npm run auditor:magic`',
        'duplicate-constant-divergent':
          '📖 REMEDIATION GUIDE: duplicate-constant-divergent\n' +
          '1. Root Cause: Constants with identical names were found declaring divergent values across different modules.\n' +
          '2. Diagnosis: Check files where the constant is defined with conflicting values.\n' +
          '3. Canonical Solution: Resolve value disparity by assigning specific semantic names or unifying the canonical value in an SSoT module.\n' +
          '4. Example / Auto-fix command:\n' +
          '   Unify constants into single SSoT in `src/constants/`.',
        'constant-bad-names':
          '📖 REMEDIATION GUIDE: constant-bad-names\n' +
          '1. Root Cause: Constant identifier includes its literal value in its name.\n' +
          '2. Diagnosis: Inspect constant declaration at the reported line.\n' +
          '3. Canonical Solution: Remove the numerical value from the identifier name, favoring domain semantics.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Avoid embedding the numeric literal in the constant identifier\n' +
          '   ✅ `const MAX_RETRY_COUNT = 5;`',
        'constant-no-alias':
          '📖 REMEDIATION GUIDE: constant-no-alias\n' +
          '1. Root Cause: A redundant constant alias was declared without adding semantic value.\n' +
          '2. Diagnosis: Locate the redundant alias at the reported line.\n' +
          '3. Canonical Solution: Delete redundant constant aliases; import or reference the canonical source constant directly.\n' +
          '4. Example / Auto-fix command:\n' +
          '   Import canonical constant directly instead of re-aliasing.',
        'constant-no-literal-suffix':
          '📖 REMEDIATION GUIDE: constant-no-literal-suffix\n' +
          '1. Root Cause: Constant identifier uses a raw numeric suffix (e.g. `_100`, `_600`).\n' +
          '2. Diagnosis: Inspect constant identifier at reported line.\n' +
          '3. Canonical Solution: Replace numeric suffixes with semantic domain terms (e.g., `FAST`, `DEFAULT`, `EXTENDED`).\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Avoid naming constants with trailing numeric suffixes\n' +
          '   ✅ `const FAST_TIMEOUT_MS = 500;`'
      },
      projectRoot: effectiveRoot
    });
  }

  private scanRegexConstantRules(
    relPath: string,
    content: string,
    range: { start: number; end: number }
  ): void {
    const regexChecks = [
      { ruleId: 'constant-bad-names' as const, rule: badConstantNames },
      { ruleId: 'constant-no-literal-suffix' as const, rule: noLiteralSuffixInConstantName },
      { ruleId: 'constant-no-alias' as const, rule: noAliasConstants }
    ];

    for (const { ruleId, rule } of regexChecks) {
      this.runSubAuditorSync(ruleId, () => {
        rule.regex.lastIndex = range.start;
        let m: RegExpExecArray | null;
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
      });
    }
  }

  private scanRedundantExportAliases(
    relPath: string,
    content: string,
    range: { start: number; end: number }
  ): void {
    this.runSubAuditorSync('constant-no-alias', () => {
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
        if (
          fullLine.includes('// value-ok:') ||
          fullLine.includes('// const-ok:') ||
          fullLine.includes('// json-ok:') ||
          fullLine.includes('// alias-ok:')
        )
          continue;

        // Skip if targetName is imported from a .json file or is a json data import
        const isJsonImport =
          new RegExp(`import\\s+${targetName}\\s+from\\s+['"][^'"]*\\.json['"]`).test(content) ||
          /(?:json|dbjson)$/i.test(targetName);
        if (isJsonImport) continue;

        const line = preceding.split('\n').length;
        const column = lineText.length + 1;

        this.addViolation({
          ruleId: 'constant-no-alias',
          severity: 'error',
          filePath: relPath,
          line,
          column,
          message: `Redundant 1:1 constant/function redefinition: '${m[0].trim()}'. Use the canonical origin constant directly instead of declaring passthrough aliases.`,
          context: m[0].trim()
        });
      }
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    const absPath = path.resolve(this.projectRoot, relPath);
    if (!isTestPath(relPath) && !relPath.endsWith('.d.ts')) {
      this.scannedAbsFiles.push(absPath);
    }

    const isVue = relPath.endsWith('.vue');
    const vueBlocks = isVue ? parseVueSfcBlocks(content) : null;
    const scriptRanges: Array<{ start: number; end: number }> = vueBlocks
      ? vueBlocks.scripts.map((s) => ({
          start: s.contentStartIndex,
          end: s.contentStartIndex + s.content.length
        }))
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
      this.markRuleNotApplicable(
        'duplicate-constant-identical',
        'No files found to verify duplication'
      );
      this.markRuleNotApplicable(
        'duplicate-constant-divergent',
        'No files found to verify duplication'
      );
      return;
    }

    await this.runSubAuditor('duplicate-constant-identical', async () => {
      const identicalViolations = await detectDuplicateConstants(
        this.scannedAbsFiles,
        astContext,
        this.projectRoot,
        'identical'
      );
      for (const v of identicalViolations) {
        this.addViolation({
          ruleId: 'duplicate-constant-identical',
          severity: v.severity || 'error',
          filePath: v.file,
          line: v.line || 1,
          message: v.message,
          context: v.context
        });
      }
    });

    await this.runSubAuditor('duplicate-constant-divergent', async () => {
      const divergentViolations = await detectDuplicateConstants(
        this.scannedAbsFiles,
        astContext,
        this.projectRoot,
        'divergent'
      );
      for (const v of divergentViolations) {
        this.addViolation({
          ruleId: 'duplicate-constant-divergent',
          severity: v.severity || 'error',
          filePath: v.file,
          line: v.line || 1,
          message: v.message,
          context: v.context
        });
      }
    });
  }
}

export { ValidateConstantHygieneAuditor as ConstantHygieneAuditor };

// Canonical CLI Entrypoint
await FileScanAuditor.runCliIfMain(import.meta.url, new ValidateConstantHygieneAuditor());

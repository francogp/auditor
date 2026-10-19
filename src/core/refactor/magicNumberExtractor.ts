/**
 * src/core/refactor/magicNumberExtractor.ts
 *
 * CANONICAL POLYGLOT MAGIC LITERAL EXTRACTOR & SUPER-DIRAC BATCH COMPRESSOR
 * Scans TS, Vue SFC (<script> & <style>), and SCSS files.
 * Provides Zero-Token semantic AST inference, design token mapping, and compact batch clustering.
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { parseVueSfcBlocks } from '../vueSfcParser.ts';
import type {
  DiscoveredMagicItem,
  ExistingConstantEntry,
  SuperDiracClusterPacket,
  SuperDiracBatchItem,
  InferredSemanticRole,
  MagicLiteralKind,
  MagicRefactorPlan,
  ConstantDeclarationSpec,
  SpanReplacementSpec
} from './magicContracts.ts';
import { ESTIMATED_TOKENS_PER_CHAR } from './refactorContracts.ts';
import {
  resolveSignedNumericLiteral,
  ValidateMagicNumbersAuditor
} from '../../suites/architecture/validate_magic_numbers.ts';

import { BaseRefactorEngine } from './baseRefactorEngine.ts';
import { MagicNumberHarness } from './magicNumberHarness.ts';
import type { AuditEngineConfig } from '../auditConfigTypes.ts';

const UNIVERSAL_SENTINELS = new Set<number>([
  -1, 0, 0.5, 1, 2, 3, 4, 5, 10, 24, 60, 100, 360, 1000, 1024
]);

const STANDARD_RADIX = new Set<number>([2, 8, 10, 16, 32, 36]);

export class MagicNumberExtractor extends BaseRefactorEngine<
  DiscoveredMagicItem,
  MagicRefactorPlan,
  ValidateMagicNumbersAuditor
> {
  public readonly toolId = 'auditor-magic';
  public readonly configSectionKey = 'constants' as const;
  public override get allowedExtensions(): ReadonlySet<string> {
    return new Set<string>([
      ...this.auditor.allowedExtensions,
      '.scss',
      '.css'
    ]);
  }

  private readonly existingConstants: ExistingConstantEntry[] = [];
  private readonly cssVariables: Map<string, string> = new Map();

  constructor(
    auditorOrOptions?: ValidateMagicNumbersAuditor | string | { projectRoot?: string; config?: AuditEngineConfig },
    _explicitConfig?: AuditEngineConfig
  ) {
    const auditor =
      auditorOrOptions instanceof ValidateMagicNumbersAuditor
        ? auditorOrOptions
        : new ValidateMagicNumbersAuditor(
            typeof auditorOrOptions === 'string'
              ? { projectRoot: auditorOrOptions }
              : auditorOrOptions
          );
    super(auditor);
  }

  /**
   * Data catalog paths (paths.dataRoots) are exempt from magic number checks,
   * matching validate_magic_numbers suite behavior 1:1.
   */
  public override shouldIncludeDataPaths(): boolean {
    return false;
  }

  /**
   * Discovers all candidate source files (TS, Vue SFC, SCSS) in a project
   * dynamically driven by audit.config.ts.
   */
  public static discoverScannableFiles(projectRoot: string): string[] {
    return new MagicNumberExtractor({ projectRoot })
      .getScannableFiles()
      .map((f) => path.normalize(f));
  }

  /**
   * Pre-indexes existing exported constants and CSS variables across the repository.
   */
  public indexProjectConstants(projectRoot: string = this.projectRoot): void {
    this.existingConstants.length = 0;
    this.cssVariables.clear();

    const scannable = this.getScannableFiles();
    for (const rel of scannable) {
      const full = path.resolve(projectRoot, rel);
      if (rel.endsWith('.ts')) {
        this.indexTsConstants(full);
      } else if (rel.endsWith('.scss') || rel.endsWith('.css')) {
        this.indexCssVariables(full);
      }
    }
  }

  public discoverInFile(filePath: string): readonly DiscoveredMagicItem[] {
    const relFile = path.isAbsolute(filePath)
      ? path.relative(this.projectRoot, filePath)
      : filePath;
    return this.scanFile(this.projectRoot, relFile);
  }

  public createPlan(id: string, findings: readonly DiscoveredMagicItem[]): MagicRefactorPlan {
    const targetFile = findings[0]?.file ?? 'unknown';
    return this.createRefactorPlan(id, targetFile, findings);
  }

  public applyPlan(
    projectRoot: string,
    plan: MagicRefactorPlan
  ): { readonly modifiedFiles: readonly string[] } {
    MagicNumberHarness.execute(projectRoot, plan);
    return { modifiedFiles: plan.targetFiles };
  }

  private indexVariableDeclaration(
    decl: ts.VariableDeclaration,
    isExported: boolean,
    absPath: string
  ): void {
    if (!ts.isIdentifier(decl.name) || !decl.initializer) return;
    const name = decl.name.text;
    if (name !== name.toUpperCase() || name.length < 3) return;

    if (ts.isNumericLiteral(decl.initializer)) {
      this.existingConstants.push({
        symbol: name,
        value: parseFloat(decl.initializer.text),
        file: absPath,
        isExported,
        isCssVariable: false
      });
    } else if (ts.isStringLiteral(decl.initializer)) {
      this.existingConstants.push({
        symbol: name,
        value: decl.initializer.text,
        file: absPath,
        isExported,
        isCssVariable: false
      });
    }
  }

  private indexTsConstants(absPath: string): void {
    try {
      const code = fs.readFileSync(absPath, 'utf8');
      const sf = ts.createSourceFile(absPath, code, ts.ScriptTarget.Latest, true);

      const visit = (node: ts.Node): void => {
        if (ts.isVariableStatement(node)) {
          const isExported =
            node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
          for (const decl of node.declarationList.declarations) {
            this.indexVariableDeclaration(decl, isExported, absPath);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    } catch {
      // catch-ok: ignore unreadable or malformed files during constant pre-indexing
    }
  }

  private indexCssVariables(absPath: string): void {
    try {
      const code = fs.readFileSync(absPath, 'utf8');
      const varRegex = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
      let match: RegExpExecArray | null;
      while ((match = varRegex.exec(code)) !== null) {
        const varName = match[1]!;
        const varValue = match[2]!.trim();
        this.cssVariables.set(varValue, varName);
        this.existingConstants.push({
          symbol: varName,
          value: varValue,
          file: absPath,
          isExported: true,
          isCssVariable: true
        });
      }
    } catch {
      // catch-ok: ignore unreadable stylesheet files during css variable indexing
    }
  }

  /**
   * Scans a target file for magic literals across TS, Vue SFC, and SCSS.
   */
  public scanFile(projectRoot: string, relFile: string): DiscoveredMagicItem[] {
    const absPath = path.resolve(projectRoot, relFile);
    if (!fs.existsSync(absPath)) return [];

    const content = fs.readFileSync(absPath, 'utf8');
    const items: DiscoveredMagicItem[] = [];

    if (relFile.endsWith('.ts') || relFile.endsWith('.tsx') || relFile.endsWith('.js')) {
      this.scanTypeScriptCode(relFile, content, 0, 'numeric-ts', items);
    } else if (relFile.endsWith('.vue')) {
      const { scripts, styles } = parseVueSfcBlocks(content);
      for (const script of scripts) {
        this.scanTypeScriptCode(
          relFile,
          script.content,
          script.contentStartIndex,
          'numeric-vue-script',
          items
        );
      }
      for (const style of styles) {
        this.scanScssCode(relFile, style.content, style.contentStartIndex, items);
      }
    } else if (relFile.endsWith('.scss') || relFile.endsWith('.css')) {
      this.scanScssCode(relFile, content, 0, items);
    }

    return items;
  }

  private scanTypeScriptCode(
    file: string,
    code: string,
    offsetDelta: number,
    kind: MagicLiteralKind,
    results: DiscoveredMagicItem[]
  ): void {
    const sf = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
    const lines = code.split('\n');

    let counter = 1;
    const visit = (node: ts.Node): void => {
      if (ts.isNumericLiteral(node)) {
        const { val, reportedNode } = resolveSignedNumericLiteral(node);

        const isAllowed = this.isExemptTsLiteral(node, reportedNode, val);
        if (!isAllowed) {
          const { line, character } = sf.getLineAndCharacterOfPosition(reportedNode.getStart(sf));
          const lineText = lines[line] ?? '';
          if (!lineText.includes('// const-ok:')) {
            const startOffset = reportedNode.getStart(sf) + offsetDelta;
            const endOffset = reportedNode.getEnd() + offsetDelta;
            const enclosingSymbol = this.findEnclosingSymbol(reportedNode);
            const { role, candidateName } = this.inferSemanticRoleAndName(
              reportedNode,
              val,
              enclosingSymbol
            );

            // Check if matching constant already exists in project SSoT
            const matching = this.existingConstants.find(
              (c) => typeof c.value === 'number' && Math.abs(c.value - val) < 0.0001
            );

            const isZeroToken = Boolean(matching || (role !== 'unclassified' && candidateName));

            results.push({
              id: `M${counter++}`,
              file,
              kind,
              line: line + 1,
              column: character + 1,
              startOffset,
              endOffset,
              rawValue: reportedNode.getText(sf),
              numericValue: val,
              lineSnippet: lineText.trim(),
              enclosingSymbol,
              semanticRole: role,
              autoCandidateName: candidateName ?? (matching ? matching.symbol : undefined),
              matchingExistingConstant: matching
                ? { symbol: matching.symbol, moduleSpecifier: matching.file }
                : undefined,
              isZeroTokenResolvable: isZeroToken
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(sf);
  }

  private scanScssCode(
    file: string,
    scssContent: string,
    offsetDelta: number,
    results: DiscoveredMagicItem[]
  ): void {
    const lines = scssContent.split('\n');
    let counter = 1;

    // 1. Z-Index hardcoded literals (e.g. z-index: 1000)
    const zIndexRegex = /z-index\s*:\s*(-?\d+)\b/gi;
    let zMatch: RegExpExecArray | null;
    while ((zMatch = zIndexRegex.exec(scssContent)) !== null) {
      const rawVal = zMatch[1]!;
      const numVal = parseInt(rawVal, 10);
      if (numVal !== 0 && numVal !== -1 && numVal !== 1) {
        const lineIdx = scssContent.slice(0, zMatch.index).split('\n').length - 1;
        const lineText = lines[lineIdx] ?? '';
        if (!lineText.includes('// z-ok:') && !lineText.includes('var(')) {
          const varMatch = this.cssVariables.get(rawVal);
          results.push({
            id: `SZ${counter++}`,
            file,
            kind: 'z-index-scss',
            line: lineIdx + 1,
            column: 1,
            startOffset: zMatch.index + offsetDelta,
            endOffset: zMatch.index + zMatch[0].length + offsetDelta,
            rawValue: zMatch[0],
            numericValue: numVal,
            lineSnippet: lineText.trim(),
            semanticRole: 'z-index-layer',
            autoCandidateName: varMatch ? `var(${varMatch})` : `var(--z-layer-${rawVal})`,
            matchingExistingConstant: varMatch
              ? { symbol: `var(${varMatch})`, isCssVariable: true }
              : undefined,
            isZeroTokenResolvable: Boolean(varMatch)
          });
        }
      }
    }

    // 2. Hardcoded hex colors without var() (e.g. color: #1e293b)
    const hexColorRegex = /#([0-9a-fA-F]{3,8})\b/g;
    let cMatch: RegExpExecArray | null;
    while ((cMatch = hexColorRegex.exec(scssContent)) !== null) {
      const hexVal = cMatch[0].toLowerCase();
      const lineIdx = scssContent.slice(0, cMatch.index).split('\n').length - 1;
      const lineText = lines[lineIdx] ?? '';
      if (!lineText.includes('var(') && !lineText.includes('$') && !lineText.includes('color-ok:')) {
        const varMatch = this.cssVariables.get(hexVal);
        results.push({
          id: `SC${counter++}`,
          file,
          kind: 'color-scss',
          line: lineIdx + 1,
          column: 1,
          startOffset: cMatch.index + offsetDelta,
          endOffset: cMatch.index + cMatch[0].length + offsetDelta,
          rawValue: cMatch[0],
          lineSnippet: lineText.trim(),
          semanticRole: 'color-token',
          autoCandidateName: varMatch ? `var(${varMatch})` : undefined,
          matchingExistingConstant: varMatch
            ? { symbol: `var(${varMatch})`, isCssVariable: true }
            : undefined,
          isZeroTokenResolvable: Boolean(varMatch)
        });
      }
    }
  }

  private isExemptTsLiteral(_node: ts.Node, reported: ts.Node, val: number): boolean {
    if (UNIVERSAL_SENTINELS.has(val)) return true;
    if (this.config.constants?.exemptMagicNumbers?.includes(val)) return true;

    // Is already a constant declaration?
    let curr: ts.Node | undefined = reported.parent;
    while (curr) {
      if (ts.isVariableDeclaration(curr)) {
        const list = curr.parent;
        if (ts.isVariableDeclarationList(list) && list.flags & ts.NodeFlags.Const) return true;
      }
      if (
        ts.isPropertyDeclaration(curr) &&
        curr.modifiers?.some((m) => m.kind === ts.SyntaxKind.ReadonlyKeyword)
      ) {
        return true;
      }
      if (ts.isEnumMember(curr) || ts.isTypeNode(curr)) return true;
      curr = curr.parent;
    }

    const p = reported.parent;
    if (!p) return false;

    // Radix args (parseInt(x, 10))
    if (STANDARD_RADIX.has(val) && ts.isCallExpression(p) && p.arguments[1] === reported) return true;

    // Array indexing arr[0]
    if (ts.isElementAccessExpression(p) && p.argumentExpression === reported) return true;

    // Default parameter values function foo(limit = 10)
    if (ts.isParameter(p) && p.initializer === reported) return true;

    // Precision methods .toFixed(2)
    if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression)) {
      const fnName = p.expression.name.text;
      if (['toFixed', 'toPrecision', 'slice'].includes(fnName)) return true;
    }

    return false;
  }

  private findEnclosingSymbol(node: ts.Node): string | undefined {
    let curr: ts.Node | undefined = node.parent;
    while (curr) {
      if (ts.isFunctionDeclaration(curr) && curr.name) return curr.name.text;
      if (ts.isMethodDeclaration(curr) && ts.isIdentifier(curr.name)) return curr.name.text;
      if (ts.isVariableDeclaration(curr) && ts.isIdentifier(curr.name)) return curr.name.text;
      if (ts.isClassDeclaration(curr) && curr.name) return curr.name.text;
      curr = curr.parent;
    }
    return undefined;
  }

  private inferSemanticRoleAndName(
    node: ts.Node,
    _val: number,
    enclosingSymbol?: string
  ): { role: InferredSemanticRole; candidateName?: string } {
    const parent = node.parent;
    if (!parent) return { role: 'unclassified' };

    const timer = this.inferTimerRole(parent, node, enclosingSymbol);
    if (timer) return timer;

    const prop = this.inferPropertyRole(parent, node);
    if (prop) return prop;

    if (ts.isBinaryExpression(parent)) {
      const threshold = this.inferBinaryThresholdRole(parent, node);
      if (threshold) return threshold;

      const math = this.inferMathRole(parent, enclosingSymbol);
      if (math) return math;
    }

    return { role: 'unclassified' };
  }

  private inferTimerRole(
    parent: ts.Node,
    node: ts.Node,
    enclosingSymbol?: string
  ): { role: InferredSemanticRole; candidateName: string } | undefined {
    if (!ts.isCallExpression(parent)) return undefined;
    const callee = parent.expression.getText();
    if (['setTimeout', 'setInterval'].includes(callee) && parent.arguments[1] === node) {
      const prefix = enclosingSymbol ? this.toScreamingSnake(enclosingSymbol) : 'OPERATION';
      return { role: 'timer-delay', candidateName: `${prefix}_DELAY_MS` };
    }
    if (callee === 'delayedCall' && parent.arguments[0] === node) {
      const prefix = enclosingSymbol ? this.toScreamingSnake(enclosingSymbol) : 'TWEEN';
      return { role: 'timer-delay', candidateName: `${prefix}_DELAY_SECONDS` };
    }
    return undefined;
  }

  private inferPropertyRole(
    parent: ts.Node,
    node: ts.Node
  ): { role: InferredSemanticRole; candidateName: string } | undefined {
    if (
      !ts.isPropertyAssignment(parent) ||
      parent.initializer !== node ||
      !ts.isIdentifier(parent.name)
    ) {
      return undefined;
    }
    const propName = parent.name.text;
    const propUpper = this.toScreamingSnake(propName);
    const isMs =
      propName.toLowerCase().includes('timeout') || propName.toLowerCase().includes('delay');
    const suffix = isMs && !propUpper.endsWith('_MS') ? '_MS' : '';
    return { role: 'property-value', candidateName: `DEFAULT_${propUpper}${suffix}` };
  }

  private inferBinaryThresholdRole(
    parent: ts.BinaryExpression,
    node: ts.Node
  ): { role: InferredSemanticRole; candidateName: string } | undefined {
    if (parent.right !== node) return undefined;
    const leftText = parent.left.getText().replace(/[^a-zA-Z0-9_]/g, '_');
    if (!leftText) return undefined;

    const op = parent.operatorToken.kind;
    let boundPrefix = 'LIMIT';
    if (op === ts.SyntaxKind.LessThanToken || op === ts.SyntaxKind.LessThanEqualsToken) {
      boundPrefix = 'MAX';
    } else if (
      op === ts.SyntaxKind.GreaterThanToken ||
      op === ts.SyntaxKind.GreaterThanEqualsToken
    ) {
      boundPrefix = 'MIN';
    }

    const cleanLeft = this.toScreamingSnake(leftText).replace(/^_+|_+$/g, '');
    return { role: 'binary-threshold', candidateName: `${boundPrefix}_${cleanLeft}` };
  }

  private inferMathRole(
    parent: ts.BinaryExpression,
    enclosingSymbol?: string
  ): { role: InferredSemanticRole; candidateName: string } | undefined {
    const op = parent.operatorToken.kind;
    if (op !== ts.SyntaxKind.AsteriskToken && op !== ts.SyntaxKind.SlashToken) return undefined;
    const prefix = enclosingSymbol ? this.toScreamingSnake(enclosingSymbol) : 'CALC';
    return { role: 'math-formula', candidateName: `${prefix}_MULTIPLIER` };
  }

  private toScreamingSnake(str: string): string {
    return str
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .toUpperCase()
      .replace(/_+/g, '_');
  }

  /**
   * Generates Super-Dirac compact batch table packet.
   */
  public generateSuperDiracPacket(
    projectRoot: string,
    file: string,
    items: readonly DiscoveredMagicItem[]
  ): SuperDiracClusterPacket {
    const absPath = path.resolve(projectRoot, file);
    const fileContent = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf8') : '';
    const fullFileTokens = Math.round(fileContent.length * ESTIMATED_TOKENS_PER_CHAR);

    // Compact clustering: group occurrences of the identical literal value within the same enclosing scope
    const clusteredMap = new Map<string, { items: DiscoveredMagicItem[]; candidate: string }>();
    for (const item of items) {
      const key = `${item.rawValue}::${item.semanticRole}::${item.enclosingSymbol || 'global'}`;
      const existing = clusteredMap.get(key);
      if (existing) {
        existing.items.push(item);
      } else {
        clusteredMap.set(key, {
          items: [item],
          candidate: item.autoCandidateName ?? 'PENDING_NAME'
        });
      }
    }

    const batchItems: SuperDiracBatchItem[] = Array.from(clusteredMap.entries()).map(
      ([_, entry], idx) => {
        const first = entry.items[0]!;
        const locs = entry.items.map((i) => `L${i.line}`).join(',');
        return {
          id: `G${idx + 1}`,
          loc: `${path.basename(first.file)}:${locs}`,
          val: first.rawValue,
          role: first.semanticRole,
          fn: first.enclosingSymbol,
          expr:
            entry.items.length === 1
              ? first.lineSnippet
              : `${first.lineSnippet} (x${entry.items.length})`,
          candidate: entry.candidate
        };
      }
    );

    const zeroCount = items.filter((i) => i.isZeroTokenResolvable).length;
    const pendingCount = items.length - zeroCount;

    const batchJson = JSON.stringify(batchItems, null, 2);
    const batchTokens = Math.round(batchJson.length * ESTIMATED_TOKENS_PER_CHAR);
    const savings =
      fullFileTokens > 0
        ? Math.max(0, Math.round(((fullFileTokens - batchTokens) / fullFileTokens) * 100))
        : 0;

    return {
      file,
      totalItems: items.length,
      zeroTokenCount: zeroCount,
      pendingAmbiguousCount: pendingCount,
      fullFileTokensBaseline: fullFileTokens,
      superDiracBatchTokens: batchTokens,
      tokenSavingsPercent: savings,
      items: batchItems
    };
  }

  /**
   * Generates a fully-executable MagicRefactorPlan ready to be applied by MagicNumberHarness.
   */
  public createRefactorPlan(
    planId: string,
    file: string,
    items: readonly DiscoveredMagicItem[],
    options?: {
      targetLocation?: 'local-file-header' | 'shared-constants-module';
      destinationFile?: string;
    }
  ): MagicRefactorPlan {
    const targetLocation = options?.targetLocation ?? 'local-file-header';
    const destinationFile = options?.destinationFile;
    const declarationsMap = new Map<string, ConstantDeclarationSpec>();
    const replacements: SpanReplacementSpec[] = [];

    for (const item of items) {
      const constName =
        item.matchingExistingConstant?.symbol ?? item.autoCandidateName ?? 'CONSTANT_VALUE';
      if (!declarationsMap.has(constName) && !item.matchingExistingConstant) {
        declarationsMap.set(constName, {
          name: constName,
          value: item.rawValue,
          targetLocation,
          destinationFile,
          isExported: targetLocation === 'shared-constants-module'
        });
      }
      replacements.push({
        startOffset: item.startOffset,
        endOffset: item.endOffset,
        replacement: constName,
        originalSnippet: String(item.rawValue)
      });
    }

    return {
      version: 1,
      planId,
      targetFiles: [file],
      declarations: Array.from(declarationsMap.values()),
      fileReplacements: {
        [file]: replacements
      }
    };
  }
}


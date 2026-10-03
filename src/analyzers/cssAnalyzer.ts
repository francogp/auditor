/**
 * packages/auditor/src/analyzers/cssAnalyzer.ts
 *
 * PURE TYPESCRIPT / POSTCSS AST CSS HYGIENE & DUPLICATION ANALYZER (Node.js 26+ Native)
 * Replaces legacy external Go binary (css-checker-kit) with 100% pure JavaScript/TypeScript AST.
 *
 * Capabilities:
 *   1. Duplicate Rules (css-duplicate-rules): Identical declaration bodies across different selectors.
 *   2. Similar Classes (css-similar-classes): Fuzzy property matching with configurable % threshold.
 *   3. Long Values (css-duplicate-long-lines): Complex repeated CSS values >= 20 chars without variables.
 *   4. Unvariabled Colors (css-unvariabled-colors): Raw HEX/RGB/HSL colors repeated across rules.
 *   5. Duplicate Selectors (css-duplicate-selectors): Same selector repeated in the same stylesheet.
 *   6. Empty Rules (css-empty-rules): Redundant CSS rules without declarations.
 *   7. Unused Classes (css-unused-classes): Selectors never referenced in template/JS files.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Rule } from 'postcss';
import scssSyntax from 'postcss-scss';
import type { Violation, RuleDescriptor } from '../suites/architecture/audit_rules.ts';

export const CSS_ANALYZER_DESCRIPTOR: RuleDescriptor = {
  id: 'css-analyzer',
  name: 'CSS / SCSS Multicriteria AST Analyzer',
  category: 'css-checker: SCSS/CSS duplicado y calidad',
  aliases: ['css-checker', 'css', 'scss', 'duplicate-css', 'scss-duplicados', 'css-hygiene']
};

export interface CssDeclaration {
  readonly prop: string;
  readonly value: string;
  readonly raw: string;
  readonly line: number;
}

export interface ParsedCssRule {
  readonly file: string;
  readonly line: number;
  readonly selector: string;
  readonly declarations: readonly CssDeclaration[];
  readonly rawBlock: string;
}

export interface DuplicateRuleOccurrence {
  readonly file: string;
  readonly line: number;
  readonly selector: string;
}

export interface DuplicateRuleGroup {
  readonly signature: string;
  readonly declarations: string[];
  readonly occurrences: DuplicateRuleOccurrence[];
}

export interface SimilarClassComparison {
  readonly similarity: number;
  readonly commonDeclarations: string[];
  readonly left: {
    readonly file: string;
    readonly line: number;
    readonly selector: string;
    readonly uniqueDeclarations: string[];
  };
  readonly right: {
    readonly file: string;
    readonly line: number;
    readonly selector: string;
    readonly uniqueDeclarations: string[];
  };
}

export interface LongValueOccurrence {
  readonly file: string;
  readonly line: number;
  readonly prop: string;
  readonly selector: string;
}

export interface LongValueGroup {
  readonly value: string;
  readonly length: number;
  readonly occurrences: LongValueOccurrence[];
}

export interface ColorOccurrence {
  readonly file: string;
  readonly line: number;
  readonly prop: string;
  readonly selector: string;
}

export interface ColorGroup {
  readonly color: string;
  readonly occurrences: ColorOccurrence[];
}

export interface DuplicateSelectorGroup {
  readonly selector: string;
  readonly file: string;
  readonly lines: number[];
}

export interface EmptyRuleRecord {
  readonly selector: string;
  readonly file: string;
  readonly line: number;
}

export interface UnusedClassRecord {
  readonly className: string;
  readonly file: string;
  readonly line: number;
}

export interface CssAnalysisDetails {
  readonly duplicates: DuplicateRuleGroup[];
  readonly similar: SimilarClassComparison[];
  readonly longValues: LongValueGroup[];
  readonly unvariabledColors: ColorGroup[];
  readonly duplicateSelectors: DuplicateSelectorGroup[];
  readonly emptyRules: EmptyRuleRecord[];
  readonly unusedClasses: UnusedClassRecord[];
}

export interface CssAnalysisOptions {
  readonly minDeclarations?: number;
  readonly checkSimilar?: boolean;
  readonly similarityThreshold?: number;
  readonly checkLongLines?: boolean;
  readonly longLineLengthThreshold?: number;
  readonly checkColors?: boolean;
  readonly checkEmptyRules?: boolean;
  readonly checkUnused?: boolean;
  readonly checkDuplicateSelectors?: boolean;
}

export const DEFAULT_CSS_SIMILARITY_THRESHOLD = 80;
export const DEFAULT_CSS_LONG_LINE_THRESHOLD = 20;

const DEFAULT_OPTIONS: Required<CssAnalysisOptions> = {
  minDeclarations: 2,
  checkSimilar: true,
  similarityThreshold: DEFAULT_CSS_SIMILARITY_THRESHOLD,
  checkLongLines: true,
  longLineLengthThreshold: DEFAULT_CSS_LONG_LINE_THRESHOLD,
  checkColors: true,
  checkEmptyRules: true,
  checkUnused: false,
  checkDuplicateSelectors: true
};

const COLOR_REGEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|\b(?:rgba?|hsla?)\([^)]+\)/gi;

function normalizeDeclaration(prop: string, val: string): string {
  const cleanProp = prop.trim().toLowerCase();
  const cleanVal = val.trim().replace(/\s+/g, ' ');
  return `${cleanProp}: ${cleanVal}`;
}

export function extractCssBlocksFromVue(content: string): Array<{ code: string; startLine: number }> {
  const blocks: Array<{ code: string; startLine: number }> = [];
  const styleRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let match: RegExpExecArray | null;

  while ((match = styleRegex.exec(content)) !== null) {
    const preContent = content.slice(0, match.index);
    const startLine = preContent.split('\n').length;
    const styleBody = match[1] ?? '';
    blocks.push({ code: styleBody, startLine });
  }

  return blocks;
}

export function parseCssContent(
  content: string,
  filePath: string,
  linePaddingCount = 0
): ParsedCssRule[] {
  const rules: ParsedCssRule[] = [];
  const paddedContent = '\n'.repeat(Math.max(0, linePaddingCount)) + content;

  try {
    const root = scssSyntax.parse(paddedContent, { from: filePath });
    root.walkRules((rule: Rule) => {
      const startLine = rule.source?.start?.line ?? 1;
      const decls: CssDeclaration[] = [];

      for (const node of rule.nodes ?? []) {
        if (node.type === 'decl') {
          decls.push({
            prop: node.prop,
            value: node.value,
            raw: `${node.prop}: ${node.value}`,
            line: node.source?.start?.line ?? startLine
          });
        }
      }

      rules.push({
        file: filePath,
        line: startLine,
        selector: rule.selector.trim(),
        declarations: decls,
        rawBlock: rule.toString()
      });
    });
  } catch {
    // catch-ok: Ignore syntactically incomplete or partial CSS snippets gracefully
  }

  return rules;
}

export async function collectAllProjectCssRules(
  targetDir: string,
  ignoreDirs: ReadonlySet<string>,
  projectRoot: string = process.cwd()
): Promise<{ rules: ParsedCssRule[]; fileCount: number }> {
  const searchDir = path.resolve(projectRoot, targetDir === '.' ? 'src' : targetDir);
  const pattern = '**/*.{scss,css,vue}';
  const entries: string[] = [];

  for await (const entry of fs.glob(pattern, {
    cwd: searchDir,
    exclude: (p: string) => Array.from(ignoreDirs).some(d => p.includes(d))
  })) {
    entries.push(entry);
  }

  const fileCount = entries.length;
  if (fileCount === 0) {
    return { rules: [], fileCount: 0 };
  }

  const concurrency = Math.max(1, os.availableParallelism ? os.availableParallelism() : os.cpus().length);
  const rulesByWorker: ParsedCssRule[][] = Array.from({ length: concurrency }, () => []);
  let nextIdx = 0;

  async function worker(workerId: number): Promise<void> {
    const workerRules = rulesByWorker[workerId]!;
    while (nextIdx < entries.length) {
      const idx = nextIdx++;
      const entry = entries[idx]!;
      const fullPath = path.join(searchDir, entry);
      const relPath = path.relative(projectRoot, fullPath).split(path.sep).join(path.posix.sep);
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        if (fullPath.endsWith('.vue')) {
          const blocks = extractCssBlocksFromVue(content);
          for (const block of blocks) {
            const parsed = parseCssContent(block.code, relPath, block.startLine - 1);
            workerRules.push(...parsed);
          }
        } else {
          const parsed = parseCssContent(content, relPath, 0);
          workerRules.push(...parsed);
        }
      } catch {
        // catch-ok: ignore file read or syntax errors in individual CSS/Vue snippets
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i)));
  const rules = rulesByWorker.flat();
  return { rules, fileCount };
}

export function detectDuplicateRules(
  rules: readonly ParsedCssRule[],
  minDeclarations: number
): DuplicateRuleGroup[] {
  const groupsBySignature = new Map<string, { declarations: string[]; occurrences: DuplicateRuleOccurrence[] }>();

  for (const rule of rules) {
    if (rule.declarations.length < minDeclarations) continue;

    const normalizedDecls = rule.declarations
      .map(d => normalizeDeclaration(d.prop, d.value))
      .sort();
    const signature = normalizedDecls.join('; ');

    const existing = groupsBySignature.get(signature);
    const occurrence: DuplicateRuleOccurrence = {
      file: rule.file,
      line: rule.line,
      selector: rule.selector
    };

    if (existing) {
      existing.occurrences.push(occurrence);
    } else {
      groupsBySignature.set(signature, {
        declarations: normalizedDecls,
        occurrences: [occurrence]
      });
    }
  }

  const duplicates: DuplicateRuleGroup[] = [];
  for (const [signature, data] of groupsBySignature.entries()) {
    // Only consider duplicate if it appears in at least 2 places
    if (data.occurrences.length >= 2) {
      duplicates.push({
        signature,
        declarations: data.declarations,
        occurrences: data.occurrences
      });
    }
  }

  return duplicates;
}

interface PreparedCssRule {
  readonly rule: ParsedCssRule;
  readonly declArray: readonly string[];
  readonly declSet: ReadonlySet<string>;
  readonly size: number;
}

export function detectSimilarClasses(
  rules: readonly ParsedCssRule[],
  thresholdPercent: number,
  minDeclarations = 2
): SimilarClassComparison[] {
  const preparedRules: PreparedCssRule[] = [];
  for (const r of rules) {
    if (r.declarations.length < minDeclarations) continue;
    const declArray = r.declarations.map(d => normalizeDeclaration(d.prop, d.value));
    const declSet = new Set(declArray);
    if (declSet.size >= minDeclarations) {
      preparedRules.push({
        rule: r,
        declArray: Array.from(declSet),
        declSet,
        size: declSet.size
      });
    }
  }

  // Build inverted index: normalized declaration -> array of rule indices containing it
  const declIndex = new Map<string, number[]>();
  for (let i = 0; i < preparedRules.length; i++) {
    const prep = preparedRules[i]!;
    for (const decl of prep.declArray) {
      let list = declIndex.get(decl);
      if (!list) {
        list = [];
        declIndex.set(decl, list);
      }
      list.push(i);
    }
  }

  const comparisons: SimilarClassComparison[] = [];
  const seenPairs = new Set<string>();

  for (let i = 0; i < preparedRules.length; i++) {
    const a = preparedRules[i]!;
    // Count shared declarations only for candidate rules j > i that share at least 1 property
    const candidateSharedCounts = new Map<number, number>();
    for (const decl of a.declArray) {
      const candidateIndices = declIndex.get(decl);
      if (!candidateIndices) continue;
      for (const j of candidateIndices) {
        if (j > i) {
          candidateSharedCounts.set(j, (candidateSharedCounts.get(j) ?? 0) + 1);
        }
      }
    }

    for (const [j, sharedCount] of candidateSharedCounts.entries()) {
      if (sharedCount < minDeclarations) continue;
      const b = preparedRules[j]!;

      // Skip if exactly the same selector in same file (handled by duplicate selectors)
      if (a.rule.file === b.rule.file && a.rule.selector === b.rule.selector) continue;

      // Skip if 100% identical declarations (handled by duplicate rules)
      if (sharedCount === a.size && sharedCount === b.size) continue;

      // Quick theoretical ceiling check
      const maxPossibleUnion = a.size + b.size - sharedCount;
      const maxPossibleSimilarity = Math.round((sharedCount / maxPossibleUnion) * 100);
      if (maxPossibleSimilarity < thresholdPercent) continue;

      const pairKey = `${a.rule.file}:${a.rule.line}<->${b.rule.file}:${b.rule.line}`;
      if (seenPairs.has(pairKey)) continue;

      const common: string[] = [];
      const uniqueA: string[] = [];
      for (const decl of a.declArray) {
        if (b.declSet.has(decl)) {
          common.push(decl);
        } else {
          uniqueA.push(decl);
        }
      }

      const uniqueB: string[] = [];
      for (const decl of b.declArray) {
        if (!a.declSet.has(decl)) {
          uniqueB.push(decl);
        }
      }

      const unionSize = a.size + b.size - common.length;
      if (unionSize === 0) continue;
      const similarity = Math.round((common.length / unionSize) * 100);

      // Report if high similarity but NOT 100% identical
      if (similarity >= thresholdPercent && similarity < 100 && common.length >= minDeclarations) {
        seenPairs.add(pairKey);
        comparisons.push({
          similarity,
          commonDeclarations: common,
          left: {
            file: a.rule.file,
            line: a.rule.line,
            selector: a.rule.selector,
            uniqueDeclarations: uniqueA
          },
          right: {
            file: b.rule.file,
            line: b.rule.line,
            selector: b.rule.selector,
            uniqueDeclarations: uniqueB
          }
        });
      }
    }
  }

  return comparisons;
}

export function detectLongValues(
  rules: readonly ParsedCssRule[],
  lengthThreshold: number
): LongValueGroup[] {
  const occurrencesByVal = new Map<string, LongValueOccurrence[]>();

  for (const rule of rules) {
    for (const decl of rule.declarations) {
      const val = decl.value.trim();
      if (val.length >= lengthThreshold && !val.includes('var(') && !val.startsWith('$')) {
        const occ: LongValueOccurrence = {
          file: rule.file,
          line: decl.line,
          prop: decl.prop,
          selector: rule.selector
        };
        const existing = occurrencesByVal.get(val);
        if (existing) {
          existing.push(occ);
        } else {
          occurrencesByVal.set(val, [occ]);
        }
      }
    }
  }

  const results: LongValueGroup[] = [];
  for (const [value, occurrences] of occurrencesByVal.entries()) {
    if (occurrences.length >= 2) {
      results.push({
        value,
        length: value.length,
        occurrences
      });
    }
  }

  return results;
}

export function detectUnvariabledColors(
  rules: readonly ParsedCssRule[]
): ColorGroup[] {
  const occurrencesByColor = new Map<string, ColorOccurrence[]>();

  for (const rule of rules) {
    for (const decl of rule.declarations) {
      const val = decl.value.trim();
      // Ignore if value is already a variable definition or uses var()
      if (decl.prop.startsWith('$') || decl.prop.startsWith('--') || val.includes('var(')) continue;

      COLOR_REGEX.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = COLOR_REGEX.exec(val)) !== null) {
        const color = match[0].toLowerCase();
        // Ignore transparent or inherit
        if (color === 'transparent' || color === 'currentcolor') continue;

        const occ: ColorOccurrence = {
          file: rule.file,
          line: decl.line,
          prop: decl.prop,
          selector: rule.selector
        };
        const existing = occurrencesByColor.get(color);
        if (existing) {
          existing.push(occ);
        } else {
          occurrencesByColor.set(color, [occ]);
        }
      }
    }
  }

  const results: ColorGroup[] = [];
  for (const [color, occurrences] of occurrencesByColor.entries()) {
    // Only flag colors repeated across 3 or more rules without a theme token
    if (occurrences.length >= 3) {
      results.push({
        color,
        occurrences
      });
    }
  }

  return results;
}

export function detectDuplicateSelectors(
  rules: readonly ParsedCssRule[]
): DuplicateSelectorGroup[] {
  const linesByFileSelector = new Map<string, { selector: string; file: string; lines: number[] }>();

  for (const rule of rules) {
    const key = `${rule.file}:::${rule.selector}`;
    const existing = linesByFileSelector.get(key);
    if (existing) {
      existing.lines.push(rule.line);
    } else {
      linesByFileSelector.set(key, {
        selector: rule.selector,
        file: rule.file,
        lines: [rule.line]
      });
    }
  }

  const results: DuplicateSelectorGroup[] = [];
  for (const entry of linesByFileSelector.values()) {
    if (entry.lines.length >= 2) {
      results.push(entry);
    }
  }

  return results;
}

export function detectEmptyRules(
  rules: readonly ParsedCssRule[]
): EmptyRuleRecord[] {
  const empty: EmptyRuleRecord[] = [];
  for (const rule of rules) {
    if (rule.declarations.length === 0) {
      empty.push({
        selector: rule.selector,
        file: rule.file,
        line: rule.line
      });
    }
  }
  return empty;
}

export async function detectUnusedClasses(
  rules: readonly ParsedCssRule[],
  projectRoot: string
): Promise<UnusedClassRecord[]> {
  const classNames = new Set<string>();
  const classRules: Array<{ name: string; file: string; line: number }> = [];

  for (const rule of rules) {
    const matches = rule.selector.match(/\.([a-zA-Z0-9_-]+)/g);
    if (matches) {
      for (const m of matches) {
        const cls = m.slice(1);
        classNames.add(cls);
        classRules.push({ name: cls, file: rule.file, line: rule.line });
      }
    }
  }

  if (classNames.size === 0) return [];

  // Search templates and script files for class references
  const usedTokens = new Set<string>();
  const pattern = '**/*.{vue,html,ts,js,tsx,jsx}';
  const searchDir = path.resolve(projectRoot, 'src');

  try {
    for await (const entry of fs.glob(pattern, { cwd: searchDir })) {
      const fullPath = path.join(searchDir, entry);
      const text = await fs.readFile(fullPath, 'utf-8');
      const tokens = text.match(/[a-zA-Z0-9_-]+/g);
      if (tokens) {
        for (const t of tokens) usedTokens.add(t);
      }
    }
  } catch {
    // catch-ok: Ignore template scanning errors
  }

  const unused: UnusedClassRecord[] = [];
  for (const cr of classRules) {
    if (!usedTokens.has(cr.name)) {
      unused.push({
        className: cr.name,
        file: cr.file,
        line: cr.line
      });
    }
  }

  return unused;
}

export type CssProgressCallback = (step: number, total: number, checkName: string, count: number) => void;

export async function runCssAnalysis(
  targetDir = '.',
  ignoreDirs: ReadonlySet<string>,
  options: CssAnalysisOptions = {},
  projectRoot: string = process.cwd(),
  onProgress?: CssProgressCallback
): Promise<{ violations: Violation[]; details: CssAnalysisDetails; filesScanned: number }> {
  const opt: Required<CssAnalysisOptions> = { ...DEFAULT_OPTIONS, ...options };
  const { rules, fileCount } = await collectAllProjectCssRules(targetDir, ignoreDirs, projectRoot);

  const duplicates = detectDuplicateRules(rules, opt.minDeclarations);
  onProgress?.(1, 7, 'Reglas duplicadas en estilos', duplicates.length);

  const similar = opt.checkSimilar ? detectSimilarClasses(rules, opt.similarityThreshold, opt.minDeclarations) : [];
  const simPct = opt.similarityThreshold > 1 ? opt.similarityThreshold : Math.round(opt.similarityThreshold * 100);
  onProgress?.(2, 7, `Clases similares (umbral >= ${simPct}%)`, similar.length);

  const longValues = opt.checkLongLines ? detectLongValues(rules, opt.longLineLengthThreshold) : [];
  onProgress?.(3, 7, `Valores largos repetidos (>= ${opt.longLineLengthThreshold} chars)`, longValues.length);

  const unvariabledColors = opt.checkColors ? detectUnvariabledColors(rules) : [];
  onProgress?.(4, 7, 'Colores repetidos sin variable', unvariabledColors.length);

  const duplicateSelectors = opt.checkDuplicateSelectors ? detectDuplicateSelectors(rules) : [];
  onProgress?.(5, 7, 'Selectores duplicados en mismo archivo', duplicateSelectors.length);

  const emptyRules = opt.checkEmptyRules ? detectEmptyRules(rules) : [];
  onProgress?.(6, 7, 'Bloques y reglas vacías', emptyRules.length);

  const unusedClasses = opt.checkUnused ? await detectUnusedClasses(rules, projectRoot) : [];
  onProgress?.(7, 7, 'Clases de estilos sin uso en plantillas', unusedClasses.length);

  const violations: Violation[] = [];

  // 1. Duplicate Rules -> severity: error
  for (const dup of duplicates) {
    const first = dup.occurrences[0]!;
    const others = dup.occurrences.slice(1).map(o => `${o.selector} (${o.file}:${o.line})`).join(', ');
    violations.push({
      file: path.resolve(projectRoot, first.file),
      line: first.line,
      message: `SCSS/CSS duplicado: Selector '${first.selector}' coincide exactamente con ${dup.occurrences.length} reglas idénticas: ${others}`,
      context: `duplicación css (${dup.occurrences.length} lugares: ${dup.declarations.slice(0, 3).join('; ')})`,
      severity: 'error',
      fixable: false
    });
  }

  // 2. Similar Classes -> severity: warning
  for (const sim of similar) {
    violations.push({
      file: path.resolve(projectRoot, sim.left.file),
      line: sim.left.line,
      message: `Clases CSS similares (${sim.similarity}%): '${sim.left.selector}' y '${sim.right.selector}' (${sim.right.file}:${sim.right.line}) comparten ${sim.commonDeclarations.length} propiedades`,
      context: `similitud css (${sim.similarity}%: ${sim.commonDeclarations.slice(0, 2).join('; ')})`,
      severity: 'warning',
      fixable: false
    });
  }

  // 3. Long Values -> severity: warning
  for (const lv of longValues) {
    const first = lv.occurrences[0]!;
    violations.push({
      file: path.resolve(projectRoot, first.file),
      line: first.line,
      message: `Valor CSS largo duplicado (${lv.length} chars) en ${lv.occurrences.length} lugares: '${lv.value.slice(0, 35)}...'. Extraer a variable.`,
      context: `valor largo duplicado (${lv.occurrences.length} lugares)`,
      severity: 'warning',
      fixable: false
    });
  }

  // 4. Unvariabled Colors -> severity: warning
  for (const uc of unvariabledColors) {
    const first = uc.occurrences[0]!;
    violations.push({
      file: path.resolve(projectRoot, first.file),
      line: first.line,
      message: `Color repetido sin variable (${uc.color}) en ${uc.occurrences.length} reglas. Utilizar variable de tema o token.`,
      context: `color sin variable (${uc.occurrences.length} lugares)`,
      severity: 'warning',
      fixable: false
    });
  }

  // 5. Duplicate Selectors -> severity: error
  for (const ds of duplicateSelectors) {
    violations.push({
      file: path.resolve(projectRoot, ds.file),
      line: ds.lines[0]!,
      message: `Selector duplicado '${ds.selector}' definido ${ds.lines.length} veces en el mismo archivo (líneas ${ds.lines.join(', ')})`,
      context: `selector repetido (${ds.lines.length} veces)`,
      severity: 'error',
      fixable: false
    });
  }

  // 6. Empty Rules -> severity: warning
  for (const er of emptyRules) {
    violations.push({
      file: path.resolve(projectRoot, er.file),
      line: er.line,
      message: `Bloque CSS vacío para selector '${er.selector}'. Eliminar regla o agregar declaraciones.`,
      context: `regla css vacía`,
      severity: 'warning',
      fixable: false
    });
  }

  // 7. Unused Classes -> severity: warning
  for (const uc of unusedClasses) {
    violations.push({
      file: path.resolve(projectRoot, uc.file),
      line: uc.line,
      message: `Clase CSS '${uc.className}' no encontrada en componentes ni plantillas del proyecto`,
      context: `clase css huérfana`,
      severity: 'warning',
      fixable: false
    });
  }

  const details: CssAnalysisDetails = {
    duplicates,
    similar,
    longValues,
    unvariabledColors,
    duplicateSelectors,
    emptyRules,
    unusedClasses
  };

  return { violations, details, filesScanned: fileCount };
}

/**
 * Backward compatibility wrapper returning canonical Violation[]
 */
export async function runCssChecker(
  targetDir = '.',
  ignoreDirs: ReadonlySet<string>,
  options?: CssAnalysisOptions,
  projectRoot?: string
): Promise<Violation[]> {
  const result = await runCssAnalysis(targetDir, ignoreDirs, options, projectRoot);
  return result.violations;
}

/**
 * src/analyzers/webPerfModernAnalyzer.ts
 *
 * AST-DRIVEN CORE WEB VITALS & FRONTEND PERFORMANCE ANALYZER (Node.js 26+ Native)
 *
 * Inspects HTML / Vue <template> DOM trees via JSDOM (`includeNodeLocations: true`)
 * and CSS / SCSS AST blocks via `parseScssBlockNodes`, providing deterministic
 * auto-repairs via MagicString.
 */

import type { JSDOM } from 'jsdom';
import MagicString from 'magic-string';

import {
  type JsdomElementLocation,
  computeRawLineOffsets,
  getAttrLocation,
  parseDomWithLocations
} from './modernDomAstUtils.ts';
import { parseScssBlockNodes, type ScssAstRuleNode } from './scssModernAnalyzer.ts';

export const MODERN_WEB_PERF_RULES = [
  'perf-lcp-lazy-conflict',
  'perf-font-preload-crossorigin',
  'perf-srcset-missing-sizes',
  'perf-content-visibility-intrinsic-size'
] as const;

export type ModernWebPerfRuleId = (typeof MODERN_WEB_PERF_RULES)[number];

export interface ModernWebPerfFinding {
  readonly ruleId: ModernWebPerfRuleId;
  readonly line: number;
  readonly message: string;
  readonly fixable: boolean;
}

export interface ModernWebPerfAnalysisResult {
  readonly findings: readonly ModernWebPerfFinding[];
  readonly fixedContent?: string;
}

const INTRINSIC_SIZE_PROPS: ReadonlySet<string> = new Set([
  // runtime-set: Fast O(1) membership lookup set
  'contain-intrinsic-size',
  'contain-intrinsic-block-size',
  'contain-intrinsic-height'
]);

function checkLcpLazyConflict(
  doc: Document,
  dom: JSDOM,
  markup: string,
  lineOffset: number,
  ms: MagicString | null,
  findings: ModernWebPerfFinding[]
): boolean {
  let mutated = false;
  const images = doc.querySelectorAll('img');
  for (const img of images) {
    const loading = img.getAttribute('loading')?.toLowerCase();
    const priority = img.getAttribute('fetchpriority')?.toLowerCase();
    if (loading !== 'lazy' || priority !== 'high') continue;

    const loc = dom.nodeLocation(img) as JsdomElementLocation | null;
    const loadingLoc = getAttrLocation(loc, 'loading');
    const line = lineOffset + (loadingLoc?.startLine ?? loc?.startLine ?? 1) - 1;

    findings.push({
      ruleId: 'perf-lcp-lazy-conflict',
      line,
      message:
        'Element <img> combines loading="lazy" with fetchpriority="high", delaying LCP resource discovery.',
      fixable: Boolean(loadingLoc)
    });

    if (ms && loadingLoc) {
      const removeStart =
        loadingLoc.startOffset > 0 && /\s/.test(markup[loadingLoc.startOffset - 1] ?? '')
          ? loadingLoc.startOffset - 1
          : loadingLoc.startOffset;
      ms.remove(removeStart, loadingLoc.endOffset);
      mutated = true;
    }
  }
  return mutated;
}

function checkFontPreloadCrossorigin(
  doc: Document,
  dom: JSDOM,
  markup: string,
  lineOffset: number,
  ms: MagicString | null,
  findings: ModernWebPerfFinding[]
): boolean {
  let mutated = false;
  const links = doc.querySelectorAll('link[rel="preload"]');
  for (const link of links) {
    const asAttr = link.getAttribute('as')?.toLowerCase();
    if (asAttr !== 'font') continue;
    if (link.hasAttribute('crossorigin')) continue;

    const loc = dom.nodeLocation(link) as JsdomElementLocation | null;
    const startTag = loc?.startTag;
    const line = lineOffset + (startTag?.startLine ?? loc?.startLine ?? 1) - 1;

    findings.push({
      ruleId: 'perf-font-preload-crossorigin',
      line,
      message:
        '<link rel="preload" as="font"> omits crossorigin attribute, causing the browser to download the font twice.',
      fixable: Boolean(startTag)
    });

    if (ms && startTag) {
      ms.appendLeft(startTag.startOffset + 5, ' crossorigin="anonymous"');
      const fpLoc = getAttrLocation(loc, 'fetchpriority');
      if (fpLoc && link.getAttribute('fetchpriority')?.toLowerCase() === 'high') {
        const removeStart =
          fpLoc.startOffset > 0 && /\s/.test(markup[fpLoc.startOffset - 1] ?? '')
            ? fpLoc.startOffset - 1
            : fpLoc.startOffset;
        ms.remove(removeStart, fpLoc.endOffset);
      }
      mutated = true;
    }
  }
  return mutated;
}

function checkSrcsetMissingSizes(
  doc: Document,
  dom: JSDOM,
  lineOffset: number,
  ms: MagicString | null,
  findings: ModernWebPerfFinding[]
): boolean {
  let mutated = false;
  const elements = doc.querySelectorAll('img[srcset], source[srcset]');
  for (const el of elements) {
    const srcset = el.getAttribute('srcset') ?? '';
    const hasWidthDescriptor = /\b\d+w\b/.test(srcset);
    if (!hasWidthDescriptor) continue;

    const hasSizes =
      el.hasAttribute('sizes') || el.hasAttribute(':sizes') || el.hasAttribute('v-bind:sizes');
    if (hasSizes) continue;

    // For <source> inside <picture>, skip if the sibling <img> defines sizes
    if (el.tagName.toLowerCase() === 'source' && el.parentElement?.querySelector('img[sizes]')) {
      continue;
    }

    const loc = dom.nodeLocation(el) as JsdomElementLocation | null;
    const startTag = loc?.startTag;
    const line = lineOffset + (startTag?.startLine ?? loc?.startLine ?? 1) - 1;
    const tagLower = el.tagName.toLowerCase();

    findings.push({
      ruleId: 'perf-srcset-missing-sizes',
      line,
      message: `<${tagLower}> uses width descriptors in srcset without a sizes attribute, forcing 100vw image downloads.`,
      fixable: Boolean(startTag)
    });

    if (ms && startTag) {
      const isLazy = el.getAttribute('loading')?.toLowerCase() === 'lazy';
      const defaultSizes = isLazy ? ' sizes="auto"' : ' sizes="100vw"';
      ms.appendLeft(startTag.startOffset + tagLower.length + 1, defaultSizes);
      mutated = true;
    }
  }
  return mutated;
}

export function analyzeModernWebPerfMarkup(
  markupContent: string,
  lineOffset: number,
  enableFix: boolean
): ModernWebPerfAnalysisResult {
  const dom = parseDomWithLocations(markupContent);
  const doc = dom.window.document;
  const ms = enableFix ? new MagicString(markupContent) : null;
  const findings: ModernWebPerfFinding[] = [];

  const m1 = checkLcpLazyConflict(doc, dom, markupContent, lineOffset, ms, findings);
  const m2 = checkFontPreloadCrossorigin(doc, dom, markupContent, lineOffset, ms, findings);
  const m3 = checkSrcsetMissingSizes(doc, dom, lineOffset, ms, findings);

  return {
    findings,
    fixedContent: (m1 || m2 || m3) && ms ? ms.toString() : undefined
  };
}

function walkCssRules(
  nodes: readonly ScssAstRuleNode[],
  visitor: (rule: ScssAstRuleNode) => void
): void {
  for (const node of nodes) {
    visitor(node);
    if (node.children.length > 0) {
      walkCssRules(node.children, visitor);
    }
  }
}

export function analyzeModernWebPerfStyles(
  styleContent: string,
  lineOffset: number,
  enableFix: boolean
): ModernWebPerfAnalysisResult {
  const rootBlock = parseScssBlockNodes(
    styleContent,
    0,
    styleContent.length,
    computeRawLineOffsets(styleContent)
  );
  const findings: ModernWebPerfFinding[] = [];
  let mutated = false;
  const ms = enableFix ? new MagicString(styleContent) : null;

  walkCssRules(rootBlock.children, (rule) => {
    const cvDecl = rule.declarations.find(
      (d) => d.prop === 'content-visibility' && d.value.trim().toLowerCase().startsWith('auto')
    );
    if (!cvDecl) return;

    const hasIntrinsicSize = rule.declarations.some((d) => INTRINSIC_SIZE_PROPS.has(d.prop));
    if (hasIntrinsicSize) return;

    findings.push({
      ruleId: 'perf-content-visibility-intrinsic-size',
      line: lineOffset + cvDecl.line - 1,
      message:
        'CSS rule sets content-visibility: auto without contain-intrinsic-size, causing offscreen height collapse and scrollbar jumping.',
      fixable: true
    });

    if (ms) {
      ms.appendRight(cvDecl.endOffset, ' contain-intrinsic-size: auto 500px;');
      mutated = true;
    }
  });

  return {
    findings,
    fixedContent: mutated && ms ? ms.toString() : undefined
  };
}

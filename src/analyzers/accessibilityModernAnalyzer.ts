/**
 * src/analyzers/accessibilityModernAnalyzer.ts
 *
 * DOM AST ACCESSIBILITY & FORM SEMANTICS ANALYZER (Node.js 26+ Native)
 *
 * Inspects HTML and Vue SFC <template> markup using JSDOM with source code
 * location tracking (`includeNodeLocations: true`) and applies surgical
 * auto-repairs via MagicString without regex tag parsing traps.
 */

import type { JSDOM } from 'jsdom';
import MagicString from 'magic-string';
import ts from 'typescript';

import {
  type JsdomElementLocation,
  getAttrLocation,
  parseDomWithLocations
} from './modernDomAstUtils.ts';

export const MODERN_ACCESSIBILITY_RULES = [
  'a11y-no-positive-tabindex',
  'a11y-no-aria-hidden-focusable',
  'a11y-svg-accessibility',
  'a11y-iframe-title-and-scroll',
  'forms-identifier-input-type',
  'forms-autocomplete-hygiene',
  'html-dialog-popover-exclusivity'
] as const;

export type ModernAccessibilityRuleId = (typeof MODERN_ACCESSIBILITY_RULES)[number];

export interface ModernA11yFinding {
  readonly ruleId: ModernAccessibilityRuleId;
  readonly line: number;
  readonly message: string;
  readonly context: string;
  readonly fixable: boolean;
}

export interface ModernA11yAnalysisResult {
  readonly findings: readonly ModernA11yFinding[];
  readonly fixedContent?: string;
}

const NATIVE_INTERACTIVE_FORM_TAGS: ReadonlySet<string> = new Set([
  // runtime-set: Fast O(1) membership lookup set
  'button',
  'select',
  'textarea'
]);

const IDENTIFIER_INPUT_TOKEN_REGEX =
  /(?:^|[-_.\s])(?:postal[-_]?code|zip[-_]?code|zip|cc[-_]?number|card[-_]?number|tel|phone|telefono|celular|otp|one[-_]?time[-_]?code|dni|cuit|cuil|cbu)(?:$|[-_.\s])/i;

function extractElementContext(
  template: string,
  loc: JsdomElementLocation | null | undefined
): string {
  if (!loc) return '';
  const start = loc.startTag?.startOffset ?? loc.startOffset;
  const end = loc.startTag?.endOffset ?? Math.min(loc.endOffset, start + 120);
  return template.slice(start, end).replace(/\s+/g, ' ').trim();
}

function hasDynamicOrStaticAttr(el: Element, name: string): boolean {
  return el.hasAttribute(name) || el.hasAttribute(`:${name}`) || el.hasAttribute(`v-bind:${name}`);
}

function checkPositiveTabindex(
  doc: Document,
  dom: JSDOM,
  template: string,
  lineOffset: number,
  ms: MagicString | null,
  findings: ModernA11yFinding[]
): boolean {
  let mutated = false;
  const elements = doc.querySelectorAll('[tabindex]');
  for (const el of elements) {
    const rawVal = el.getAttribute('tabindex')?.trim() ?? '';
    if (!/^\d+$/.test(rawVal)) continue;
    const num = Number.parseInt(rawVal, 10);
    if (num <= 0) continue;

    const loc = dom.nodeLocation(el) as JsdomElementLocation | null;
    const attrLoc = getAttrLocation(loc, 'tabindex');
    const line = lineOffset + (attrLoc?.startLine ?? loc?.startLine ?? 1) - 1;

    findings.push({
      ruleId: 'a11y-no-positive-tabindex',
      line,
      message: `Positive tabindex="${num}" disrupts natural DOM keyboard focus order (WCAG 2.4.3). Use tabindex="0" or "-1".`,
      context: extractElementContext(template, loc),
      fixable: Boolean(attrLoc)
    });

    if (ms && attrLoc) {
      ms.overwrite(attrLoc.startOffset, attrLoc.endOffset, 'tabindex="0"');
      mutated = true;
    }
  }
  return mutated;
}

function isFocusableElement(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (el.hasAttribute('disabled') || el.hasAttribute(':disabled')) return false;
  const tabIndex = el.getAttribute('tabindex')?.trim();
  if (tabIndex === '-1') return false;

  if (NATIVE_INTERACTIVE_FORM_TAGS.has(tag)) return true;
  if (tag === 'a') return hasDynamicOrStaticAttr(el, 'href');
  if (tag === 'input') {
    const rawType = el.getAttribute('type');
    return !rawType || rawType.toLowerCase() !== 'hidden';
  }
  return tabIndex !== undefined && tabIndex !== '';
}

function checkAriaHiddenOnFocusable(
  doc: Document,
  dom: JSDOM,
  template: string,
  lineOffset: number,
  ms: MagicString | null,
  findings: ModernA11yFinding[]
): boolean {
  let mutated = false;
  const elements = doc.querySelectorAll('[aria-hidden="true"]');
  for (const el of elements) {
    if (!isFocusableElement(el)) continue;

    const loc = dom.nodeLocation(el) as JsdomElementLocation | null;
    const attrLoc = getAttrLocation(loc, 'aria-hidden');
    const line = lineOffset + (attrLoc?.startLine ?? loc?.startLine ?? 1) - 1;

    findings.push({
      ruleId: 'a11y-no-aria-hidden-focusable',
      line,
      message: `Focusable <${el.tagName.toLowerCase()}> has aria-hidden="true", creating a keyboard focus trap invisible to assistive tech (WCAG 4.1.2).`,
      context: extractElementContext(template, loc),
      fixable: Boolean(attrLoc)
    });

    if (ms && attrLoc) {
      const removeStart =
        attrLoc.startOffset > 0 && /\s/.test(template[attrLoc.startOffset - 1] ?? '')
          ? attrLoc.startOffset - 1
          : attrLoc.startOffset;
      ms.remove(removeStart, attrLoc.endOffset);
      mutated = true;
    }
  }
  return mutated;
}

const SVG_DEFINITION_ONLY_TAGS: ReadonlySet<string> = new Set([
  // runtime-set: Fast O(1) membership lookup set
  'defs',
  'symbol',
  'filter',
  'lineargradient',
  'radialgradient',
  'clippath',
  'mask',
  'pattern',
  'style'
]);

function isNonVisualOrInteractiveSvgCanvas(svg: Element): boolean {
  if (svg.getAttribute('width') === '0' && svg.getAttribute('height') === '0') {
    return true;
  }
  const styleAttr = (svg.getAttribute('style') ?? '').toLowerCase();
  if (styleAttr.includes('visibility: hidden') || styleAttr.includes('display: none')) {
    return true;
  }

  const children = [...svg.children];
  if (
    children.length > 0 &&
    children.every((child) => SVG_DEFINITION_ONLY_TAGS.has(child.tagName.toLowerCase()))
  ) {
    return true;
  }

  if (svg.querySelector('text, foreignObject, a, button, [tabindex]')) {
    return true;
  }
  const allNodes = [svg, ...svg.querySelectorAll('*')];
  for (const node of allNodes) {
    for (const attr of node.getAttributeNames()) {
      if (
        attr.startsWith('@click') ||
        attr.startsWith('@pointer') ||
        attr.startsWith('@mouse') ||
        attr.startsWith('v-on:click') ||
        attr.startsWith('v-on:pointer')
      ) {
        return true;
      }
    }
  }

  return false;
}

function isSvgAccessibleOrDecorative(svg: Element): boolean {
  if (isNonVisualOrInteractiveSvgCanvas(svg)) return true;
  if (hasDynamicOrStaticAttr(svg, 'aria-hidden')) return true;
  const role = svg.getAttribute('role')?.toLowerCase();
  if (role === 'presentation' || role === 'none') return true;
  if (hasDynamicOrStaticAttr(svg, 'aria-label') || hasDynamicOrStaticAttr(svg, 'aria-labelledby')) {
    return true;
  }
  const titleEl = svg.querySelector('title, desc');
  return titleEl !== null && (titleEl.textContent?.trim().length ?? 0) > 0;
}

const INTERACTIVE_CONTAINER_TAGS_LIST = ['button', 'a', 'label'] as const;
export type InteractiveContainerTag = (typeof INTERACTIVE_CONTAINER_TAGS_LIST)[number];
const INTERACTIVE_CONTAINER_TAGS: ReadonlySet<string> = new Set<InteractiveContainerTag>(
  INTERACTIVE_CONTAINER_TAGS_LIST
); // runtime-set: Fast O(1) membership lookup set

function isInsideInteractiveOrLabelledElement(el: Element): boolean {
  let curr = el.parentElement;
  while (curr) {
    const tag = curr.tagName.toLowerCase();
    if (INTERACTIVE_CONTAINER_TAGS.has(tag)) {
      return true;
    }
    if (
      curr.hasAttribute('aria-label') ||
      curr.hasAttribute(':aria-label') ||
      curr.hasAttribute('title') ||
      curr.hasAttribute(':title')
    ) {
      return true;
    }
    curr = curr.parentElement;
  }
  return false;
}

function checkSvgAccessibility(
  doc: Document,
  dom: JSDOM,
  template: string,
  lineOffset: number,
  ms: MagicString | null,
  findings: ModernA11yFinding[]
): boolean {
  let mutated = false;
  const svgs = doc.querySelectorAll('svg');
  for (const svg of svgs) {
    if (isSvgAccessibleOrDecorative(svg)) continue;

    const loc = dom.nodeLocation(svg) as JsdomElementLocation | null;
    const startTag = loc?.startTag;
    const line = lineOffset + (startTag?.startLine ?? loc?.startLine ?? 1) - 1;
    const isEnclosedByInteractive = isInsideInteractiveOrLabelledElement(svg);

    findings.push({
      ruleId: 'a11y-svg-accessibility',
      line,
      message:
        'Inline <svg> lacks aria-hidden="true" (for decorative icons) or role="img" with accessible <title>/aria-label (WCAG 1.1.1).',
      context: extractElementContext(template, loc),
      fixable: Boolean(startTag && isEnclosedByInteractive)
    });

    if (ms && startTag && isEnclosedByInteractive) {
      const insertPos = startTag.startOffset + 4; // Right after `<svg`
      ms.appendLeft(insertPos, ' aria-hidden="true"');
      mutated = true;
    }
  }
  return mutated;
}

function checkIframeAccessibility(
  doc: Document,
  dom: JSDOM,
  template: string,
  lineOffset: number,
  ms: MagicString | null,
  findings: ModernA11yFinding[]
): boolean {
  let mutated = false;
  const iframes = doc.querySelectorAll('iframe');
  for (const iframe of iframes) {
    if (iframe.getAttribute('aria-hidden') === 'true') continue;
    const loc = dom.nodeLocation(iframe) as JsdomElementLocation | null;
    const line = lineOffset + (loc?.startLine ?? 1) - 1;

    const titleVal = iframe.getAttribute('title')?.trim();
    const hasTitle =
      (titleVal !== undefined && titleVal.length > 0) ||
      iframe.hasAttribute(':title') ||
      iframe.hasAttribute('v-bind:title') ||
      hasDynamicOrStaticAttr(iframe, 'aria-label');

    const scrollingAttr = iframe.getAttribute('scrolling')?.toLowerCase();
    const hasScrollingNo = scrollingAttr === 'no';
    const scrollingLoc = getAttrLocation(loc, 'scrolling');

    if (!hasTitle || hasScrollingNo) {
      findings.push({
        ruleId: 'a11y-iframe-title-and-scroll',
        line,
        message: hasScrollingNo
          ? 'Element <iframe> uses deprecated scrolling="no" which blocks content reflow on 200% zoom (WCAG 1.4.10).'
          : 'Element <iframe> is missing a descriptive title attribute for screen readers (WCAG 2.4.1 / 4.1.2).',
        context: extractElementContext(template, loc),
        fixable: hasScrollingNo && Boolean(scrollingLoc)
      });

      if (ms && hasScrollingNo && scrollingLoc) {
        const removeStart =
          scrollingLoc.startOffset > 0 && /\s/.test(template[scrollingLoc.startOffset - 1] ?? '')
            ? scrollingLoc.startOffset - 1
            : scrollingLoc.startOffset;
        ms.remove(removeStart, scrollingLoc.endOffset);
        mutated = true;
      }
    }
  }
  return mutated;
}

function checkFormIdentifierInputs(
  doc: Document,
  dom: JSDOM,
  template: string,
  lineOffset: number,
  ms: MagicString | null,
  findings: ModernA11yFinding[]
): boolean {
  let mutated = false;
  const numberInputs = doc.querySelectorAll('input[type="number"]');
  for (const input of numberInputs) {
    const candidateTokens = [
      input.getAttribute('name') ?? '',
      input.getAttribute('id') ?? '',
      input.getAttribute('autocomplete') ?? '',
      input.getAttribute('v-model') ?? ''
    ].join(' ');

    if (!IDENTIFIER_INPUT_TOKEN_REGEX.test(candidateTokens)) continue;

    const loc = dom.nodeLocation(input) as JsdomElementLocation | null;
    const typeLoc = getAttrLocation(loc, 'type');
    const line = lineOffset + (typeLoc?.startLine ?? loc?.startLine ?? 1) - 1;
    const hasInputMode = hasDynamicOrStaticAttr(input, 'inputmode');

    findings.push({
      ruleId: 'forms-identifier-input-type',
      line,
      message:
        'Identifier/code input uses type="number" (strips leading zeros and enables scroll-wheel mutation). Use type="text" inputmode="numeric".',
      context: extractElementContext(template, loc),
      fixable: Boolean(typeLoc)
    });

    if (ms && typeLoc) {
      const replacement = hasInputMode ? 'type="text"' : 'type="text" inputmode="numeric"';
      ms.overwrite(typeLoc.startOffset, typeLoc.endOffset, replacement);
      mutated = true;
    }
  }
  return mutated;
}

function checkFormAutocompleteHygiene(
  doc: Document,
  dom: JSDOM,
  template: string,
  lineOffset: number,
  ms: MagicString | null,
  findings: ModernA11yFinding[]
): boolean {
  let mutated = false;
  const inputs = doc.querySelectorAll('input[autocomplete="off"]');
  for (const input of inputs) {
    const rawType = input.getAttribute('type');
    if (!rawType) continue;
    const type = rawType.toLowerCase();
    if (type !== 'password' && type !== 'email') continue;

    const loc = dom.nodeLocation(input) as JsdomElementLocation | null;
    const autoLoc = getAttrLocation(loc, 'autocomplete');
    const line = lineOffset + (autoLoc?.startLine ?? loc?.startLine ?? 1) - 1;
    const targetAuto = type === 'password' ? 'current-password' : 'email';

    findings.push({
      ruleId: 'forms-autocomplete-hygiene',
      line,
      message: `Authentication <input type="${type}"> sets autocomplete="off", blocking password managers and passkeys. Use autocomplete="${targetAuto}".`,
      context: extractElementContext(template, loc),
      fixable: Boolean(autoLoc)
    });

    if (ms && autoLoc) {
      ms.overwrite(autoLoc.startOffset, autoLoc.endOffset, `autocomplete="${targetAuto}"`);
      mutated = true;
    }
  }
  return mutated;
}

function hasShowModalCallInAst(sf: ts.SourceFile): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'showModal'
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

function checkDialogPopoverAndSummarySemantics(
  doc: Document,
  dom: JSDOM,
  template: string,
  scriptAst: ts.SourceFile | undefined,
  lineOffset: number,
  findings: ModernA11yFinding[]
): void {
  const dialogsWithPopover = doc.querySelectorAll('dialog[popover]');
  const hasShowModal = scriptAst ? hasShowModalCallInAst(scriptAst) : false;
  if (dialogsWithPopover.length > 0 && hasShowModal) {
    for (const dlg of dialogsWithPopover) {
      const loc = dom.nodeLocation(dlg) as JsdomElementLocation | null;
      const line = lineOffset + (loc?.startLine ?? 1) - 1;
      findings.push({
        ruleId: 'html-dialog-popover-exclusivity',
        line,
        message:
          'Element <dialog> combines the [popover] attribute with .showModal(). Use either modal <dialog> or non-modal [popover], never both.',
        context: extractElementContext(template, loc),
        fixable: false
      });
    }
  }

  const summaries = doc.querySelectorAll('summary');
  for (const summary of summaries) {
    const forbiddenChild = summary.querySelector(
      'button, a[href], input, select, textarea, h1, h2, h3, h4, h5, h6'
    );
    if (!forbiddenChild) continue;

    const loc = dom.nodeLocation(summary) as JsdomElementLocation | null;
    const line = lineOffset + (loc?.startLine ?? 1) - 1;
    findings.push({
      ruleId: 'html-dialog-popover-exclusivity',
      line,
      message: `<summary> contains nested <${forbiddenChild.tagName.toLowerCase()}> which breaks disclosure semantics and click targets.`,
      context: extractElementContext(template, loc),
      fixable: false
    });
  }
}

export function analyzeModernAccessibility(
  templateContent: string,
  scriptAst: ts.SourceFile | undefined,
  lineOffset: number,
  enableFix: boolean
): ModernA11yAnalysisResult {
  const dom = parseDomWithLocations(templateContent);
  const doc = dom.window.document;
  const ms = enableFix ? new MagicString(templateContent) : null;
  const findings: ModernA11yFinding[] = [];

  const m1 = checkPositiveTabindex(doc, dom, templateContent, lineOffset, ms, findings);
  const m2 = checkAriaHiddenOnFocusable(doc, dom, templateContent, lineOffset, ms, findings);
  const m3 = checkSvgAccessibility(doc, dom, templateContent, lineOffset, ms, findings);
  const m4 = checkIframeAccessibility(doc, dom, templateContent, lineOffset, ms, findings);
  const m5 = checkFormIdentifierInputs(doc, dom, templateContent, lineOffset, ms, findings);
  const m6 = checkFormAutocompleteHygiene(doc, dom, templateContent, lineOffset, ms, findings);
  checkDialogPopoverAndSummarySemantics(doc, dom, templateContent, scriptAst, lineOffset, findings);

  const mutated = m1 || m2 || m3 || m4 || m5 || m6;
  return {
    findings,
    fixedContent: mutated && ms ? ms.toString() : undefined
  };
}

export function fixViewportZoomLockContent(htmlContent: string): string | undefined {
  const dom = parseDomWithLocations(htmlContent);
  const meta = dom.window.document.querySelector('meta[name="viewport"]');
  if (!meta) return undefined;

  const contentAttr = meta.getAttribute('content');
  if (!contentAttr) return undefined;

  const loc = dom.nodeLocation(meta) as JsdomElementLocation | null;
  const contentLoc = getAttrLocation(loc, 'content');
  if (!contentLoc) return undefined;

  const cleanedParts = contentAttr
    .split(',')
    .map((p) => p.trim())
    .filter((p) => {
      if (/^user-scalable\s*=\s*(?:no|0|false)$/i.test(p)) return false;
      const maxMatch = /^maximum-scale\s*=\s*([0-9.]+)$/i.exec(p);
      if (maxMatch && Number.parseFloat(maxMatch[1]!) < 2) return false;
      return p.length > 0;
    });

  const newContentVal = cleanedParts.join(', ');
  if (newContentVal === contentAttr) return undefined;

  const ms = new MagicString(htmlContent);
  ms.overwrite(contentLoc.startOffset, contentLoc.endOffset, `content="${newContentVal}"`);
  return ms.toString();
}

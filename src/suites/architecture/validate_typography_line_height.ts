/**
 * scripts/auditors/architecture/validate_typography_line_height.ts
 *
 * TYPOGRAPHY LINE-HEIGHT & INTERLINEAR SPACING AUDITOR (Node.js 26+ Native)
 *
 * Enforces safe multiline line-height across design system typography:
 *   Anti-Zero Line-Height (`line-height-overlap`): Detects text classes, headings, titles,
 *   descriptions, and multiline labels that declare 'line-height: 1' or 'line-height: 0'.
 *   Fonts with line-height <= 1 collide and overlap vertically when text wraps.
 *
 * Usage:
 *   npm run validate:line-height
 */

import { enableCompileCache } from 'node:module';
import { FileScanAuditor, BaseAuditor,
  createUniformRemediationPhases, createRuleCapabilities, resolveFileScanRoots, type FileScanRootsOptions } from '../../core/auditorBase.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';

enableCompileCache();

export type LineHeightRuleId = 'line-height-overlap';

export const TYPOGRAPHY_LINE_HEIGHT_RULES: readonly LineHeightRuleId[] = ['line-height-overlap'];

const ICON_ELEMENT_REGEX =
  /(?:^|[._-])(?:emoji|icon|arrow|bullet|symbol|glyph|avatar|medal|quote|mark|placeholder|checkmark|star|indicator|infinity|dash|tooltip-wrapper|fx-wrapper|clear|close|dismiss)(?:$|[._-])|(?<![\w-])(?:img|svg|canvas)\b/i;
const TEXT_ELEMENT_REGEX =
  /(?:^|[._-])(?:title|heading|header|caption|desc|description|sub|subtitle|dialogue|name|label|text|body|wrap|item|card|accordion|content|h[1-6]|paragraph|note|message|banner|alert|prompt|phrase|comment|summary|reason|metric|pill|tag)(?:$|[._-])/i;

interface ExtractedStyleBlock {
  readonly content: string;
  readonly startLine: number;
}

function extractStyleBlocks(filePath: string, fileContent: string): ExtractedStyleBlock[] {
  if (filePath.endsWith('.scss') || filePath.endsWith('.css')) {
    return [{ content: fileContent, startLine: 1 }];
  }

  const blocks: ExtractedStyleBlock[] = [];
  const styleTagRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let match: RegExpExecArray | null;

  while ((match = styleTagRegex.exec(fileContent)) !== null) {
    const preContent = fileContent.slice(0, match.index);
    const startLine = preContent.split('\n').length;
    blocks.push({
      content: match[1] || '',
      startLine
    });
  }

  return blocks;
}

function getLeafSelector(fullSelector: string): string {
  const segments = fullSelector
    .split(/[\s>+~]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const last = segments[segments.length - 1] || fullSelector;
  return last.replace(/::?[\w-]+(\([^)]*\))?/g, '').trim();
}

function isEmojiFontContext(lines: readonly string[], currentIndex: number): boolean {
  const start = Math.max(0, currentIndex - 6);
  const end = Math.min(lines.length - 1, currentIndex + 6);
  for (let idx = start; idx <= end; idx++) {
    const l = lines[idx] || '';
    if (
      /font-family\s*:\s*(?:\S.*)?(?:Emoji|Apple Color Emoji|Segoe UI Emoji|Noto Color Emoji)/i.test(
        l
      )
    ) {
      return true;
    }
  }
  return false;
}

interface SelectorFrame {
  selector: string;
}

function updateSelectorStack(trimmed: string, selectorStack: SelectorFrame[]): void {
  if (trimmed.includes('{')) {
    const selectorPart = trimmed.slice(0, trimmed.indexOf('{')).trim();
    if (selectorPart) {
      selectorStack.push({ selector: selectorPart });
    }
  }
}

function popSelectorStack(trimmed: string, selectorStack: SelectorFrame[]): void {
  if (trimmed.includes('}')) {
    const closeCount = (trimmed.match(/\}/g) || []).length;
    for (let c = 0; c < closeCount; c++) {
      selectorStack.pop();
    }
  }
}

function isLineHeightOverlapCandidate(trimmed: string): RegExpMatchArray | null {
  return trimmed.match(/\bline-height\s*:\s*(0|1|0px|1px|1em|1rem)\s*(?:!important\s*)?;/i);
}

function isTextSelectorCandidate(currentSelector: string, leafSelector: string): boolean {
  return (
    TEXT_ELEMENT_REGEX.test(leafSelector) ||
    currentSelector.includes('&__') ||
    currentSelector.includes('.text')
  );
}

export class TypographyLineHeightAuditor extends FileScanAuditor<LineHeightRuleId> {
  private totalRulesChecked = 0;

  constructor(options: FileScanRootsOptions = {}) {
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(
      options,
      (config) => config.paths?.srcRoots ?? []
    );
    super({
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleCapabilities: createRuleCapabilities(TYPOGRAPHY_LINE_HEIGHT_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_typography_line_height',
      name: 'Typography Line-Height & Interlinear Spacing Validator',
      description: 'Detects line-height collisions in multiline typography',
      family: 'architecture',
      ruleIds: TYPOGRAPHY_LINE_HEIGHT_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(TYPOGRAPHY_LINE_HEIGHT_RULES, 'behavior'),
      packageName: 'Typography',
      configKey: 'styles.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '🔤',
      ruleDescriptions: {
        'line-height-overlap': 'Line-height collision'
      },
      ruleRemediations: {
        'line-height-overlap':
          '1. Root Cause:\n' +
          'A collapsed line-height value (`0`, `1`, `1px`, `1rem`) was declared on a multiline text element or typography class (`p`, `span`, `h1`-`h6`, `.text`, etc.). When text wraps across multiple lines, font descenders collide with ascenders of the line below, impairing legibility and violating WCAG accessibility guidelines.\n\n' +
          '2. Diagnosis:\n' +
          'Locate the `line-height` declaration in the reported line of the stylesheet or Vue component.\n\n' +
          '3. Canonical Solution:\n' +
          '1. Use proportional line-height values suitable for multiline text: minimum `line-height: 1.25` for headings and `line-height: 1.5` for body text and paragraphs.\n' +
          '2. For single-line icons or non-text containers, use specific dedicated icon classes or CSS flexbox/grid alignment.\n\n' +
          '4. Example / Auto-fix command:\n' +
          '// ❌ Incorrect: collapsed line-height in multiline text\n' +
          'p { font-size: 16px; line-height: 1; }\n\n' +
          '// ✅ Correct: accessible line-height\n' +
          'p { font-size: 16px; line-height: 1.5; }'
      },
      roots: targetRoots,
      allowedExtensions: new Set(['.vue', '.scss', '.css']),
      projectRoot: effectiveRoot
    });
  }

  private checkBlockLine(
    blockLines: readonly string[],
    lineIndex: number,
    blockStartLine: number,
    relPath: string,
    selectorStack: SelectorFrame[]
  ): void {
    const line = blockLines[lineIndex];
    if (!line) return;
    const trimmed = line.trim();

    updateSelectorStack(trimmed, selectorStack);

    const lineHeightMatch = isLineHeightOverlapCandidate(trimmed);
    if (lineHeightMatch) {
      this.totalRulesChecked++;
      const currentSelector = selectorStack.map((f) => f.selector).join(' ') || '(global scope)';
      const leafSelector = getLeafSelector(currentSelector);

      if (!ICON_ELEMENT_REGEX.test(leafSelector) && !isEmojiFontContext(blockLines, lineIndex)) {
        if (isTextSelectorCandidate(currentSelector, leafSelector)) {
          this.addViolation({
            ruleId: 'line-height-overlap',
            severity: 'error',
            file: relPath,
            line: blockStartLine + lineIndex,
            message: `Dangerous '${lineHeightMatch[0]}' on text selector '${currentSelector}'. Fonts overlap when text wraps. Use 'line-height: 1.2' to '1.5' or $lh-normal.`,
            context: trimmed
          });
        }
      }
    }

    popSelectorStack(trimmed, selectorStack);
  }

  protected override scanFile(relPath: string, content: string): void {
    const config = getAuditConfig(this.projectRoot);
    if (config.styles?.lineHeightOverlapCheck === false) return;
    const styleBlocks = extractStyleBlocks(relPath, content);

    for (const block of styleBlocks) {
      const blockLines = block.content.split('\n');
      const selectorStack: SelectorFrame[] = [];

      for (let i = 0; i < blockLines.length; i++) {
        this.checkBlockLine(blockLines, i, block.startLine, relPath, selectorStack);
      }
    }
  }

  public override async runAudit(): Promise<void> {
    await super.runAudit();
    this.context.setMetric('Line-height rules analyzed', this.totalRulesChecked);
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new TypographyLineHeightAuditor());

/**
 * @file validate_mermaid_syntax.ts
 * @description Sub-auditor that validates syntax and escapes in Mermaid diagrams within Markdown files
 * using the official modern Mermaid engine (mermaid.parse).
 */

import fs from 'node:fs';
import { enableCompileCache } from 'node:module';
import path from 'node:path';

import { JSDOM } from 'jsdom';

import {
  FileScanAuditor,
  BaseAuditor,
  createUniformRemediationPhases,
  createRuleCapabilities,
  resolveFileScanRoots,
  type FileScanRootsOptions
} from '../../core/auditorBase.ts';
import { getEffectiveIgnoreGlobs } from '../../core/canonicalIgnoreRegistry.ts';

enableCompileCache();

if (typeof (globalThis as Record<string, unknown>).window === 'undefined') {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  Reflect.set(globalThis, 'window', dom.window);
  Reflect.set(globalThis, 'document', dom.window.document);
}

const mermaidModule = await import('mermaid');
const mermaid = mermaidModule.default;

mermaid.initialize({
  startOnLoad: false,
  suppressErrorRendering: true
});

export const MERMAID_SYNTAX_RULES = [
  'mermaid-syntax-error',
  'mermaid-unquoted-special-chars'
] as const;

export type MermaidSyntaxRuleId = (typeof MERMAID_SYNTAX_RULES)[number];

export interface MermaidValidationResult {
  valid: boolean;
  diagramType?: string;
  error?: {
    line: number;
    message: string;
  };
}

/**
 * Validates syntax of a Mermaid diagram block using the official Mermaid parser.
 */
export async function validateMermaid(diagramCode: string): Promise<MermaidValidationResult> {
  if (!diagramCode || typeof diagramCode !== 'string' || diagramCode.trim().length === 0) {
    return {
      valid: false,
      error: { line: 1, message: 'The Mermaid diagram is empty or does not contain code' }
    };
  }

  try {
    const parseResult = await mermaid.parse(diagramCode);
    const diagramType =
      typeof parseResult === 'object' && parseResult !== null && 'diagramType' in parseResult
        ? String((parseResult as { diagramType: unknown }).diagramType)
        : 'unknown';
    return { valid: true, diagramType };
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : String(err);
    const lineMatch = rawMessage.match(/line\s+(\d+)/i);
    const line = lineMatch ? Number.parseInt(lineMatch[1] ?? '1', 10) : 1;
    return {
      valid: false,
      error: { line, message: rawMessage }
    };
  }
}

const UNQUOTED_EDGE_CHARS_REGEX = /[%&<>\u2260\u2265\u2264()/?!+:=#*~]/;
const UNQUOTED_EDGE_LABEL_REGEX = /\|([^|"\n]+)\|/g;
const UNQUOTED_SQUARE_NODE_REGEX = /\b\w+\[([^\]"()\n]*[()][^\]"\n]*)\]/g;
const UNQUOTED_BRACE_NODE_REGEX =
  /\b\w+\{([^}"\n?%&<>\u2260\u2265\u2264()/:!+=\\#*~]*[?%&<>\u2260\u2265\u2264()/:!+=\\#*~][^}"\n]*)\}/g;

export class ValidateMermaidSyntaxAuditor extends FileScanAuditor<MermaidSyntaxRuleId> {
  public constructor(options: FileScanRootsOptions = {}) {
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(options, () => ['.']);
    super({
      ruleFixers: {},
      fixableRuleIds: ['mermaid-unquoted-special-chars'],
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleCapabilities: createRuleCapabilities(MERMAID_SYNTAX_RULES, {
        speed: 'light',
        phase: 'normal',
        md: true,
        ast: false,
        changedOnly: false,
        critical: false
      }),
      id: 'validate_mermaid_syntax',
      name: 'Mermaid Diagram Syntax Auditor',
      description: 'Valid syntax and characters in Mermaid diagrams',
      family: 'documentation',
      packageName: 'Doc',
      configKey: 'documentation.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      icon: '📊',
      ruleIds: MERMAID_SYNTAX_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(MERMAID_SYNTAX_RULES, 'polish'),
      ruleDescriptions: {
        'mermaid-syntax-error': 'Syntax error in Mermaid diagram',
        'mermaid-unquoted-special-chars': 'Unquoted special character in Mermaid'
      },
      ruleRemediations: {
        'mermaid-syntax-error':
          '📖 REMEDIATION GUIDE: mermaid-syntax-error\n' +
          '1. Root Cause: The Mermaid diagram block (````mermaid) contains syntax errors preventing compilation by Mermaid engine (unrecognized keywords, malformed arrows, unclosed blocks, or unsupported directives).\n' +
          '2. Diagnosis: Inspect the Mermaid code block in the Markdown file and the reported line in the compiler error message.\n' +
          '3. Canonical Solution: Correct syntax per official Mermaid directives. Verify diagram headers (`graph TD`, `flowchart LR`, `sequenceDiagram`, `stateDiagram-v2`, `erDiagram`) and statement endings.\n' +
          '4. Example:\n' +
          '   ❌ Incorrect: ````mermaid\nflowchart\nA --> B\n```` (missing TD/LR direction)\n' +
          '   ✅ Correct:   ````mermaid\nflowchart TD\nA --> B\n````',
        'mermaid-unquoted-special-chars':
          '📖 REMEDIATION GUIDE: mermaid-unquoted-special-chars\n' +
          '1. Root Cause: A Mermaid node or edge label contains special characters (parentheses `()`, brackets, colon `:`, question mark `?`, math operators) without being wrapped in double quotes `""`.\n' +
          '2. Diagnosis: Check the reported node or label in the Markdown file.\n' +
          '3. Canonical Solution:\n' +
          '   a) Run the canonical auto-fix command: `npm run auditor:fix` or `auditor fix` to automatically wrap unquoted text in quotes.\n' +
          '   b) Or manually add double quotes inside brackets or node braces.\n' +
          '4. Example:\n' +
          '   ❌ Incorrect: `id[Process (Main)]` or `A -->|Confirm?| B`\n' +
          '   ✅ Correct:   `id["Process (Main)"]` or `A -->|"Confirm?"| B`'
      },
      roots: targetRoots,
      allowedExtensions: new Set(['.md']),
      extraIgnorePatterns: Array.from(getEffectiveIgnoreGlobs(effectiveRoot)),
      projectRoot: effectiveRoot
    });
  }

  private fixMermaidLine(line: string): string {
    let fixed = line;

    // 1. Edge labels |...| with unquoted delimiter characters
    fixed = fixed.replace(/\|([^|"\n]+)\|/g, (match, text) => {
      const trimmed = text.trim();
      if (UNQUOTED_EDGE_CHARS_REGEX.test(trimmed)) {
        return `|"${trimmed}"|`;
      }
      return match;
    });

    // 2. Node definitions [ ... ] with unquoted parentheses
    fixed = fixed.replace(/\b(\w+)\[([^\]"()\n]*[()][^\]"\n]*)\]/g, (_match, id, label) => {
      const trimmed = label.trim();
      return `${id}["${trimmed}"]`;
    });

    // 3. Node definitions { ... } with unquoted special characters
    fixed = fixed.replace(
      /\b(\w+)\{([^}"\n?%&<>\u2260\u2265\u2264()/:!+=\\#*~]*[?%&<>\u2260\u2265\u2264()/:!+=\\#*~][^}"\n]*)\}/g,
      (_match, id, label) => {
        const trimmed = label.trim();
        return `${id}{"${trimmed}"}`;
      }
    );

    return fixed;
  }

  private checkSpecialCharacters(line: string, lineNum: number, relPath: string): void {
    // 1. Edge labels |...| with unquoted delimiter characters
    const edgeMatches = line.matchAll(UNQUOTED_EDGE_LABEL_REGEX);
    for (const match of edgeMatches) {
      const text = match[1]?.trim() ?? '';
      if (UNQUOTED_EDGE_CHARS_REGEX.test(text)) {
        this.addViolation({
          ruleId: 'mermaid-unquoted-special-chars',
          severity: 'error',
          file: relPath,
          line: lineNum,
          context: match[0],
          message: `Mermaid edge label contains unquoted special characters ("${text}"). Wrap it in quotes: |"${text}"|.`,
          fixable: true
        });
      }
    }

    // 2. Node definitions [ ... ] with unquoted parentheses
    const squareMatches = line.matchAll(UNQUOTED_SQUARE_NODE_REGEX);
    for (const match of squareMatches) {
      const label = match[1]?.trim() ?? '';
      this.addViolation({
        ruleId: 'mermaid-unquoted-special-chars',
        severity: 'error',
        file: relPath,
        line: lineNum,
        context: match[0],
        message: `Node definition with unquoted parentheses ("${label}"). Wrap it in double quotes: ["${label}"].`,
        fixable: true
      });
    }

    // 3. Node definitions { ... } with unquoted parentheses
    const braceMatches = line.matchAll(UNQUOTED_BRACE_NODE_REGEX);
    for (const match of braceMatches) {
      const label = match[1]?.trim() ?? '';
      this.addViolation({
        ruleId: 'mermaid-unquoted-special-chars',
        severity: 'error',
        file: relPath,
        line: lineNum,
        context: match[0],
        message: `Rhombus/decision definition with unquoted special characters ("${label}"). Wrap it in double quotes: {"${label}"}.`,
        fixable: true
      });
    }
  }

  private async validateDiagramBlock(
    relPath: string,
    diagramCode: string,
    mermaidStartLine: number
  ): Promise<void> {
    if (!diagramCode) return;
    await this.runSubAuditor('mermaid-syntax-error', async () => {
      const validation = await validateMermaid(diagramCode);
      if (!validation.valid && validation.error) {
        const offsetLine = Math.max(0, validation.error.line - 1);
        const errorLine = mermaidStartLine + offsetLine;

        this.addViolation({
          ruleId: 'mermaid-syntax-error',
          severity: 'error',
          file: relPath,
          line: errorLine,
          context: validation.error.message.slice(0, 100),
          message: `Syntax error in Mermaid diagram: ${validation.error.message}`
        });
      }
    });
  }

  private processMermaidContentLine(
    line: string,
    lineIndex: number,
    relPath: string,
    isFix: boolean
  ): { fixedLine: string | null } {
    let fixedLine: string | null = null;
    if (isFix) {
      const fixed = this.fixMermaidLine(line);
      if (fixed !== line) {
        fixedLine = fixed;
      }
    }
    const lineToCheck = fixedLine ?? line;
    this.runSubAuditorSync('mermaid-unquoted-special-chars', () => {
      this.checkSpecialCharacters(lineToCheck, lineIndex + 1, relPath);
    });
    return { fixedLine };
  }

  protected override async scanFile(relPath: string, content: string): Promise<void> {
    const lines = content.split('\n');
    let inMermaid = false;
    let mermaidStartLine = 0;
    const mermaidLines: string[] = [];
    let fileModified = false;
    const isFix = this.isFixActive();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const trimmed = line.trim();

      if (trimmed.startsWith('```mermaid')) {
        inMermaid = true;
        mermaidStartLine = i + 1;
        mermaidLines.length = 0;
        continue;
      }

      if (inMermaid && trimmed.startsWith('```')) {
        inMermaid = false;
        const diagramCode = mermaidLines
          .map((l) => l.replace(/<!--[\s\S]*?-->/g, '').trimEnd())
          .join('\n')
          .trim();
        await this.validateDiagramBlock(relPath, diagramCode, mermaidStartLine);
        continue;
      }

      if (inMermaid) {
        const result = this.processMermaidContentLine(line, i, relPath, isFix);
        if (result.fixedLine !== null) {
          lines[i] = result.fixedLine;
          fileModified = true;
          mermaidLines.push(result.fixedLine);
        } else {
          mermaidLines.push(line);
        }
      }
    }

    if (isFix && fileModified) {
      const absPath = path.resolve(this.projectRoot, relPath);
      if (fs.existsSync(absPath)) {
        fs.writeFileSync(absPath, lines.join('\n'), 'utf-8');
      }
    }
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateMermaidSyntaxAuditor());

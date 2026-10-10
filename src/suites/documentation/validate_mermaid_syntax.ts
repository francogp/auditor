/**
 * @file validate_mermaid_syntax.ts
 * @description Sub-auditor that validates syntax and escapes in Mermaid diagrams within Markdown files
 * using the official modern Mermaid engine (mermaid.parse).
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { JSDOM } from 'jsdom';
import { FileScanAuditor, BaseAuditor } from '../../core/auditorBase.ts';

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
      error: { line: 1, message: 'El diagrama Mermaid está vacío o no contiene código' }
    };
  }

  try {
    const parseResult = await mermaid.parse(diagramCode);
    const diagramType = typeof parseResult === 'object' && parseResult !== null && 'diagramType' in parseResult
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

/**
 * Validates diagram and returns or throws an Error (for backward compatibility).
 */
export async function validate(
  diagramCode: string,
  parseOptions?: { suppressErrors?: boolean }
): Promise<{ diagramType: string; valid: boolean } | false> {
  const result = await validateMermaid(diagramCode);
  if (!result.valid && result.error) {
    if (parseOptions?.suppressErrors) {
      return false;
    }
    throw new Error(`Parse error on line ${result.error.line}: ${result.error.message}`);
  }
  return { diagramType: result.diagramType ?? 'unknown', valid: true };
}

const UNQUOTED_EDGE_CHARS_REGEX = /[%&<>\u2260\u2265\u2264()/?!+:=#*~]/;
const UNQUOTED_EDGE_LABEL_REGEX = /\|([^|"\n]+)\|/g;
const UNQUOTED_SQUARE_NODE_REGEX = /\b\w+\[([^\]"()\n]*[()][^\]"\n]*)\]/g;
const UNQUOTED_BRACE_NODE_REGEX = /\b\w+\{([^}"\n?%&<>\u2260\u2265\u2264()/:!+=\\#*~]*[?%&<>\u2260\u2265\u2264()/:!+=\\#*~][^}"\n]*)\}/g;

export class ValidateMermaidSyntaxAuditor extends FileScanAuditor<MermaidSyntaxRuleId> {
  public constructor(roots: readonly string[] = ['.'], projectRoot?: string) {
    super({
      capabilities: {
        fix: true,
        fixPriority: false,
        lint: true,
        md: true,
        ast: false,
        changedSince: false,
        heavy: false,
        requiresBuild: false,
        postRun: false
      },
      fixableRuleIds: [...MERMAID_SYNTAX_RULES],
      id: 'validate_mermaid_syntax',
      name: 'Mermaid Diagram Syntax Auditor',
      description: 'Sintaxis y caracteres válidos en diagramas Mermaid',
      family: 'documentation',
      packageName: 'Doc',
      configKey: 'documentation.enabled',
      defaultConfig: { enabled: true },
      icon: '📊',
      ruleIds: MERMAID_SYNTAX_RULES,
      ruleDescriptions: {
        'mermaid-syntax-error': 'Error sintáctico en diagrama Mermaid',
        'mermaid-unquoted-special-chars': 'Caracter especial sin comillas en Mermaid'
      },
      roots,
      allowedExtensions: new Set(['.md']),
      unignoreDirs: ['.agents', 'skills', 'docs'],
      extraIgnorePatterns: ['scratch/**', 'dist/**', 'dev-dist/**', 'test-results/**'],
      projectRoot
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
    fixed = fixed.replace(/\b(\w+)\{([^}"\n?%&<>\u2260\u2265\u2264()/:!+=\\#*~]*[?%&<>\u2260\u2265\u2264()/:!+=\\#*~][^}"\n]*)\}/g, (_match, id, label) => {
      const trimmed = label.trim();
      return `${id}{"${trimmed}"}`;
    });

    return fixed;
  }

  private checkSpecialCharacters(
    line: string,
    lineNum: number,
    relPath: string
  ): void {
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
          message: `Etiqueta de arista Mermaid contiene caracteres especiales no entrecomillados ("${text}"). Envuélvela en comillas: |"${text}"|.`,
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
        message: `Definición de nodo con paréntesis no entrecomillados ("${label}"). Envuélvela en comillas dobles: ["${label}"].`,
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
        message: `Definición de rombo/decisión con caracteres especiales no entrecomillados ("${label}"). Envuélvela en comillas dobles: {"${label}"}.`,
        fixable: true
      });
    }
  }

  protected override async scanFile(relPath: string, content: string): Promise<void> {
    const lines = content.split('\n');
    let inMermaid = false;
    let diagramIgnored = false;
    let mermaidStartLine = 0;
    const mermaidLines: string[] = [];
    let fileModified = false;
    const isFix = this.isFixModeRequested();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      const trimmed = line.trim();

      if (trimmed.startsWith('```mermaid')) {
        inMermaid = true;
        diagramIgnored = this.isLineIgnored(line, ['mermaid-ok', 'doc-ok']);
        mermaidStartLine = i + 1;
        mermaidLines.length = 0;
        continue;
      }

      if (inMermaid && trimmed.startsWith('```')) {
        inMermaid = false;
        if (!diagramIgnored) {
          const diagramCode = mermaidLines
            .map(l => l.replace(/<!--[\s\S]*?-->/g, '').trimEnd())
            .join('\n')
            .trim();

          if (diagramCode) {
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
                message: `Error de sintaxis en diagrama Mermaid: ${validation.error.message}`
              });
            }
          }
        }
        continue;
      }

      if (inMermaid) {
        if (this.isLineIgnored(line, ['mermaid-ok', 'doc-ok'])) {
          diagramIgnored = true;
        } else {
          if (isFix) {
            const fixedLine = this.fixMermaidLine(line);
            if (fixedLine !== line) {
              lines[i] = fixedLine;
              fileModified = true;
              mermaidLines.push(fixedLine);
              continue;
            }
          }
          mermaidLines.push(line);
          this.checkSpecialCharacters(line, i + 1, relPath);
        }
      }
    }

    if (isFix && fileModified) {
      const absPath = path.resolve(this.projectRoot, relPath);
      fs.writeFileSync(absPath, lines.join('\n'), 'utf-8');
    }
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
await BaseAuditor.runCliIfMain(import.meta.url, new ValidateMermaidSyntaxAuditor());

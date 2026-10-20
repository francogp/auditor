/**
 * src/core/refactor/microContextExtractor.ts
 *
 * HASH-ANCHORED MICRO-CONTEXT EXTRACTOR (Dirac Pattern)
 * Extracts ±5 lines around clone instances, computes sha256 integrity anchor,
 * analyzes variable dataflow (parameters vs return values), and quantifies token savings.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
import { toPosixRelative } from '../safePath.ts';
import {
  type FallowCloneGroup,
  type MicroContextInstance,
  type MicroContextPacket,
  ESTIMATED_TOKENS_PER_CHAR
} from './refactorContracts.ts';

export const MIN_DIRAC_TOKEN_THRESHOLD = 100;
const CONTEXT_MARGIN_LINES = 5;

export class MicroContextExtractor {
  /**
   * Evaluates if a clone group meets the minimum Dirac token threshold (>100 tokens)
   * to ensure micro-context compression focuses on consequential architectural clones.
   */
  public static isDiracCandidate(group: FallowCloneGroup): boolean {
    return (group.token_count ?? 0) >= MIN_DIRAC_TOKEN_THRESHOLD;
  }

  /**
   * Extracts Hash-Anchored micro-context packet for a clone group.
   */
  public extract(projectRoot: string, group: FallowCloneGroup): MicroContextPacket {
    let fullFilesTotalChars = 0;
    const processedFiles = new Set<string>();

    const instances: MicroContextInstance[] = group.instances.map((inst) => {
      const absPath = path.resolve(projectRoot, inst.file);
      if (!fs.existsSync(absPath)) {
        throw new Error(`Instance file does not exist: ${absPath}`);
      }

      const fileContent = fs.readFileSync(absPath, 'utf8');

      if (!processedFiles.has(absPath)) {
        processedFiles.add(absPath);
        fullFilesTotalChars += fileContent.length;
      }

      const lines = fileContent.split(/\r?\n/);
      const totalLines = lines.length;

      const startIdx = Math.max(0, inst.start_line - 1);
      const endIdx = Math.min(totalLines, inst.end_line);

      const rawSnippetLines = lines.slice(startIdx, endIdx);
      const rawFragment = rawSnippetLines.join('\n');

      const ctxStartIdx = Math.max(0, startIdx - CONTEXT_MARGIN_LINES);
      const ctxEndIdx = Math.min(totalLines, endIdx + CONTEXT_MARGIN_LINES);

      const ctxLines = lines.slice(ctxStartIdx, ctxEndIdx);
      const contextSnippet = ctxLines.join('\n');

      const hash = crypto.createHash('sha256').update(rawFragment).digest('hex');

      const analysis = this.analyzeDataflow(rawFragment);

      return {
        file: toPosixRelative(projectRoot, absPath),
        startLine: inst.start_line,
        endLine: inst.end_line,
        contextStartLine: ctxStartIdx + 1,
        contextEndLine: ctxEndIdx,
        rawFragment,
        contextSnippet,
        sha256: hash,
        freeVariables: analysis.freeVariables,
        assignedVariables: analysis.assignedVariables,
        hasReturnOrControlBreak: analysis.hasReturnOrControlBreak
      };
    });

    const paramCandidates = Array.from(
      new Set(instances.flatMap((i) => i.freeVariables))
    ).filter((v) => !['console', 'Math', 'JSON', 'Object', 'Array', 'Promise'].includes(v));

    const returnCandidates = Array.from(
      new Set(instances.flatMap((i) => i.assignedVariables))
    );

    const microContextChars = instances.reduce((acc, i) => acc + i.contextSnippet.length, 0);

    const traditionalTokens = Math.round(fullFilesTotalChars * ESTIMATED_TOKENS_PER_CHAR);
    const microTokens = Math.round((microContextChars + 500) * ESTIMATED_TOKENS_PER_CHAR);
    const savingsPct = traditionalTokens > 0
      ? Math.max(0, Math.round(((traditionalTokens - microTokens) / traditionalTokens) * 100))
      : 0;

    return {
      fingerprint: group.fingerprint,
      instances,
      candidateParameters: paramCandidates,
      candidateReturns: returnCandidates,
      traditionalTokensEstimate: traditionalTokens,
      microContextTokensEstimate: microTokens,
      tokenSavingsPercent: savingsPct
    };
  }

  /**
   * Parses snippet as TypeScript AST and analyzes variable reads vs assignments.
   */
  private analyzeDataflow(code: string): {
    freeVariables: readonly string[];
    assignedVariables: readonly string[];
    hasReturnOrControlBreak: boolean;
  } {
    const wrappedCode = `function __scope__() {\n${code}\n}`;
    const sf = ts.createSourceFile('snippet.ts', wrappedCode, ts.ScriptTarget.Latest, true);

    const declaredInScope = new Set<string>();
    const readVariables = new Set<string>();
    const assignedVariables = new Set<string>();
    let hasReturnOrBreak = false;

    const visit = (node: ts.Node): void => {
      if (
        ts.isReturnStatement(node) ||
        ts.isBreakStatement(node) ||
        ts.isContinueStatement(node)
      ) {
        hasReturnOrBreak = true;
      }

      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
        declaredInScope.add(node.name.text);
        if (node.initializer) {
          assignedVariables.add(node.name.text);
        }
      }

      if (ts.isReturnStatement(node) && node.expression && ts.isIdentifier(node.expression)) {
        assignedVariables.add(node.expression.text);
      }

      if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
        declaredInScope.add(node.name.text);
      }

      if (ts.isBinaryExpression(node)) {
        if (
          [
            ts.SyntaxKind.EqualsToken,
            ts.SyntaxKind.PlusEqualsToken,
            ts.SyntaxKind.MinusEqualsToken
          ].includes(node.operatorToken.kind) &&
          ts.isIdentifier(node.left)
        ) {
          assignedVariables.add(node.left.text);
        }
      }

      if (ts.isIdentifier(node)) {
        const parent = node.parent;
        const isPropAccessName = ts.isPropertyAccessExpression(parent) && parent.name === node;
        const isVarDeclName = ts.isVariableDeclaration(parent) && parent.name === node;
        const isParamName = ts.isParameter(parent) && parent.name === node;

        if (!isPropAccessName && !isVarDeclName && !isParamName) {
          readVariables.add(node.text);
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sf);

    const freeVars = Array.from(readVariables).filter(
      (v) => !declaredInScope.has(v) && v !== '__scope__'
    );
    const assigned = Array.from(assignedVariables);

    return {
      freeVariables: freeVars,
      assignedVariables: assigned,
      hasReturnOrControlBreak: hasReturnOrBreak
    };
  }
}

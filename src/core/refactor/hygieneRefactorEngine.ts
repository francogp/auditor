/**
 * src/core/refactor/hygieneRefactorEngine.ts
 *
 * CODEBASE HYGIENE REFACTORING ENGINE (Node.js 26+ Native)
 *
 * Provides deterministic discovery, Dirac micro-context extraction,
 * and automated plan-based remediation for:
 *   1. Explicit member accessibility (`@typescript-eslint/explicit-member-accessibility`)
 *   2. Modern `globalThis` usage (`unicorn/prefer-global-this`)
 *   3. Redundant `void` operator expressions (`eslint/no-void`)
 */

import fs from 'node:fs';

import ts from 'typescript';

import { OxlintAuditor } from '../../suites/architecture/validate_oxlint.ts';
import {
  createUnifiedAstSourceFile,
  applyAstReplacementsAcrossFiles,
  type AstTextReplacement
} from '../astScriptExtractor.ts';
import {
  BaseRefactorEngine,
  assertValidRefactorEngineOptions,
  type RefactorEngineOptions
} from './baseRefactorEngine.ts';
import type { HygieneFindingItem, HygieneRefactorPlan } from './refactorContracts.ts';

const TARGET_GLOBAL_NAMES: ReadonlySet<string> = new Set(['window', 'self', 'global']);

function isClassMemberCandidate(member: ts.ClassElement): boolean {
  return (
    ts.isMethodDeclaration(member) ||
    ts.isPropertyDeclaration(member) ||
    ts.isGetAccessorDeclaration(member) ||
    ts.isSetAccessorDeclaration(member) ||
    ts.isConstructorDeclaration(member)
  );
}

function hasExplicitAccessibility(member: ts.ClassElement): boolean {
  const modifiers = ts.canHaveModifiers(member) ? ts.getModifiers(member) || [] : [];
  return modifiers.some(
    (m) =>
      m.kind === ts.SyntaxKind.PublicKeyword ||
      m.kind === ts.SyntaxKind.ProtectedKeyword ||
      m.kind === ts.SyntaxKind.PrivateKeyword
  );
}

function resolveMemberInsertPosition(
  member: ts.ClassElement,
  sourceFile: ts.SourceFile,
  sourceText: string
): number {
  let insertPos = member.getStart(sourceFile);
  const decorators = ts.canHaveDecorators(member) ? ts.getDecorators(member) || [] : [];
  if (decorators.length === 0) return insertPos;

  const lastDecorator = decorators[decorators.length - 1];
  if (!lastDecorator) return insertPos;

  insertPos = lastDecorator.getEnd();
  while (insertPos < sourceText.length && /\s/.test(sourceText[insertPos] || '')) {
    if (sourceText[insertPos] === '\n') {
      insertPos++;
      break;
    }
    insertPos++;
  }
  return insertPos;
}

function inspectClassMember(
  member: ts.ClassElement,
  sourceFile: ts.SourceFile,
  sourceText: string,
  filePath: string
): { finding: HygieneFindingItem; replacement: AstTextReplacement } | null {
  if (!isClassMemberCandidate(member)) return null;
  if (member.name && ts.isPrivateIdentifier(member.name)) return null;
  if (hasExplicitAccessibility(member)) return null;

  const insertPos = resolveMemberInsertPosition(member, sourceFile, sourceText);
  const startPos = member.getStart(sourceFile);
  const line = ts.getLineAndCharacterOfPosition(sourceFile, startPos).line + 1;
  const nameText = member.name ? member.name.getText(sourceFile) : 'constructor';
  const snippet = sourceText
    .slice(startPos, Math.min(startPos + 40, sourceText.length))
    .replace(/\n[\s\S]*/, '');

  return {
    finding: {
      file: filePath,
      line,
      kind: 'member-accessibility',
      identifier: nameText,
      originalSnippet: snippet,
      suggestedReplacement: `public ${snippet}`,
      explanation: `Class member "${nameText}" is missing explicit access modifier. Prepend "public" (or protected/private).`
    },
    replacement: {
      start: insertPos,
      end: insertPos,
      text: 'public '
    }
  };
}

function isShadowedIdentifier(node: ts.Identifier): boolean {
  let currentScope: ts.Node | undefined = node.parent;
  while (currentScope) {
    if (
      ts.isFunctionDeclaration(currentScope) ||
      ts.isArrowFunction(currentScope) ||
      ts.isFunctionExpression(currentScope) ||
      ts.isMethodDeclaration(currentScope)
    ) {
      if (
        currentScope.parameters.some((p) => ts.isIdentifier(p.name) && p.name.text === node.text)
      ) {
        return true;
      }
    }
    currentScope = currentScope.parent;
  }
  return false;
}

function isPropertyOrBindingContext(node: ts.Identifier, parent: ts.Node): boolean {
  if (ts.isPropertyAssignment(parent) && parent.name === node) return true;
  if (ts.isPropertyDeclaration(parent) && parent.name === node) return true;
  if (ts.isMethodDeclaration(parent) && parent.name === node) return true;
  if (ts.isParameter(parent) && parent.name === node) return true;
  if (ts.isVariableDeclaration(parent) && parent.name === node) return true;
  if (ts.isBindingElement(parent) && parent.name === node) return true;
  if (ts.isImportSpecifier(parent)) return true;
  if (ts.isExportSpecifier(parent)) return true;
  if (ts.isTypeReferenceNode(parent)) return true;
  if (ts.isModuleDeclaration(parent)) return true;
  if (ts.isPropertyAccessExpression(parent) && parent.name === node) return true;
  return false;
}

function inspectGlobalIdentifier(
  node: ts.Identifier,
  sourceFile: ts.SourceFile,
  filePath: string
): { finding: HygieneFindingItem; replacement: AstTextReplacement } | null {
  const name = node.text;
  if (!TARGET_GLOBAL_NAMES.has(name)) return null;

  const parent = node.parent;
  if (parent && isPropertyOrBindingContext(node, parent)) return null;
  if (isShadowedIdentifier(node)) return null;

  const startPos = node.getStart(sourceFile);
  const line = ts.getLineAndCharacterOfPosition(sourceFile, startPos).line + 1;
  const isTypeOf = parent && ts.isTypeOfExpression(parent);
  const replacementText = isTypeOf ? `globalThis.${name}` : 'globalThis';

  return {
    finding: {
      file: filePath,
      line,
      kind: 'prefer-global-this',
      identifier: name,
      originalSnippet: name,
      suggestedReplacement: replacementText,
      explanation: `Prefer "globalThis" over environment-specific "${name}".`
    },
    replacement: {
      start: startPos,
      end: node.getEnd(),
      text: replacementText
    }
  };
}

function inspectVoidNode(
  node: ts.VoidExpression,
  sourceFile: ts.SourceFile,
  filePath: string
): { finding: HygieneFindingItem; replacement: AstTextReplacement } {
  const startPos = node.getStart(sourceFile);
  const line = ts.getLineAndCharacterOfPosition(sourceFile, startPos).line + 1;
  const exprText = node.expression.getText(sourceFile);
  const isConciseArrow = ts.isArrowFunction(node.parent) && node.parent.body === node;

  if (isConciseArrow) {
    const replacementText = `{\n    ${exprText};\n  }`;
    return {
      finding: {
        file: filePath,
        line,
        kind: 'no-void',
        originalSnippet: node.getText(sourceFile),
        suggestedReplacement: replacementText,
        explanation:
          'Arrow function uses "void" in concise body. Convert to standard block statement.'
      },
      replacement: {
        start: startPos,
        end: node.getEnd(),
        text: replacementText
      }
    };
  }

  return {
    finding: {
      file: filePath,
      line,
      kind: 'no-void',
      originalSnippet: node.getText(sourceFile),
      suggestedReplacement: exprText,
      explanation: 'Unnecessary unary "void" expression. Remove "void" operator.'
    },
    replacement: {
      start: startPos,
      end: node.expression.getStart(sourceFile),
      text: ''
    }
  };
}

/**
 * Inspects a file for code hygiene findings and prepares exact AST text replacements.
 */
export function inspectHygieneFile(
  filePath: string,
  sourceText: string
): {
  readonly findings: readonly HygieneFindingItem[];
  readonly replacements: readonly AstTextReplacement[];
} {
  const { sourceFile } = createUnifiedAstSourceFile(filePath, sourceText);
  const findings: HygieneFindingItem[] = [];
  const replacements: AstTextReplacement[] = [];

  function visit(node: ts.Node): void {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      for (const member of node.members) {
        const res = inspectClassMember(member, sourceFile, sourceText, filePath);
        if (res) {
          findings.push(res.finding);
          replacements.push(res.replacement);
        }
      }
    }

    if (ts.isIdentifier(node)) {
      const res = inspectGlobalIdentifier(node, sourceFile, filePath);
      if (res) {
        findings.push(res.finding);
        replacements.push(res.replacement);
      }
    }

    if (ts.isVoidExpression(node)) {
      const res = inspectVoidNode(node, sourceFile, filePath);
      if (res) {
        findings.push(res.finding);
        replacements.push(res.replacement);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { findings, replacements };
}

export type HygieneRefactorEngineOptions = RefactorEngineOptions<OxlintAuditor>;

export class HygieneRefactorEngine extends BaseRefactorEngine<
  HygieneFindingItem,
  HygieneRefactorPlan,
  OxlintAuditor
> {
  public readonly toolId = 'auditor-hygiene';
  public readonly configSectionKey = 'oxlint' as const;

  public constructor(options: HygieneRefactorEngineOptions = {}) {
    const opts = assertValidRefactorEngineOptions<OxlintAuditor>(options);
    const auditor =
      opts.auditor ??
      new OxlintAuditor({
        projectRoot: opts.projectRoot
      });
    super(auditor);
  }

  public override discoverInFile(filePath: string): readonly HygieneFindingItem[] {
    return HygieneRefactorEngine.discoverInFile(filePath);
  }

  public override createPlan(
    hygienePlanId: string,
    hygieneFindings: readonly HygieneFindingItem[]
  ): HygieneRefactorPlan {
    return HygieneRefactorEngine.buildHygienePlan(hygienePlanId, hygieneFindings);
  }

  public override applyPlan(
    projectRoot: string,
    plan: HygieneRefactorPlan
  ): { readonly modifiedFiles: readonly string[] } {
    HygieneRefactorEngine.applyPlan(projectRoot, plan);
    return { modifiedFiles: plan.targetFiles };
  }

  /**
   * Scans a file to discover accessibility, globalThis, and void violations using TypeScript AST.
   */
  public static discoverInFile(filePath: string): readonly HygieneFindingItem[] {
    if (!fs.existsSync(filePath)) return [];
    const sourceText = fs.readFileSync(filePath, 'utf-8');
    const { findings } = inspectHygieneFile(filePath, sourceText);
    return findings;
  }

  /**
   * Builds a declarative HygieneRefactorPlan from findings.
   */
  public static buildHygienePlan(
    planId: string,
    findings: readonly HygieneFindingItem[]
  ): HygieneRefactorPlan {
    const targetFiles = Array.from(new Set(findings.map((f) => f.file)));
    const accessibilityInjections: {
      file: string;
      line: number;
      originalSnippet: string;
      replacementSnippet: string;
    }[] = [];
    const globalThisReplacements: {
      file: string;
      line: number;
      originalSnippet: string;
      replacementSnippet: string;
    }[] = [];
    const voidReplacements: {
      file: string;
      line: number;
      originalSnippet: string;
      replacementSnippet: string;
    }[] = [];

    for (const f of findings) {
      if (f.kind === 'member-accessibility') {
        accessibilityInjections.push({
          file: f.file,
          line: f.line,
          originalSnippet: f.originalSnippet,
          replacementSnippet: f.suggestedReplacement
        });
      } else if (f.kind === 'prefer-global-this') {
        globalThisReplacements.push({
          file: f.file,
          line: f.line,
          originalSnippet: f.originalSnippet,
          replacementSnippet: f.suggestedReplacement
        });
      } else if (f.kind === 'no-void') {
        voidReplacements.push({
          file: f.file,
          line: f.line,
          originalSnippet: f.originalSnippet,
          replacementSnippet: f.suggestedReplacement
        });
      }
    }

    return {
      version: 1,
      planId,
      targetFiles,
      accessibilityInjections,
      globalThisReplacements,
      voidReplacements
    };
  }

  public static createPlan(
    planId: string,
    findings: readonly HygieneFindingItem[]
  ): HygieneRefactorPlan {
    return HygieneRefactorEngine.buildHygienePlan(planId, findings);
  }

  /**
   * Applies a HygieneRefactorPlan cleanly using AST replacements.
   */
  public static applyPlan(
    targetDir: string,
    plan: HygieneRefactorPlan
  ): { readonly filesChanged: number; readonly changesApplied: number } {
    return applyAstReplacementsAcrossFiles(targetDir, plan.targetFiles, (fullPath, sourceText) => {
      const { replacements } = inspectHygieneFile(fullPath, sourceText);
      return replacements;
    });
  }
}

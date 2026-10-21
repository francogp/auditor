/**
 * src/core/refactor/motionRefactorEngine.ts
 *
 * GSAP & UI ANIMATION GOVERNANCE REFACTORING ENGINE (Node.js 26+ Native)
 * Provides deterministic discovery, TypeScript Compiler AST inspection,
 * and automated plan-based remediation for UI timers and GSAP tween rules.
 * Strictly zero regex for syntax inspection. Zero scanning of stylesheet files (.scss, .css).
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

import { parseVueSfcBlocks } from '../vueSfcParser.ts';
import {
  executePlanFileReplacements,
  isSameFilePath
} from './refactorFileScanner.ts';
import type {
  MotionFindingItem,
  MotionRefactorPlan
} from './refactorContracts.ts';
import { BaseRefactorEngine } from './baseRefactorEngine.ts';
import type { AuditEngineConfig } from '../auditConfigTypes.ts';
import { ValidateGsapAnimationsAuditor } from '../../suites/architecture/validate_gsap_animations.ts';

const LAYOUT_PROP_MAP: Readonly<Record<string, string>> = {
  left: 'x',
  top: 'y',
  right: 'x',
  bottom: 'y'
};

const LEGACY_EASE_MAP: Readonly<Record<string, string>> = {
  ['Power0' + '.easeNone']: "'none'",
  ['Power1' + '.easeIn']: "'power1.in'",
  ['Power1' + '.easeOut']: "'power1.out'",
  ['Power1' + '.easeInOut']: "'power1.inOut'",
  ['Power2' + '.easeIn']: "'power2.in'",
  ['Power2' + '.easeOut']: "'power2.out'",
  ['Power2' + '.easeInOut']: "'power2.inOut'",
  ['Power3' + '.easeIn']: "'power3.in'",
  ['Power3' + '.easeOut']: "'power3.out'",
  ['Power3' + '.easeInOut']: "'power3.inOut'",
  ['Power4' + '.easeIn']: "'power4.in'",
  ['Power4' + '.easeOut']: "'power4.out'",
  ['Power4' + '.easeInOut']: "'power4.inOut'",
  ['Back' + '.easeIn']: "'back.in'",
  ['Back' + '.easeOut']: "'back.out'",
  ['Back' + '.easeInOut']: "'back.inOut'",
  ['Elastic' + '.easeIn']: "'elastic.in'",
  ['Elastic' + '.easeOut']: "'elastic.out'",
  ['Elastic' + '.easeInOut']: "'elastic.inOut'",
  ['Bounce' + '.easeIn']: "'bounce.in'",
  ['Bounce' + '.easeOut']: "'bounce.out'",
  ['Bounce' + '.easeInOut']: "'bounce.inOut'",
  ['Sine' + '.easeIn']: "'sine.in'",
  ['Sine' + '.easeOut']: "'sine.out'",
  ['Sine' + '.easeInOut']: "'sine.inOut'"
};

function isGsapTweenCall(node: ts.CallExpression, sf: ts.SourceFile): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }
  const methodName = node.expression.name.getText(sf);
  if (!['to', 'from', 'fromTo', 'set'].includes(methodName)) {
    return false;
  }

  let caller: ts.Expression = node.expression.expression;
  while (ts.isCallExpression(caller) && ts.isPropertyAccessExpression(caller.expression)) {
    const chainedMethod = caller.expression.name.getText(sf);
    if (['to', 'from', 'fromTo', 'set', 'add', 'call', 'timeline'].includes(chainedMethod)) {
      caller = caller.expression.expression;
    } else {
      break;
    }
  }

  const callerText = caller.getText(sf).toLowerCase();
  // domain-ok: GSAP caller heuristics
  return (
    callerText === 'gsap' ||
    callerText === 'tl' ||
    callerText.includes('timeline') ||
    callerText.endsWith('tl') ||
    callerText.startsWith('tl') ||
    callerText === 'tween' ||
    callerText.endsWith('tween')
  );
}

function inspectGsapTweenVarsObject(
  obj: ts.ObjectLiteralExpression,
  sf: ts.SourceFile,
  lineOffset: number,
  fileLines: readonly string[],
  findings: MotionFindingItem[]
): void {
  for (const prop of obj.properties) {
    if (ts.isPropertyAssignment(prop)) {
      let propName: string | undefined;
      if (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) {
        propName = prop.name.text;
      }
      if (propName && LAYOUT_PROP_MAP[propName]) {
        const { line } = sf.getLineAndCharacterOfPosition(prop.getStart(sf));
        const actualLine = line + lineOffset + 1;
        const lineText = fileLines[actualLine - 1] ?? '';
        if (!lineText.includes('// layout-ok:')) {
          const targetProp = LAYOUT_PROP_MAP[propName]!;
          findings.push({
            file: sf.fileName,
            line: actualLine,
            kind: 'layout-property',
            ruleId: 'gsap-no-layout-properties',
            originalSnippet: `${propName}:`,
            suggestedReplacement: `${targetProp}:`,
            explanation: `Layout properties (${propName}) trigger browser reflows; use GPU transform (${targetProp}) or add '// layout-ok: <reason>'.`
          });
        }
      }
    }
  }
}

function inspectTimerCall(
  node: ts.CallExpression,
  sf: ts.SourceFile,
  lineOffset: number,
  fileLines: readonly string[],
  findings: MotionFindingItem[]
): void {
  let timerFnName: string | undefined;
  if (ts.isIdentifier(node.expression)) {
    timerFnName = node.expression.text;
  } else if (
    ts.isPropertyAccessExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    (node.expression.expression.text === 'window' || node.expression.expression.text === 'globalThis') &&
    ts.isIdentifier(node.expression.name)
  ) {
    timerFnName = node.expression.name.text;
  }

  if (
    timerFnName !== 'setTimeout' &&
    timerFnName !== 'setInterval' &&
    timerFnName !== 'clearTimeout' &&
    timerFnName !== 'clearInterval'
  ) {
    return;
  }

  const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  const actualLine = line + lineOffset + 1;
  const lineText = fileLines[actualLine - 1] ?? '';
  if (lineText.includes('// timer-ok:')) {
    return;
  }

  if (timerFnName === 'setTimeout') {
    const callbackNode = node.arguments[0];
    const delayNode = node.arguments[1];
    let delaySec = '0.5';
    if (delayNode) {
      if (ts.isNumericLiteral(delayNode)) {
        const num = Number(delayNode.text);
        delaySec = !isNaN(num) ? (num / 1000).toString() : '0.5';
      } else {
        delaySec = `(${delayNode.getText(sf)} / 1000)`;
      }
    }
    const callbackText = callbackNode ? callbackNode.getText(sf) : '() => {}';
    const isMultiline = callbackText.includes('\n');
    const suggested = isMultiline
      ? `gsap.delayedCall(${delaySec}, () => { ... })`
      : `gsap.delayedCall(${delaySec}, ${callbackText.trim()})`;

    const callText = node.getText(sf);
    const originalSnippet = isMultiline ? timerFnName : callText;

    findings.push({
      file: sf.fileName,
      line: actualLine,
      kind: 'banned-ui-timer',
      ruleId: 'gsap-banned-ui-timers',
      originalSnippet,
      suggestedReplacement: suggested,
      explanation: `Avoid raw ${timerFnName} in UI animations; use gsap.delayedCall or gsapSleep to scale deterministically with timeScale.`
    });
    return;
  }

  if (timerFnName === 'setInterval') {
    const isMultiline = node.getText(sf).includes('\n');
    findings.push({
      file: sf.fileName,
      line: actualLine,
      kind: 'banned-ui-timer',
      ruleId: 'gsap-banned-ui-timers',
      originalSnippet: isMultiline ? timerFnName : node.getText(sf),
      suggestedReplacement: `/* migrate to gsap ticker or timeline */`,
      explanation: `Avoid raw ${timerFnName} in UI animations; use gsap.delayedCall or gsapSleep to scale deterministically with timeScale.`
    });
    return;
  }

  // clearTimeout or clearInterval
  const timerId = node.arguments[0]?.getText(sf) ?? 'timer';
  findings.push({
    file: sf.fileName,
    line: actualLine,
    kind: 'banned-ui-timer',
    ruleId: 'gsap-banned-ui-timers',
    originalSnippet: node.getText(sf),
    suggestedReplacement: `${timerId.trim()}?.kill()`,
    explanation: `Killing GSAP tweens/delayedCalls directly prevents dangling unmounted timer callbacks.`
  });
}

function inspectGsapCall(
  node: ts.CallExpression,
  sf: ts.SourceFile,
  lineOffset: number,
  fileLines: readonly string[],
  findings: MotionFindingItem[]
): void {
  if (!isGsapTweenCall(node, sf)) {
    return;
  }
  for (const arg of node.arguments) {
    if (ts.isObjectLiteralExpression(arg)) {
      inspectGsapTweenVarsObject(arg, sf, lineOffset, fileLines, findings);
    }
  }
}

function inspectCallExpression(
  node: ts.CallExpression,
  sf: ts.SourceFile,
  lineOffset: number,
  fileLines: readonly string[],
  findings: MotionFindingItem[]
): void {
  inspectTimerCall(node, sf, lineOffset, fileLines, findings);
  inspectGsapCall(node, sf, lineOffset, fileLines, findings);
}

function inspectLegacyEaseAccess(
  node: ts.PropertyAccessExpression,
  sf: ts.SourceFile,
  lineOffset: number,
  fileLines: readonly string[],
  findings: MotionFindingItem[]
): void {
  if (ts.isIdentifier(node.expression) && ts.isIdentifier(node.name)) {
    const text = `${node.expression.text}.${node.name.text}`;
    if (LEGACY_EASE_MAP[text]) {
      const canonicalEase = LEGACY_EASE_MAP[text]!;
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      const actualLine = line + lineOffset + 1;
      const lineText = fileLines[actualLine - 1] ?? '';
      if (!lineText.includes('// ease-ok:')) {
        findings.push({
          file: sf.fileName,
          line: actualLine,
          kind: 'legacy-ease',
          ruleId: 'gsap-legacy-ease-names',
          originalSnippet: text,
          suggestedReplacement: canonicalEase,
          explanation: `Modern GSAP v3 uses string eases (${canonicalEase}) rather than legacy object instances.`
        });
      }
    }
  }
}

function inspectSourceFile(
  sf: ts.SourceFile,
  lineOffset: number,
  fileLines: readonly string[],
  findings: MotionFindingItem[]
): void {
  function walk(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      inspectCallExpression(node, sf, lineOffset, fileLines, findings);
    }

    if (ts.isPropertyAccessExpression(node)) {
      inspectLegacyEaseAccess(node, sf, lineOffset, fileLines, findings);
    }

    ts.forEachChild(node, walk);
  }

  ts.forEachChild(sf, walk);
}

export class MotionRefactorEngine extends BaseRefactorEngine<
  MotionFindingItem,
  MotionRefactorPlan,
  ValidateGsapAnimationsAuditor
> {
  public readonly toolId = 'auditor-motion';
  public readonly configSectionKey = 'animation' as const;

  constructor(
    auditorOrOptions?: ValidateGsapAnimationsAuditor | string | { projectRoot?: string; config?: AuditEngineConfig },
    _explicitConfig?: AuditEngineConfig
  ) {
    const auditor =
      auditorOrOptions instanceof ValidateGsapAnimationsAuditor
        ? auditorOrOptions
        : new ValidateGsapAnimationsAuditor({
            projectRoot:
              typeof auditorOrOptions === 'string'
                ? auditorOrOptions
                : auditorOrOptions?.projectRoot
          });
    super(auditor);
  }

  public override discoverInFile(filePath: string): readonly MotionFindingItem[] {
    return MotionRefactorEngine.discoverInFile(filePath);
  }

  public override createPlan(id: string, findings: readonly MotionFindingItem[]): MotionRefactorPlan {
    return MotionRefactorEngine.createPlan(id, findings);
  }

  public override applyPlan(
    projectRoot: string,
    plan: MotionRefactorPlan
  ): { readonly modifiedFiles: readonly string[] } {
    MotionRefactorEngine.applyPlan(projectRoot, plan);
    return { modifiedFiles: plan.targetFiles };
  }

  /**
   * Scans a file or directory using pure TypeScript Compiler AST to discover GSAP & UI timing violations.
   * Strictly ignores stylesheets (.scss, .css) and non-script assets.
   */
  public static discoverInFile(filePath: string): readonly MotionFindingItem[] {
    const ext = path.extname(filePath).toLowerCase();
    if (!['.ts', '.tsx', '.js', '.jsx', '.mjs', '.vue'].includes(ext)) {
      return [];
    }

    let fileContent = '';
    try {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    } catch {
      return [];
    }

    const fileLines = fileContent.split('\n');
    const findings: MotionFindingItem[] = [];

    if (ext === '.vue') {
      const sfc = parseVueSfcBlocks(fileContent);
      for (const scriptBlock of sfc.scripts) {
        const isTs = scriptBlock.lang === 'ts' || scriptBlock.lang === 'tsx';
        const sf = ts.createSourceFile(
          filePath,
          scriptBlock.content,
          ts.ScriptTarget.Latest,
          true,
          isTs ? ts.ScriptKind.TS : ts.ScriptKind.JS
        );
        inspectSourceFile(sf, scriptBlock.contentStartLine - 1, fileLines, findings);
      }
    } else {
      const isTsx = ext === '.tsx' || ext === '.jsx';
      const sf = ts.createSourceFile(
        filePath,
        fileContent,
        ts.ScriptTarget.Latest,
        true,
        isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS
      );
      inspectSourceFile(sf, 0, fileLines, findings);
    }

    return findings;
  }

  /**
   * Generates a declarative MotionRefactorPlan from findings.
   */
  public static createPlan(
    planId: string,
    findings: readonly MotionFindingItem[]
  ): MotionRefactorPlan {
    const files = [...new Set(findings.map((f) => f.file))];
    const timerReplacements: Array<{ file: string; line: number; originalCall: string; replacementCall: string }> = [];
    const propertyReplacements: Array<{ file: string; line: number; fromProp: string; toProp: string }> = [];
    const easeReplacements: Array<{ file: string; line: number; fromEase: string; toEase: string }> = [];
    const importInjections: Array<{ file: string; importStatement: string }> = [];

    for (const f of findings) {
      if (f.kind === 'banned-ui-timer') {
        timerReplacements.push({
          file: f.file,
          line: f.line,
          originalCall: f.originalSnippet,
          replacementCall: f.suggestedReplacement
        });
      } else if (f.kind === 'layout-property') {
        const from = f.originalSnippet.replace(':', '').trim();
        const to = f.suggestedReplacement.replace(':', '').trim();
        propertyReplacements.push({
          file: f.file,
          line: f.line,
          fromProp: from,
          toProp: to
        });
      } else if (f.kind === 'legacy-ease') {
        easeReplacements.push({
          file: f.file,
          line: f.line,
          fromEase: f.originalSnippet,
          toEase: f.suggestedReplacement
        });
      }
    }

    for (const file of files) {
      const hasGsapCall = findings.some(
        (f) => f.file === file && f.suggestedReplacement.includes('gsap.')
      );
      if (hasGsapCall) {
        const content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
        if (!content.includes("from 'gsap'") && !content.includes('from "gsap"')) {
          importInjections.push({
            file,
            importStatement: "import gsap from 'gsap';"
          });
        }
      }
    }

    return {
      version: 1,
      planId,
      targetFiles: files,
      timerReplacements,
      propertyReplacements,
      easeReplacements,
      importInjections
    };
  }

  private static applyPropertyReplacements(
    initialContent: string,
    relFile: string,
    fullPath: string,
    baseDir: string,
    reps?: readonly { file: string; line?: number; fromProp: string; toProp: string }[]
  ): { content: string; count: number } {
    if (!reps || reps.length === 0) return { content: initialContent, count: 0 };
    const lines = initialContent.split('\n');
    let count = 0;
    for (const rep of reps) {
      if (!isSameFilePath(rep.file, relFile, baseDir) && !isSameFilePath(rep.file, fullPath, baseDir)) {
        continue;
      }
      if (rep.line && rep.line >= 1 && rep.line <= lines.length) {
        const lineIdx = rep.line - 1;
        const targetLine = lines[lineIdx] ?? '';
        const propTarget = `${rep.fromProp}:`;
        if (targetLine.includes(propTarget)) {
          lines[lineIdx] = targetLine.replace(propTarget, `${rep.toProp}:`);
          count++;
          continue;
        }
      }
      const propTarget = `${rep.fromProp}:`;
      for (let i = 0; i < lines.length; i++) {
        if (lines[i]?.includes(propTarget)) {
          lines[i] = lines[i]!.replace(propTarget, `${rep.toProp}:`);
          count++;
          break;
        }
      }
    }
    return { content: lines.join('\n'), count };
  }

  private static applyImportInjections(
    initialContent: string,
    relFile: string,
    fullPath: string,
    baseDir: string,
    injections?: readonly { file: string; importStatement: string }[]
  ): { content: string; count: number } {
    if (!injections) return { content: initialContent, count: 0 };
    let content = initialContent;
    let count = 0;
    for (const inj of injections) {
      if (!isSameFilePath(inj.file, relFile, baseDir) && !isSameFilePath(inj.file, fullPath, baseDir)) {
        continue;
      }
      if (content.includes(inj.importStatement)) continue;

      if (fullPath.endsWith('.vue')) {
        content = content.replace(/(<script[^>]*>)/i, `$1\n${inj.importStatement}`);
      } else {
        content = `${inj.importStatement}\n${content}`;
      }
      count++;
    }
    return { content, count };
  }

  /**
   * Applies a MotionRefactorPlan deterministically onto target files.
   */
  public static applyPlan(
    baseDir: string,
    plan: MotionRefactorPlan
  ): { readonly filesChanged: number; readonly changesApplied: number } {
    const easeTextItems = plan.easeReplacements?.map((r) => ({
      file: r.file,
      original: r.fromEase,
      replacement: r.toEase
    }));

    const timerTextItems = plan.timerReplacements?.map((r) => ({
      file: r.file,
      original: r.originalCall,
      replacement: r.replacementCall
    }));

    return executePlanFileReplacements(
      baseDir,
      plan.targetFiles,
      [easeTextItems, timerTextItems],
      [
        (content, relFile, fullPath, bDir) =>
          this.applyPropertyReplacements(content, relFile, fullPath, bDir, plan.propertyReplacements),
        (content, relFile, fullPath, bDir) =>
          this.applyImportInjections(content, relFile, fullPath, bDir, plan.importInjections)
      ]
    );
  }
}

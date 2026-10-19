/**
 * src/core/refactor/motionRefactorEngine.ts
 *
 * GSAP & UI ANIMATION GOVERNANCE REFACTORING ENGINE (Node.js 26+ Native)
 * Provides deterministic discovery, Dirac micro-context extraction,
 * and automated plan-based remediation for UI timers and GSAP tween rules.
 */

import fs from 'node:fs';

import {
  executePlanFileReplacements,
  forEachSourceScriptLine,
  isSameFilePath
} from './refactorFileScanner.ts';
import type {
  MotionFindingItem,
  MotionRefactorPlan
} from './refactorContracts.ts';
import { BaseRefactorEngine } from './baseRefactorEngine.ts';
import type { AuditEngineConfig } from '../auditConfigTypes.ts';
import { ValidateGsapAnimationsAuditor } from '../../suites/architecture/validate_gsap_animations.ts';

const BANNED_TIMERS_REGEX = /\b(setTimeout|setInterval)\s*\(\s*([^,]+),\s*(\d+|\w+)\s*\)/g;
const CLEAR_TIMERS_REGEX = /\b(clearTimeout|clearInterval)\s*\(\s*([^)]+)\s*\)/g;

const LAYOUT_PROPERTIES: readonly { readonly from: string; readonly to: string }[] = [
  { from: 'left', to: 'x' },
  { from: 'top', to: 'y' },
  { from: 'right', to: 'x' },
  { from: 'bottom', to: 'y' }
];

const LEGACY_EASE_MAP: Record<string, string> = {
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

const MAX_MULTILINE_LOOKAHEAD_LINES = 15;
const DEFAULT_FALLBACK_DELAY_SEC = 0.5;

function inspectInlineTimer(line: string, actualLine: number, filePath: string): MotionFindingItem | null {
  BANNED_TIMERS_REGEX.lastIndex = 0;
  const timerMatch = BANNED_TIMERS_REGEX.exec(line);
  if (!timerMatch) return null;

  const fullMatch = timerMatch[0];
  const fnName = timerMatch[1];
  const callback = timerMatch[2];
  const delay = timerMatch[3];
  if (!fullMatch || !fnName || !callback || !delay) return null;

  const delayNum = Number(delay);
  const delaySec = !isNaN(delayNum) ? (delayNum / 1000).toString() : `(${delay} / 1000)`;
  const suggested = fnName === 'setTimeout'
    ? `gsap.delayedCall(${delaySec}, ${callback.trim()})`
    : `/* migrate to gsap ticker or timeline */`;

  return {
    file: filePath,
    line: actualLine,
    kind: 'banned-ui-timer',
    originalSnippet: fullMatch,
    suggestedReplacement: suggested,
    explanation: `Avoid raw ${fnName} in UI animations; use gsap.delayedCall or gsapSleep to scale deterministically with timeScale.`
  };
}

function findMultilineDelaySec(i: number, lines: readonly string[]): string | null {
  for (let j = i + 1; j < Math.min(lines.length, i + MAX_MULTILINE_LOOKAHEAD_LINES); j++) {
    const subsequentLine = lines[j] ?? '';
    const delayMatch = /(?:}\s*,\s*|\bdelay\s*:\s*)(\d+(?:\.\d+)?)\s*\)?/.exec(subsequentLine);
    if (delayMatch && delayMatch[1]) {
      const delayNum = Number(delayMatch[1]);
      return !isNaN(delayNum) ? (delayNum / 1000).toString() : `(${delayMatch[1]} / 1000)`;
    }
    if (subsequentLine.includes('});') || subsequentLine.includes('})')) {
      break;
    }
  }
  return null;
}

function inspectMultilineTimer(
  line: string,
  actualLine: number,
  i: number,
  lines: readonly string[],
  filePath: string
): MotionFindingItem | null {
  if (!/\b(setTimeout|setInterval)\b/.test(line)) return null;

  const fnName = line.includes('setInterval') ? 'setInterval' : 'setTimeout';
  const multilineDelaySec = findMultilineDelaySec(i, lines);

  const suggested = fnName === 'setTimeout'
    ? (multilineDelaySec ? `gsap.delayedCall(${multilineDelaySec}, () => { ... })` : 'gsap.' + `delayedCall(${DEFAULT_FALLBACK_DELAY_SEC}, callback)`)
    : `/* migrate to gsap ticker or timeline */`;

  return {
    file: filePath,
    line: actualLine,
    kind: 'banned-ui-timer',
    ruleId: 'gsap-banned-ui-timers',
    originalSnippet: fnName,
    suggestedReplacement: suggested,
    explanation: `Avoid raw ${fnName} in UI animations; use gsap.delayedCall or gsapSleep to scale deterministically with timeScale.`
  };
}

function inspectClearTimers(line: string, actualLine: number, filePath: string): MotionFindingItem[] {
  const items: MotionFindingItem[] = [];
  CLEAR_TIMERS_REGEX.lastIndex = 0;
  let timerMatch: RegExpExecArray | null;
  while ((timerMatch = CLEAR_TIMERS_REGEX.exec(line)) !== null) {
    const fullMatch = timerMatch[0];
    const timerId = timerMatch[2];
    if (!fullMatch || !timerId) continue;

    items.push({
      file: filePath,
      line: actualLine,
      kind: 'banned-ui-timer',
      originalSnippet: fullMatch,
      suggestedReplacement: `${timerId.trim()}?.kill()`,
      explanation: `Killing GSAP tweens/delayedCalls directly prevents dangling unmounted timer callbacks.`
    });
  }
  return items;
}

function inspectBannedTimers(
  line: string,
  actualLine: number,
  i: number,
  lines: readonly string[],
  filePath: string
): MotionFindingItem[] {
  const items: MotionFindingItem[] = [];

  const inlineItem = inspectInlineTimer(line, actualLine, filePath);
  if (inlineItem) {
    items.push(inlineItem);
  } else {
    const multilineItem = inspectMultilineTimer(line, actualLine, i, lines, filePath);
    if (multilineItem) {
      items.push(multilineItem);
    }
  }

  items.push(...inspectClearTimers(line, actualLine, filePath));
  return items;
}

function inspectLegacyEases(line: string, actualLine: number, filePath: string): MotionFindingItem[] {
  const items: MotionFindingItem[] = [];
  for (const [legacyEase, canonicalEase] of Object.entries(LEGACY_EASE_MAP)) {
    if (line.includes(legacyEase)) {
      items.push({
        file: filePath,
        line: actualLine,
        kind: 'legacy-ease',
        ruleId: 'gsap-legacy-ease-names',
        originalSnippet: legacyEase,
        suggestedReplacement: canonicalEase,
        explanation: `Modern GSAP v3 uses string eases (${canonicalEase}) rather than legacy object instances.`
      });
    }
  }
  return items;
}

function inspectLayoutProperties(line: string, actualLine: number, filePath: string): MotionFindingItem[] {
  const items: MotionFindingItem[] = [];
  for (const layoutProp of LAYOUT_PROPERTIES) {
    const propRegex = new RegExp(`\\b${layoutProp.from}\\s*:`, 'g');
    if (propRegex.test(line)) {
      items.push({
        file: filePath,
        line: actualLine,
        kind: 'layout-property',
        ruleId: 'gsap-no-layout-properties',
        originalSnippet: `${layoutProp.from}:`,
        suggestedReplacement: `${layoutProp.to}:`,
        explanation: `Layout properties (${layoutProp.from}) trigger browser reflows; use GPU transform (${layoutProp.to}) or add '// layout-ok: <reason>'.`
      });
    }
  }
  return items;
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
        : new ValidateGsapAnimationsAuditor(
            undefined,
            typeof auditorOrOptions === 'string'
              ? auditorOrOptions
              : auditorOrOptions?.projectRoot
          );
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
   * Scans a file or directory to discover GSAP & UI timing violations.
   */
  public static discoverInFile(filePath: string): readonly MotionFindingItem[] {
    const findings: MotionFindingItem[] = [];

    forEachSourceScriptLine(filePath, (line, actualLine, i, lines) => {
      if (line.includes('// timer-ok:') || line.includes('// layout-ok:')) {
        return;
      }

      findings.push(...inspectBannedTimers(line, actualLine, i, lines, filePath));
      findings.push(...inspectLegacyEases(line, actualLine, filePath));
      findings.push(...inspectLayoutProperties(line, actualLine, filePath));
    });

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
    reps?: readonly { file: string; fromProp: string; toProp: string }[]
  ): { content: string; count: number } {
    if (!reps) return { content: initialContent, count: 0 };
    let content = initialContent;
    let count = 0;
    for (const rep of reps) {
      if (!isSameFilePath(rep.file, relFile, baseDir) && !isSameFilePath(rep.file, fullPath, baseDir)) {
        continue;
      }
      const regex = new RegExp(`\\b${rep.fromProp}\\s*:`, 'g');
      if (!regex.test(content)) continue;
      content = content.replace(regex, `${rep.toProp}:`);
      count++;
    }
    return { content, count };
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

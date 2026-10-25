/**
 * src/suites/architecture/validate_gsap_scrolltrigger.ts
 *
 * GSAP SCROLLTRIGGER ARCHITECTURAL HYGIENE AUDITOR (Node.js 26+ Native)
 *
 * Enforces best practices and anti-pattern prevention for GSAP ScrollTrigger (AGENTS.md):
 *   1. `gsap-scrolltrigger-in-timeline-child`: Prohibits scrollTrigger in child tweens of timelines.
 *   2. `gsap-scrolltrigger-scrub-and-toggle`: Prohibits conflicting scrub and toggleActions.
 *   3. `gsap-scrolltrigger-markers-production`: Prohibits markers: true in production source files.
 *   4. `gsap-scrolltrigger-animating-pinned-element`: Prohibits animating transforms on pinned element.
 *   5. `gsap-scrolltrigger-container-animation-ease`: Enforces ease: "none" on containerAnimation tweens.
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* src/suites/architecture/validate_gsap_scrolltrigger.ts
 */

import { enableCompileCache } from 'node:module';
import { BaseAuditor,
  createUniformRemediationPhases, FileScanAuditor, createRuleCapabilities,
  resolveFileScanRoots, type FileScanRootsOptions } from '../../core/auditorBase.ts';
import { isExemptFile } from '../../core/auditConfig.ts';

enableCompileCache();

export type GsapScrollTriggerRuleId =
  | 'gsap-scrolltrigger-in-timeline-child'
  | 'gsap-scrolltrigger-scrub-and-toggle'
  | 'gsap-scrolltrigger-markers-production'
  | 'gsap-scrolltrigger-animating-pinned-element'
  | 'gsap-scrolltrigger-container-animation-ease';

export const GSAP_SCROLLTRIGGER_RULES: readonly GsapScrollTriggerRuleId[] = [
  'gsap-scrolltrigger-in-timeline-child',
  'gsap-scrolltrigger-scrub-and-toggle',
  'gsap-scrolltrigger-markers-production',
  'gsap-scrolltrigger-animating-pinned-element',
  'gsap-scrolltrigger-container-animation-ease'
] as const;

export class ValidateGsapScrollTriggerAuditor extends FileScanAuditor<GsapScrollTriggerRuleId> {
  constructor(options: FileScanRootsOptions = {}) {
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(options);

    super({
      usesThirdPartyTool: false,
      requiredPermissions: [],
      projectRoot: effectiveRoot,
      roots: targetRoots,
      id: 'validate_gsap_scrolltrigger',
      name: 'GSAP ScrollTrigger Hygiene',
      description: 'Governance of synchronization and pinning in ScrollTrigger',
      family: 'architecture',
      packageName: 'ScrollTrigger',
      icon: '📜',
      configKey: 'paths',
      defaultConfig: {},
      criticalConfig: {},
      ruleCapabilities: createRuleCapabilities(GSAP_SCROLLTRIGGER_RULES, {
        speed: 'light',
        phase: 'normal',
        fix: 'none',
        md: false,
        ast: true,
        changedOnly: false,
        critical: false
      }),
      allowedExtensions: new Set(['.ts', '.vue', '.tsx', '.js']),
      ruleIds: GSAP_SCROLLTRIGGER_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(GSAP_SCROLLTRIGGER_RULES, 'behavior'),
      ruleDescriptions: {
        'gsap-scrolltrigger-in-timeline-child': 'scrollTrigger inside timeline tween',
        'gsap-scrolltrigger-scrub-and-toggle': 'scrub vs toggleActions conflict',
        'gsap-scrolltrigger-markers-production': 'markers: true in production code',
        'gsap-scrolltrigger-animating-pinned-element': 'Animation on pinned element',
        'gsap-scrolltrigger-container-animation-ease': 'Missing ease: none on container'
      },
      ruleRemediations: {
        'gsap-scrolltrigger-in-timeline-child':
          '📖 REMEDIATION GUIDE: gsap-scrolltrigger-in-timeline-child\n' +
          '1. Root Cause: Declaring scrollTrigger on a child tween in a GSAP timeline disrupts timeline time control and causes desynchronization.\n' +
          '2. Diagnosis: Look for scrollTrigger inside tl.to(), tl.from(), or tl.fromTo() child tweens.\n' +
          '3. Canonical Solution: Declare scrollTrigger in the parent timeline configuration: gsap.timeline({ scrollTrigger: { ... } }).\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Banned:  declaring scrollTrigger in child tweens like tl.to()\n' +
          '   ✅ Correct: const tl = gsap.timeline({ scrollTrigger: { trigger: ".container", scrub: true } });',
        'gsap-scrolltrigger-scrub-and-toggle':
          '📖 REMEDIATION GUIDE: gsap-scrolltrigger-scrub-and-toggle\n' +
          '1. Root Cause: Both scrub and toggleActions were configured in the same ScrollTrigger object. scrub ties animation progress continuously to scroll position, neutralizing discrete toggleActions.\n' +
          '2. Diagnosis: Locate ScrollTrigger definitions where both properties are present.\n' +
          '3. Canonical Solution: Retain scrub for scroll-linked animations, or retain toggleActions for threshold-triggered animations.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ScrollTrigger.create({ trigger: ".elem", scrub: 1 });',
        'gsap-scrolltrigger-markers-production':
          '📖 REMEDIATION GUIDE: gsap-scrolltrigger-markers-production\n' +
          '1. Root Cause: markers: true was found in ScrollTrigger code without a development environment guard, exposing debug guides to end users.\n' +
          '2. Diagnosis: Search for markers: true in ScrollTrigger configurations.\n' +
          '3. Canonical Solution: Remove markers: true or guard it with import.meta.env.DEV.\n' +
          '4. Example / Auto-fix command:\n' +
          '   scrollTrigger: { trigger: ".box", markers: import.meta.env.DEV }',
        'gsap-scrolltrigger-animating-pinned-element':
          '📖 REMEDIATION GUIDE: gsap-scrolltrigger-animating-pinned-element\n' +
          '1. Root Cause: Transforms (x, y, scale, rotation) were applied directly to a pinned element (pin: true), distorting the pin-spacer layout.\n' +
          '2. Diagnosis: Check if the animated target element is the same element being pinned.\n' +
          '3. Canonical Solution: Pin the outer container and animate an inner child wrapper.\n' +
          '4. Example / Auto-fix command:\n' +
          '   gsap.to(".pinned-card-inner", { scrollTrigger: { trigger: ".pinned-wrapper", pin: true }, x: 200 });',
        'gsap-scrolltrigger-container-animation-ease':
          '📖 REMEDIATION GUIDE: gsap-scrolltrigger-container-animation-ease\n' +
          '1. Root Cause: The horizontal container tween assigned to containerAnimation uses a non-linear ease (e.g. power1.out), desynchronizing nested triggers.\n' +
          '2. Diagnosis: Check the ease property of the tween used for containerAnimation.\n' +
          '3. Canonical Solution: Set ease: "none" on the container tween for strictly linear scroll mapping.\n' +
          '4. Example / Auto-fix command:\n' +
          '   const horizontalTween = gsap.to(".sections", { xPercent: -300, ease: "none" });'
      }
    });
  }

  protected override scanFile(relPath: string, content: string): void {
    if (isExemptFile(relPath)) return;
    this.runSubAuditorSync('gsap-scrolltrigger-in-timeline-child', () => {
      this.checkTimelineChild(relPath, content);
    });
    this.runSubAuditorSync('gsap-scrolltrigger-scrub-and-toggle', () => {
      this.checkScrubAndToggle(relPath, content);
    });
    this.runSubAuditorSync('gsap-scrolltrigger-markers-production', () => {
      this.checkMarkersProduction(relPath, content);
    });
    this.runSubAuditorSync('gsap-scrolltrigger-animating-pinned-element', () => {
      this.checkAnimatingPinnedElement(relPath, content);
    });
    this.runSubAuditorSync('gsap-scrolltrigger-container-animation-ease', () => {
      this.checkContainerAnimationEase(relPath, content);
    });
  }

  private isLineInComment(content: string, index: number): boolean {
    const lineStart = content.lastIndexOf('\n', index) + 1;
    const lineEnd = content.indexOf('\n', index);
    const lineText = content.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
    const trimmed = lineText.trim();
    return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
  }

  private checkTimelineChild(relPath: string, content: string): void {
    const timelineChildRegex =
      /(?:\b(?:tl|timeline|\w*Timeline)|\))\s*\.\s*(?:to|from|fromTo)\s*\([^){]*\{[^)}]*(?:\}[^){]*\{[^)}]*)*(?:\)[^}]*)?\bscrollTrigger\s*:/g;
    let m: RegExpExecArray | null;
    while ((m = timelineChildRegex.exec(content)) !== null) {
      if (this.isLineInComment(content, m.index)) continue;

      this.addViolationAtMatch({
        ruleId: 'gsap-scrolltrigger-in-timeline-child',
        filePath: relPath,
        content,
        matchIndex: m.index,
        message:
          "Declaring 'scrollTrigger' on a child tween in a timeline breaks sequence timing. Declare it in 'gsap.timeline({ scrollTrigger: ... })'.",
        severity: 'error'
      });
    }
  }

  private scanScrollTriggerBlocks(
    content: string,
    callback: (blockBody: string, matchIndex: number) => void
  ): void {
    const stBlockRegex = /(?:scrollTrigger\s*:\s*\{|ScrollTrigger\.create\s*\(\s*\{)([^}]*)\}/g;
    let m: RegExpExecArray | null;
    while ((m = stBlockRegex.exec(content)) !== null) {
      const blockBody = m[1] ?? '';
      const matchIndex = m.index;
      if (this.isLineInComment(content, matchIndex)) continue;
      callback(blockBody, matchIndex);
    }
  }

  private checkScrubAndToggle(relPath: string, content: string): void {
    this.scanScrollTriggerBlocks(content, (blockBody, matchIndex) => {
      if (/\bscrub\s*:/i.test(blockBody) && /\btoggleActions\s*:/i.test(blockBody)) {
        this.addViolationAtMatch({
          ruleId: 'gsap-scrolltrigger-scrub-and-toggle',
          filePath: relPath,
          content,
          matchIndex,
          message:
            "Conflict in ScrollTrigger: 'scrub' and 'toggleActions' cannot coexist. 'scrub' neutralizes toggleActions.",
          severity: 'error'
        });
      }
    });
  }

  private checkMarkersProduction(relPath: string, content: string): void {
    this.scanScrollTriggerBlocks(content, (blockBody, matchIndex) => {
      if (/\bmarkers\s*:\s*true\b/i.test(blockBody)) {
        const surroundingWindow = content.slice(
          Math.max(0, matchIndex - 100),
          Math.min(content.length, matchIndex + 200)
        );
        const hasDevGuard = /import\.meta\.env\.DEV|NODE_ENV\s*!==\s*['"]production['"]/i.test(
          surroundingWindow
        );
        if (!hasDevGuard) {
          this.addViolationAtMatch({
            ruleId: 'gsap-scrolltrigger-markers-production',
            filePath: relPath,
            content,
            matchIndex,
            message:
              "Using 'markers: true' in production code. Remove markers or guard them with 'import.meta.env.DEV'.",
            severity: 'error'
          });
        }
      }
    });
  }

  private checkAnimatingPinnedElement(relPath: string, content: string): void {
    const pinnedAnimationRegex =
      /\b(?:gsap|tl|timeline)\s*\.\s*(?:to|from|fromTo)\s*\([^,]+,\s*\{[^}]*\bpin\s*:\s*true[^}]*(?:\bx|\by|\bscale|\brotation)\s*:/g;
    let m: RegExpExecArray | null;
    while ((m = pinnedAnimationRegex.exec(content)) !== null) {
      if (this.isLineInComment(content, m.index)) continue;

      this.addViolationAtMatch({
        ruleId: 'gsap-scrolltrigger-animating-pinned-element',
        filePath: relPath,
        content,
        matchIndex: m.index,
        message:
          "Transform animation on pinned element ('pin: true') distorts pin-spacer. Pin the outer parent container instead.",
        severity: 'error'
      });
    }
  }

  private checkContainerAnimationEase(relPath: string, content: string): void {
    const containerAnimRegex = /\bcontainerAnimation\s*:\s*([^,}\n]+)/g;
    let m: RegExpExecArray | null;
    while ((m = containerAnimRegex.exec(content)) !== null) {
      const animVar = m[1]?.trim() ?? '';
      if (!animVar) continue;
      const defRegex = new RegExp(
        `(?:const|let|var)\\s+${animVar}\\s*=\\s*gsap\\.(?:to|from|fromTo)\\s*\\([^}]*\\}`,
        'g'
      );
      const defMatch = defRegex.exec(content);
      if (defMatch) {
        const tweenBody = defMatch[0];
        const easeMatch = /\bease\s*:\s*['"]([^'"]+)['"]/.exec(tweenBody);
        if (easeMatch && easeMatch[1] !== 'none') {
          this.addViolationAtMatch({
            ruleId: 'gsap-scrolltrigger-container-animation-ease',
            filePath: relPath,
            content,
            matchIndex: defMatch.index,
            message: `The containerAnimation driving tween '${animVar}' must have 'ease: "none"' for linear scroll synchronization.`,
            severity: 'error'
          });
        }
      }
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateGsapScrollTriggerAuditor());

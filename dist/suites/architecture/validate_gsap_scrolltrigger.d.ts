import { FileScanAuditor, FileScanRootsOptions } from "../../core/auditorBase.js";
export type GsapScrollTriggerRuleId = 'gsap-scrolltrigger-in-timeline-child' | 'gsap-scrolltrigger-scrub-and-toggle' | 'gsap-scrolltrigger-markers-production' | 'gsap-scrolltrigger-animating-pinned-element' | 'gsap-scrolltrigger-container-animation-ease';
export declare const GSAP_SCROLLTRIGGER_RULES: readonly GsapScrollTriggerRuleId[];
export declare class ValidateGsapScrollTriggerAuditor extends FileScanAuditor<GsapScrollTriggerRuleId> {
  constructor(options?: FileScanRootsOptions);
  protected scanFile(relPath: string, content: string): void;
  private isLineInComment;
  private checkTimelineChild;
  private scanScrollTriggerBlocks;
  private checkScrubAndToggle;
  private checkMarkersProduction;
  private checkAnimatingPinnedElement;
  private checkContainerAnimationEase;
}
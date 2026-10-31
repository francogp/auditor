import { FileScanAuditor, FileScanRootsOptions } from "../../core/auditorBase.js";
export declare const WEB_PERFORMANCE_RULES: readonly ["unoptimized-images", "font-display-missing", "inline-svg-bloat", "css-render-blocking", "excessive-dom-depth", "layout-shift-dimensions", "uncompressed-video", "perf-lcp-lazy-conflict", "perf-font-preload-crossorigin", "perf-srcset-missing-sizes", "perf-content-visibility-intrinsic-size"];
export type WebPerformanceRuleId = (typeof WEB_PERFORMANCE_RULES)[number];
export declare class ValidateWebPerformanceAuditor extends FileScanAuditor<WebPerformanceRuleId> {
  private readonly exemptSvgPaths;
  constructor(options?: FileScanRootsOptions);
  protected scanFile(relPath: string, content: string): void;
  private collectVueModernWebPerf;
  private auditModernWebPerformanceRules;
  private auditUnoptimizedImages;
  private auditFontDisplayMissing;
  private auditInlineSvgBloat;
  private auditCssRenderBlocking;
  private auditExcessiveDomDepth;
  private auditLayoutShiftDimensions;
  private auditUncompressedVideo;
}
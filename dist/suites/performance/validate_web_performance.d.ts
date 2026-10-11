import { FileScanAuditor } from '../../core/auditorBase.ts';
export declare const WEB_PERFORMANCE_RULES: readonly ["unoptimized-images", "font-display-missing", "inline-svg-bloat", "css-render-blocking", "excessive-dom-depth", "layout-shift-dimensions", "uncompressed-video"];
export type WebPerformanceRuleId = (typeof WEB_PERFORMANCE_RULES)[number];
export declare class ValidateWebPerformanceAuditor extends FileScanAuditor<WebPerformanceRuleId> {
    constructor(options?: {
        projectRoot?: string;
        fix?: boolean;
        roots?: readonly string[];
    });
    protected scanFile(relPath: string, content: string): void;
    private auditUnoptimizedImages;
    private auditFontDisplayMissing;
    private auditInlineSvgBloat;
    private auditCssRenderBlocking;
    private auditExcessiveDomDepth;
    private auditLayoutShiftDimensions;
    private auditUncompressedVideo;
}
//# sourceMappingURL=validate_web_performance.d.ts.map
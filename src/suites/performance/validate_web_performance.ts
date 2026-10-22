import path from 'node:path';
import { enableCompileCache } from 'node:module';
import {
  BaseAuditor,
  FileScanAuditor,
  createUniformRuleCapabilities,
  createUniformRemediationPhases,
  LIGHT_RULE_CAPABILITIES,
  resolveFileScanRoots
} from '../../core/auditorBase.ts';
import { deriveCoverageFromRoots } from '../../core/auditCoverage.ts';
import { getAuditConfig } from '../../core/auditConfig.ts';
import { isPathExempt } from '../../core/safePath.ts';
import { parseVueSfc } from '../../core/vueSfcParser.ts';

enableCompileCache();

export const WEB_PERFORMANCE_RULES = [
  'unoptimized-images',
  'font-display-missing',
  'inline-svg-bloat',
  'css-render-blocking',
  'excessive-dom-depth',
  'layout-shift-dimensions',
  'uncompressed-video'
] as const;

export type WebPerformanceRuleId = (typeof WEB_PERFORMANCE_RULES)[number];

const SCANNABLE_EXTS = new Set(['.vue', '.html', '.htm', '.jsx', '.tsx', '.css', '.scss']);
const MAX_RECOMMENDED_DOM_DEPTH = 16;

export class ValidateWebPerformanceAuditor extends FileScanAuditor<WebPerformanceRuleId> {
  private readonly exemptSvgPaths: readonly string[];

  constructor(options: { projectRoot?: string; fix?: boolean; roots?: readonly string[] } = {}) {
    const webRoots = resolveFileScanRoots(options);
    const webConfig = getAuditConfig(webRoots.effectiveRoot);
    super({
      id: 'validate_web_performance',
      name: 'Web Performance & Core Web Vitals Auditor',
      description: 'Web performance, Core Web Vitals, and frontend optimization',
      family: 'performance',
      packageName: 'WebPerf',
      icon: '⚡',
      configKey: 'webPerformance.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      requiredPermissions: [],
      usesThirdPartyTool: false,
      roots: webRoots.targetRoots,
      allowedExtensions: SCANNABLE_EXTS,
      ruleIds: WEB_PERFORMANCE_RULES,
      ruleRemediationPhases: createUniformRemediationPhases(WEB_PERFORMANCE_RULES, 'behavior'),
      ruleDescriptions: {
        'unoptimized-images': 'Image without modern WebP compression',
        'font-display-missing': '@font-face without font-display swap',
        'inline-svg-bloat': 'Inline SVG exceeding 2KB',
        'css-render-blocking': 'Render-blocking CSS or script in head',
        'excessive-dom-depth': 'Excessive DOM depth > 16 levels',
        'layout-shift-dimensions': 'Media element missing width/height',
        'uncompressed-video': 'Video missing preload="none" or webm'
      },
      ruleRemediations: {
        'unoptimized-images':
          '📖 REMEDIATION GUIDE: unoptimized-images\n' +
          '1. Root Cause: A legacy raster image (`.png`, `.jpg`, `.jpeg`) was included without modern compression (`.webp`, `.avif`) or the `decoding="async"` attribute. Legacy formats increase transfer weight and hurt LCP (Largest Contentful Paint).\n' +
          '2. Diagnosis: Locate the `<img>` tag in the reported template.\n' +
          '3. Canonical Solution:\n' +
          '   a) Convert the image to `.webp` or `.avif` format.\n' +
          '   b) Add performance attributes: `loading="lazy"` and `decoding="async"`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Legacy:    `<img src="/hero.png">`\n' +
          '   ✅ Optimized: `<img src="/hero.webp" loading="lazy" decoding="async" alt="Hero">`',
        'font-display-missing':
          '📖 REMEDIATION GUIDE: font-display-missing\n' +
          '1. Root Cause: An `@font-face` rule lacks the `font-display: swap` or `font-display: optional` property. This blocks text rendering while the web font is downloading, causing Flash of Invisible Text (FOIT).\n' +
          '2. Diagnosis: Inspect the `@font-face` declaration in the reported stylesheet.\n' +
          '3. Canonical Solution: Add `font-display: swap;` inside the `@font-face` definition block.\n' +
          '4. Example / Auto-fix command:\n' +
          '   - CSS: `@font-face { font-family: "CustomFont"; src: url(...); font-display: swap; }`',
        'inline-svg-bloat':
          '📖 REMEDIATION GUIDE: inline-svg-bloat\n' +
          '1. Root Cause: A large inline SVG (> 2KB) was embedded directly inside the HTML/Vue template. Giant SVGs bloat JS/HTML bundle sizes and prevent browser HTTP caching.\n' +
          '2. Diagnosis: Check the `<svg>` block in the component template.\n' +
          '3. Canonical Solution:\n' +
          '   a) Move the SVG to an external asset in `src/assets/` or `public/` and load it via `<img src="/icon.svg" ...>`.\n' +
          '   b) If CSS coloring is required, use a CSS mask: `mask: url(/icon.svg)` or an SVG sprite system.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ 15KB inline SVG in Vue template.\n' +
          '   ✅ External image: `<img src="@/assets/illustration.svg" alt="Illustration">`',
        'css-render-blocking':
          '📖 REMEDIATION GUIDE: css-render-blocking\n' +
          '1. Root Cause: An external stylesheet or script tag was found in `<head>` that blocks browser rendering without `async`, `defer`, or non-critical media queries.\n' +
          '2. Diagnosis: Locate the `<link rel="stylesheet">` or `<script>` tag in `index.html`.\n' +
          '3. Canonical Solution: Add `defer` or `async` to scripts, or load secondary fonts/styles using `media="print" onload="this.media=\'all\'"`.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Blocking:    `<script src="/analytics.js"></script>`\n' +
          '   ✅ Non-blocking: `<script src="/analytics.js" async defer></script>`',
        'excessive-dom-depth':
          '📖 REMEDIATION GUIDE: excessive-dom-depth\n' +
          '1. Root Cause: The component markup has a DOM depth exceeding 16 levels. Deep DOM trees slow down style recalculations and overload the accessibility tree.\n' +
          '2. Diagnosis: Examine nested `<div>` containers in the component template.\n' +
          '3. Canonical Solution: Flatten the HTML hierarchy by removing redundant containers or break the component down into smaller modular subcomponents.\n' +
          '4. Example / Auto-fix command:\n' +
          '   - Remove redundant wrapper elements that only apply a layout class.',
        'layout-shift-dimensions':
          '📖 REMEDIATION GUIDE: layout-shift-dimensions\n' +
          '1. Root Cause: An `<img>` or `<video>` tag lacks explicit `width` and `height` attributes (or CSS `aspect-ratio`). When the media loads, surrounding content shifts, causing Cumulative Layout Shift (CLS).\n' +
          '2. Diagnosis: Inspect the `<img>` or `<video>` tag in the template.\n' +
          '3. Canonical Solution: Always specify `width` and `height` attributes matching intrinsic dimensions, or declare `aspect-ratio` via CSS.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Missing dimensions: `<img src="/banner.webp" />`\n' +
          '   ✅ With dimensions:    `<img src="/banner.webp" width="800" height="400" />`',
        'uncompressed-video':
          '📖 REMEDIATION GUIDE: uncompressed-video\n' +
          '1. Root Cause: A `<video>` tag lacks `preload="none"` or `preload="metadata"`, or does not offer a modern WebM source (`<source type="video/webm">`). Preloading full video files wastes client bandwidth.\n' +
          '2. Diagnosis: Locate the `<video>` tag in the template.\n' +
          '3. Canonical Solution: Add `preload="metadata"` and provide modern WebM and MP4 sources.\n' +
          '4. Example / Auto-fix command:\n' +
          '   ❌ Inefficient: `<video src="/intro.mp4" autoplay>`\n' +
          '   ✅ Optimized:   `<video preload="metadata" playsinline><source src="/intro.webm" type="video/webm" /></video>`'
      },
      ruleCapabilities: createUniformRuleCapabilities(
        WEB_PERFORMANCE_RULES,
        LIGHT_RULE_CAPABILITIES
      ),
      projectRoot: webRoots.effectiveRoot,
      coverage: deriveCoverageFromRoots(webRoots.targetRoots, SCANNABLE_EXTS, webRoots.effectiveRoot),
      exemptPaths: webConfig.webPerformance?.exemptPaths
    });
    this.exemptSvgPaths = webConfig.webPerformance?.exemptSvgPaths ?? [];
  }

  protected override scanFile(relPath: string, content: string): void {
    this.runSubAuditorSync('unoptimized-images', () => {
      this.auditUnoptimizedImages(relPath, content);
    });
    this.runSubAuditorSync('font-display-missing', () => {
      this.auditFontDisplayMissing(relPath, content);
    });
    this.runSubAuditorSync('inline-svg-bloat', () => {
      this.auditInlineSvgBloat(relPath, content);
    });
    this.runSubAuditorSync('css-render-blocking', () => {
      this.auditCssRenderBlocking(relPath, content);
    });
    this.runSubAuditorSync('excessive-dom-depth', () => {
      this.auditExcessiveDomDepth(relPath, content);
    });
    this.runSubAuditorSync('layout-shift-dimensions', () => {
      this.auditLayoutShiftDimensions(relPath, content);
    });
    this.runSubAuditorSync('uncompressed-video', () => {
      this.auditUncompressedVideo(relPath, content);
    });
  }

  private auditUnoptimizedImages(relPath: string, content: string): void {
    const imgRegex = /<img\s+([^>]*)>/gi;
    let match: RegExpExecArray | null;
    while ((match = imgRegex.exec(content)) !== null) {
      const attrs = match[1] ?? '';
      const srcMatch = attrs.match(/src=["']([^"']+)["']/i);
      if (!srcMatch) continue;
      const src = srcMatch[1]!;
      const isLegacyRaster = /\.(png|jpe?g|bmp|gif)($|\?)/i.test(src);
      const hasAsyncDecoding = /decoding=["']async["']/i.test(attrs);
      const isModernWebpOrAvif = /\.(webp|avif|svg)($|\?)/i.test(src);
      if (isLegacyRaster && !hasAsyncDecoding && !isModernWebpOrAvif) {
        const line = this.getLineNumber(content, match.index);
        this.addViolation({
          ruleId: 'unoptimized-images',
          severity: 'error',
          message: `Image '${src}' uses legacy raster format without modern WebP/AVIF compression or decoding="async"`,
          file: relPath,
          line
        });
      }
    }
  }

  private auditFontDisplayMissing(relPath: string, content: string): void {
    const fontFaceRegex = /@font-face\s*\{([^}]*)\}/gi;
    let match: RegExpExecArray | null;
    while ((match = fontFaceRegex.exec(content)) !== null) {
      const block = match[1] ?? '';
      const hasFontDisplay = /font-display\s*:\s*(swap|optional|fallback)/i.test(block);
      if (!hasFontDisplay) {
        const line = this.getLineNumber(content, match.index);
        this.addViolation({
          ruleId: 'font-display-missing',
          severity: 'error',
          message: '@font-face declaration without font-display: swap or optional (risk of FOIT)',
          file: relPath,
          line
        });
      }
    }
  }

  private auditInlineSvgBloat(relPath: string, content: string): void {
    if (isPathExempt(relPath, this.exemptSvgPaths)) return;
    const config = getAuditConfig(this.projectRoot);
    const maxSvgSize = config.webPerformance?.maxInlineSvgSize ?? 2048;

    const svgRegex = /<svg[\s>][\s\S]*?<\/svg>/gi;
    let match: RegExpExecArray | null;
    while ((match = svgRegex.exec(content)) !== null) {
      const svgContent = match[0];
      const isBloated =
        svgContent.length > maxSvgSize || (svgContent.match(/<path[\s>]/gi) ?? []).length > 30;
      if (isBloated) {
        const line = this.getLineNumber(content, match.index);
        this.addViolation({
          ruleId: 'inline-svg-bloat',
          severity: 'error',
          message: `Excessive inline SVG (${svgContent.length} chars) exceeding ${maxSvgSize} bytes limit; extract as asset`,
          file: relPath,
          line
        });
      }
    }
  }

  private auditCssRenderBlocking(relPath: string, content: string): void {
    const ext = path.extname(relPath).toLowerCase();
    if (ext !== '.html' && ext !== '.htm' && ext !== '.vue') return;

    // Detect synchronous blocking stylesheet links without media="print" or preload
    const linkRegex = /<link\s+([^>]*)>/gi;
    let linkMatch: RegExpExecArray | null;
    while ((linkMatch = linkRegex.exec(content)) !== null) {
      const attrs = linkMatch[1] ?? '';
      const isStylesheet = /rel=["']stylesheet["']/i.test(attrs);
      const isBlocking = !/media=["']print["']/i.test(attrs) && !/disabled/i.test(attrs);
      if (
        isStylesheet &&
        isBlocking &&
        content.includes('<head>') &&
        linkMatch.index <
          (content.indexOf('</head>') === -1 ? content.length : content.indexOf('</head>'))
      ) {
        const line = this.getLineNumber(content, linkMatch.index);
        this.addViolation({
          ruleId: 'css-render-blocking',
          severity: 'error',
          message: 'Synchronous external stylesheet in head blocking first render',
          file: relPath,
          line
        });
      }
    }

    // Detect external synchronous scripts without defer or async or type="module"
    const scriptRegex = /<script\s+([^>]*)>/gi;
    let scriptMatch: RegExpExecArray | null;
    while ((scriptMatch = scriptRegex.exec(content)) !== null) {
      const attrs = scriptMatch[1] ?? '';
      const hasSrc = /src=["'][^"']+["']/i.test(attrs);
      const isDeferred =
        /defer/i.test(attrs) || /async/i.test(attrs) || /type=["']module["']/i.test(attrs);
      if (hasSrc && !isDeferred) {
        const line = this.getLineNumber(content, scriptMatch.index);
        this.addViolation({
          ruleId: 'css-render-blocking',
          severity: 'error',
          message: 'Synchronous external script without defer, async, or type="module" attribute',
          file: relPath,
          line
        });
      }
    }
  }

  private auditExcessiveDomDepth(relPath: string, content: string): void {
    const ext = path.extname(relPath).toLowerCase();
    if (ext !== '.html' && ext !== '.htm' && ext !== '.vue') return;

    let targetContent = content;
    let lineOffset = 1;

    if (ext === '.vue') {
      const sfc = parseVueSfc(content);
      if (sfc.template) {
        lineOffset = sfc.template.contentStartLine;
        targetContent = sfc.template.content;
      } else {
        // In fragments without <template> tag, strip script/style blocks from content
        targetContent = content;
        for (const block of [...sfc.scripts, ...sfc.styles]) {
          targetContent =
            targetContent.slice(0, block.startIndex) +
            ' '.repeat(block.endIndex - block.startIndex) +
            targetContent.slice(block.endIndex);
        }
      }
    }

    const config = getAuditConfig(this.projectRoot);
    const maxAllowedDepth = config.webPerformance?.maxDomDepth ?? MAX_RECOMMENDED_DOM_DEPTH;

    let maxDepth = 0;
    let currentDepth = 0;
    let maxDepthIndex = 0;

    const tagRegex = /<\/?([\w-]+)(?:\s[^>]*)?\/?>/g;
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(targetContent)) !== null) {
      const fullTag = match[0];
      const tagName = match[1]!.toLowerCase();
      if (
        [
          'img',
          'input',
          'br',
          'hr',
          'meta',
          'link',
          'source',
          'path',
          'circle',
          'rect',
          'line',
          'polygon',
          'polyline'
        ].includes(tagName)
      ) {
        continue;
      }
      const isClosing = fullTag.startsWith('</');
      const isSelfClosing = fullTag.endsWith('/>');

      if (isClosing) {
        currentDepth = Math.max(0, currentDepth - 1);
      } else if (!isSelfClosing) {
        currentDepth++;
        if (currentDepth > maxDepth) {
          maxDepth = currentDepth;
          maxDepthIndex = match.index;
        }
      }
    }

    if (maxDepth > maxAllowedDepth) {
      const line = lineOffset + this.getLineNumber(targetContent, maxDepthIndex) - 1;
      this.addViolation({
        ruleId: 'excessive-dom-depth',
        severity: 'error',
        message: `Excessive DOM depth (${maxDepth} levels > ${maxAllowedDepth}) causing layout thrashing`,
        file: relPath,
        line
      });
    }
  }

  private auditLayoutShiftDimensions(relPath: string, content: string): void {
    const config = getAuditConfig(this.projectRoot);
    const exemptClasses = config.webPerformance?.exemptImgClasses ?? [];

    const mediaRegex = /<(img|video)\s+([^>]*)>/gi;
    let match: RegExpExecArray | null;
    while ((match = mediaRegex.exec(content)) !== null) {
      const tag = match[1]!.toLowerCase();
      const attrs = match[2] ?? '';

      // Check if class contains any of exemptImgClasses
      if (exemptClasses.length > 0) {
        const classMatch = /class=["']([^"']+)["']/i.exec(attrs);
        if (classMatch) {
          const classes = classMatch[1]!.split(/\s+/);
          if (classes.some((c) => exemptClasses.includes(c))) {
            continue;
          }
        }
      }

      const hasWidth =
        /(?:\b|:)width=["']?[^"'\s>]+/i.test(attrs) || /style=["'][^"']*width/i.test(attrs);
      const hasHeight =
        /(?:\b|:)height=["']?[^"'\s>]+/i.test(attrs) || /style=["'][^"']*height/i.test(attrs);
      const hasAspectRatio = /aspect-ratio/i.test(attrs) || /aspectRatio/i.test(attrs);
      const hasDynamicStyle = /:style=["'][^"']*(?:width|height|aspectRatio)/i.test(attrs);

      if ((!hasWidth || !hasHeight) && !hasAspectRatio && !hasDynamicStyle) {
        const line = this.getLineNumber(content, match.index);
        this.addViolation({
          ruleId: 'layout-shift-dimensions',
          severity: 'error',
          message: `Element <${tag}> lacks explicit width and height dimensions (risk of CLS)`,
          file: relPath,
          line
        });
      }
    }
  }

  private auditUncompressedVideo(relPath: string, content: string): void {
    const videoRegex = /<video\s+([^>]*)>([\s\S]*?)<\/video>/gi;
    let match: RegExpExecArray | null;
    while ((match = videoRegex.exec(content)) !== null) {
      const attrs = match[1] ?? '';
      const inner = match[2] ?? '';
      const hasPreload = /preload=["'](none|metadata)["']/i.test(attrs);
      const hasUncompressedSrc =
        /\.(mov|avi|wmv)(["'?\s>]|$)/i.test(attrs) || /\.(mov|avi|wmv)(["'?\s>]|$)/i.test(inner);
      const hasWebm = /type=["']video\/webm["']/i.test(inner) || /\.webm(["'?\s>]|$)/i.test(attrs);

      if (hasUncompressedSrc) {
        const line = this.getLineNumber(content, match.index);
        this.addViolation({
          ruleId: 'uncompressed-video',
          severity: 'error',
          message:
            'Video element with uncompressed container (.mov/.avi); use modern MP4 or WebM',
          file: relPath,
          line
        });
      } else if (!hasPreload && !hasWebm) {
        const line = this.getLineNumber(content, match.index);
        this.addViolation({
          ruleId: 'uncompressed-video',
          severity: 'error',
          message: 'Video element <video> without preload="none" or optimized WebM source',
          file: relPath,
          line
        });
      }
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateWebPerformanceAuditor());

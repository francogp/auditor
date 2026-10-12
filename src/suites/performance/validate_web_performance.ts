import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor, FileScanAuditor, createUniformRuleCapabilities, LINT_RULE_CAPABILITIES, resolveFileScanRoots } from '../../core/auditorBase.ts';
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
    const { effectiveRoot, targetRoots } = resolveFileScanRoots(options);
    const config = getAuditConfig(effectiveRoot);
    super({
      id: 'validate_web_performance',
      name: 'Web Performance & Core Web Vitals Auditor',
      description: 'Rendimiento web, Core Web Vitals y optimización frontend',
      family: 'performance',
      packageName: 'WebPerf',
      icon: '⚡',
      configKey: 'webPerformance.enabled',
      defaultConfig: { enabled: true },
      criticalConfig: {},
      roots: targetRoots,
      allowedExtensions: SCANNABLE_EXTS,
      ruleIds: WEB_PERFORMANCE_RULES,
      ruleDescriptions: {
        'unoptimized-images': 'Imagen sin compresión moderna WebP',
        'font-display-missing': '@font-face sin font-display swap',
        'inline-svg-bloat': 'SVG inline excesivo superando 2KB',
        'css-render-blocking': 'Recurso CSS o script bloqueante en head',
        'excessive-dom-depth': 'Anidamiento DOM excesivo > 16 niveles',
        'layout-shift-dimensions': 'img o video sin width o height explícito',
        'uncompressed-video': 'video sin preload none o formato webm'
      },
      ruleCapabilities: createUniformRuleCapabilities(WEB_PERFORMANCE_RULES, LINT_RULE_CAPABILITIES),
      projectRoot: effectiveRoot,
      coverage: deriveCoverageFromRoots(targetRoots, SCANNABLE_EXTS, effectiveRoot),
      exemptPaths: config.webPerformance?.exemptPaths
    });
    this.exemptSvgPaths = config.webPerformance?.exemptSvgPaths ?? [];
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
    if (content.includes('unoptimized-img-ok')) return;
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
          message: `Imagen '${src}' con formato tradicional sin compresión moderna WebP/AVIF ni decoding="async"`,
          file: relPath,
          line
        });
      }
    }
  }

  private auditFontDisplayMissing(relPath: string, content: string): void {
    if (content.includes('font-display-ok')) return;
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
          message: 'Declaración @font-face sin font-display: swap u optional (riesgo de FOIT)',
          file: relPath,
          line
        });
      }
    }
  }

  private auditInlineSvgBloat(relPath: string, content: string): void {
    if (content.includes('svg-bloat-ok')) return;
    if (isPathExempt(relPath, this.exemptSvgPaths)) return;
    const config = getAuditConfig(this.projectRoot);
    const maxSvgSize = config.webPerformance?.maxInlineSvgSize ?? 2048;

    const svgRegex = /<svg[\s>][\s\S]*?<\/svg>/gi;
    let match: RegExpExecArray | null;
    while ((match = svgRegex.exec(content)) !== null) {
      const svgContent = match[0];
      const isBloated = svgContent.length > maxSvgSize || (svgContent.match(/<path[\s>]/gi) ?? []).length > 30;
      if (isBloated) {
        const line = this.getLineNumber(content, match.index);
        this.addViolation({
          ruleId: 'inline-svg-bloat',
          severity: 'error',
          message: `SVG inline excesivo (${svgContent.length} caracteres) superando el límite de ${maxSvgSize} bytes; extraer como asset`,
          file: relPath,
          line
        });
      }
    }
  }

  private auditCssRenderBlocking(relPath: string, content: string): void {
    if (content.includes('render-blocking-ok')) return;
    const ext = path.extname(relPath).toLowerCase();
    if (ext !== '.html' && ext !== '.htm' && ext !== '.vue') return;

    // Detect synchronous blocking stylesheet links without media="print" or preload
    const linkRegex = /<link\s+([^>]*)>/gi;
    let linkMatch: RegExpExecArray | null;
    while ((linkMatch = linkRegex.exec(content)) !== null) {
      const attrs = linkMatch[1] ?? '';
      const isStylesheet = /rel=["']stylesheet["']/i.test(attrs);
      const isBlocking = !/media=["']print["']/i.test(attrs) && !/disabled/i.test(attrs);
      if (isStylesheet && isBlocking && content.includes('<head>') && linkMatch.index < (content.indexOf('</head>') === -1 ? content.length : content.indexOf('</head>'))) {
        const line = this.getLineNumber(content, linkMatch.index);
        this.addViolation({
          ruleId: 'css-render-blocking',
          severity: 'error',
          message: 'Hoja de estilos externa síncrona en head bloqueando el primer renderizado',
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
      const isDeferred = /defer/i.test(attrs) || /async/i.test(attrs) || /type=["']module["']/i.test(attrs);
      if (hasSrc && !isDeferred) {
        const line = this.getLineNumber(content, scriptMatch.index);
        this.addViolation({
          ruleId: 'css-render-blocking',
          severity: 'error',
          message: 'Script externo síncrono sin atributo defer, async o type="module"',
          file: relPath,
          line
        });
      }
    }
  }

  private auditExcessiveDomDepth(relPath: string, content: string): void {
    if (content.includes('dom-depth-ok')) return;
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
          targetContent = targetContent.slice(0, block.startIndex) + ' '.repeat(block.endIndex - block.startIndex) + targetContent.slice(block.endIndex);
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
      if (['img', 'input', 'br', 'hr', 'meta', 'link', 'source', 'path', 'circle', 'rect', 'line', 'polygon', 'polyline'].includes(tagName)) {
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
        message: `Anidamiento DOM excesivo (${maxDepth} niveles > ${maxAllowedDepth}) provocando sobrecarga de layout`,
        file: relPath,
        line
      });
    }
  }

  private auditLayoutShiftDimensions(relPath: string, content: string): void {
    if (content.includes('layout-dimensions-ok')) return;
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
          if (classes.some(c => exemptClasses.includes(c))) {
            continue;
          }
        }
      }

      const hasWidth = /(?:\b|:)width=["']?[^"'\s>]+/i.test(attrs) || /style=["'][^"']*width/i.test(attrs);
      const hasHeight = /(?:\b|:)height=["']?[^"'\s>]+/i.test(attrs) || /style=["'][^"']*height/i.test(attrs);
      const hasAspectRatio = /aspect-ratio/i.test(attrs) || /aspectRatio/i.test(attrs);
      const hasDynamicStyle = /:style=["'][^"']*(?:width|height|aspectRatio)/i.test(attrs);

      if ((!hasWidth || !hasHeight) && !hasAspectRatio && !hasDynamicStyle) {
        const line = this.getLineNumber(content, match.index);
        this.addViolation({
          ruleId: 'layout-shift-dimensions',
          severity: 'error',
          message: `Elemento <${tag}> sin dimensiones width y height explícitas (riesgo de CLS)`,
          file: relPath,
          line
        });
      }
    }
  }

  private auditUncompressedVideo(relPath: string, content: string): void {
    if (content.includes('uncompressed-video-ok')) return;
    const videoRegex = /<video\s+([^>]*)>([\s\S]*?)<\/video>/gi;
    let match: RegExpExecArray | null;
    while ((match = videoRegex.exec(content)) !== null) {
      const attrs = match[1] ?? '';
      const inner = match[2] ?? '';
      const hasPreload = /preload=["'](none|metadata)["']/i.test(attrs);
      const hasUncompressedSrc = /\.(mov|avi|wmv)(["'?\s>]|$)/i.test(attrs) || /\.(mov|avi|wmv)(["'?\s>]|$)/i.test(inner);
      const hasWebm = /type=["']video\/webm["']/i.test(inner) || /\.webm(["'?\s>]|$)/i.test(attrs);

      if (hasUncompressedSrc) {
        const line = this.getLineNumber(content, match.index);
        this.addViolation({
          ruleId: 'uncompressed-video',
          severity: 'error',
          message: 'Elemento video con formato no comprimido (.mov/.avi); utilizar MP4 o WebM moderno',
          file: relPath,
          line
        });
      } else if (!hasPreload && !hasWebm) {
        const line = this.getLineNumber(content, match.index);
        this.addViolation({
          ruleId: 'uncompressed-video',
          severity: 'error',
          message: 'Elemento <video> sin preload="none" ni fuente en formato WebM optimizado',
          file: relPath,
          line
        });
      }
    }
  }
}

await BaseAuditor.runCliIfMain(import.meta.url, new ValidateWebPerformanceAuditor());

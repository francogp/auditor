/**
 * packages/auditor/src/core/vitePrecompressPlugin.ts
 *
 * CANONICAL VITE+ PRECOMPRESSION PLUGIN (Node.js 26+ Native)
 * Generates companion .br (Brotli Q11) and .gz (Gzip L9) static assets in dist/
 * with zero third-party dependencies, multi-server configuration scaffolding
 * (Nginx, Apache .htaccess, Caddy), and concise UnifiedTheme reporting.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import util from 'node:util';
import zlib from 'node:zlib';
import { styleText } from 'node:util';

import type { Plugin } from 'vite-plus';
import type {
  AuditVitePlusPrecompressConfig,
  PrecompressServerTarget,
  VitePrecompressReportMode
} from './auditConfigTypes.ts';

const asyncBrotliCompress = util.promisify(zlib.brotliCompress);
const asyncGzip = util.promisify(zlib.gzip);

export const COMPRESSIBLE_EXTENSIONS = [
  '.js',
  '.mjs',
  '.cjs',
  '.css',
  '.html',
  '.wasm',
  '.svg',
  '.json',
  '.ico',
  '.txt',
  '.webmanifest'
] as const;

export type CompressibleExtension = (typeof COMPRESSIBLE_EXTENSIONS)[number];

export function isCompressibleExtension(ext: string): ext is CompressibleExtension {
  return COMPRESSIBLE_EXTENSIONS.some((candidate) => candidate === ext);
}

export interface VitePrecompressOptions extends AuditVitePlusPrecompressConfig {}

const DEFAULT_THRESHOLD_BYTES = 512;
const BROTLI_MAX_QUALITY = 11;
const GZIP_MAX_LEVEL = 9;
const DEFAULT_CONCURRENCY = 8;
const MAX_TABLE_DISPLAY_ENTRIES = 25;
const BYTES_IN_KB = 1024;
const BYTES_IN_MB = 1024 * 1024;

interface AssetCompressionStat {
  readonly relPath: string;
  readonly origBytes: number;
  readonly gzipBytes: number;
  readonly brotliBytes: number;
  readonly savingsPercent: number;
}

function formatBytes(bytes: number): string {
  if (bytes >= BYTES_IN_MB) {
    return `${(bytes / BYTES_IN_MB).toFixed(2)} MB`;
  }
  return `${(bytes / BYTES_IN_KB).toFixed(2)} kB`;
}

async function getAllFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

async function mapConcurrent<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  async function worker(): Promise<void> {
    while (currentIndex < items.length) {
      const idx = currentIndex++;
      const item = items[idx];
      if (item !== undefined) {
        results[idx] = await fn(item);
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function compressAsset(
  filePath: string,
  distDir: string,
  options: VitePrecompressOptions
): Promise<AssetCompressionStat | null> {
  const threshold = options.threshold ?? DEFAULT_THRESHOLD_BYTES;
  const enableBrotli = options.brotli !== false;
  const enableGzip = options.gzip !== false;

  try {
    const content = await fs.readFile(filePath);
    if (content.byteLength < threshold) return null;

    let brotliBytes = content.byteLength;
    let gzipBytes = content.byteLength;

    if (enableBrotli) {
      const brotliBuffer = await asyncBrotliCompress(content, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: BROTLI_MAX_QUALITY }
      });
      await fs.writeFile(`${filePath}.br`, brotliBuffer);
      brotliBytes = brotliBuffer.byteLength;
    }

    if (enableGzip) {
      const gzipBuffer = await asyncGzip(content, { level: GZIP_MAX_LEVEL });
      await fs.writeFile(`${filePath}.gz`, gzipBuffer);
      gzipBytes = gzipBuffer.byteLength;
    }

    const relPath = path.relative(distDir, filePath).replace(/\\/g, '/');
    const bestCompressed = Math.min(
      enableBrotli ? brotliBytes : content.byteLength,
      enableGzip ? gzipBytes : content.byteLength
    );
    const savings = ((content.byteLength - bestCompressed) / content.byteLength) * 100;

    return {
      relPath,
      origBytes: content.byteLength,
      gzipBytes,
      brotliBytes,
      savingsPercent: savings
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[vite-precompress] Error al comprimir ${path.basename(filePath)}:`, msg);
    return null;
  }
}

/**
 * Builds canonical Apache .htaccess directives for serving precompressed .br and .gz assets
 * with correct MIME types, Content-Encoding, Vary headers, and SPA routing.
 */
export function buildApacheHtaccess(spa = true): string {
  const spaDirectives = spa
    ? `
    # SPA HTML5 History Mode Routing
    RewriteRule ^index\\.html$ - [L]
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule . /index.html [L]
`
    : '';

  return `# Generated automatically by @francogp/auditor (vitePrecompressPlugin)
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /

    # 1. Servir Brotli (.br) si el navegador lo soporta y el archivo existe
    RewriteCond %{HTTP:Accept-Encoding} \\bbr\\b
    RewriteCond %{REQUEST_FILENAME}\\.br -s
    RewriteRule ^(.+)$ $1\\.br [L]

    # 2. Servir Gzip (.gz) como fallback si el archivo existe
    RewriteCond %{HTTP:Accept-Encoding} \\bgzip\\b
    RewriteCond %{REQUEST_FILENAME}\\.gz -s
    RewriteRule ^(.+)$ $1\\.gz [L]
${spaDirectives}</IfModule>

# Deshabilitar MultiViews para evitar conflictos de nombres con extensiones .br/.gz
<FilesMatch "\\.(br|gz)$">
    Options -MultiViews
</FilesMatch>

# Asignar Content-Encoding y Content-Type correctos para archivos comprimidos
<IfModule mod_headers.c>
    # Brotli Headers
    <FilesMatch "\\.html\\.br$">
        Header set Content-Encoding "br"
        Header set Content-Type "text/html; charset=UTF-8"
    </FilesMatch>
    <FilesMatch "\\.css\\.br$">
        Header set Content-Encoding "br"
        Header set Content-Type "text/css"
    </FilesMatch>
    <FilesMatch "\\.(js|mjs)\\.br$">
        Header set Content-Encoding "br"
        Header set Content-Type "application/javascript"
    </FilesMatch>
    <FilesMatch "\\.svg\\.br$">
        Header set Content-Encoding "br"
        Header set Content-Type "image/svg+xml"
    </FilesMatch>
    <FilesMatch "\\.json\\.br$">
        Header set Content-Encoding "br"
        Header set Content-Type "application/json"
    </FilesMatch>
    <FilesMatch "\\.wasm\\.br$">
        Header set Content-Encoding "br"
        Header set Content-Type "application/wasm"
    </FilesMatch>

    # Gzip Headers
    <FilesMatch "\\.html\\.gz$">
        Header set Content-Encoding "gzip"
        Header set Content-Type "text/html; charset=UTF-8"
    </FilesMatch>
    <FilesMatch "\\.css\\.gz$">
        Header set Content-Encoding "gzip"
        Header set Content-Type "text/css"
    </FilesMatch>
    <FilesMatch "\\.(js|mjs)\\.gz$">
        Header set Content-Encoding "gzip"
        Header set Content-Type "application/javascript"
    </FilesMatch>
    <FilesMatch "\\.svg\\.gz$">
        Header set Content-Encoding "gzip"
        Header set Content-Type "image/svg+xml"
    </FilesMatch>
    <FilesMatch "\\.json\\.gz$">
        Header set Content-Encoding "gzip"
        Header set Content-Type "application/json"
    </FilesMatch>
    <FilesMatch "\\.wasm\\.gz$">
        Header set Content-Encoding "gzip"
        Header set Content-Type "application/wasm"
    </FilesMatch>

    # Informar a proxies y CDNs que la respuesta varía según Accept-Encoding
    Header append Vary Accept-Encoding

    # Cache inmutable para activos con hash
    <FilesMatch "\\.(js|mjs|css|svg|wasm|json|png|jpg|webp|woff2)$">
        Header set Cache-Control "max-age=31536000, immutable"
    </FilesMatch>

    # Anti-stale para index.html
    <FilesMatch "index\\.html$">
        Header set Cache-Control "no-cache, no-store, must-revalidate"
    </FilesMatch>
</IfModule>
`;
}

/**
 * Builds canonical Nginx configuration snippet for precompressed assets.
 */
export function buildNginxConfigSnippet(): string {
  return `# Generated automatically by @francogp/auditor (vitePrecompressPlugin)
# Include this block inside your Nginx location / { ... } or server { ... } block
gzip_static on;
brotli_static on;
`;
}

/**
 * Builds canonical Caddyfile snippet for precompressed assets.
 */
export function buildCaddyConfigSnippet(): string {
  return `# Generated automatically by @francogp/auditor (vitePrecompressPlugin)
# Include inside your Caddy site block:
file_server {
    precompressed br gzip
}
`;
}

async function scaffoldServerConfigurations(
  distDir: string,
  serverTarget: PrecompressServerTarget,
  spa = true
): Promise<void> {
  if (serverTarget === 'apache' || serverTarget === 'all') {
    const htaccessPath = path.join(distDir, '.htaccess');
    await fs.writeFile(htaccessPath, buildApacheHtaccess(spa), 'utf-8');
  }

  if (serverTarget === 'nginx' || serverTarget === 'all') {
    const nginxPath = path.join(distDir, 'nginx-precompressed.conf');
    await fs.writeFile(nginxPath, buildNginxConfigSnippet(), 'utf-8');
  }

  if (serverTarget === 'caddy' || serverTarget === 'all') {
    const caddyPath = path.join(distDir, 'Caddyfile.snippet');
    await fs.writeFile(caddyPath, buildCaddyConfigSnippet(), 'utf-8');
  }
}

function renderTableReport(
  stats: readonly AssetCompressionStat[],
  totalOrig: number,
  totalGzip: number,
  totalBrotli: number
): void {
  const TABLE_WIDTH = 78;
  console.log('\n┌' + '─'.repeat(TABLE_WIDTH) + '┐');
  console.log(
    '│ ' +
      styleText(
        'bold',
        '⚡ AUDITOR — PRE-COMPRESSION SUMMARY (Brotli Q11 & Gzip L9)'.padEnd(TABLE_WIDTH - 1)
      ) +
      '│'
  );
  console.log('├' + '─'.repeat(TABLE_WIDTH) + '┤');

  for (const s of stats.slice(0, MAX_TABLE_DISPLAY_ENTRIES)) {
    const name = s.relPath.length > 34 ? `…${s.relPath.slice(-33)}` : s.relPath.padEnd(34);
    const orig = formatBytes(s.origBytes).padStart(10);
    const gz = formatBytes(s.gzipBytes).padStart(10);
    const br = formatBytes(s.brotliBytes).padStart(10);
    const sav = `-${s.savingsPercent.toFixed(0)}%`.padStart(6);
    console.log(`│ ${name} │ ${orig} │ ${gz} │ ${br} │ ${sav} │`);
  }

  if (stats.length > MAX_TABLE_DISPLAY_ENTRIES) {
    console.log(`│ … y ${stats.length - MAX_TABLE_DISPLAY_ENTRIES} archivos más`.padEnd(TABLE_WIDTH + 1) + '│');
  }

  console.log('├' + '─'.repeat(TABLE_WIDTH) + '┤');
  const totName = `TOTAL (${stats.length} archivos)`.padEnd(34);
  const totOrig = formatBytes(totalOrig).padStart(10);
  const totGz = formatBytes(totalGzip).padStart(10);
  const totBr = formatBytes(totalBrotli).padStart(10);
  const bestTotal = Math.min(totalGzip, totalBrotli);
  const totSav = `-${(((totalOrig - bestTotal) / totalOrig) * 100).toFixed(1)}%`.padStart(6);
  console.log(`│ ${styleText('bold', totName)} │ ${totOrig} │ ${totGz} │ ${totBr} │ ${totSav} │`);
  console.log('└' + '─'.repeat(TABLE_WIDTH) + '┘\n');
}

/**
 * Canonical Vite Plugin for zero-dependency Brotli & Gzip static precompression.
 */
export function vitePrecompressPlugin(userOptions: VitePrecompressOptions = {}): Plugin {
  let resolvedOutDir = userOptions.outDir;

  return {
    name: 'vite-plugin-auditor-precompress',
    apply: 'build',
    configResolved(config) {
      if (!resolvedOutDir) {
        resolvedOutDir = config.build.outDir || 'dist';
      }
    },
    async closeBundle() {
      if (userOptions.enabled === false) return;

      const distDir = path.resolve(process.cwd(), resolvedOutDir || 'dist');
      try {
        await fs.access(distDir);
      } catch {
        return;
      }

      const startTime = performance.now();
      const files = await getAllFiles(distDir);
      const compressibleFiles = files.filter((filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (!isCompressibleExtension(ext)) return false;
        return !filePath.endsWith('.gz') && !filePath.endsWith('.br');
      });

      if (compressibleFiles.length === 0) return;

      const statsResults = await mapConcurrent(
        compressibleFiles,
        DEFAULT_CONCURRENCY,
        (filePath) => compressAsset(filePath, distDir, userOptions)
      );

      const stats = statsResults.filter((s): s is AssetCompressionStat => s !== null);
      if (stats.length === 0) return;

      let totalOrig = 0;
      let totalGzip = 0;
      let totalBrotli = 0;
      for (const s of stats) {
        totalOrig += s.origBytes;
        totalGzip += s.gzipBytes;
        totalBrotli += s.brotliBytes;
      }

      const serverTarget = userOptions.server ?? 'nginx';
      await scaffoldServerConfigurations(distDir, serverTarget, userOptions.spa !== false);

      const reportMode: VitePrecompressReportMode = userOptions.report ?? 'summary';
      if (reportMode === 'silent') return;

      if (reportMode === 'table') {
        renderTableReport(stats, totalOrig, totalGzip, totalBrotli);
        return;
      }

      // Default 'summary' mode: concise single line
      const elapsedSec = ((performance.now() - startTime) / 1000).toFixed(2);
      const bestBytes = Math.min(totalGzip, totalBrotli);
      const savedPercent = (((totalOrig - bestBytes) / totalOrig) * 100).toFixed(1);
      const algos = [
        userOptions.brotli !== false ? 'Brotli Q11' : '',
        userOptions.gzip !== false ? 'Gzip L9' : ''
      ]
        .filter(Boolean)
        .join(' & ');

      const serverTag = serverTarget !== 'nginx' ? ` [${serverTarget}]` : '';
      const summaryMsg =
        styleText('cyan', '⚡ [auditor] ') +
        `Pre-compressed ${styleText('bold', String(stats.length))} assets in ${elapsedSec}s ` +
        `(${algos}${serverTag} | ${formatBytes(totalOrig)} → ${formatBytes(bestBytes)}, ` +
        styleText('green', `-${savedPercent}%`) +
        ' saved)';

      console.log(summaryMsg);
    }
  };
}

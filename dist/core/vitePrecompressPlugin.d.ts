import { AuditVitePlusPrecompressConfig } from "./auditConfigTypes.js";
import { Plugin } from "vite-plus";
//#region src/core/vitePrecompressPlugin.d.ts
export declare const COMPRESSIBLE_EXTENSIONS: readonly [".js", ".mjs", ".cjs", ".css", ".html", ".wasm", ".svg", ".json", ".ico", ".txt", ".webmanifest"];
export type CompressibleExtension = (typeof COMPRESSIBLE_EXTENSIONS)[number];
export declare function isCompressibleExtension(ext: string): ext is CompressibleExtension;
export type VitePrecompressOptions = Partial<AuditVitePlusPrecompressConfig>;
/**
 * Builds canonical Apache .htaccess directives for serving precompressed .br and .gz assets
 * with correct MIME types, Content-Encoding, Vary headers, and SPA routing.
 */
export declare function buildApacheHtaccess(spa?: boolean): string;
/**
 * Builds canonical Nginx configuration snippet for precompressed assets.
 */
export declare function buildNginxConfigSnippet(): string;
/**
 * Builds canonical Caddyfile snippet for precompressed assets.
 */
export declare function buildCaddyConfigSnippet(): string;
/**
 * Canonical Vite Plugin for zero-dependency Brotli & Gzip static precompression.
 */
export declare function vitePrecompressPlugin(userOptions?: VitePrecompressOptions): Plugin;
//#endregion
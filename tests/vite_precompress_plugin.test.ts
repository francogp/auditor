import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import { describe, it, expect, beforeEach, afterEach, vi } from 'vite-plus/test';

import {
  vitePrecompressPlugin,
  buildApacheHtaccess,
  buildNginxConfigSnippet,
  buildCaddyConfigSnippet,
  isCompressibleExtension,
  COMPRESSIBLE_EXTENSIONS
} from '../src/core/vitePrecompressPlugin.ts';

describe('vitePrecompressPlugin', () => {
  let tempDir: string;
  let distDir: string;

  beforeEach(async () => {
    tempDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'vite-precompress-test-'));
    distDir = path.join(tempDir, 'dist');
    await fs.mkdir(distDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('validates compressible extensions accurately', () => {
    expect(isCompressibleExtension('.js')).toBe(true);
    expect(isCompressibleExtension('.css')).toBe(true);
    expect(isCompressibleExtension('.html')).toBe(true);
    expect(isCompressibleExtension('.wasm')).toBe(true);
    expect(isCompressibleExtension('.svg')).toBe(true);
    expect(isCompressibleExtension('.json')).toBe(true);
    expect(isCompressibleExtension('.png')).toBe(false);
    expect(isCompressibleExtension('.jpg')).toBe(false);
    expect(COMPRESSIBLE_EXTENSIONS).toContain('.webmanifest');
  });

  it('generates standalone snippet strings for server configurations', () => {
    expect(buildApacheHtaccess(true)).toContain('RewriteEngine On');
    expect(buildApacheHtaccess(true)).toContain('RewriteRule . /index.html [L]');
    expect(buildApacheHtaccess(false)).not.toContain('RewriteRule . /index.html [L]');
    expect(buildNginxConfigSnippet()).toContain('gzip_static on;');
    expect(buildCaddyConfigSnippet()).toContain('precompressed br gzip');
  });

  it('precompresses valid assets above threshold to Brotli and Gzip', async () => {
    const jsContent = 'console.log("hello world");\n'.repeat(100);
    const cssContent = '.btn { display: flex; color: red; }\n'.repeat(100);
    const smallContent = 'a';

    await fs.writeFile(path.join(distDir, 'app.js'), jsContent, 'utf-8');
    await fs.writeFile(path.join(distDir, 'style.css'), cssContent, 'utf-8');
    await fs.writeFile(path.join(distDir, 'small.js'), smallContent, 'utf-8');

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      const plugin = vitePrecompressPlugin({ report: 'silent', threshold: 50 });
      if (typeof plugin.closeBundle === 'function') {
        await plugin.closeBundle.call({} as never);
      }

      // Verify files generated
      expect(fsSync.existsSync(path.join(distDir, 'app.js.br'))).toBe(true);
      expect(fsSync.existsSync(path.join(distDir, 'app.js.gz'))).toBe(true);
      expect(fsSync.existsSync(path.join(distDir, 'style.css.br'))).toBe(true);
      expect(fsSync.existsSync(path.join(distDir, 'style.css.gz'))).toBe(true);

      // Verify small file ignored
      expect(fsSync.existsSync(path.join(distDir, 'small.js.br'))).toBe(false);
      expect(fsSync.existsSync(path.join(distDir, 'small.js.gz'))).toBe(false);

      // Verify uncompressed content matches
      const gzBuf = await fs.readFile(path.join(distDir, 'app.js.gz'));
      const decompressedGz = zlib.gunzipSync(gzBuf).toString('utf-8');
      expect(decompressedGz).toBe(jsContent);

      const brBuf = await fs.readFile(path.join(distDir, 'app.js.br'));
      const decompressedBr = zlib.brotliDecompressSync(brBuf).toString('utf-8');
      expect(decompressedBr).toBe(jsContent);
    } finally {
      cwdSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  it('respects brotli: false and gzip: false flags', async () => {
    const jsContent = 'const x = 42;\n'.repeat(100);
    await fs.writeFile(path.join(distDir, 'test.js'), jsContent, 'utf-8');

    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);

    try {
      const pluginOnlyGz = vitePrecompressPlugin({ brotli: false, gzip: true, report: 'silent' });
      if (typeof pluginOnlyGz.closeBundle === 'function') {
        await pluginOnlyGz.closeBundle.call({} as never);
      }
      expect(fsSync.existsSync(path.join(distDir, 'test.js.gz'))).toBe(true);
      expect(fsSync.existsSync(path.join(distDir, 'test.js.br'))).toBe(false);
    } finally {
      cwdSpy.mockRestore();
    }
  });

  describe('Multi-server configuration scaffolding', () => {
    it('generates nginx config snippet when server: "nginx" (default)', async () => {
      const jsContent = 'alert("nginx test");\n'.repeat(50);
      await fs.writeFile(path.join(distDir, 'main.js'), jsContent, 'utf-8');

      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
      try {
        const plugin = vitePrecompressPlugin({ server: 'nginx', report: 'silent' });
        if (typeof plugin.closeBundle === 'function') {
          await plugin.closeBundle.call({} as never);
        }

        const nginxConf = path.join(distDir, 'nginx-precompressed.conf');
        expect(fsSync.existsSync(nginxConf)).toBe(true);
        const content = await fs.readFile(nginxConf, 'utf-8');
        expect(content).toContain('gzip_static on;');
        expect(content).toContain('brotli_static on;');
      } finally {
        cwdSpy.mockRestore();
      }
    });

    it('generates production-grade .htaccess when server: "apache"', async () => {
      const jsContent = 'alert("apache test");\n'.repeat(50);
      await fs.writeFile(path.join(distDir, 'main.js'), jsContent, 'utf-8');

      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
      try {
        const plugin = vitePrecompressPlugin({ server: 'apache', spa: true, report: 'silent' });
        if (typeof plugin.closeBundle === 'function') {
          await plugin.closeBundle.call({} as never);
        }

        const htaccessPath = path.join(distDir, '.htaccess');
        expect(fsSync.existsSync(htaccessPath)).toBe(true);
        const content = await fs.readFile(htaccessPath, 'utf-8');
        expect(content).toContain('RewriteCond %{HTTP:Accept-Encoding} \\bbr\\b');
        expect(content).toContain('RewriteCond %{REQUEST_FILENAME}\\.br -s');
        expect(content).toContain('Header set Content-Encoding "br"');
        expect(content).toContain('Header set Content-Encoding "gzip"');
        expect(content).toContain('Header append Vary Accept-Encoding');
        expect(content).toContain('RewriteRule . /index.html [L]');
      } finally {
        cwdSpy.mockRestore();
      }
    });

    it('generates Caddyfile snippet when server: "caddy"', async () => {
      const jsContent = 'alert("caddy test");\n'.repeat(50);
      await fs.writeFile(path.join(distDir, 'main.js'), jsContent, 'utf-8');

      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
      try {
        const plugin = vitePrecompressPlugin({ server: 'caddy', report: 'silent' });
        if (typeof plugin.closeBundle === 'function') {
          await plugin.closeBundle.call({} as never);
        }

        const caddyPath = path.join(distDir, 'Caddyfile.snippet');
        expect(fsSync.existsSync(caddyPath)).toBe(true);
        const content = await fs.readFile(caddyPath, 'utf-8');
        expect(content).toContain('precompressed br gzip');
      } finally {
        cwdSpy.mockRestore();
      }
    });

    it('generates all server configs when server: "all"', async () => {
      const jsContent = 'alert("all test");\n'.repeat(50);
      await fs.writeFile(path.join(distDir, 'main.js'), jsContent, 'utf-8');

      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
      try {
        const plugin = vitePrecompressPlugin({ server: 'all', report: 'silent' });
        if (typeof plugin.closeBundle === 'function') {
          await plugin.closeBundle.call({} as never);
        }

        expect(fsSync.existsSync(path.join(distDir, '.htaccess'))).toBe(true);
        expect(fsSync.existsSync(path.join(distDir, 'nginx-precompressed.conf'))).toBe(true);
        expect(fsSync.existsSync(path.join(distDir, 'Caddyfile.snippet'))).toBe(true);
      } finally {
        cwdSpy.mockRestore();
      }
    });
  });

  describe('Report modes', () => {
    it('prints concise single line in summary mode (default)', async () => {
      const jsContent = 'console.log("summary report");\n'.repeat(50);
      await fs.writeFile(path.join(distDir, 'bundle.js'), jsContent, 'utf-8');

      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      try {
        const plugin = vitePrecompressPlugin({ report: 'summary' });
        if (typeof plugin.closeBundle === 'function') {
          await plugin.closeBundle.call({} as never);
        }

        expect(logSpy).toHaveBeenCalledTimes(1);
        const output = String(logSpy.mock.calls[0]?.[0]);
        expect(output).toContain('[auditor]');
        expect(output).toContain('Pre-compressed');
        expect(output).toContain('Brotli Q11 & Gzip L9');
      } finally {
        cwdSpy.mockRestore();
        logSpy.mockRestore();
      }
    });

    it('prints nothing in silent mode', async () => {
      const jsContent = 'console.log("silent");\n'.repeat(50);
      await fs.writeFile(path.join(distDir, 'bundle.js'), jsContent, 'utf-8');

      const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      try {
        const plugin = vitePrecompressPlugin({ report: 'silent' });
        if (typeof plugin.closeBundle === 'function') {
          await plugin.closeBundle.call({} as never);
        }

        expect(logSpy).not.toHaveBeenCalled();
      } finally {
        cwdSpy.mockRestore();
        logSpy.mockRestore();
      }
    });
  });
});

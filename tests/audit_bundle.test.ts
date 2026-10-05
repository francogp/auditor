/**
 * tests/audit_bundle.test.ts
 *
 * Hermetic unit test suite for Production Bundle & Chunk Auditor (audit_bundle.ts)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  parseVisualizerData,
  aggregateModuleSizes,
  auditSingleChunk,
  runBundleAudit,
  type VisualizerData
} from '../src/cli/audit_bundle.ts';
import { resetAuditConfig } from '../src/core/auditConfig.ts';

describe('Production Bundle Auditor (audit_bundle.ts)', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-bundle-test-'));
    resetAuditConfig();
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    resetAuditConfig();
  });

  describe('parseVisualizerData', () => {
    it('parses window.data object correctly from visualizer HTML string', () => {
      const html = `<html><head><script>window.data = {"nodeMetas":{"m1":{"id":"src/main.ts"}},"nodeParts":{"p1":{"metaUid":"m1","renderedLength":1024,"gzipLength":512}}};</script></head><body></body></html>`;
      const data = parseVisualizerData(html);
      expect(data).not.toBeNull();
      expect(data?.nodeMetas['m1']?.id).toBe('src/main.ts');
      expect(data?.nodeParts['p1']?.renderedLength).toBe(1024);
    });

    it('returns null if window.data is missing or malformed', () => {
      expect(parseVisualizerData('<html><body>No data here</body></html>')).toBeNull();
      expect(parseVisualizerData('window.data = {malformed json};</script>')).toBeNull();
    });
  });

  describe('aggregateModuleSizes', () => {
    it('aggregates module sizes and detects multi-chunk presence', () => {
      const mockData: VisualizerData = {
        nodeMetas: {
          u1: { id: 'node_modules/lodash/index.js' }
        },
        nodeParts: {
          p1: { metaUid: 'u1', renderedLength: 20 * 1024, gzipLength: 5 * 1024 },
          p2: { metaUid: 'u1', renderedLength: 20 * 1024, gzipLength: 5 * 1024 }
        }
      };

      const result = aggregateModuleSizes(mockData);
      expect(result.length).toBe(1);
      expect(result[0]?.id).toBe('node_modules/lodash/index.js');
      expect(result[0]?.rendered).toBe(40 * 1024);
      expect(result[0]?.heavyChunkCount).toBe(2);
      expect(result[0]?.count).toBe(2);
    });
  });

  describe('auditSingleChunk', () => {
    it('passes for chunk within configured budget', () => {
      const chunkFile = path.join(tempDir, 'vendor-vue-core.js');
      fs.writeFileSync(chunkFile, Buffer.alloc(100 * 1024)); // 100 KB

      const budgets = [{ name: 'vendor-vue', prefix: 'vendor-vue', limitBytes: 250 * 1024 }];
      const result = auditSingleChunk('vendor-vue-core.js', chunkFile, budgets);

      expect(result.status).toBe('passed');
      expect(result.sizeBytes).toBe(100 * 1024);
    });

    it('fails when chunk exceeds configured budget', () => {
      const chunkFile = path.join(tempDir, 'auth-client.js');
      fs.writeFileSync(chunkFile, Buffer.alloc(300 * 1024)); // 300 KB

      const budgets = [{ name: 'auth', prefix: 'auth-', limitBytes: 150 * 1024 }];
      const result = auditSingleChunk('auth-client.js', chunkFile, budgets);

      expect(result.status).toBe('failed');
      expect(result.note).toContain('Supera presupuesto');
    });

    it('fails when unbudgeted chunk exceeds general 500 KB limit', () => {
      const chunkFile = path.join(tempDir, 'custom-feature.js');
      fs.writeFileSync(chunkFile, Buffer.alloc(600 * 1024)); // 600 KB

      const result = auditSingleChunk('custom-feature.js', chunkFile, []);
      expect(result.status).toBe('failed');
      expect(result.note).toContain('Chunk no presupuestado excede límite');
    });
  });

  describe('runBundleAudit in isolated sandbox', () => {
    it('passes with zero errors on compliant bundle artifacts', async () => {
      const scratchDir = path.join(tempDir, 'scratch');
      const distDir = path.join(tempDir, 'dist/assets');
      fs.mkdirSync(scratchDir, { recursive: true });
      fs.mkdirSync(distDir, { recursive: true });

      const statsContent = `<html><head><script>window.data = {"nodeMetas":{"m1":{"id":"src/app.ts"}},"nodeParts":{"p1":{"metaUid":"m1","renderedLength":5000,"gzipLength":2000}}};</script></head><body></body></html>`;
      fs.writeFileSync(path.join(scratchDir, 'bundle_stats.html'), statsContent);

      const chunkFile = path.join(distDir, 'main-chunk.js');
      fs.writeFileSync(chunkFile, Buffer.alloc(50 * 1024)); // 50 KB

      const summary = await runBundleAudit(tempDir);
      expect(summary.success).toBe(true);
      expect(summary.totalErrors).toBe(0);
      expect(summary.topModules.length).toBe(1);
      expect(summary.chunkResults.length).toBe(1);
    });

    it('detects errors when duplicate module exceeds threshold', async () => {
      const scratchDir = path.join(tempDir, 'scratch');
      fs.mkdirSync(scratchDir, { recursive: true });

      // Module replicated across heavy chunks > 500 KB
      const statsContent = `<html><head><script>window.data = {
        "nodeMetas":{"m1":{"id":"huge-shared-lib.js"}},
        "nodeParts":{
          "p1":{"metaUid":"m1","renderedLength":300000,"gzipLength":100000},
          "p2":{"metaUid":"m1","renderedLength":300000,"gzipLength":100000}
        }
      };</script></head><body></body></html>`;
      fs.writeFileSync(path.join(scratchDir, 'bundle_stats.html'), statsContent);

      const summary = await runBundleAudit(tempDir);
      expect(summary.success).toBe(false);
      expect(summary.totalErrors).toBeGreaterThanOrEqual(1);
      expect(summary.duplicateViolations.length).toBe(1);
      expect(summary.duplicateViolations[0]).toContain('huge-shared-lib.js');
    });

    it('returns success with 0 errors when bundle.enabled is explicitly false', async () => {
      // Create config with bundle.enabled: false
      fs.mkdirSync(path.join(tempDir, '.auditor'), { recursive: true });
      const configPath = path.join(tempDir, '.auditor', 'audit.config.json');
      fs.writeFileSync(configPath, JSON.stringify({
        name: 'test-no-bundle',
        bundle: { enabled: false }
      }));

      const summary = await runBundleAudit(tempDir);
      expect(summary.success).toBe(true);
      expect(summary.totalErrors).toBe(0);
      expect(summary.totalWarnings).toBe(0);
    });
  });
});

/**
 * tests/package_index_exports.test.ts
 *
 * Verifies public package exports from the canonical entrypoint src/index.ts,
 * ensuring complete public API stability for host sub-auditors and extension plugins.
 */

import { describe, it, expect } from 'vitest';
import * as AuditorPackage from '../src/index.ts';

describe('Public Package Exports (src/index.ts)', () => {
  it('exports core auditor runtime and base classes', () => {
    expect(AuditorPackage.BaseAuditor).toBeDefined();
    expect(AuditorPackage.FileScanAuditor).toBeDefined();
    expect(AuditorPackage.getAuditConfig).toBeDefined();
    expect(typeof AuditorPackage.BaseAuditor.runCliIfMain).toBe('function');
  });

  it('exports canonical Vue SFC parser helpers for host sub-auditors and extensions', () => {
    expect(typeof AuditorPackage.parseVueSfc).toBe('function');
    expect(typeof AuditorPackage.parseVueSfcBlocks).toBe('function');
    expect(AuditorPackage.VUE_SFC_BLOCK_TAGS).toEqual(['template', 'script', 'style']);

    const sample = `
      <template><div>Hello</div></template>
      <script setup lang="ts">
      const msg = 'world';
      </script>
      <style scoped>
      div { color: red; }
      </style>
    `;
    const parsed = AuditorPackage.parseVueSfc(sample);
    expect(parsed.template?.content.trim()).toBe('<div>Hello</div>');
    expect(parsed.scripts[0]?.content.trim()).toContain("const msg = 'world';");
    expect(parsed.styles[0]?.content.trim()).toContain('div { color: red; }');
  });

  it('exports extension definition helper and homebrew analyzers', () => {
    expect(typeof AuditorPackage.defineAuditorExtension).toBe('function');
    expect(AuditorPackage.HomebrewDetectorRegistry).toBeDefined();
    expect(typeof AuditorPackage.HomebrewDetectorRegistry.getAll).toBe('function');
    expect(AuditorPackage.HomebrewDetectorRegistry.getAll().length).toBeGreaterThan(0);
  });

  it('exports AST context caching and inspection utilities', () => {
    expect(AuditorPackage.SharedAstContext).toBeDefined();
    const ctx = new AuditorPackage.SharedAstContext();
    expect(typeof ctx.getSourceFile).toBe('function');
  });

  it('exports streaming runner and reporting primitives', () => {
    expect(typeof AuditorPackage.executeAuditorStreaming).toBe('function');
    expect(AuditorPackage.TaskStreamCoordinator).toBeDefined();
    expect(typeof AuditorPackage.renderBoxTable).toBe('function');
    expect(typeof AuditorPackage.renderBanner).toBe('function');
  });

  it('exports safe path resolution and environment utilities', () => {
    expect(typeof AuditorPackage.safeResolve).toBe('function');
    expect(typeof AuditorPackage.safeJoin).toBe('function');
    expect(typeof AuditorPackage.isInCodeRoots).toBe('function');
  });


  it('exports framework version metadata and conformance test runner', () => {
    expect(typeof AuditorPackage.AUDITOR_VERSION).toBe('string');
    expect(typeof AuditorPackage.validateAuditorConstruction).toBe('function');
    expect(typeof AuditorPackage.runAuditorContractConformanceTests).toBe('function');
  });
});

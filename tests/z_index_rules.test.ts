/**
 * tests/z_index_rules.test.ts
 *
 * Exhaustive unit tests for Z-Index Design System Parity and isolated constant rules.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CANONICAL_DEFAULT_Z_LAYERS,
  Z_INDEX_CONSISTENCY_DESCRIPTOR,
  ACTIVE_Z_LAYERS,
  resolveZLayer,
  zIndexAudit,
  zIndexConstantDeclaration
} from '../src/analyzers/zIndexRules.ts';
import {
  setAuditConfig,
  defineAuditConfig,
  resetAuditConfig
} from '../src/core/auditConfig.ts';

describe('zIndexRules Analyzer', () => {
  beforeEach(() => {
    resetAuditConfig();
  });

  afterEach(() => {
    resetAuditConfig();
  });

  describe('CANONICAL_DEFAULT_Z_LAYERS & Descriptors', () => {
    it('declares canonical default Z-index layers', () => {
      expect(CANONICAL_DEFAULT_Z_LAYERS.BASE).toBe(0);
      expect(CANONICAL_DEFAULT_Z_LAYERS.MODAL).toBe(11000);
      expect(CANONICAL_DEFAULT_Z_LAYERS.TOOLTIP).toBe(15000);
      expect(CANONICAL_DEFAULT_Z_LAYERS.TOAST).toBe(20000);
    });

    it('declares valid rule descriptor for z-index parity', () => {
      expect(Z_INDEX_CONSISTENCY_DESCRIPTOR.id).toBe('z-index-parity');
      expect(Z_INDEX_CONSISTENCY_DESCRIPTOR.name).toContain('Z-Index Parity');
      expect(Z_INDEX_CONSISTENCY_DESCRIPTOR.aliases).toContain('z-index');
    });

    it('maintains active layers aligned with default configuration', () => {
      expect(ACTIVE_Z_LAYERS.BASE).toBe(0);
      expect(ACTIVE_Z_LAYERS.MODAL).toBe(11000);
    });
  });

  describe('resolveZLayer helper', () => {
    it('resolves exact match to standard CSS variable expression', () => {
      const resModal = resolveZLayer(11000);
      expect(resModal.exactKey).toBe('MODAL');
      expect(resModal.cssVarExpr).toBe('var(--z-modal)');

      const resBase = resolveZLayer(0);
      expect(resBase.exactKey).toBe('BASE');
      expect(resBase.cssVarExpr).toBe('var(--z-base)');
    });

    it('resolves relative match with positive offset', () => {
      const res = resolveZLayer(11005);
      expect(res.exactKey).toBeUndefined();
      expect(res.nearestKey).toBe('MODAL');
      expect(res.offset).toBe(5);
      expect(res.cssVarExpr).toBe('calc(var(--z-modal) + 5)');
    });

    it('resolves relative match with negative offset', () => {
      const res = resolveZLayer(10995);
      expect(res.exactKey).toBeUndefined();
      expect(res.nearestKey).toBe('MODAL');
      expect(res.offset).toBe(-5);
      expect(res.cssVarExpr).toBe('calc(var(--z-modal) - 5)');
    });
  });

  describe('zIndexAudit Rule', () => {
    it('matches hardcoded z-index in CSS and JS', () => {
      zIndexAudit.regex.lastIndex = 0;
      expect(zIndexAudit.regex.test('z-index: 100')).toBe(true);

      zIndexAudit.regex.lastIndex = 0;
      expect(zIndexAudit.regex.test('zIndex: 11000')).toBe(true);

      zIndexAudit.regex.lastIndex = 0;
      expect(zIndexAudit.regex.test('z-index: -1')).toBe(true);
    });

    it('generates appropriate messages for exact, relative, and out-of-standard layers', () => {
      const msgExact = typeof zIndexAudit.message === 'function' ? zIndexAudit.message('z-index: 11000') : zIndexAudit.message;
      expect(msgExact).toContain('Z_LAYERS.MODAL');
      expect(msgExact).toContain('var(--z-modal)');

      const msgRelative = typeof zIndexAudit.message === 'function' ? zIndexAudit.message('z-index: 11005') : zIndexAudit.message;
      expect(msgRelative).toContain('Z_LAYERS.MODAL');
      expect(msgRelative).toContain('calc(var(--z-modal) + 5)');

      const msgNoNum = typeof zIndexAudit.message === 'function' ? zIndexAudit.message('z-index: none') : zIndexAudit.message;
      expect(msgNoNum).toContain('Z-Index hardcodeado detectado');
    });

    it('check returns false when styles.zLayersEnabled is false', () => {
      setAuditConfig(defineAuditConfig({
        name: 'test-app',
        styles: { zLayersEnabled: false }
      }));

      const match = ['z-index: 100'] as unknown as RegExpExecArray;
      const shouldRun = zIndexAudit.check?.('z-index: 100', match, 'src/test.vue');
      expect(shouldRun).toBe(false);
    });

    it('check returns true for non-exempt files when enabled', () => {
      setAuditConfig(defineAuditConfig({
        name: 'test-app',
        styles: { zLayersEnabled: true }
      }));

      const match = ['z-index: 100'] as unknown as RegExpExecArray;
      const shouldRun = zIndexAudit.check?.('z-index: 100', match, 'src/components/Modal.vue');
      expect(shouldRun).toBe(true);
    });

    it('fixes CSS z-index and JS zIndex properties automatically', () => {
      expect(zIndexAudit.fix?.('z-index: 11000')).toBe('z-index: var(--z-modal)');
      expect(zIndexAudit.fix?.('zIndex: 11000')).toBe("zIndex: 'var(--z-modal)'");
      expect(zIndexAudit.fix?.('z-index: 11005')).toBe('z-index: calc(var(--z-modal) + 5)');
      expect(zIndexAudit.fix?.('invalid')).toBe('invalid');
    });
  });

  describe('zIndexConstantDeclaration Rule', () => {
    it('matches isolated Z_INDEX constant declarations', () => {
      zIndexConstantDeclaration.regex.lastIndex = 0;
      expect(zIndexConstantDeclaration.regex.test('const MODAL_Z_INDEX = 1000;')).toBe(true);

      zIndexConstantDeclaration.regex.lastIndex = 0;
      expect(zIndexConstantDeclaration.regex.test("const Z_INDEX_DROPDOWN = '50';")).toBe(true);
    });

    it('generates message pointing to Z_LAYERS configuration', () => {
      const msg = typeof zIndexConstantDeclaration.message === 'function'
        ? zIndexConstantDeclaration.message('const Z_INDEX_X = 1;')
        : zIndexConstantDeclaration.message;
      expect(msg).toContain('PROHIBIDO declarar constantes de Z-Index');
      expect(msg).toContain('Z_LAYERS');
    });

    it('check returns false when zLayersEnabled is false or file is exempt', () => {
      setAuditConfig(defineAuditConfig({
        name: 'test-app',
        styles: { zLayersEnabled: false }
      }));

      const match = ['const Z_INDEX = 1;'] as unknown as RegExpExecArray;
      expect(zIndexConstantDeclaration.check?.('', match, 'src/test.ts')).toBe(false);

      setAuditConfig(defineAuditConfig({
        name: 'test-app',
        styles: { zLayersEnabled: true, zLayersTsFile: 'src/constants/zLayers.ts' }
      }));

      expect(zIndexConstantDeclaration.check?.('', match, 'src/constants/zLayers.ts')).toBe(false);
      expect(zIndexConstantDeclaration.check?.('', match, 'src/node_modules/pkg/index.ts')).toBe(false);
      expect(zIndexConstantDeclaration.check?.('', match, 'src/views/Home.vue')).toBe(true);
    });
  });
});

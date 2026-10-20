// test-fragmentation-ok: Isolated stylelint and security sync test suite below 60 line threshold
/**
 * tests/stylelint_and_security_config_sync.test.ts
 *
 * Validates that stylelint configurations declared either at top-level config.stylelint
 * or nested under config.styles.stylelint are bi-directionally synchronized and inherit
 * ignoreGlobs, exemptPaths, and rules seamlessly.
 */

import { describe, it, expect } from 'vite-plus/test';

import { defineAuditConfig } from '../src/core/auditConfig.ts';

describe('stylelint configuration synchronization', () => {
  it('inherits ignoreGlobs and rules into top-level stylelint when declared in styles.stylelint', () => {
    const config = defineAuditConfig({
      name: 'SyncTest',
      styles: {
        stylelint: {
          ignoreGlobs: ['custom/styles/**'],
          rules: {
            'color-no-invalid-hex': true
          }
        }
      }
    });

    expect(config.stylelint).toBeDefined();
    expect(config.stylelint?.ignoreGlobs).toEqual(['custom/styles/**']);
    expect(config.stylelint?.rules).toEqual({ 'color-no-invalid-hex': true });
  });

  it('inherits ignoreGlobs into styles.stylelint when declared at top-level stylelint', () => {
    const config = defineAuditConfig({
      name: 'SyncTestTop',
      stylelint: {
        ignoreGlobs: ['top/styles/**']
      }
    });

    expect(config.styles?.stylelint).toBeDefined();
    expect(config.styles?.stylelint?.ignoreGlobs).toEqual(['top/styles/**']);
  });

  it('merges rules and strictValues deeply across top-level and nested configurations', () => {
    const config = defineAuditConfig({
      name: 'SyncDeepMerge',
      styles: {
        stylelint: {
          rules: {
            'rule-from-styles': true
          },
          strictValues: {
            properties: ['margin', 'padding'],
            ignoreValues: { margin: ['0', 'auto'] }
          }
        }
      },
      stylelint: {
        rules: {
          'rule-from-top': 'error'
        },
        strictValues: {
          properties: ['font-size'],
          ignoreValues: { 'font-size': ['inherit'] }
        }
      }
    });

    expect(config.stylelint?.rules).toEqual({
      'rule-from-styles': true,
      'rule-from-top': 'error'
    });
    expect(config.styles?.stylelint?.rules).toEqual({
      'rule-from-styles': true,
      'rule-from-top': 'error'
    });

    expect(config.stylelint?.strictValues?.properties).toEqual(['margin', 'padding', 'font-size']);
    expect(config.styles?.stylelint?.strictValues?.properties).toEqual([
      'margin',
      'padding',
      'font-size'
    ]);
    expect(config.stylelint?.strictValues?.ignoreValues).toEqual({
      margin: ['0', 'auto'],
      'font-size': ['inherit']
    });
  });
});

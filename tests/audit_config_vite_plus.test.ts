import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect } from 'vite-plus/test';

import { defineAuditConfig } from '../src/core/auditConfigDefaults.ts';
import { evaluateSuiteStatus } from '../src/core/suiteGating.ts';
import { syncViteConfigWithAuditConfig } from '../src/core/vitePlusConfigSync.ts';

describe('audit_config_vite_plus (8 Canary Matrix)', () => {
  it('C-AC-01: vitePlusConfig.enabled defaults to true with canonical sections', () => {
    const config = defineAuditConfig({ name: 'test-app' });
    expect(config.vitePlusConfig?.enabled).toBe(true);
    expect(config.vitePlusConfig?.fmt?.enabled).toBe(true);
    expect(config.vitePlusConfig?.lint?.enabled).toBe(true);
    expect(typeof config.vitePlusConfig?.staged === 'object').toBe(true);
    expect(config.vitePlusConfig?.vscode?.enabled).toBe(true);
  });

  it('C-AC-02: vitePlusConfig.enabled = false gates out validate_vite_plus_config, validate_oxlint, validate_oxfmt', () => {
    const config = defineAuditConfig({
      name: 'test-app',
      vitePlusConfig: { enabled: false }
    });
    const statusVitePlus = evaluateSuiteStatus('validate_vite_plus_config', config);
    const statusOxlint = evaluateSuiteStatus('validate_oxlint', config);
    const statusOxfmt = evaluateSuiteStatus('validate_oxfmt', config);

    expect(statusVitePlus.enabled).toBe(false);
    expect(statusOxlint.enabled).toBe(false);
    expect(statusOxfmt.enabled).toBe(false);
  });

  it('C-AC-03: vitePlusConfig.fmt.enabled = false gates out validate_oxfmt but keeps validate_oxlint', () => {
    const config = defineAuditConfig({
      name: 'test-app',
      vitePlusConfig: {
        enabled: true,
        fmt: { enabled: false }
      }
    });
    const statusOxfmt = evaluateSuiteStatus('validate_oxfmt', config);
    const statusOxlint = evaluateSuiteStatus('validate_oxlint', config);

    expect(statusOxfmt.enabled).toBe(false);
    expect(statusOxlint.enabled).toBe(true);
  });

  it('C-AC-04: vitePlusConfig.lint.enabled = false gates out validate_oxlint but keeps validate_oxfmt', () => {
    const config = defineAuditConfig({
      name: 'test-app',
      vitePlusConfig: {
        enabled: true,
        lint: { enabled: false }
      }
    });
    const statusOxlint = evaluateSuiteStatus('validate_oxlint', config);
    const statusOxfmt = evaluateSuiteStatus('validate_oxfmt', config);

    expect(statusOxlint.enabled).toBe(false);
    expect(statusOxfmt.enabled).toBe(true);
  });

  it('C-AC-05: oxfmt.enabled = false legacy/direct flag gates out validate_oxfmt', () => {
    const config = defineAuditConfig({
      name: 'test-app',
      oxfmt: { enabled: false }
    });
    const statusOxfmt = evaluateSuiteStatus('validate_oxfmt', config);
    expect(statusOxfmt.enabled).toBe(false);
  });

  it('C-AC-06: oxlint.enabled = false direct flag gates out validate_oxlint', () => {
    const config = defineAuditConfig({
      name: 'test-app',
      oxlint: { enabled: false }
    });
    const statusOxlint = evaluateSuiteStatus('validate_oxlint', config);
    expect(statusOxlint.enabled).toBe(false);
  });

  it('C-AC-07: lint.overrides in audit.config.ts are projected into vite.config.ts', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-plus-overrides-test-'));
    try {
      const config = defineAuditConfig({
        name: 'test-app',
        vitePlusConfig: {
          enabled: true,
          lint: {
            enabled: true,
            overrides: [
              {
                files: ['tests/**/*.ts'],
                rules: {
                  '@typescript-eslint/no-explicit-any': 'off'
                }
              }
            ]
          }
        }
      });

      const syncResult = syncViteConfigWithAuditConfig(tempDir, config);
      expect(syncResult.content).toContain('tests/**/*.ts');
      expect(syncResult.content).toContain('overrides: [');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('C-AC-08: lint.categories in audit.config.ts are projected into vite.config.ts', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vite-plus-categories-test-'));
    try {
      const config = defineAuditConfig({
        name: 'test-app',
        vitePlusConfig: {
          enabled: true,
          lint: {
            enabled: true,
            categories: {
              a11y: 'off',
              style: 'warn'
            }
          }
        }
      });

      const syncResult = syncViteConfigWithAuditConfig(tempDir, config);
      expect(syncResult.content).toContain("'a11y': 'off'");
      expect(syncResult.content).toContain("'style': 'warn'");
      expect(syncResult.content).toContain('categories: {');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

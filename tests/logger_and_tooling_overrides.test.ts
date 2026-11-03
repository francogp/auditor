/**
 * tests/logger_and_tooling_overrides.test.ts
 *
 * Canary test suite verifying:
 * 1. Declarative logger SSoT projection (paths.loggerFiles -> vite.config.ts override)
 * 2. Declarative tooling files projection (paths.toolingFiles -> vite.config.ts override)
 * 3. Database query builder mocking in tests (unicorn/no-thenable in DYNAMIC_TEST_OFF_RULES)
 * 4. Text layout formatting and crypto byte sizing in validate_magic_numbers
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { resetAuditConfig, defineAuditConfig } from '../src/core/auditConfig.ts';
import {
  CANONICAL_DYNAMIC_TEST_OVERRIDE_RULES,
  DEFAULT_AUDIT_PATHS_CONFIG
} from '../src/core/auditConfigDefaults.ts';
import { resolveEffectiveLintOverrides } from '../src/core/viteConfigAst.ts';
import { ValidateMagicNumbersAuditor } from '../src/suites/architecture/validate_magic_numbers.ts';

describe('Logger and Tooling Overrides Governance', () => {
  it('includes unicorn/no-thenable in CANONICAL_DYNAMIC_TEST_OVERRIDE_RULES for mock builders', () => {
    expect(CANONICAL_DYNAMIC_TEST_OVERRIDE_RULES['unicorn/no-thenable']).toBe('off');
  });

  it('declares toolingFiles: ["vite.plugins.ts"] in DEFAULT_AUDIT_PATHS_CONFIG', () => {
    expect(DEFAULT_AUDIT_PATHS_CONFIG.toolingFiles).toEqual(['vite.plugins.ts']);
  });

  it('projects paths.loggerFiles to a file-scoped override in resolveEffectiveLintOverrides', () => {
    const config = defineAuditConfig({
      name: 'Test Project',
      paths: {
        srcRoots: ['src'],
        testRoots: ['tests'],
        e2eRoots: [],
        integrationRoots: [],
        migrationsDir: 'migrations',
        scriptsRoots: ['scripts'],
        codeRoots: ['src', 'scripts'],
        loggerFiles: ['src/logic/utils/logger.ts']
      }
    });

    const overrides = resolveEffectiveLintOverrides(config);
    const loggerOverride = overrides.find((ov) => ov.files.includes('src/logic/utils/logger.ts'));
    expect(loggerOverride).toBeDefined();
    expect(loggerOverride?.rules?.['no-console']).toBe('off');
  });

  it('projects paths.toolingFiles to a tooling override in resolveEffectiveLintOverrides', () => {
    const config = defineAuditConfig({
      name: 'Test Project',
      paths: {
        srcRoots: ['src'],
        testRoots: ['tests'],
        e2eRoots: [],
        integrationRoots: [],
        migrationsDir: 'migrations',
        scriptsRoots: ['scripts'],
        codeRoots: ['src', 'scripts'],
        toolingFiles: ['vite.plugins.ts']
      }
    });

    const overrides = resolveEffectiveLintOverrides(config);
    const toolingOverride = overrides.find((ov) => ov.files.includes('vite.plugins.ts'));
    expect(toolingOverride).toBeDefined();
    expect(toolingOverride?.rules?.['no-console']).toBe('off');
    expect(toolingOverride?.rules?.['typescript/no-floating-promises']).toBe('off');
  });

  it('projects paths.integrationRoots to an override enforcing no-tautological-integration-mocks as error', () => {
    const config = defineAuditConfig({
      name: 'Test Project',
      paths: {
        srcRoots: ['src'],
        testRoots: ['tests'],
        e2eRoots: [],
        integrationRoots: ['tests/integration'],
        migrationsDir: 'migrations',
        scriptsRoots: ['scripts'],
        codeRoots: ['src', 'scripts']
      }
    });

    const overrides = resolveEffectiveLintOverrides(config);
    const integrationOverride = overrides.find(
      (ov) =>
        ov.files.includes('**/tests/integration/**') &&
        ov.rules?.['@francogp/domain-type/no-tautological-integration-mocks'] === 'error'
    );
    expect(integrationOverride).toBeDefined();
    expect(
      integrationOverride?.rules?.['@francogp/domain-type/no-tautological-integration-mocks']
    ).toBe('error');
  });
});

describe('Magic Numbers Text Formatting and Crypto Sizing', () => {
  let tempDir: string;
  let srcDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'magic-numbers-test-'));
    srcDir = path.join(tempDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('exempts .padEnd, .padStart, and .repeat string formatting layout methods in naked expressions', async () => {
    await fs.writeFile(
      path.join(srcDir, 'format.ts'),
      `export function printTable(name: string, url: string): void {
  process.stdout.write('━'.repeat(80));
  process.stdout.write(name.padEnd(20) + ' ' + url.padStart(45));
}\n`,
      'utf-8'
    );

    const auditor = new ValidateMagicNumbersAuditor({ roots: [srcDir], projectRoot: tempDir });
    const result = await auditor.audit();
    expect(result.summary.errors).toBe(0);
  });

  it('exempts crypto.randomBytes standard entropy buffer lengths in assignments', async () => {
    await fs.writeFile(
      path.join(srcDir, 'key.ts'),
      `import crypto from 'node:crypto';
export function generateKey(target: Record<string, string>): void {
  if (!target.token) {
    target.token = crypto.randomBytes(32).toString('base64');
    target.nonce = crypto.randomBytes(16).toString('hex');
  }
}\n`,
      'utf-8'
    );

    const auditor = new ValidateMagicNumbersAuditor({ roots: [srcDir], projectRoot: tempDir });
    const result = await auditor.audit();
    expect(result.summary.errors).toBe(0);
  });
});

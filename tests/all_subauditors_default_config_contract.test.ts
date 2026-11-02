import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { discoverAuditors } from '../src/cli/auditScanner.ts';
import { resetAuditConfig } from '../src/core/auditConfig.ts';
import { toPosixPath } from '../src/core/safePath.ts';
import {
  ValidateAuditConfigAuditor,
  collectConfigSectionsFromTasks
} from '../src/suites/architecture/validate_audit_config.ts';

const AUDIT_CONFIG_MODULE_PATH = toPosixPath(
  path.resolve(import.meta.dirname, '../src/core/auditConfig.ts')
);

describe('All Sub-auditors Default Configuration Contract & Dynamic Injection', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-all-defaults-test-'));
    resetAuditConfig();
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('discovers all subauditors and verifies every configurable suite declares configKey and defaultConfig', async () => {
    const tasks = await discoverAuditors({ withBuild: true, speed: 'full' });
    expect(tasks.length).toBeGreaterThan(70);

    const collected = collectConfigSectionsFromTasks(tasks);

    // Crucial canonical sections that MUST be contributed dynamically by subauditors
    expect(collected).toHaveProperty('gitIgnore');
    expect(collected.gitIgnore).toEqual(expect.objectContaining({ enabled: true }));

    expect(collected).toHaveProperty('vitePlusConfig');
    expect(collected.vitePlusConfig).toEqual(
      expect.objectContaining({
        enabled: true,
        lint: expect.objectContaining({
          enabled: true,
          typeAware: true,
          typeCheck: true,
          plugins: [
            'vitest',
            'node',
            'promise',
            'unicorn',
            'typescript',
            'vue',
            'import',
            'jsx-a11y'
          ]
        }),
        fmt: expect.objectContaining({
          enabled: true,
          singleQuote: true,
          semi: true
        }),
        staged: expect.objectContaining({
          enabled: true
        }),
        hooks: expect.objectContaining({
          enabled: true
        }),
        vscode: expect.objectContaining({
          enabled: true
        })
      })
    );

    expect(collected).toHaveProperty('fallow');
    expect(collected.fallow).toEqual(
      expect.objectContaining({
        enabled: true,
        health: expect.objectContaining({
          maxCognitive: 20,
          maxCyclomatic: 25,
          cyclomaticPolicy: 'standard'
        })
      })
    );

    expect(collected).toHaveProperty('bundle');
    expect(collected.bundle).toEqual(expect.objectContaining({ enabled: true }));

    expect(collected).toHaveProperty('persistence');
    expect(collected.persistence).toEqual(expect.objectContaining({ enabled: true }));

    expect(collected).toHaveProperty('domain');
    expect(collected.domain).toEqual(expect.objectContaining({ enabled: true }));

    expect(collected).toHaveProperty('testCoverage');
    expect(collected.testCoverage).toEqual(
      expect.objectContaining({ enabled: true, threshold: 80 })
    );
  });

  it('automatically injects missing gitIgnore, vitePlusConfig.lint properties, staged, hooks, and vscode into partial config', async () => {
    // Simulates an existing consumer config that omitted gitIgnore and detailed vitePlusConfig subproperties
    const initialConfig = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';

export default defineAuditConfig({
  name: 'pokeborrador-mock',
  paths: { srcRoots: ['src'], testRoots: ['tests'], scriptsRoots: ['scripts'] },
  vitePlusConfig: {
    enabled: true,
    lint: {
      rules: {
        'unicorn/prefer-node-protocol': 'error'
      }
    },
    fmt: {
      ignorePatterns: ['src/data/**']
    },
    precompress: {
      enabled: true,
      server: 'nginx',
      spa: true,
      report: 'summary',
      threshold: 512
    }
  }
});
`;
    const configPath = path.join(tempDir, '.auditor', 'audit.config.ts');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, initialConfig, 'utf-8');

    // Create .gitignore so gitignore checks don't fail on missing file
    await fs.writeFile(path.join(tempDir, '.gitignore'), 'node_modules/\n', 'utf-8');

    // Run ValidateAuditConfigAuditor in fix mode
    const auditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    await auditor.fix();

    const updatedContent = await fs.readFile(configPath, 'utf-8');

    // 1. gitIgnore must be injected
    expect(updatedContent).toContain('gitIgnore: {');
    expect(updatedContent).toContain('enabled: true');

    // 2. vitePlusConfig.lint.typeAware, typeCheck, and plugins must be injected without erasing existing rules
    expect(updatedContent).toContain('typeAware: true');
    expect(updatedContent).toContain('typeCheck: true');
    expect(updatedContent).toContain(
      "plugins: ['vitest', 'node', 'promise', 'unicorn', 'typescript', 'vue', 'import', 'jsx-a11y']"
    );
    expect(updatedContent).toContain("'unicorn/prefer-node-protocol': 'error'");

    // 3. vitePlusConfig.staged, hooks, vscode must be injected
    expect(updatedContent).toContain('staged: {');
    expect(updatedContent).toContain('hooks: {');
    expect(updatedContent).toContain('vscode: {');

    // 4. fallow.health must be injected dynamically from ValidateFallowConfigAuditor.defaultConfig
    expect(updatedContent).toContain('fallow: {');
    expect(updatedContent).toContain('health: {');
    expect(updatedContent).toContain('maxCognitive: 20');
    expect(updatedContent).toContain('maxCyclomatic: 25');
    expect(updatedContent).toContain("cyclomaticPolicy: 'standard'");

    // 5. Existing custom fmt ignorePatterns must be preserved
    expect(updatedContent).toContain("'src/data/**'");
  });

  it('injects 100% of discovered subauditor default configs when audit.config.ts starts with empty defineAuditConfig({})', async () => {
    const emptyConfig = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';

export default defineAuditConfig({
  name: 'empty-test-app'
});
`;
    const configPath = path.join(tempDir, '.auditor', 'audit.config.ts');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, emptyConfig, 'utf-8');
    await fs.writeFile(path.join(tempDir, '.gitignore'), 'node_modules/\n', 'utf-8');

    // Create required base directories so missing-path doesn't report non-existent paths
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'tests'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'scripts'), { recursive: true });

    const auditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    await auditor.fix();

    const updatedContent = await fs.readFile(configPath, 'utf-8');

    // Must have all essential sections
    expect(updatedContent).toContain('gitIgnore: {');
    expect(updatedContent).toContain('vitePlusConfig: {');
    expect(updatedContent).toContain('bundle: {');
    expect(updatedContent).toContain('persistence: {');
    expect(updatedContent).toContain('domain: {');
    expect(updatedContent).toContain('styles: {');
    expect(updatedContent).toContain('testCoverage: {');
    expect(updatedContent).toContain('fallow: {');
    expect(updatedContent).toContain('agentPlugin: {');
    expect(updatedContent).toContain('gitSafety: {');
    expect(updatedContent).toContain('codeSimplification: {');
    expect(updatedContent).toContain('scssArchitecture: {');
    expect(updatedContent).toContain('webPerformance: {');
    expect(updatedContent).toContain('queryPerformance: {');

    // Recheck should report 0 missing section violations
    resetAuditConfig();
    const recheckAuditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    const result = await recheckAuditor.audit();
    const missingSectionViolations = result.findings.filter(
      (f) => f.ruleId === 'audit-config-missing-section'
    );
    expect(missingSectionViolations).toHaveLength(0);
  });

  it('is strictly idempotent and deduplicates pre-existing identical keys with quotes like staged.rules["*"]', async () => {
    const duplicateKeyConfig = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';

export default defineAuditConfig({
  name: 'quoted-keys-test',
  paths: { srcRoots: ['src'], testRoots: ['tests'], scriptsRoots: ['scripts'] },
  vitePlusConfig: {
    enabled: true,
    staged: {
      enabled: true,
      rules: {
        '*': 'vp check --fix',
        '*': 'vp check --fix'
      }
    }
  }
});
`;
    const configPath = path.join(tempDir, '.auditor', 'audit.config.ts');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, duplicateKeyConfig, 'utf-8');
    await fs.writeFile(path.join(tempDir, '.gitignore'), 'node_modules/\n', 'utf-8');

    const auditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    await auditor.fix();

    const fixedContent = await fs.readFile(configPath, 'utf-8');
    const starMatches = fixedContent.match(/'\*':/g) ?? [];
    expect(starMatches).toHaveLength(1);
  });
});

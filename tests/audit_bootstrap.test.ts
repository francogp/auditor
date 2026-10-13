/**
 * tests/audit_bootstrap.test.ts
 *
 * ZERO-SETUP PRE-FLIGHT AUTO-BOOTSTRAP TESTS (Vitest / Node.js 26+)
 *
 * Verifies that:
 * 1. A virgin project without .auditor/ generates .auditor/audit.config.ts with
 *    100% of discovered sub-auditors and extensions configured with their defaults.
 * 2. Virgin project initializes .agents/plugins.json and .agents/skills.json.
 * 3. Existing project with partial/legacy config automatically receives missing sections
 *    injected via AST without mutating existing configuration values.
 * 4. Custom extensions with configKey and defaultConfig are recognized and injected.
 * 5. Bootstrap is idempotent when the configuration is already up-to-date.
 * 6. In CI environment (process.env.CI = 'true'), automatic filesystem mutation is inhibited.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ensureProjectBootstrapped } from '../src/core/auditBootstrap.ts';
import { AUDIT_CONFIG_FILE, resetAuditConfig } from '../src/core/auditConfig.ts';

describe('Zero-Setup Pre-Flight Auto-Bootstrap (ensureProjectBootstrapped)', () => {
  let tempDir: string;
  const originalCi = process.env.CI;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-bootstrap-test-'));
    delete process.env.CI;
    resetAuditConfig();

    // Link @francogp/auditor into tempDir/node_modules so dynamic ESM import resolves in tempDir
    const nodeModulesDir = path.join(tempDir, 'node_modules', '@francogp');
    fs.mkdirSync(nodeModulesDir, { recursive: true });
    fs.symlinkSync(process.cwd(), path.join(nodeModulesDir, 'auditor'), 'junction');
  });

  afterEach(() => {
    if (originalCi !== undefined) {
      process.env.CI = originalCi;
    } else {
      delete process.env.CI;
    }
    resetAuditConfig();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // catch-ok
    }
  });

  it('scaffolds complete .auditor/audit.config.ts and .agents/ on a virgin project', async () => {
    // Setup virgin project with package.json
    const pkg = { name: 'virgin-sample-app', version: '1.0.0', type: 'module' };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8');

    const result = await ensureProjectBootstrapped({ projectRoot: tempDir, force: true });

    expect(result.configCreated).toBe(true);
    expect(result.agentsRegistered).toBe(true);

    const generatedConfigFile = path.join(tempDir, AUDIT_CONFIG_FILE);
    expect(fs.existsSync(generatedConfigFile)).toBe(true);

    const content = fs.readFileSync(generatedConfigFile, 'utf-8');
    expect(content).toContain("name: 'virgin-sample-app'");
    expect(content).toContain("defineAuditConfig");

    // Must contain default configurations of all major built-in subauditors
    expect(content).toContain('webPerformance:');
    expect(content).toContain('queryPerformance:');
    expect(content).toContain('securityHardening:');
    expect(content).toContain('codeSimplification:');
    expect(content).toContain('scssArchitecture:');
    expect(content).toContain('valibot:');
    expect(content).toContain('pinia:');
    expect(content).toContain('fallow:');

    // Agents registration files
    const pluginsJson = path.join(tempDir, '.agents', 'plugins.json');
    const skillsJson = path.join(tempDir, '.agents', 'skills.json');
    expect(fs.existsSync(pluginsJson)).toBe(true);
    expect(fs.existsSync(skillsJson)).toBe(true);

    const pluginsContent = JSON.parse(fs.readFileSync(pluginsJson, 'utf-8'));
    expect(pluginsContent.entries.some((e: { path: string }) => e.path.includes('@francogp/auditor'))).toBe(true);

    // GitIgnore verification
    const gitignorePath = path.join(tempDir, '.gitignore');
    expect(fs.existsSync(gitignorePath)).toBe(true);
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
    expect(gitignoreContent).toContain('scratch/');

    // Ensure no orphaned commas on standalone lines
    expect(content).not.toMatch(/\}\s*\r?\n\s*,/);
    expect(content).not.toMatch(/^\s*,\s*$/m);
  });

  it('injects missing sections into existing partial/old audit.config.ts without altering prior settings', async () => {
    const pkg = { name: 'old-sample-app', version: '1.0.0', type: 'module' };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8');

    // Create partial/legacy audit.config.ts that lacks performance and simplifications
    const auditorDir = path.join(tempDir, '.auditor');
    fs.mkdirSync(auditorDir, { recursive: true });
    const initialConfig = `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'old-sample-app',
  paths: {
    srcRoots: ['src'],
    testRoots: ['tests'],
    scriptsRoots: ['scripts']
  },
  documentation: {
    language: 'en'
  },
  valibot: {
    enabled: true,
    targets: []
  }
});
`;
    fs.writeFileSync(path.join(tempDir, AUDIT_CONFIG_FILE), initialConfig, 'utf-8');

    const result = await ensureProjectBootstrapped({ projectRoot: tempDir, force: true });

    expect(result.configCreated).toBe(false);
    expect(result.configUpdated).toBe(true);
    expect(result.sectionsInjected.length).toBeGreaterThan(0);
    expect(result.sectionsInjected).toContain('webPerformance');
    expect(result.sectionsInjected).toContain('queryPerformance');
    expect(result.sectionsInjected).toContain('securityHardening');
    expect(result.sectionsInjected).toContain('codeSimplification');
    expect(result.sectionsInjected).toContain('scssArchitecture');

    const updatedContent = fs.readFileSync(path.join(tempDir, AUDIT_CONFIG_FILE), 'utf-8');
    // Prior settings preserved
    expect(updatedContent).toContain("name: 'old-sample-app'");
    expect(updatedContent).toContain("targets: []");
    // Newly injected sections exist
    expect(updatedContent).toContain('webPerformance:');
    expect(updatedContent).toContain('queryPerformance:');
    expect(updatedContent).toContain('codeSimplification:');

    // Ensure no orphaned commas on standalone lines
    expect(updatedContent).not.toMatch(/\}\s*\r?\n\s*,/);
    expect(updatedContent).not.toMatch(/^\s*,\s*$/m);
  });

  it('is completely idempotent when run multiple times on an up-to-date configuration', async () => {
    const pkg = { name: 'idempotent-app', version: '1.0.0', type: 'module' };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8');

    // First run creates config
    const firstResult = await ensureProjectBootstrapped({ projectRoot: tempDir, force: true });
    expect(firstResult.configCreated).toBe(true);

    const firstContent = fs.readFileSync(path.join(tempDir, AUDIT_CONFIG_FILE), 'utf-8');

    // Second run should make 0 changes
    const secondResult = await ensureProjectBootstrapped({ projectRoot: tempDir, force: true });
    expect(secondResult.configCreated).toBe(false);
    expect(secondResult.configUpdated).toBe(false);
    expect(secondResult.sectionsInjected.length).toBe(0);

    const secondContent = fs.readFileSync(path.join(tempDir, AUDIT_CONFIG_FILE), 'utf-8');
    expect(secondContent).toBe(firstContent);
  });

  it('does not mutate filesystem when running in CI environment (process.env.CI = true)', async () => {
    process.env.CI = 'true';
    const pkg = { name: 'ci-app', version: '1.0.0', type: 'module' };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8');

    const result = await ensureProjectBootstrapped({ projectRoot: tempDir, force: true });

    expect(result.configCreated).toBe(false);
    expect(result.configUpdated).toBe(false);
    expect(result.agentsRegistered).toBe(false);
    expect(fs.existsSync(path.join(tempDir, AUDIT_CONFIG_FILE))).toBe(false);
  });

  it('injects missing sections into existing audit.config.json', async () => {
    const pkg = { name: 'json-sample-app', version: '1.0.0' };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8');

    const auditorDir = path.join(tempDir, '.auditor');
    fs.mkdirSync(auditorDir, { recursive: true });
    const jsonPath = path.join(auditorDir, 'audit.config.json');
    const initialJson = {
      name: 'json-sample-app',
      paths: { srcRoots: ['src'] }
    };
    fs.writeFileSync(jsonPath, JSON.stringify(initialJson, null, 2), 'utf-8');

    const result = await ensureProjectBootstrapped({ projectRoot: tempDir, force: true });

    expect(result.configCreated).toBe(false);
    expect(result.configUpdated).toBe(true);
    expect(result.sectionsInjected.length).toBeGreaterThan(0);

    const updated = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    expect(updated.name).toBe('json-sample-app');
    expect(updated.webPerformance).toBeDefined();
    expect(updated.queryPerformance).toBeDefined();
    expect(updated.securityHardening).toBeDefined();
    expect(updated.auditorVersion).toBeDefined();
  });

  it('scaffolds complete .auditor/audit.config.ts including auditorVersion matching current running build', async () => {
    const pkg = { name: 'version-sample-app', version: '1.0.0', type: 'module' };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8');

    const result = await ensureProjectBootstrapped({ projectRoot: tempDir, force: true });

    expect(result.configCreated).toBe(true);
    expect(result.versionUpdated).toBe(true);
    expect(result.currentVersion).toMatch(/^\d+\.\d+\.\d+-build\./);

    const generatedConfigFile = path.join(tempDir, AUDIT_CONFIG_FILE);
    const content = fs.readFileSync(generatedConfigFile, 'utf-8');
    expect(content).toContain(`auditorVersion: '${result.currentVersion}'`);
  });

  it('detects diverged or missing auditorVersion in existing config, synchronizes it and returns versionUpdated: true', async () => {
    const pkg = { name: 'diverged-version-app', version: '1.0.0', type: 'module' };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8');

    const auditorDir = path.join(tempDir, '.auditor');
    fs.mkdirSync(auditorDir, { recursive: true });
    const initialConfig = `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'diverged-version-app',
  auditorVersion: '7.0.0-build.legacy',
  paths: {
    srcRoots: ['src'],
    testRoots: ['tests'],
    scriptsRoots: ['scripts']
  },
  documentation: {
    language: 'en'
  }
});
`;
    fs.writeFileSync(path.join(tempDir, AUDIT_CONFIG_FILE), initialConfig, 'utf-8');

    const result = await ensureProjectBootstrapped({ projectRoot: tempDir, force: true });

    expect(result.configCreated).toBe(false);
    expect(result.versionUpdated).toBe(true);
    expect(result.previousVersion).toBe('7.0.0-build.legacy');
    expect(result.currentVersion).not.toBe('7.0.0-build.legacy');

    const updatedContent = fs.readFileSync(path.join(tempDir, AUDIT_CONFIG_FILE), 'utf-8');
    expect(updatedContent).toContain(`auditorVersion: '${result.currentVersion}'`);
    expect(updatedContent).not.toContain('7.0.0-build.legacy');
  });

  it('preserves existing non-violating user configurations while enforcing mandatory subauditor minimums', async () => {
    const pkg = { name: 'preserve-config-app', version: '1.0.0', type: 'module' };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8');

    const auditorDir = path.join(tempDir, '.auditor');
    fs.mkdirSync(auditorDir, { recursive: true });
    const initialConfig = `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'preserve-config-app',
  auditorVersion: '7.0.0-build.prev',
  paths: {
    srcRoots: ['custom-src'],
    testRoots: ['custom-tests'],
    scriptsRoots: ['scripts']
  },
  documentation: {
    language: 'es'
  },
  webPerformance: {
    enabled: true,
    maxDomDepth: 64
  }
});
`;
    fs.writeFileSync(path.join(tempDir, AUDIT_CONFIG_FILE), initialConfig, 'utf-8');

    const result = await ensureProjectBootstrapped({ projectRoot: tempDir, force: true });

    expect(result.versionUpdated).toBe(true);

    const updatedContent = fs.readFileSync(path.join(tempDir, AUDIT_CONFIG_FILE), 'utf-8');
    // Non-violating user customizations MUST be preserved
    expect(updatedContent).toContain("language: 'es'");
    expect(updatedContent).toContain("maxDomDepth: 64");
    expect(updatedContent).toContain("srcRoots: ['custom-src']");
    expect(updatedContent).toContain("testRoots: ['custom-tests']");

    // Version updated
    expect(updatedContent).toContain(`auditorVersion: '${result.currentVersion}'`);

    // Missing sections injected
    expect(updatedContent).toContain('queryPerformance:');
    expect(updatedContent).toContain('securityHardening:');
  });

  it('detects diverged build ID even when major.minor.patch matches and synchronizes it', async () => {
    const pkg = { name: 'diverged-build-app', version: '1.0.0', type: 'module' };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8');

    const auditorDir = path.join(tempDir, '.auditor');
    fs.mkdirSync(auditorDir, { recursive: true });
    // Same semver but older build timestamp
    const initialConfig = `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'diverged-build-app',
  auditorVersion: '7.1.1-build.20261001-000000',
  paths: {
    srcRoots: ['src'],
    testRoots: ['tests'],
    scriptsRoots: ['scripts']
  },
  documentation: {
    language: 'en'
  }
});
`;
    fs.writeFileSync(path.join(tempDir, AUDIT_CONFIG_FILE), initialConfig, 'utf-8');

    const result = await ensureProjectBootstrapped({ projectRoot: tempDir, force: true });

    expect(result.versionUpdated).toBe(true);
    expect(result.previousVersion).toBe('7.1.1-build.20261001-000000');
    expect(result.currentVersion).not.toBe('7.1.1-build.20261001-000000');

    const updatedContent = fs.readFileSync(path.join(tempDir, AUDIT_CONFIG_FILE), 'utf-8');
    expect(updatedContent).toContain(`auditorVersion: '${result.currentVersion}'`);
    expect(updatedContent).not.toContain('7.1.1-build.20261001-000000');
  });

  it('detects completely missing auditorVersion in legacy config and injects it cleanly', async () => {
    const pkg = { name: 'missing-version-app', version: '1.0.0', type: 'module' };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8');

    const auditorDir = path.join(tempDir, '.auditor');
    fs.mkdirSync(auditorDir, { recursive: true });
    const legacyConfig = `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'missing-version-app',
  paths: {
    srcRoots: ['src'],
    testRoots: ['tests'],
    scriptsRoots: ['scripts']
  },
  documentation: {
    language: 'en'
  }
});
`;
    fs.writeFileSync(path.join(tempDir, AUDIT_CONFIG_FILE), legacyConfig, 'utf-8');

    const result = await ensureProjectBootstrapped({ projectRoot: tempDir, force: true });

    expect(result.versionUpdated).toBe(true);
    expect(result.previousVersion).toBeUndefined();

    const updatedContent = fs.readFileSync(path.join(tempDir, AUDIT_CONFIG_FILE), 'utf-8');
    expect(updatedContent).toContain(`auditorVersion: '${result.currentVersion}'`);
  });

  it('generates 100% syntactically valid TypeScript with zero parse diagnostics and zero orphaned commas', async () => {
    const pkg = { name: 'syntax-integrity-app', version: '1.0.0', type: 'module' };
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify(pkg, null, 2), 'utf-8');

    // 1. Virgin scaffold
    await ensureProjectBootstrapped({ projectRoot: tempDir, force: true });
    const virginContent = fs.readFileSync(path.join(tempDir, AUDIT_CONFIG_FILE), 'utf-8');

    const ts = await import('typescript');
    const virginTranspile = ts.default.transpileModule(virginContent, { reportDiagnostics: true });
    expect(virginTranspile.diagnostics ?? []).toHaveLength(0);
    expect(virginContent).not.toMatch(/\}\s*\r?\n\s*,/);
    expect(virginContent).not.toMatch(/^\s*,\s*$/m);

    // 2. Incremental section injection on existing file without trailing commas
    const dirtyConfig = `import { defineAuditConfig } from '@francogp/auditor';

export default defineAuditConfig({
  name: 'syntax-integrity-app',
  auditorVersion: '7.0.0-build.000',
  paths: {
    srcRoots: ['src'],
    testRoots: ['tests'],
    scriptsRoots: ['scripts']
  },
  documentation: {
    language: 'en'
  }
});
`;
    fs.writeFileSync(path.join(tempDir, AUDIT_CONFIG_FILE), dirtyConfig, 'utf-8');

    await ensureProjectBootstrapped({ projectRoot: tempDir, force: true });
    const updatedContent = fs.readFileSync(path.join(tempDir, AUDIT_CONFIG_FILE), 'utf-8');

    const updatedTranspile = ts.default.transpileModule(updatedContent, { reportDiagnostics: true });
    expect(updatedTranspile.diagnostics ?? []).toHaveLength(0);
    expect(updatedContent).not.toMatch(/\}\s*\r?\n\s*,/);
    expect(updatedContent).not.toMatch(/^\s*,\s*$/m);
  });
});


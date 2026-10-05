/**
 * tests/validate_documented_commands.test.ts
 *
 * Hermetic unit tests for ValidateDocumentedCommandsAuditor.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ValidateDocumentedCommandsAuditor } from '../src/suites/documentation/validate_documented_commands.ts';

describe('ValidateDocumentedCommandsAuditor', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-cmd-test-'));
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('passes cleanly when all documented commands exist in package.json', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        scripts: {
          test: 'vitest',
          lint: 'eslint .',
          build: 'tsc'
        },
        devDependencies: {
          vitest: '^3.0.0'
        }
      }, null, 2)
    );

    const docContent = [
      '# Guide',
      '',
      'Run `npm run test` or `npm test` to test.',
      '',
      '```bash',
      'npm run build',
      'npx vitest run',
      '```'
    ].join('\n');

    await fs.writeFile(path.join(tempDir, 'README.md'), docContent);

    const auditor = new ValidateDocumentedCommandsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('detects unregistered npm run script in inline markdown', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        scripts: {
          build: 'tsc'
        }
      }, null, 2)
    );

    await fs.writeFile(
      path.join(tempDir, 'README.md'),
      'To validate, execute `npm run validate:types` before submitting.'
    );

    const auditor = new ValidateDocumentedCommandsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.summary.errors).toBeGreaterThan(0);
    const finding = result.findings.find(f => f.ruleId === 'documented-cmd-unregistered-npm');
    expect(finding).toBeDefined();
    expect(finding?.message).toContain('validate:types');
  });

  it('detects unregistered npm run script inside fenced bash code block', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        scripts: {
          test: 'vitest'
        }
      }, null, 2)
    );

    const content = [
      '# Setup',
      '```sh',
      '$ npm run nonexistent-setup',
      '```'
    ].join('\n');

    await fs.writeFile(path.join(tempDir, 'SETUP.md'), content);

    const auditor = new ValidateDocumentedCommandsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    const finding = result.findings.find(f => f.ruleId === 'documented-cmd-unregistered-npm');
    expect(finding).toBeDefined();
    expect(finding?.message).toContain('nonexistent-setup');
  });

  it('detects invalid direct npm commands instead of npm run', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        scripts: {
          foo: 'echo foo'
        }
      }, null, 2)
    );

    await fs.writeFile(
      path.join(tempDir, 'DOC.md'),
      'Run `npm foo` to execute the foo task.'
    );

    const auditor = new ValidateDocumentedCommandsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    const finding = result.findings.find(f => f.ruleId === 'documented-cmd-invalid-npm-syntax');
    expect(finding).toBeDefined();
    expect(finding?.message).toContain("debe ser 'npm run foo'");
  });

  it('detects unregistered npx binaries', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        dependencies: {}
      }, null, 2)
    );

    await fs.writeFile(
      path.join(tempDir, 'DOC.md'),
      'Run `npx nonexistent-binary-cli` to inspect.'
    );

    const auditor = new ValidateDocumentedCommandsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    const finding = result.findings.find(f => f.ruleId === 'documented-cmd-unregistered-npx');
    expect(finding).toBeDefined();
    expect(finding?.message).toContain('nonexistent-binary-cli');
  });

  it('ignores placeholder template syntax in documentation', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        scripts: {}
      }, null, 2)
    );

    await fs.writeFile(
      path.join(tempDir, 'TEMPLATE.md'),
      'Usage: `npm run <script-name>` or `npm run [script]` or `npx <command>`'
    );

    const auditor = new ValidateDocumentedCommandsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('audits skills in .agents/skills/ directory and flags unregistered commands', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        scripts: { test: 'vitest' }
      }, null, 2)
    );

    const skillDir = path.join(tempDir, '.agents/skills/my-custom-skill');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      'Execute `npm run unrecorded-skill-task` to test.'
    );

    const auditor = new ValidateDocumentedCommandsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.summary.errors).toBeGreaterThan(0);
    const finding = result.findings.find(f => f.ruleId === 'documented-cmd-unregistered-npm');
    expect(finding).toBeDefined();
    expect(finding?.message).toContain('unrecorded-skill-task');
  });

  it('allows npx binaries configured in audit.config.ts allowedNpxBinaries', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        dependencies: {}
      }, null, 2)
    );

    await fs.writeFile(
      path.join(tempDir, 'audit.config.ts'),
      `export default {
  name: 'test-pkg',
  documentation: {
    allowedNpxBinaries: ['custom-allowed-tool']
  }
};`
    );

    await fs.writeFile(
      path.join(tempDir, 'GUIDE.md'),
      'Run `npx custom-allowed-tool check` to inspect.'
    );

    const auditor = new ValidateDocumentedCommandsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('recognizes npm info and wildcard pattern as valid/placeholders', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        scripts: { test: 'vitest' }
      }, null, 2)
    );

    await fs.writeFile(
      path.join(tempDir, 'README.md'),
      'Run `npm info package-name` to view info, and `npm run audit:fallow:*` for wildcards.'
    );

    const auditor = new ValidateDocumentedCommandsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('respects paths.ignoredDirs and paths.ignoreGlobs from audit.config.ts', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-pkg',
        scripts: { test: 'vitest' }
      }, null, 2)
    );

    await fs.writeFile(
      path.join(tempDir, 'audit.config.ts'),
      `export default {
  name: 'test-pkg',
  paths: {
    ignoredDirs: ['vendor_external']
  }
};`
    );

    const vendorDir = path.join(tempDir, 'vendor_external');
    await fs.mkdir(vendorDir, { recursive: true });
    await fs.writeFile(
      path.join(vendorDir, 'CONTRIBUTING.md'),
      'Run `npm run completely-fake-command` in vendor docs.'
    );

    const auditor = new ValidateDocumentedCommandsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });
});


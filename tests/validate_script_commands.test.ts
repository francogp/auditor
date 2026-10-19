/**
 * tests/validate_script_commands.test.ts
 *
 * Hermetic unit tests for ValidateScriptCommandsAuditor.
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { resetAuditConfig } from '../src/core/auditConfig.ts';
import { ValidateScriptCommandsAuditor } from '../src/suites/architecture/validate_script_commands.ts';

describe('ValidateScriptCommandsAuditor', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    resetAuditConfig();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-script-cmd-test-'));
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Rule Declarations & Metadata', () => {
    it('initializes with correct metadata and rules', () => {
      const auditor = new ValidateScriptCommandsAuditor({ projectRoot: tempDir });
      expect(auditor.id).toBe('validate_script_commands');
      expect(auditor.packageName).toBe('ScriptCommands');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds.length).toBeGreaterThan(0);
      expect(auditor.ruleDescriptions).toBeDefined();
      expect(auditor.ruleIds).toContain('script-cmd-unregistered-npm');
      expect(auditor.ruleIds).toContain('script-cmd-invalid-npm-syntax');
      expect(auditor.ruleIds).toContain('script-cmd-unregistered-npx');
    });
  });

  it('passes cleanly when all commands in scripts and workflows are valid and registered', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-pkg',
          scripts: {
            test: 'vitest',
            lint: 'eslint .',
            build: 'tsc'
          },
          devDependencies: {
            vitest: '^3.0.0'
          }
        },
        null,
        2
      )
    );

    // Shell script with valid commands
    const deploySh = [
      '#!/usr/bin/env bash',
      'set -e',
      'npm ci',
      'npm run build',
      'npm test',
      '# This is a comment: npm run fake-commented-command',
      'npm run "$VARIABLE_TARGET"'
    ].join('\n');
    await fs.writeFile(path.join(tempDir, 'deploy.sh'), deploySh);

    // PowerShell script with valid commands
    const deployPs1 = [
      'Write-Host "Starting deployment"',
      'npm ci',
      'npm run lint',
      'npx vitest run'
    ].join('\n');
    await fs.writeFile(path.join(tempDir, 'deploy.ps1'), deployPs1);

    // Dockerfile with valid commands
    const dockerfile = [
      'FROM node:26-alpine',
      'WORKDIR /app',
      'COPY package*.json ./',
      'RUN npm ci',
      'RUN npm run build',
      'CMD ["npm", "start"]'
    ].join('\n');
    await fs.writeFile(path.join(tempDir, 'Dockerfile'), dockerfile);

    // GitHub workflow with valid commands
    const workflowDir = path.join(tempDir, '.github', 'workflows');
    await fs.mkdir(workflowDir, { recursive: true });
    const ciYaml = [
      'name: CI',
      'on: [push]',
      'jobs:',
      '  build:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - run: npm ci',
      '      - run: npm run build'
    ].join('\n');
    await fs.writeFile(path.join(workflowDir, 'ci.yml'), ciYaml);

    const auditor = new ValidateScriptCommandsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('detects unregistered npm run script in shell script', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-pkg',
          scripts: {
            build: 'tsc'
          }
        },
        null,
        2
      )
    );

    await fs.writeFile(
      path.join(tempDir, 'deploy-update.sh'),
      '#!/bin/bash\nnpm ci\nnpm run build:prod\n'
    );

    const auditor = new ValidateScriptCommandsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.summary.errors).toBeGreaterThan(0);
    expect(result.status).toBe('failed');
    const finding = result.findings.find((f) => f.ruleId === 'script-cmd-unregistered-npm');
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('error');
    expect(finding?.message).toContain('build:prod');
  });

  it('detects unregistered npm run in GitHub workflow file', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-pkg',
          scripts: {
            build: 'tsc'
          }
        },
        null,
        2
      )
    );

    const workflowDir = path.join(tempDir, '.github', 'workflows');
    await fs.mkdir(workflowDir, { recursive: true });
    await fs.writeFile(
      path.join(workflowDir, 'deploy.yml'),
      'jobs:\n  deploy:\n    steps:\n      - run: npm run non-existent-deploy-step\n'
    );

    const auditor = new ValidateScriptCommandsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.summary.errors).toBeGreaterThan(0);
    const finding = result.findings.find((f) => f.ruleId === 'script-cmd-unregistered-npm');
    expect(finding).toBeDefined();
    expect(finding?.message).toContain('non-existent-deploy-step');
  });

  it('detects invalid direct npm commands instead of npm run in shell and batch scripts', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-pkg',
          scripts: {
            compile: 'tsc'
          }
        },
        null,
        2
      )
    );

    await fs.writeFile(path.join(tempDir, 'build.sh'), '#!/bin/bash\nnpm compile\n');

    const auditor = new ValidateScriptCommandsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.summary.errors).toBeGreaterThan(0);
    const finding = result.findings.find((f) => f.ruleId === 'script-cmd-invalid-npm-syntax');
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('error');
    expect(finding?.message).toContain("debe ser 'npm run compile'");
  });

  it('detects unregistered npx binaries invoked inside scripts', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-pkg',
          dependencies: {}
        },
        null,
        2
      )
    );

    await fs.writeFile(
      path.join(tempDir, 'setup.sh'),
      '#!/bin/bash\nnpx uninstalled-fancy-tool --init\n'
    );

    const auditor = new ValidateScriptCommandsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.summary.errors).toBeGreaterThan(0);
    const finding = result.findings.find((f) => f.ruleId === 'script-cmd-unregistered-npx');
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('error');
    expect(finding?.message).toContain('uninstalled-fancy-tool');
  });

  it('detects npx vite in scripts and advises using vp dev', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-pkg',
          dependencies: {}
        },
        null,
        2
      )
    );

    await fs.writeFile(path.join(tempDir, 'dev.sh'), '#!/bin/bash\nnpx vite --host\n');

    const auditor = new ValidateScriptCommandsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.summary.errors).toBeGreaterThan(0);
    const finding = result.findings.find((f) => f.ruleId === 'script-cmd-unregistered-npx');
    expect(finding).toBeDefined();
    expect(finding?.message).toContain(
      "usa 'vp dev' o 'node_modules/.bin/vite' en lugar de 'npx vite'"
    );
  });

  it('allows npx binaries configured in audit.config.ts allowedNpxBinaries', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-pkg',
          dependencies: {}
        },
        null,
        2
      )
    );

    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, '.auditor', 'audit.config.ts'),
      `export default {
  name: 'test-pkg',
  scriptCommands: {
    allowedNpxBinaries: ['allowed-deploy-cli']
  }
};`
    );

    await fs.writeFile(
      path.join(tempDir, 'deploy.sh'),
      '#!/bin/bash\nnpx allowed-deploy-cli deploy --prod\n'
    );

    const auditor = new ValidateScriptCommandsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('respects scriptCommands.exemptGlobs configuration', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-pkg',
          scripts: { test: 'vitest' }
        },
        null,
        2
      )
    );

    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, '.auditor', 'audit.config.ts'),
      `export default {
  name: 'test-pkg',
  scriptCommands: {
    exemptGlobs: ['legacy/**/*.sh']
  }
};`
    );

    const legacyDir = path.join(tempDir, 'legacy');
    await fs.mkdir(legacyDir, { recursive: true });
    await fs.writeFile(
      path.join(legacyDir, 'old-deploy.sh'),
      '#!/bin/bash\nnpm run missing-legacy-script\n'
    );

    const auditor = new ValidateScriptCommandsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('respects scriptCommands.enabled = false configuration', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-pkg',
          scripts: {}
        },
        null,
        2
      )
    );

    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, '.auditor', 'audit.config.ts'),
      `export default {
  name: 'test-pkg',
  scriptCommands: {
    enabled: false
  }
};`
    );

    await fs.writeFile(path.join(tempDir, 'run.sh'), '#!/bin/bash\nnpm run unregistered-script\n');

    const auditor = new ValidateScriptCommandsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('skipped');
  });

  it('ignores echo messages, loops, and variable assignments in shell scripts without false positives', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-pkg',
          scripts: { build: 'tsc' }
        },
        null,
        2
      )
    );

    const script = [
      '#!/bin/bash',
      'echo "Updating npm to latest version..."',
      'echo "npm a cualquier cosa"',
      'for bin in node npm npx corepack; do',
      '  echo "Checking binary: $bin"',
      'done',
      'MSG="npm run fake"',
      'npm run build'
    ].join('\n');

    await fs.writeFile(path.join(tempDir, 'build.sh'), script);

    const auditor = new ValidateScriptCommandsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('ignores workflow step names and only audits commands in run: blocks in YAML workflows', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-pkg',
          scripts: { test: 'vitest' }
        },
        null,
        2
      )
    );

    const workflowDir = path.join(tempDir, '.github', 'workflows');
    await fs.mkdir(workflowDir, { recursive: true });

    const workflow = [
      'name: CI Workflow',
      'jobs:',
      '  build:',
      '    runs-on: ubuntu-latest',
      '    steps:',
      '      - name: Update npm to latest version',
      '        run: npm ci',
      '      - name: Run test suite with npm',
      '        run: |',
      '          echo "Running tests..."',
      '          npm run test'
    ].join('\n');

    await fs.writeFile(path.join(workflowDir, 'deploy.yml'), workflow);

    const auditor = new ValidateScriptCommandsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('ignores Write-Host, Write-Error, and quoted strings in PowerShell scripts', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-pkg',
          scripts: { 'env:post-setup': 'node post.js' }
        },
        null,
        2
      )
    );

    const psScript = [
      'Write-Host "npm a la versión más reciente"',
      'Write-Warning "npm instalado con éxito"',
      'Write-Error "npm sincronizada"',
      '$msg = "npm run missing"',
      'npm install -g npm@latest',
      'npm ci',
      'npm run env:post-setup'
    ].join('\n');

    await fs.writeFile(path.join(tempDir, 'setup-windows.ps1'), psScript);

    const auditor = new ValidateScriptCommandsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('inspects process runner calls and ignores console.log / line.includes in TypeScript scripts', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-pkg',
          scripts: {
            test: 'vitest',
            build: 'tsc'
          },
          devDependencies: {
            playwright: '^1.40.0'
          }
        },
        null,
        2
      )
    );

    const scriptsDir = path.join(tempDir, 'scripts');
    await fs.mkdir(scriptsDir, { recursive: true });

    const tsScript = [
      "import { execSync, spawnSync } from 'node:child_process';",
      '',
      '// Process runner calls (should be extracted and verified):',
      "execSync('npm run build');",
      "spawnSync('npx', ['playwright', 'test']);",
      '',
      '// Non-runner calls with npm keywords (should be completely ignored):',
      "console.log('Use: npm run build to compile');",
      "const line = 'some npm notice text';",
      "if (line.includes('npm notice') || line.includes('npm warn')) {",
      "  console.log('Ignored npm output');",
      '}'
    ].join('\n');

    await fs.writeFile(path.join(scriptsDir, 'run_simulations.ts'), tsScript);

    const auditor = new ValidateScriptCommandsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('detects violations in process runner calls inside TypeScript scripts', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-pkg',
          scripts: { build: 'tsc' }
        },
        null,
        2
      )
    );

    const scriptsDir = path.join(tempDir, 'scripts');
    await fs.mkdir(scriptsDir, { recursive: true });

    const tsScript = [
      "import { execSync } from 'node:child_process';",
      "execSync('npm run non-existent-script');"
    ].join('\n');

    await fs.writeFile(path.join(scriptsDir, 'deploy.ts'), tsScript);

    const auditor = new ValidateScriptCommandsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.summary.errors).toBeGreaterThan(0);
    expect(result.status).toBe('failed');
    const finding = result.findings.find((f) => f.ruleId === 'script-cmd-unregistered-npm');
    expect(finding).toBeDefined();
    expect(finding?.message).toContain('non-existent-script');
  });

  it('detects unregistered npm run in CLI help logs while ignoring syntax placeholders', async () => {
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-pkg',
          scripts: { 'db:migrate': 'node run.js' }
        },
        null,
        2
      )
    );

    const scriptsDir = path.join(tempDir, 'scripts');
    await fs.mkdir(scriptsDir, { recursive: true });

    const tsScript = [
      "console.log('USO: npm run <comando>');",
      "console.log('Ejemplo: npm run database:update');"
    ].join('\n');

    await fs.writeFile(path.join(scriptsDir, 'help.ts'), tsScript);

    const auditor = new ValidateScriptCommandsAuditor({ projectRoot: tempDir });
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(1);
    expect(result.status).toBe('failed');
    const finding = result.findings.find((f) => f.ruleId === 'script-cmd-unregistered-npm');
    expect(finding).toBeDefined();
    expect(finding?.message).toContain('database:update');
  });
});

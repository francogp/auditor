import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { resetAuditConfig } from '../src/core/auditConfig.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import {
  ValidatePackageScriptsAuditor,
  PACKAGE_SCRIPTS_RULES
} from '../src/suites/architecture/validate_package_scripts.ts';

describe('ValidatePackageScriptsAuditor', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    resetAuditConfig();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'package-scripts-test-'));

    // Git sandbox satisfying ratchet production ref
    const git = (...args: string[]): void => {
      execFileSync('git', args, { cwd: tempDir, stdio: 'ignore' });
    };
    git('init', '-q');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Contract & Metadata Conformance (5-Point Mandate)', () => {
    it('satisfies 100% of BaseAuditor metadata contracts via validateAuditorConstruction', () => {
      const auditor = new ValidatePackageScriptsAuditor({ projectRoot: tempDir });
      const errors = validateAuditorConstruction(auditor, 'validate_package_scripts');
      expect(errors).toEqual([]);
      expect(auditor.id).toBe('validate_package_scripts');
      expect(auditor.family).toBe('architecture');
      expect(auditor.packageName).toBe('Scripts');
      expect(auditor.icon).toBe('📦');
      expect(auditor.capabilities.fix).not.toBe('none');
    });

    it('declares 100% of rule IDs in ruleDescriptions within the 50 char badge limit', () => {
      const auditor = new ValidatePackageScriptsAuditor({ projectRoot: tempDir });
      for (const ruleId of PACKAGE_SCRIPTS_RULES) {
        expect(auditor.ruleDescriptions?.[ruleId]).toBeDefined();
        const desc = auditor.ruleDescriptions![ruleId]!;
        const combined = `${auditor.packageName}: ${desc}`;
        expect(combined.length).toBeLessThanOrEqual(50);
      }
    });
  });

  async function writeConfig(cfg: object): Promise<void> {
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, '.auditor', 'audit.config.json'),
      JSON.stringify(cfg, null, 2),
      'utf-8'
    );
  }

  describe('Clean Path Testing', () => {
    it('passes cleanly with 0 errors and 0 warnings on valid package.json and baseline', async () => {
      await writeConfig({
        name: 'test-app',
        paths: { srcRoots: ['src'] },
        packageScripts: { enabled: true, enforceBuildAudit: true, recommendedScripts: false },
        ratchet: { enabled: false }
      });

      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify(
          {
            name: 'test-app',
            scripts: {
              build: 'npm run auditor:full && vite build && npm run auditor:post-build',
              lint: 'npm run auditor:lint'
            }
          },
          null,
          2
        ),
        'utf-8'
      );

      const auditor = new ValidatePackageScriptsAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('passed');
      expect(result.findings.length).toBe(0);
    });
  });

  describe('Violation Path Testing (Errors)', () => {
    it('detects missing package.json (package-scripts-missing-file)', async () => {
      await writeConfig({ name: 'test-app', paths: { srcRoots: ['src'] } });

      const auditor = new ValidatePackageScriptsAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      expect(result.status).toBe('failed');
      const f = result.findings.find((x) => x.ruleId === 'package-scripts-missing-file');
      expect(f).toBeDefined();
      expect(f?.severity).toBe('error');
    });

    it('detects unchained build script (package-scripts-build-missing-audit)', async () => {
      await writeConfig({
        name: 'test-app',
        paths: { srcRoots: ['src'] },
        packageScripts: { recommendedScripts: false },
        ratchet: { enabled: false }
      });

      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'test-app', scripts: { build: 'vite build' } }, null, 2),
        'utf-8'
      );

      const auditor = new ValidatePackageScriptsAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      expect(result.status).toBe('failed');
      const f = result.findings.find((x) => x.ruleId === 'package-scripts-build-missing-audit');
      expect(f).toBeDefined();
      expect(f?.severity).toBe('error');
    });

    it('detects removed audit:for-commit references (package-scripts-removed-commit-gate)', async () => {
      await writeConfig({
        name: 'test-app',
        paths: { srcRoots: ['src'] },
        packageScripts: { recommendedScripts: false },
        ratchet: { enabled: false }
      });

      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify(
          {
            name: 'test-app',
            scripts: {
              build: 'npm run auditor:full && vite build && npm run auditor:post-build',
              'audit:for-commit': 'auditor-commit'
            }
          },
          null,
          2
        ),
        'utf-8'
      );

      const auditor = new ValidatePackageScriptsAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      expect(result.status).toBe('failed');
      const f = result.findings.find((x) => x.ruleId === 'package-scripts-removed-commit-gate');
      expect(f).toBeDefined();
      expect(f?.severity).toBe('error');
    });

    it('detects invalid ratchet production ref (package-scripts-invalid-production-ref)', async () => {
      await writeConfig({
        name: 'test-app',
        paths: { srcRoots: ['src'] },
        packageScripts: { recommendedScripts: false },
        ratchet: { enabled: true, productionRef: 'origin/non_existent_branch' }
      });

      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify(
          {
            name: 'test-app',
            scripts: { build: 'npm run auditor:full && vite build && npm run auditor:post-build' }
          },
          null,
          2
        ),
        'utf-8'
      );

      const auditor = new ValidatePackageScriptsAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      expect(result.status).toBe('failed');
      const f = result.findings.find((x) => x.ruleId === 'package-scripts-invalid-production-ref');
      expect(f).toBeDefined();
      expect(f?.severity).toBe('error');
    });

    it('detects invalid ratchet baseline schema (package-scripts-invalid-ratchet-baseline)', async () => {
      await writeConfig({
        name: 'test-app',
        paths: { srcRoots: ['src'] },
        packageScripts: { recommendedScripts: false },
        ratchet: { enabled: true, baselineFile: '.auditor/audit-baseline.json' }
      });

      await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, '.auditor', 'audit-baseline.json'),
        '{"schemaVersion":99,"warnings":[]}',
        'utf-8'
      );

      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify(
          {
            name: 'test-app',
            scripts: { build: 'npm run auditor:full && vite build && npm run auditor:post-build' }
          },
          null,
          2
        ),
        'utf-8'
      );

      const auditor = new ValidatePackageScriptsAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      expect(result.status).toBe('failed');
      const f = result.findings.find(
        (x) => x.ruleId === 'package-scripts-invalid-ratchet-baseline'
      );
      expect(f).toBeDefined();
      expect(f?.severity).toBe('error');
    });
  });

  describe('Warning Path Testing', () => {
    it('reports warnings for missing recommended scripts (package-scripts-missing-recommended)', async () => {
      await writeConfig({
        name: 'test-app',
        paths: { srcRoots: ['src'] },
        packageScripts: { recommendedScripts: true },
        ratchet: { enabled: false }
      });

      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify(
          {
            name: 'test-app',
            scripts: {
              build: 'npm run auditor:full && vite build && npm run auditor:post-build'
            }
          },
          null,
          2
        ),
        'utf-8'
      );

      const auditor = new ValidatePackageScriptsAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      expect(result.summary.warnings).toBeGreaterThan(0);
      const f = result.findings.find((x) => x.ruleId === 'package-scripts-missing-recommended');
      expect(f).toBeDefined();
      expect(f?.severity).toBe('warning');
    });

    it('reports warnings for obsolete legacy auditor scripts (package-scripts-obsolete)', async () => {
      await writeConfig({
        name: 'test-app',
        paths: { srcRoots: ['src'] },
        packageScripts: { recommendedScripts: false },
        ratchet: { enabled: false }
      });

      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify(
          {
            name: 'test-app',
            scripts: {
              build: 'npm run auditor:full && vite build && npm run auditor:post-build',
              'audit:legacy': 'node scripts/audit.js'
            }
          },
          null,
          2
        ),
        'utf-8'
      );

      const auditor = new ValidatePackageScriptsAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      expect(result.summary.warnings).toBeGreaterThan(0);
      const f = result.findings.find((x) => x.ruleId === 'package-scripts-obsolete');
      expect(f).toBeDefined();
      expect(f?.severity).toBe('warning');
    });
  });

  describe('Automated Repair Mode (fix: true)', () => {
    it('repairs build script and prunes obsolete scripts automatically in fix mode', async () => {
      await writeConfig({
        name: 'test-app',
        paths: { srcRoots: ['src'] },
        packageScripts: { recommendedScripts: false },
        ratchet: { enabled: false }
      });

      const pkgPath = path.join(tempDir, 'package.json');
      await fs.writeFile(
        pkgPath,
        JSON.stringify(
          {
            name: 'test-app',
            scripts: {
              build: 'vite build',
              'audit:for-commit': 'auditor-commit',
              'audit:legacy': 'node old.js'
            }
          },
          null,
          2
        ),
        'utf-8'
      );

      const fixAuditor = new ValidatePackageScriptsAuditor({ projectRoot: tempDir });
      const fixResult = await fixAuditor.fix();

      expect(fixResult.summary.errors).toBe(0);

      const updated = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
      expect(updated.scripts.build).toBe(
        'npm run auditor:full && vite build && npm run auditor:post-build'
      );
      expect(updated.scripts['audit:for-commit']).toBeUndefined();
      expect(updated.scripts['audit:legacy']).toBeUndefined();
    });

    it('detects vp run auditor chaining in build script and auto-repairs to npm run', async () => {
      await writeConfig({
        name: 'test-app',
        paths: { srcRoots: ['src'] },
        packageScripts: { recommendedScripts: false },
        ratchet: { enabled: false }
      });

      const pkgPath = path.join(tempDir, 'package.json');
      await fs.writeFile(
        pkgPath,
        JSON.stringify(
          {
            name: 'test-app',
            scripts: {
              build: 'vp run auditor:full && vp pack && vp run auditor:post-build'
            }
          },
          null,
          2
        ),
        'utf-8'
      );

      const inspectAuditor = new ValidatePackageScriptsAuditor({
        projectRoot: tempDir
      });
      const inspectResult = await inspectAuditor.audit();
      expect(inspectResult.summary.errors).toBe(1);
      expect(inspectResult.findings[0]?.message).toContain('uses "vp run" instead of "npm run"');

      const fixAuditor = new ValidatePackageScriptsAuditor({ projectRoot: tempDir });
      const fixResult = await fixAuditor.fix();
      expect(fixResult.summary.errors).toBe(0);

      const updated = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
      expect(updated.scripts.build).toBe(
        'npm run auditor:full && vp pack && npm run auditor:post-build'
      );
    });

    it('detects and migrates obsolete CI/CD workflow commands in .github/workflows/deploy.yml from build:prod to build:deploy', async () => {
      await writeConfig({
        name: 'test-app',
        paths: { srcRoots: ['src'] },
        packageScripts: { recommendedScripts: false },
        ratchet: { enabled: false }
      });

      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify(
          {
            name: 'test-app',
            scripts: {
              build: 'npm run auditor:full && vite build && npm run auditor:post-build'
            }
          },
          null,
          2
        ),
        'utf-8'
      );

      const workflowsDir = path.join(tempDir, '.github', 'workflows');
      await fs.mkdir(workflowsDir, { recursive: true });
      const deployYmlPath = path.join(workflowsDir, 'deploy.yml');
      await fs.writeFile(
        deployYmlPath,
        'name: Deploy\njobs:\n  build:\n    steps:\n      - run: npm run build:prod\n      - run: npm run auditor:build\n      - run: npm run auditor:precommit\n',
        'utf-8'
      );

      // Check mode reports warning
      const checkAuditor = new ValidatePackageScriptsAuditor({ projectRoot: tempDir });
      const checkResult = await checkAuditor.audit();
      expect(checkResult.summary.warnings).toBeGreaterThan(0);
      const wfFinding = checkResult.findings.find(
        (x) => x.ruleId === 'package-scripts-obsolete' && x.file === '.github/workflows/deploy.yml'
      );
      expect(wfFinding).toBeDefined();

      // Fix mode migrates deploy.yml
      const fixAuditor = new ValidatePackageScriptsAuditor({ projectRoot: tempDir });
      const fixResult = await fixAuditor.fix();
      expect(fixResult.summary.errors).toBe(0);
      expect(fixResult.summary.warnings).toBe(0);

      const migratedYml = await fs.readFile(deployYmlPath, 'utf-8');
      expect(migratedYml).toContain('npm run build:deploy');
      expect(migratedYml).toContain('npm run auditor:post-build');
      expect(migratedYml).toContain('npm run auditor:full');
      expect(migratedYml).not.toContain('build:prod');
      expect(migratedYml).not.toContain('auditor:build');
      expect(migratedYml).not.toContain('auditor:precommit');
    });

    it('bypasses build script chaining enforcement when packageScripts.enforceBuildAudit is false', async () => {
      await writeConfig({
        name: 'test-app',
        paths: { srcRoots: ['src'] },
        packageScripts: { enforceBuildAudit: false, recommendedScripts: false },
        ratchet: { enabled: false }
      });

      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify(
          {
            name: 'test-app',
            scripts: {
              build: 'vite build'
            }
          },
          null,
          2
        ),
        'utf-8'
      );

      const auditor = new ValidatePackageScriptsAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('detects legacy vitest/vite commands and auto-repairs to vp test / vp build in Vite+ projects', async () => {
      await writeConfig({
        name: 'test-app',
        paths: { srcRoots: ['src'] },
        packageScripts: { recommendedScripts: false },
        ratchet: { enabled: false }
      });

      await fs.writeFile(path.join(tempDir, 'vite.config.ts'), 'export default {};', 'utf-8');

      const pkgPath = path.join(tempDir, 'package.json');
      await fs.writeFile(
        pkgPath,
        JSON.stringify(
          {
            name: 'test-app',
            scripts: {
              test: 'vitest run',
              dev: 'vite dev',
              build: 'npm run auditor:full && vite build && npm run auditor:post-build'
            },
            devDependencies: {
              'vite-plus': '^1.3.0'
            }
          },
          null,
          2
        ),
        'utf-8'
      );

      // Check mode
      const checkAuditor = new ValidatePackageScriptsAuditor({ projectRoot: tempDir });
      const checkResult = await checkAuditor.audit();
      expect(checkResult.summary.warnings).toBeGreaterThan(0);
      const obsoleteFindings = checkResult.findings.filter(
        (f) => f.ruleId === 'package-scripts-obsolete' && f.file === 'package.json'
      );
      expect(obsoleteFindings.length).toBe(3);

      // Fix mode
      const fixAuditor = new ValidatePackageScriptsAuditor({ projectRoot: tempDir });
      const fixResult = await fixAuditor.fix();
      expect(fixResult.summary.errors).toBe(0);
      expect(fixResult.summary.warnings).toBe(0);

      const repaired = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
      expect(repaired.scripts.test).toBe('vp test');
      expect(repaired.scripts.dev).toBe('vp dev');
      expect(repaired.scripts.build).toBe(
        'npm run auditor:full && vp build && npm run auditor:post-build'
      );
    });
  });
});

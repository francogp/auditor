/**
 * tests/validate_environment_engines.test.ts
 *
 * Dedicated unit test suite for ValidateEnvironmentEnginesAuditor:
 * - Metadata & configuration conformance
 * - Violation detection for missing engines, below floor engines, and runtime mismatch
 * - Auto-fix execution for repairing package.json engines
 * - Clean path execution
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { getAuditorEngines } from '../src/cli/check_environment.ts';
import {
  ValidateEnvironmentEnginesAuditor,
  ENVIRONMENT_ENGINES_RULES,
  extractBaseNodeVersion,
  syncNodeVersion
} from '../src/suites/architecture/validate_environment_engines.ts';

describe('validate_environment_engines (Environment Engines & Runtime Validator)', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-env-engines-test-'));
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      /* non-fatal test cleanup */
    }
  });

  describe('Metadata & Configuration', () => {
    it('declares all expected canonical rules', () => {
      expect(ENVIRONMENT_ENGINES_RULES).toEqual([
        'environment-engines-missing',
        'environment-engines-below-floor',
        'environment-runtime-mismatch'
      ]);
    });

    it('initializes with correct canonical metadata and description lengths <= 50', () => {
      const auditor = new ValidateEnvironmentEnginesAuditor({ projectRoot: tempDir });
      expect(auditor.id).toBe('validate_environment_engines');
      expect(auditor.family).toBe('architecture');
      expect(auditor.packageName).toBe('Environment');
      expect(auditor.icon).toBe('⚡');
      expect(auditor.capabilities.fix).toBe('priority');
      expect(auditor.capabilities.speed).toBe('light');
      expect(auditor.description.length).toBeLessThanOrEqual(60);

      for (const ruleId of ENVIRONMENT_ENGINES_RULES) {
        const fullDesc = auditor.formatRuleDescription(ruleId);
        expect(fullDesc.length).toBeLessThanOrEqual(50);
        expect(fullDesc).not.toContain('\n');
      }
    });
  });

  describe('Clean Path (Negative Verification)', () => {
    it('passes cleanly when package.json declares valid engines matching current runtime', async () => {
      const auditorEngines = getAuditorEngines();
      const validPkg = {
        name: 'test-clean-app',
        version: '1.0.0',
        engines: {
          node: `>=${process.versions.node}`,
          npm: auditorEngines.npm
        }
      };

      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify(validPkg, null, 2),
        'utf8'
      );

      const auditor = new ValidateEnvironmentEnginesAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('passed');
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('Violation Detection', () => {
    it('detects missing package.json', async () => {
      const auditor = new ValidateEnvironmentEnginesAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      expect(result.summary.errors).toBe(1);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'environment-engines-missing');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects missing engines declaration in package.json', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'test-no-engines', version: '1.0.0' }, null, 2),
        'utf8'
      );

      const auditor = new ValidateEnvironmentEnginesAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      expect(result.summary.errors).toBeGreaterThanOrEqual(1);
      const finding = result.findings.find((f) => f.ruleId === 'environment-engines-missing');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
      expect(finding?.fixable).toBe(true);
    });

    it('detects engines below auditor floor', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify(
          {
            name: 'test-below-floor',
            version: '1.0.0',
            engines: {
              node: '>=18.0.0',
              npm: '>=8.0.0'
            }
          },
          null,
          2
        ),
        'utf8'
      );

      const auditor = new ValidateEnvironmentEnginesAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      expect(result.summary.errors).toBeGreaterThanOrEqual(1);
      const finding = result.findings.find((f) => f.ruleId === 'environment-engines-below-floor');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
      expect(finding?.fixable).toBe(true);
    });

    it('detects runtime mismatch when package requires higher node than running', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify(
          {
            name: 'test-mismatch',
            version: '1.0.0',
            engines: {
              node: '>=99.0.0',
              npm: '>=99.0.0'
            }
          },
          null,
          2
        ),
        'utf8'
      );

      const auditor = new ValidateEnvironmentEnginesAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      expect(result.summary.errors).toBeGreaterThanOrEqual(1);
      const finding = result.findings.find((f) => f.ruleId === 'environment-runtime-mismatch');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });
  });

  describe('Helper Functions & SSoT Synchronization', () => {
    it('extractBaseNodeVersion parses semver cleanly', () => {
      expect(extractBaseNodeVersion('>=26.11.1')).toBe('26.11.1');
      expect(extractBaseNodeVersion('^26.10.0')).toBe('26.10.0');
      expect(extractBaseNodeVersion('24.5.1')).toBe('24.5.1');
      expect(extractBaseNodeVersion('')).toBe('');
    });

    it('syncNodeVersion synchronizes exact base node version into .node-version', async () => {
      const updated = syncNodeVersion(tempDir, '>=26.11.1');
      expect(updated).toBe(true);

      const content = await fs.readFile(path.join(tempDir, '.node-version'), 'utf8');
      expect(content.trim()).toBe('26.11.1');

      // Idempotent run
      const secondRun = syncNodeVersion(tempDir, '>=26.11.1');
      expect(secondRun).toBe(false);
    });
  });

  describe('SSoT Auto-Fix & Non-Mutation in Check Mode', () => {
    it('auto-injects canonical SSoT engines on fix() and does not mutate on audit()', async () => {
      const pkgPath = path.join(tempDir, 'package.json');
      const originalPkg = { name: 'fixable-pkg', version: '1.0.0' };
      await fs.writeFile(pkgPath, JSON.stringify(originalPkg, null, 2), 'utf8');

      const checkAuditor = new ValidateEnvironmentEnginesAuditor({
        projectRoot: tempDir
      });
      const checkResult = await checkAuditor.audit();
      expect(checkResult.status).toBe('failed');
      const unmutated = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
      expect(unmutated.engines).toBeUndefined();

      const fixAuditor = new ValidateEnvironmentEnginesAuditor({
        projectRoot: tempDir
      });
      const fixResult = await fixAuditor.fix();
      expect(fixResult.status).toBe('passed');
      const mutated = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
      const auditorEngines = getAuditorEngines();
      expect(mutated.engines).toEqual({
        node: auditorEngines.node,
        npm: auditorEngines.npm
      });
    });

    it('auto-upgrades engines below floor to canonical SSoT floor when fix: true', async () => {
      const pkgPath = path.join(tempDir, 'package.json');
      const originalPkg = {
        name: 'fixable-below-floor',
        version: '1.0.0',
        engines: {
          node: '>=20.0.0',
          npm: '>=9.0.0'
        }
      };
      await fs.writeFile(pkgPath, JSON.stringify(originalPkg, null, 2), 'utf8');

      const auditor = new ValidateEnvironmentEnginesAuditor({
        projectRoot: tempDir
      });
      const result = await auditor.fix();

      expect(result.status).toBe('passed');
      const mutated = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
      const auditorEngines = getAuditorEngines();
      expect(mutated.engines.node).toBe(auditorEngines.node);
      expect(mutated.engines.npm).toBe(auditorEngines.npm);
    });

    it('reports actionable terminal remediation instructions pointing to setup and update scripts without spawning shell', async () => {
      const isWin = process.platform === 'win32';
      const expectedSetup = isWin ? '.\\setup-windows.ps1' : './setup-linux.sh';
      const expectedUpdate = isWin ? '.\\update-windows.ps1' : './update-linux.sh';

      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify(
          {
            name: 'test-mismatch-remediation',
            version: '1.0.0',
            engines: {
              node: '>=999.0.0',
              npm: '>=999.0.0'
            }
          },
          null,
          2
        ),
        'utf8'
      );

      const auditor = new ValidateEnvironmentEnginesAuditor({
        projectRoot: tempDir
      });
      const result = await auditor.fix();

      const finding = result.findings.find((f) => f.ruleId === 'environment-runtime-mismatch');
      expect(finding).toBeDefined();
      expect(finding?.message).toContain(expectedSetup);
      expect(finding?.message).toContain(expectedUpdate);
    });
  });
});

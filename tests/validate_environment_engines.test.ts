/**
 * tests/validate_environment_engines.test.ts
 *
 * Dedicated unit test suite for ValidateEnvironmentEnginesAuditor:
 * - Metadata & configuration conformance
 * - Violation detection for missing engines, below floor engines, and runtime mismatch
 * - Auto-fix execution for repairing package.json engines
 * - Clean path execution
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  ValidateEnvironmentEnginesAuditor,
  ENVIRONMENT_ENGINES_RULES
} from '../src/suites/architecture/validate_environment_engines.ts';
import { getAuditorEngines } from '../src/cli/check_environment.ts';

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
      // catch-ok: cleanup temporary test directory
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
      expect(auditor.packageName).toBe('Entorno');
      expect(auditor.icon).toBe('⚡');
      expect(auditor.capabilities.fixPriority).toBe(true);
      expect(auditor.capabilities.fix).toBe(true);
      expect(auditor.capabilities.lint).toBe(true);
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
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('passed');
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('Violation Detection', () => {
    it('detects missing package.json', async () => {
      const auditor = new ValidateEnvironmentEnginesAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(1);
      expect(result.status).toBe('failed');
      const finding = result.findings.find(f => f.ruleId === 'environment-engines-missing');
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
      const result = await auditor.execute();

      expect(result.summary.errors).toBeGreaterThanOrEqual(1);
      const finding = result.findings.find(f => f.ruleId === 'environment-engines-missing');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
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
      const result = await auditor.execute();

      expect(result.summary.errors).toBeGreaterThanOrEqual(1);
      const finding = result.findings.find(f => f.ruleId === 'environment-engines-below-floor');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
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
      const result = await auditor.execute();

      expect(result.summary.errors).toBeGreaterThanOrEqual(1);
      const finding = result.findings.find(f => f.ruleId === 'environment-runtime-mismatch');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });
  });

  describe('Auto-Fix Execution', () => {
    it('repairs missing engines by injecting canonical auditor engines into package.json', async () => {
      const pkgPath = path.join(tempDir, 'package.json');
      await fs.writeFile(
        pkgPath,
        JSON.stringify({ name: 'fixable-pkg', version: '1.0.0' }, null, 2),
        'utf8'
      );

      const auditor = new ValidateEnvironmentEnginesAuditor({
        projectRoot: tempDir,
        fix: true
      });
      await auditor.execute();

      const repaired = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
      expect(repaired.engines).toBeDefined();
      expect(repaired.engines.node).toMatch(/^>=26\./);
      expect(repaired.engines.npm).toMatch(/^>=12\./);
    });

    it('upgrades engines below floor in package.json to auditor minimums', async () => {
      const pkgPath = path.join(tempDir, 'package.json');
      await fs.writeFile(
        pkgPath,
        JSON.stringify(
          {
            name: 'fixable-below-floor',
            version: '1.0.0',
            engines: {
              node: '>=20.0.0',
              npm: '>=9.0.0'
            }
          },
          null,
          2
        ),
        'utf8'
      );

      const auditor = new ValidateEnvironmentEnginesAuditor({
        projectRoot: tempDir,
        fix: true
      });
      await auditor.execute();

      const repaired = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
      expect(repaired.engines.node).toMatch(/^>=26\./);
      expect(repaired.engines.npm).toMatch(/^>=12\./);
    });
  });
});

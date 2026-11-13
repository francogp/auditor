import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import {
  ValidateDockerConfigAuditor,
  DOCKER_CONFIG_RULES,
  CANONICAL_DOCKERIGNORE_CONTENT
} from '../src/suites/architecture/validate_docker_config.ts';

describe('ValidateDockerConfigAuditor', () => {
  let tmpDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-docker-test-'));
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* non-fatal test cleanup */
    }
  });

  describe('Contract Conformance & Metadata', () => {
    it('fulfills BaseAuditor metadata and construction contract', () => {
      const auditor = new ValidateDockerConfigAuditor({ projectRoot: tmpDir });
      validateAuditorConstruction(auditor);
      expect(auditor.id).toBe('validate_docker_config');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds).toEqual(DOCKER_CONFIG_RULES);
      expect(auditor.description.length).toBeLessThanOrEqual(60);
    });
  });

  describe('Conditional Applicability', () => {
    it('skips cleanly without errors or findings if no Dockerfile/compose exists', async () => {
      const auditor = new ValidateDockerConfigAuditor({ projectRoot: tmpDir });
      const result = await auditor.audit();

      expect(result.status).toBe('skipped');
      expect(result.summary.errors).toBe(0);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('Clean Path Execution', () => {
    it('passes with zero errors on canonical baseline configuration when Dockerfile is present', async () => {
      fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), 'FROM node:26-alpine\n', 'utf8');
      fs.writeFileSync(path.join(tmpDir, '.dockerignore'), CANONICAL_DOCKERIGNORE_CONTENT, 'utf8');

      const auditor = new ValidateDockerConfigAuditor({ projectRoot: tmpDir });
      const result = await auditor.audit();

      expect(result.status).toBe('passed');
      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('Canary Tests & Auto-Repair', () => {
    it('Canary 1 (Missing Config): reports error in check mode and scaffolds in fix mode', async () => {
      fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), 'FROM node:26-alpine\n', 'utf8');
      const ignorePath = path.join(tmpDir, '.dockerignore');
      expect(fs.existsSync(ignorePath)).toBe(false);

      // Check mode
      const checkAuditor = new ValidateDockerConfigAuditor({ projectRoot: tmpDir });
      const checkResult = await checkAuditor.audit();
      expect(checkResult.status).toBe('failed');
      expect(checkResult.summary.errors).toBe(1);
      expect(checkResult.findings[0]?.ruleId).toBe('dockerignore-missing');

      // Fix mode
      const fixAuditor = new ValidateDockerConfigAuditor({ projectRoot: tmpDir });
      const fixResult = await fixAuditor.fix();
      expect(fixResult.status).toBe('passed');
      expect(fixResult.summary.errors).toBe(0);
      expect(fs.existsSync(ignorePath)).toBe(true);

      const content = fs.readFileSync(ignorePath, 'utf8');
      expect(content).toContain('node_modules');
      expect(content).toContain('.git');
      expect(content).toContain('scratch');
      expect(content).toContain('.env*');
    });

    it('Canary 2 (Anti-Castration Mandate): detects missing critical patterns and appends in fix mode', async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'docker-compose.yml'),
        'services:\n  app:\n    image: test\n',
        'utf8'
      );
      const ignorePath = path.join(tmpDir, '.dockerignore');
      fs.writeFileSync(ignorePath, 'dist\n*.log\n', 'utf8');

      // Check mode
      const checkAuditor = new ValidateDockerConfigAuditor({ projectRoot: tmpDir });
      const checkResult = await checkAuditor.audit();
      expect(checkResult.status).toBe('failed');
      const violations = checkResult.findings.filter(
        (f) => f.ruleId === 'dockerignore-missing-pattern'
      );
      // missing node_modules (1), .git (1), scratch (1), .env* (1) => 4
      expect(violations).toHaveLength(4);

      // Fix mode
      const fixAuditor = new ValidateDockerConfigAuditor({ projectRoot: tmpDir });
      const fixResult = await fixAuditor.fix();
      expect(fixResult.summary.errors).toBe(0);

      const repaired = fs.readFileSync(ignorePath, 'utf8');
      expect(repaired).toContain('dist'); // preserved
      expect(repaired).toContain('node_modules');
      expect(repaired).toContain('.git');
      expect(repaired).toContain('scratch');
      expect(repaired).toContain('.env*');
    });

    it('records scannedFiles for docker-compose.yml, nested Dockerfile, and .dockerignore alongside coverage.include', async () => {
      fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), 'FROM node:26-alpine\n', 'utf8');
      fs.writeFileSync(path.join(tmpDir, 'docker-compose.yml'), 'services:\n  app:\n', 'utf8');
      fs.mkdirSync(path.join(tmpDir, 'deploy'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'deploy', 'Dockerfile'), 'FROM node:26-alpine\n', 'utf8');
      fs.writeFileSync(
        path.join(tmpDir, '.dockerignore'),
        'node_modules\n.git\nscratch\n.env*\n',
        'utf8'
      );
      const prevRunId = process.env['AUDIT_COVERAGE_RUN_ID'];
      const prevRunMode = process.env['AUDIT_COVERAGE_RUN_MODE'];
      const runId = `test-docker-${Date.now()}`;
      try {
        process.env['AUDIT_COVERAGE_RUN_ID'] = runId;
        process.env['AUDIT_COVERAGE_RUN_MODE'] = 'full';
        const auditor = new ValidateDockerConfigAuditor({ projectRoot: tmpDir });
        await auditor.audit();
        const ledgerPath = path.join(
          tmpDir,
          'scratch',
          'audits',
          'coverage',
          'validate_docker_config.json'
        );
        const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) as {
          declared: { include: string[] };
          scanned: string[];
        };
        expect(ledger.declared.include).toContain('.dockerignore');
        expect(ledger.declared.include).toContain('Dockerfile');
        expect(ledger.declared.include).toContain('docker-compose.yml');
        expect(ledger.declared.include).toContain('compose.yaml');
        expect(ledger.scanned).toContain('.dockerignore');
        expect(ledger.scanned).toContain('Dockerfile');
        expect(ledger.scanned).toContain('docker-compose.yml');
        expect(ledger.scanned).toContain('deploy/Dockerfile');
      } finally {
        if (prevRunId === undefined) {
          delete process.env['AUDIT_COVERAGE_RUN_ID'];
        } else {
          process.env['AUDIT_COVERAGE_RUN_ID'] = prevRunId;
        }
        if (prevRunMode === undefined) {
          delete process.env['AUDIT_COVERAGE_RUN_MODE'];
        } else {
          process.env['AUDIT_COVERAGE_RUN_MODE'] = prevRunMode;
        }
      }
    });
  });
});

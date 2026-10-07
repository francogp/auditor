import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  ValidateSecretLeaksAuditor,
  SECRET_LEAKS_RULES,
  mapSecretLintMessageToFinding
} from '../src/suites/architecture/validate_secret_leaks.ts';
import { setAuditConfig, resetAuditConfig, defineAuditConfig } from '../src/core/auditConfig.ts';

describe('ValidateSecretLeaksAuditor & mapSecretLintMessageToFinding', () => {
  let tempDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-secret-test-'));
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // catch-ok: cleanup temporary test directory
    }
  });

  describe('Rule Declarations & Metadata', () => {
    it('declares all expected rules in SECRET_LEAKS_RULES', () => {
      expect(SECRET_LEAKS_RULES).toContain('secret-leak-detected');
      expect(SECRET_LEAKS_RULES).toContain('secret-leak-private-key');
    });

    it('initializes with correct auditor metadata and Spanish rule descriptions', () => {
      const auditor = new ValidateSecretLeaksAuditor({ projectRoot: tempDir });
      expect(auditor.id).toBe('validate_secret_leaks');
      expect(auditor.family).toBe('architecture');
      expect(auditor.packageName).toBe('Secretos');
      expect(auditor.ruleDescriptions['secret-leak-detected']).toBe('Token, secreto o credencial expuesta');
      expect(auditor.ruleDescriptions['secret-leak-private-key']).toBe('Clave criptográfica privada expuesta');
    });
  });

  describe('mapSecretLintMessageToFinding', () => {
    it('maps general token messages to secret-leak-detected', () => {
      const finding = mapSecretLintMessageToFinding(
        {
          message: 'found GitHub Token',
          messageId: 'GITHUB_TOKEN',
          ruleId: '@secretlint/secretlint-rule-github',
          loc: { start: { line: 10, column: 5 } }
        },
        'src/config.ts'
      );

      expect(finding.ruleId).toBe('secret-leak-detected');
      expect(finding.severity).toBe('error');
      expect(finding.file).toBe('src/config.ts');
      expect(finding.line).toBe(10);
      expect(finding.col).toBe(5);
    });

    it('maps private key messages to secret-leak-private-key', () => {
      const finding = mapSecretLintMessageToFinding(
        {
          message: 'found PrivateKey',
          messageId: 'PrivateKey',
          ruleId: '@secretlint/secretlint-rule-privatekey',
          loc: { start: { line: 1, column: 1 } }
        },
        'keys/id_rsa'
      );

      expect(finding.ruleId).toBe('secret-leak-private-key');
      expect(finding.severity).toBe('error');
      expect(finding.file).toBe('keys/id_rsa');
    });
  });

  describe('Violation Detection in Sandbox', () => {
    it('detects secret-leak-detected when a secret token is present in source files', async () => {
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });

      // Split fixture string to avoid self-triggering static scanners
      const secretToken = 'gh' + 'p_111111111111111111111111111111111111';
      fs.writeFileSync(
        path.join(srcDir, 'apiClient.ts'),
        `export const token = "${secretToken}";\n`
      );

      setAuditConfig(
        defineAuditConfig({
          name: 'Secret Leak Test Project',
          secretLeaks: { enabled: true },
          persistence: { engine: 'none' },
          bundle: { enabled: false },
          styles: { zLayersEnabled: false },
          templates: { requireInputIds: false },
          agentPlugin: { enabled: false }
        })
      );

      const auditor = new ValidateSecretLeaksAuditor({
        projectRoot: tempDir,
        roots: ['src']
      });

      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      const leak = result.findings.find(f => f.ruleId === 'secret-leak-detected');
      expect(leak).toBeDefined();
      expect(leak?.file).toContain('apiClient.ts');
    });
  });

  describe('Clean Path Verification (StandardAuditResult)', () => {
    it('executes cleanly with zero errors when secretLeaks is disabled in config', async () => {
      setAuditConfig(
        defineAuditConfig({
          name: 'Disabled Secret Leaks Project',
          secretLeaks: { enabled: false },
          persistence: { engine: 'none' },
          bundle: { enabled: false },
          styles: { zLayersEnabled: false },
          templates: { requireInputIds: false },
          agentPlugin: { enabled: false }
        })
      );

      const auditor = new ValidateSecretLeaksAuditor({
        projectRoot: tempDir,
        roots: ['src']
      });

      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('skipped');
    });

    it('passes with status passed and zero errors on clean source code', async () => {
      const srcDir = path.join(tempDir, 'src');
      fs.mkdirSync(srcDir, { recursive: true });
      fs.writeFileSync(
        path.join(srcDir, 'calculator.ts'),
        'export function add(a: number, b: number): number { return a + b; }\n'
      );

      setAuditConfig(
        defineAuditConfig({
          name: 'Clean Code Project',
          secretLeaks: { enabled: true },
          persistence: { engine: 'none' },
          bundle: { enabled: false },
          styles: { zLayersEnabled: false },
          templates: { requireInputIds: false },
          agentPlugin: { enabled: false }
        })
      );

      const auditor = new ValidateSecretLeaksAuditor({
        projectRoot: tempDir,
        roots: ['src']
      });

      await auditor.runAudit();
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});

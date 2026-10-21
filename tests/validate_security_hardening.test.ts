import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { resetAuditConfig } from '../src/core/auditConfig.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';
import {
  ValidateSecurityHardeningAuditor,
  SECURITY_HARDENING_RULES
} from '../src/suites/security/validate_security_hardening.ts';

describe('ValidateSecurityHardeningAuditor Conformance & Rule Detection', () => {
  let tempDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sec-harden-test-'));
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

  describe('Point 1: Construction & Metadata Conformance', () => {
    it('initializes with correct auditor metadata and rule descriptions', () => {
      const auditor = new ValidateSecurityHardeningAuditor({ projectRoot: tempDir });
      expect(auditor.id).toBe('validate_security_hardening');
      expect(auditor.name).toBe('Security Hardening & Threat Boundary Auditor');
      expect(auditor.family).toBe('security');
      expect(auditor.packageName).toBe('SecHarden');
      expect(auditor.icon).toBe('🛡️');
      expect(auditor.ruleIds).toEqual([...SECURITY_HARDENING_RULES]);
      expect(auditor.ruleDescriptions['hardcoded-secrets']).toBe(
        'Hardcoded secret or token in code'
      );
      expect(auditor.ruleDescriptions['insecure-random']).toBe(
        'Math.random() for sensitive values'
      );
      expect(auditor.ruleDescriptions['vulnerable-regex-redos']).toBe(
        'Regular expression vulnerable to ReDoS'
      );
      expect(auditor.ruleDescriptions['raw-html-injection']).toBe(
        'HTML injection via v-html or innerHTML'
      );
      expect(auditor.ruleDescriptions['missing-csrf-token']).toBe('POST form missing CSRF token');
      expect(auditor.ruleDescriptions['eval-or-function-constructor']).toBe(
        'Use of eval() or dynamic new Function()'
      );
      expect(auditor.ruleDescriptions['permissive-cors']).toBe("Permissive CORS with origin '*'");
      expect(auditor.ruleDescriptions['unvalidated-redirect']).toBe(
        'Open redirect without path validation'
      );

      const constructionErrors = validateAuditorConstruction(auditor);
      expect(constructionErrors).toHaveLength(0);
    });
  });

  describe('Point 2: Clean Path Verification', () => {
    it('passes cleanly reporting zero errors on sanitized templates and secure patterns', async () => {
      const auditor = new ValidateSecurityHardeningAuditor({ projectRoot: tempDir });
      const cleanSnippet = [
        'import DOMPurify from "dompurify";',
        'const safeHtml = DOMPurify.sanitize(userContent);',
        'const safeId = crypto.randomUUID();',
        'const safeRegex = /^[a-zA-Z0-9]+$/;',
        'res.redirect(assertSafeRelativePath(req.query.next));'
      ].join('\n');

      auditor.testScanFile('src/services/safeService.ts', cleanSnippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.status).toBe('passed');
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('Point 3: Violation Detection Path for All 8 Rules', () => {
    it('detects hardcoded-secrets when private key or bearer token is embedded', async () => {
      const auditor = new ValidateSecurityHardeningAuditor({ projectRoot: tempDir });
      const snippet =
        'const token = "bearer ' +
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0.signature";';

      auditor.testScanFile('src/config/auth.ts', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'hardcoded-secrets');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects insecure-random when Math.random is used for tokens or session', async () => {
      const auditor = new ValidateSecurityHardeningAuditor({ projectRoot: tempDir });
      const snippet = 'const sessionToken = "tok_" + ' + 'Math.random().toString(36);';

      auditor.testScanFile('src/utils/token.ts', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'insecure-random');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects vulnerable-regex-redos when regex contains nested quantifiers', async () => {
      const auditor = new ValidateSecurityHardeningAuditor({ projectRoot: tempDir });
      const snippet = 'const risky = ' + '/([a-z]+)+$/;';

      auditor.testScanFile('src/utils/parser.ts', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'vulnerable-regex-redos');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects raw-html-injection when v-html lacks sanitization', async () => {
      const auditor = new ValidateSecurityHardeningAuditor({ projectRoot: tempDir });
      const snippet = '<div ' + 'v-html="unsafeUserMarkup"></div>';

      auditor.testScanFile('src/components/UnsafeComment.vue', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'raw-html-injection');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects raw-html-injection when innerHTML receives unsanitized dynamic markup', async () => {
      const auditor = new ValidateSecurityHardeningAuditor({ projectRoot: tempDir });
      const snippet =
        'const node = document.createElement("div"); node.innerHTML = userControlledContent;';

      auditor.testScanFile('src/components/Renderer.ts', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'raw-html-injection');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects missing-csrf-token when form POST lacks CSRF protection', async () => {
      const auditor = new ValidateSecurityHardeningAuditor({ projectRoot: tempDir });
      const snippet =
        '<form action="/transfer" method="post"><button type="submit">Send</button></form>';

      auditor.testScanFile('src/views/Checkout.vue', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'missing-csrf-token');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects eval-or-function-constructor when dynamic evaluation is used', async () => {
      const auditor = new ValidateSecurityHardeningAuditor({ projectRoot: tempDir });
      const snippet = 'const res = ' + 'ev' + 'al("2 + 2");';

      auditor.testScanFile('src/services/calculator.ts', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'eval-or-function-constructor');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects permissive-cors when origin is wildcard', async () => {
      const auditor = new ValidateSecurityHardeningAuditor({ projectRoot: tempDir });
      const snippet = 'app.use(' + 'cors({ origin: "*" }));';

      auditor.testScanFile('src/server/app.ts', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'permissive-cors');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });

    it('detects unvalidated-redirect when returnUrl parameter is redirected directly', async () => {
      const auditor = new ValidateSecurityHardeningAuditor({ projectRoot: tempDir });
      const snippet = 'res.redirect(' + 'req.query.returnUrl);';

      auditor.testScanFile('src/controllers/authController.ts', snippet);
      const result = await auditor.finishAudit();

      expect(result.summary.errors).toBeGreaterThan(0);
      expect(result.status).toBe('failed');
      const finding = result.findings.find((f) => f.ruleId === 'unvalidated-redirect');
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('error');
    });
  });

  describe('Point 4 & 5: Duration Invariants & 100% Rule Coverage', () => {
    it('measures real empirical durations for 100% of declared rules', () => {
      const auditor = new ValidateSecurityHardeningAuditor({ projectRoot: tempDir });
      auditor.testScanFile('src/clean.ts', 'const x = 1;');

      for (const rule of SECURITY_HARDENING_RULES) {
        const duration = auditor.getRuleDuration(rule);
        expect(duration).toBeDefined();
        expect(duration!).toBeGreaterThanOrEqual(0);
      }
    });
  });
});

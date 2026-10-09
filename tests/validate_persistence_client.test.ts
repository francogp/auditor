/**
 * packages/auditor/tests/validate_persistence_client.test.ts
 *
 * DYNAMIC SUB-AUDITOR CONFORMANCE TEST FOR ValidatePersistenceClientAuditor
 *
 * Strictly fulfills the 5-point contract:
 * 1. Instantiation & Metadata verification via validateAuditorConstruction()
 * 2. Clean Path testing (errors === 0, status === 'passed', findings.length === 0)
 * 3. Violation Detection (errors > 0, status === 'failed', severity === 'error')
 * 4. Warning Path / Escape Hatch verification (// storage-ok:)
 * 5. 100% of declared rule IDs tested
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ValidatePersistenceClientAuditor,
  PERSISTENCE_CLIENT_RULES
} from '../src/suites/persistence/validate_persistence_client.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';

describe('ValidatePersistenceClientAuditor', () => {
  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
  });

  it('fulfills point 1: metadata and options conform strictly to BaseAuditor contracts', () => {
    const auditor = new ValidatePersistenceClientAuditor();
    validateAuditorConstruction(auditor);
    expect(auditor.id).toBe('validate_persistence_client');
    expect(auditor.family).toBe('persistence');
    expect(auditor.ruleIds).toEqual(PERSISTENCE_CLIENT_RULES);
    expect(auditor.packageName).toBe('Storage');
    expect(auditor.icon).toBe('🗄️');
  });

  it('fulfills point 2: clean path execution with zero findings', async () => {
    const auditor = new ValidatePersistenceClientAuditor();
    class TestableAuditor extends ValidatePersistenceClientAuditor {
      public async testScan(file: string, content: string): Promise<void> {
        this.scanFile(file, content);
      }
    }
    const testAuditor = new TestableAuditor();

    const cleanCode = `
      // Clean storage usage: wrapped in try/catch and uses typed constants
      const STORAGE_KEY = 'app_preferences';
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme: 'dark' }));
      } catch (err: unknown) {
        console.error('Storage quota exceeded', err);
      }
      const rawTheme = localStorage.getItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
    `;

    await testAuditor.testScan('src/services/cleanStorage.ts', cleanCode);
    const result = await testAuditor.finishAudit();

    expect(result.summary.errors).toBe(0);
    expect(result.summary.warnings).toBe(0);
    expect(result.findings).toHaveLength(0);
    expect(result.status).toBe('passed');
  });

  it('fulfills point 3 & 5: detects persistence-client-uncoordinated-save violations', async () => {
    class TestableAuditor extends ValidatePersistenceClientAuditor {
      constructor() {
        super({
          authorizedSaveFiles: ['src/stores/authPersistence.ts'],
          saveKeyPrefixes: ['app_save_']
        });
      }
      public async testScan(file: string, content: string): Promise<void> {
        this.scanFile(file, content);
      }
    }
    const auditor = new TestableAuditor();

    const violatingCode = `
      try {
        localStorage.setItem('app_save_userData', JSON.stringify({ id: 1 }));
      } catch {}
    `;

    await auditor.testScan('src/components/BadComponent.vue', violatingCode);
    const result = await auditor.finishAudit();

    const violations = result.findings.filter(f => f.ruleId === 'persistence-client-uncoordinated-save');
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]?.severity).toBe('error');
    expect(result.summary.errors).toBeGreaterThan(0);
    expect(result.status).toBe('failed');
  });

  it('fulfills point 3 & 5: detects persistence-client-untyped-key violations across setItem, getItem, and removeItem', async () => {
    class TestableAuditor extends ValidatePersistenceClientAuditor {
      public async testScan(file: string, content: string): Promise<void> {
        this.scanFile(file, content);
      }
    }
    const auditor = new TestableAuditor();

    const violatingCode = `
      try {
        sessionStorage.setItem('random_raw_key', 'some-value');
      } catch {}
      const item = localStorage.getItem('untyped_read_key');
      localStorage.removeItem('untyped_delete_key');
    `;

    await auditor.testScan('src/logic/session.ts', violatingCode);
    const result = await auditor.finishAudit();

    const violations = result.findings.filter(f => f.ruleId === 'persistence-client-untyped-key');
    expect(violations).toHaveLength(3);
    expect(violations.every(v => v.severity === 'error')).toBe(true);
    expect(result.summary.errors).toBe(3);
    // Ensure getItem and removeItem did NOT trigger quota errors
    const quotaViolations = result.findings.filter(f => f.ruleId === 'persistence-client-unhandled-quota-error');
    expect(quotaViolations).toHaveLength(0);
  });

  it('fulfills point 3 & 5: detects persistence-client-unhandled-quota-error violations', async () => {
    class TestableAuditor extends ValidatePersistenceClientAuditor {
      public async testScan(file: string, content: string): Promise<void> {
        this.scanFile(file, content);
      }
    }
    const auditor = new TestableAuditor();

    const violatingCode = `
      const KEY = 'cached_theme';
      localStorage.setItem(KEY, 'dark');
    `;

    await auditor.testScan('src/logic/theme.ts', violatingCode);
    const result = await auditor.finishAudit();

    const violations = result.findings.filter(f => f.ruleId === 'persistence-client-unhandled-quota-error');
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]?.severity).toBe('error');
    expect(result.summary.errors).toBeGreaterThan(0);
  });

  it('detects bracket-notation storage access with untyped keys and unhandled quota on assignments', async () => {
    class TestableAuditor extends ValidatePersistenceClientAuditor {
      public async testScan(file: string, content: string): Promise<void> {
        this.scanFile(file, content);
      }
    }
    const auditor = new TestableAuditor();

    const violatingCode = `
      const token = localStorage['bracket_read_key'];
      delete sessionStorage['bracket_del_key'];
      localStorage['bracket_assign_key'] = 'dark';
    `;

    await auditor.testScan('src/features/bracketStorage.ts', violatingCode);
    const result = await auditor.finishAudit();

    const untypedViolations = result.findings.filter(f => f.ruleId === 'persistence-client-untyped-key');
    expect(untypedViolations).toHaveLength(3);

    const quotaViolations = result.findings.filter(f => f.ruleId === 'persistence-client-unhandled-quota-error');
    expect(quotaViolations).toHaveLength(1);
    expect(quotaViolations[0]?.message).toContain('indexed assignment');
  });

  it('passes cleanly for bracket-notation storage access when using typed keys and try/catch', async () => {
    class TestableAuditor extends ValidatePersistenceClientAuditor {
      public async testScan(file: string, content: string): Promise<void> {
        this.scanFile(file, content);
      }
    }
    const auditor = new TestableAuditor();

    const cleanCode = `
      const KEY = 'app_key';
      const readVal = localStorage[KEY];
      try {
        localStorage[KEY] = 'dark';
      } catch (err) {
        console.error(err);
      }
    `;

    await auditor.testScan('src/features/cleanBracket.ts', cleanCode);
    const result = await auditor.finishAudit();

    expect(result.summary.errors).toBe(0);
    expect(result.findings).toHaveLength(0);
  });

  it('detects uncoordinated save on indexed bracket assignment', async () => {
    class TestableAuditor extends ValidatePersistenceClientAuditor {
      constructor() {
        super({
          authorizedSaveFiles: ['src/stores/auth.ts'],
          saveKeyPrefixes: ['app_save_']
        });
      }
      public async testScan(file: string, content: string): Promise<void> {
        this.scanFile(file, content);
      }
    }
    const auditor = new TestableAuditor();

    const code = `
      try {
        localStorage['app_save_bracket'] = JSON.stringify({ a: 1 });
      } catch {}
    `;

    await auditor.testScan('src/views/UnauthorizedView.vue', code);
    const result = await auditor.finishAudit();

    const saveViolations = result.findings.filter(f => f.ruleId === 'persistence-client-uncoordinated-save');
    expect(saveViolations.length).toBe(1);
    expect(saveViolations[0]?.severity).toBe('error');
  });

  it('fulfills point 4: honors storage-ok escape hatch comment', async () => {
    class TestableAuditor extends ValidatePersistenceClientAuditor {
      public async testScan(file: string, content: string): Promise<void> {
        this.scanFile(file, content);
      }
    }
    const auditor = new TestableAuditor();

    const escapedCode = `
      localStorage.setItem('raw_key', 'val'); // storage-ok: Intentional raw write in isolated utility
    `;

    await auditor.testScan('src/utils/debugStorage.ts', escapedCode);
    const result = await auditor.finishAudit();

    expect(result.summary.errors).toBe(0);
    expect(result.findings).toHaveLength(0);
    expect(result.status).toBe('passed');
  });

  it('honors storage-ok escape hatch placed on preceding line', async () => {
    class TestableAuditor extends ValidatePersistenceClientAuditor {
      public async testScan(file: string, content: string): Promise<void> {
        this.scanFile(file, content);
      }
    }
    const auditor = new TestableAuditor();

    const escapedCode = `
      // storage-ok: verified isolated test utility writing raw key
      localStorage.setItem('raw_key_preceding', 'val');
    `;

    await auditor.testScan('src/utils/debugStorage2.ts', escapedCode);
    const result = await auditor.finishAudit();

    expect(result.summary.errors).toBe(0);
    expect(result.findings).toHaveLength(0);
    expect(result.status).toBe('passed');
  });

  it('correctly flags unhandled quota error when code has retry or entry variables without try/catch', async () => {
    class TestableAuditor extends ValidatePersistenceClientAuditor {
      public async testScan(file: string, content: string): Promise<void> {
        this.scanFile(file, content);
      }
    }
    const auditor = new TestableAuditor();

    const code = `
      const retryAttempts = 3;
      const entryPoint = 'main';
      const KEY = 'typed_key';
      if (retryAttempts > 0) {
        localStorage.setItem(KEY, 'val');
      }
    `;

    await auditor.testScan('src/utils/retryUtils.ts', code);
    const result = await auditor.finishAudit();

    const quotaViolations = result.findings.filter(f => f.ruleId === 'persistence-client-unhandled-quota-error');
    expect(quotaViolations.length).toBe(1);
  });
});

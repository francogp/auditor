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

  it('fulfills point 3 & 5: detects persistence-client-untyped-key violations', async () => {
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
    `;

    await auditor.testScan('src/logic/session.ts', violatingCode);
    const result = await auditor.finishAudit();

    const violations = result.findings.filter(f => f.ruleId === 'persistence-client-untyped-key');
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]?.severity).toBe('error');
    expect(result.summary.errors).toBeGreaterThan(0);
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
});

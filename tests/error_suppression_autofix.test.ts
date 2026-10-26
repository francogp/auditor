import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { ErrorSuppressionAuditor } from '../src/suites/architecture/validate_error_suppression.ts';

describe('ErrorSuppressionAuditor - Auto-Fix Support', () => {
  let tempDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-error-fix-'));
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('reports violations when fix mode is inactive', async () => {
    const filePath = path.join(tempDir, 'testError.ts');
    const content = `
export async function doTask(): Promise<void> {
  try {
    throw new Error('boom');
  } catch (err) {
  }

  await Promise.resolve().catch(() => {});
}
`;
    fs.writeFileSync(filePath, content, 'utf-8');

    const auditor = new ErrorSuppressionAuditor({
      projectRoot: tempDir,
      roots: [tempDir],
      fix: false
    });

    await auditor.runAudit();

    const counts = auditor.getCountsByRule();
    expect(counts.get('no-empty-catch')).toBe(1);
    expect(counts.get('no-silent-promise-catch')).toBe(1);

    // File content remains unchanged
    const unchanged = fs.readFileSync(filePath, 'utf-8');
    expect(unchanged).toBe(content);
  });

  it('automatically repairs empty catch blocks and silent promise catches when fix mode is active', async () => {
    const filePath = path.join(tempDir, 'testRepair.ts');
    const content = `
export async function runService(): Promise<void> {
  try {
    throw new Error('fail');
  } catch (err) {
  }

  try {
    throw new Error('fail2');
  } catch {
  }

  await Promise.resolve().catch(() => {});
}
`;
    fs.writeFileSync(filePath, content, 'utf-8');

    const auditor = new ErrorSuppressionAuditor({
      projectRoot: tempDir,
      roots: [tempDir],
      fix: true
    });

    await auditor.runAudit();

    const counts = auditor.getCountsByRule();
    expect(counts.get('no-empty-catch') ?? 0).toBe(0);
    expect(counts.get('no-silent-promise-catch') ?? 0).toBe(0);

    const repaired = fs.readFileSync(filePath, 'utf-8');
    expect(repaired).toContain("console.warn('[Handled controlled exception]:', err);");
    expect(repaired).toContain("console.warn('[Handled promise rejection]:', err);");
    expect(repaired).not.toContain('catch (err) {\n  }');
    expect(repaired).not.toContain('.catch(() => {})');
  });

  it('preserves non-fixable strict-catch-narrowing while auto-fixing empty catch', async () => {
    const filePath = path.join(tempDir, 'testNarrowing.ts');
    const content = `
export function parseData(): void {
  try {
    JSON.parse('');
  } catch (err) {
    console.error(err.message);
  }
}
`;
    fs.writeFileSync(filePath, content, 'utf-8');

    const auditor = new ErrorSuppressionAuditor({
      projectRoot: tempDir,
      roots: [tempDir],
      fix: true
    });

    await auditor.runAudit();

    const counts = auditor.getCountsByRule();
    expect(counts.get('strict-catch-narrowing')).toBe(1);
  });
});

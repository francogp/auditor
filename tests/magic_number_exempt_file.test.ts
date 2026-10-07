// test-fragmentation-ok: Isolated unit tests for isMagicNumberExemptFile relativization bugfix
import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import { isMagicNumberExemptFile } from '../src/analyzers/constantRules.ts';
import * as auditConfigModule from '../src/core/auditConfig.ts';

describe('isMagicNumberExemptFile', () => {
  const fakeRoot = '/home/franco/Trabajos/fake_project';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exempts file matching exemptGlobs when given a relative path', () => {
    vi.spyOn(auditConfigModule, 'getAuditConfig').mockReturnValue({
      constants: {
        exemptGlobs: ['scripts/assets/**']
      }
    } as any);

    const relPath = 'scripts/assets/convert_assets.ts';
    expect(isMagicNumberExemptFile(relPath, fakeRoot)).toBe(true);
  });

  it('exempts file matching exemptGlobs when given an absolute path (bug fix verification)', () => {
    vi.spyOn(auditConfigModule, 'getAuditConfig').mockReturnValue({
      constants: {
        exemptGlobs: ['scripts/assets/**']
      }
    } as any);

    const absPath = path.join(fakeRoot, 'scripts/assets/convert_assets.ts');
    expect(isMagicNumberExemptFile(absPath, fakeRoot)).toBe(true);
  });

  it('does not exempt a non-matching code file in src', () => {
    vi.spyOn(auditConfigModule, 'getAuditConfig').mockReturnValue({
      constants: {
        exemptGlobs: ['scripts/assets/**']
      }
    } as any);

    const absPath = path.join(fakeRoot, 'src/components/MyComponent.vue');
    expect(isMagicNumberExemptFile(absPath, fakeRoot)).toBe(false);
  });
});

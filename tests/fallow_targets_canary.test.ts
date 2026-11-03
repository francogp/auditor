import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { describe, it, expect } from 'vite-plus/test';

import { loadAuditConfig } from '../src/core/auditConfig.ts';

describe('Fallow Targets Canary Suite (Zero Targets with Priority >= 10)', () => {
  it('Tier 1: fallow health targets reports zero targets with priority >= 10', () => {
    const fallowBin = path.resolve(
      process.cwd(),
      process.platform === 'win32' ? 'node_modules/.bin/fallow.cmd' : 'node_modules/.bin/fallow'
    );
    expect(fs.existsSync(fallowBin)).toBe(true);

    const out = childProcess.execSync(
      `"${fallowBin}" health --targets --report-only --format json`,
      {
        cwd: process.cwd(),
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );

    const cleanOut = out.replace(/^\uFEFF/, '').trim();
    const parsed = JSON.parse(cleanOut) as {
      targets?: readonly { path: string; priority?: number; category?: string }[];
    };
    expect(parsed.targets).toBeDefined();

    const highOrMediumTargets = (parsed.targets ?? []).filter((t) => (t.priority ?? 0) >= 10);
    expect(highOrMediumTargets).toHaveLength(0);
  });

  it('Tier 2: No sub-auditor suite is listed as a critical refactoring target', () => {
    const fallowBin = path.resolve(
      process.cwd(),
      process.platform === 'win32' ? 'node_modules/.bin/fallow.cmd' : 'node_modules/.bin/fallow'
    );

    const out = childProcess.execSync(
      `"${fallowBin}" health --targets --report-only --format json`,
      {
        cwd: process.cwd(),
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );

    const cleanOut = out.replace(/^\uFEFF/, '').trim();
    const parsed = JSON.parse(cleanOut) as {
      targets?: readonly { path: string; priority?: number }[];
    };

    const suiteTargets = (parsed.targets ?? []).filter(
      (t) =>
        (t.path.includes('src/suites/') || t.path.includes('src/core/')) && (t.priority ?? 0) >= 10
    );
    expect(suiteTargets).toHaveLength(0);
  });

  it('Tier 3: audit.config.ts governance asserts maxTargetPriority is medium and enforceTargets is true', async () => {
    const config = await loadAuditConfig(process.cwd());
    expect(config.fallow).toBeDefined();
    expect(config.fallow?.enabled).toBe(true);
    expect(config.fallow?.enforceTargets).toBe(true);
    expect(config.fallow?.maxTargetPriority).toBe('medium');
  });
});

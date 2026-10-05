import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { getAuditConfig } from '../src/core/auditConfig.ts';

describe('Report Coverage Gaps & Fallow Coverage Integration', () => {
  it('defaults fallow coverage configuration to enabled', () => {
    const config = getAuditConfig();
    expect(config.fallow?.coverage?.enabled).toBe(true);
  });

  it('runs fallow coverage-gaps via report_fallow CLI producing valid JSON', () => {
    const cliScript = path.resolve(process.cwd(), 'src/cli/report_fallow.ts');
    const stdout = execSync(`node --experimental-strip-types "${cliScript}" category=coverage-gaps json top=5`, {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    const parsed = JSON.parse(stdout.trim());
    expect(parsed).toBeDefined();
    expect(parsed).toHaveProperty('totalGaps');
    expect(parsed).toHaveProperty('gaps');
    expect(Array.isArray(parsed.gaps)).toBe(true);
    expect(typeof parsed.totalGaps).toBe('number');
  });

  it('runs fallow coverage-gaps in table output mode without errors', () => {
    const cliScript = path.resolve(process.cwd(), 'src/cli/report_fallow.ts');
    const stdout = execSync(`node --experimental-strip-types "${cliScript}" category=coverage-gaps top=3`, {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    expect(stdout).toContain('BRECHAS DE COBERTURA DE TESTS');
  });

  it('runs fallow coverage-gaps with minRisk parameter in json mode', () => {
    const cliScript = path.resolve(process.cwd(), 'src/cli/report_fallow.ts');
    const stdout = execSync(`node --experimental-strip-types "${cliScript}" category=coverage-gaps json minRisk=50 top=5`, {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    const parsed = JSON.parse(stdout.trim());
    expect(parsed).toBeDefined();
    expect(typeof parsed.totalGaps).toBe('number');
    expect(Array.isArray(parsed.gaps)).toBe(true);
    for (const gap of parsed.gaps) {
      if (typeof gap.riskScore === 'number') {
        expect(gap.riskScore).toBeGreaterThanOrEqual(50);
      }
    }
  });

  it('verifies structure of coverage gap objects when gaps exist', () => {
    const cliScript = path.resolve(process.cwd(), 'src/cli/report_fallow.ts');
    const stdout = execSync(`node --experimental-strip-types "${cliScript}" category=coverage-gaps json top=10`, {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    const parsed = JSON.parse(stdout.trim());
    expect(parsed).toHaveProperty('totalGaps');
    if (parsed.gaps.length > 0) {
      const first = parsed.gaps[0];
      expect(first).toHaveProperty('path');
    }
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  ValidateTsconfigAuditor,
  TSCONFIG_RULES,
  CANONICAL_TSCONFIG,
  type TsConfigShape
} from '../src/suites/architecture/validate_tsconfig.ts';
import { validateAuditorConstruction } from '../src/core/auditorContractConformance.ts';

describe('ValidateTsconfigAuditor', () => {
  let tmpDir: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-tsconfig-test-'));
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // catch-ok
    }
  });

  describe('Contract Conformance & Metadata', () => {
    it('fulfills BaseAuditor metadata and construction contract', () => {
      const auditor = new ValidateTsconfigAuditor(undefined, tmpDir);
      validateAuditorConstruction(auditor);
      expect(auditor.id).toBe('validate_tsconfig');
      expect(auditor.family).toBe('architecture');
      expect(auditor.ruleIds).toEqual(TSCONFIG_RULES);
      expect(auditor.description.length).toBeLessThanOrEqual(60);
    });
  });

  describe('Clean Path Execution', () => {
    it('passes with zero errors on canonical baseline configuration', async () => {
      const tsconfigPath = path.join(tmpDir, 'tsconfig.json');
      fs.writeFileSync(tsconfigPath, JSON.stringify(CANONICAL_TSCONFIG, null, 2), 'utf8');

      const auditor = new ValidateTsconfigAuditor(undefined, tmpDir);
      const result = await auditor.execute();

      expect(result.status).toBe('passed');
      expect(result.summary.errors).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('Canary Tests & Auto-Repair', () => {
    it('Canary 1 (Missing Config): reports error in check mode and scaffolds in fix mode', async () => {
      const tsconfigPath = path.join(tmpDir, 'tsconfig.json');
      expect(fs.existsSync(tsconfigPath)).toBe(false);

      // Check mode
      const checkAuditor = new ValidateTsconfigAuditor(undefined, tmpDir);
      const checkResult = await checkAuditor.execute();
      expect(checkResult.status).toBe('failed');
      expect(checkResult.summary.errors).toBe(1);
      expect(checkResult.findings[0]?.ruleId).toBe('tsconfig-missing');

      // Fix mode
      const fixAuditor = new ValidateTsconfigAuditor({ fix: true }, tmpDir);
      const fixResult = await fixAuditor.execute();
      expect(fixResult.status).toBe('passed');
      expect(fixResult.summary.errors).toBe(0);
      expect(fs.existsSync(tsconfigPath)).toBe(true);

      const created = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8')) as TsConfigShape;
      expect(created.compilerOptions?.strict).toBe(true);
      expect(created.compilerOptions?.moduleResolution).toBe('bundler');
    });

    it('Canary 2 (Syntax Error): detects malformed JSON and reports tsconfig-syntax', async () => {
      const tsconfigPath = path.join(tmpDir, 'tsconfig.json');
      fs.writeFileSync(tsconfigPath, '{ compilerOptions: { unclosed: }', 'utf8');

      const auditor = new ValidateTsconfigAuditor(undefined, tmpDir);
      const result = await auditor.execute();
      expect(result.status).toBe('failed');
      expect(result.findings.some((f) => f.ruleId === 'tsconfig-syntax')).toBe(true);
    });

    it('Canary 3 (Anti-Castration Mandate): detects missing strict options and re-injects in fix mode', async () => {
      const tsconfigPath = path.join(tmpDir, 'tsconfig.json');
      const degraded: TsConfigShape = {
        compilerOptions: {
          target: 'ESNext',
          strict: false,
          noImplicitAny: false,
          noUncheckedIndexedAccess: false,
          moduleResolution: 'bundler'
        },
        include: ['src/**/*']
      };
      fs.writeFileSync(tsconfigPath, JSON.stringify(degraded, null, 2), 'utf8');

      // Check mode
      const checkAuditor = new ValidateTsconfigAuditor(undefined, tmpDir);
      const checkResult = await checkAuditor.execute();
      expect(checkResult.status).toBe('failed');
      const strictViolations = checkResult.findings.filter(
        (f) => f.ruleId === 'tsconfig-missing-strict-compiler-option'
      );
      expect(strictViolations.length).toBe(3);

      // Fix mode
      const fixAuditor = new ValidateTsconfigAuditor({ fix: true }, tmpDir);
      const fixResult = await fixAuditor.execute();
      expect(fixResult.summary.errors).toBe(0);

      const repaired = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8')) as TsConfigShape;
      expect(repaired.compilerOptions?.strict).toBe(true);
      expect(repaired.compilerOptions?.noImplicitAny).toBe(true);
      expect(repaired.compilerOptions?.noUncheckedIndexedAccess).toBe(true);
    });

    it('Canary 4 (Module Resolution): detects outdated resolution and auto-repairs to bundler', async () => {
      const tsconfigPath = path.join(tmpDir, 'tsconfig.json');
      const nonBundler: TsConfigShape = {
        compilerOptions: {
          strict: true,
          noImplicitAny: true,
          noUncheckedIndexedAccess: true,
          moduleResolution: 'classic'
        },
        include: ['src/**/*']
      };
      fs.writeFileSync(tsconfigPath, JSON.stringify(nonBundler, null, 2), 'utf8');

      const checkAuditor = new ValidateTsconfigAuditor(undefined, tmpDir);
      const checkResult = await checkAuditor.execute();
      expect(checkResult.status).toBe('failed');
      expect(
        checkResult.findings.some(
          (f) =>
            f.ruleId === 'tsconfig-missing-strict-compiler-option' &&
            f.message.includes('moduleResolution')
        )
      ).toBe(true);

      const fixAuditor = new ValidateTsconfigAuditor({ fix: true }, tmpDir);
      await fixAuditor.execute();

      const repaired = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8')) as TsConfigShape;
      expect(repaired.compilerOptions?.moduleResolution).toBe('bundler');
    });

    it('Canary 5 (Banned Options): detects suppressImplicitAnyIndexErrors and removes in fix mode', async () => {
      const tsconfigPath = path.join(tmpDir, 'tsconfig.json');
      const banned: TsConfigShape = {
        compilerOptions: {
          strict: true,
          noImplicitAny: true,
          noUncheckedIndexedAccess: true,
          moduleResolution: 'bundler',
          suppressImplicitAnyIndexErrors: true,
          noImplicitThis: false
        },
        include: ['src/**/*']
      };
      fs.writeFileSync(tsconfigPath, JSON.stringify(banned, null, 2), 'utf8');

      const checkAuditor = new ValidateTsconfigAuditor(undefined, tmpDir);
      const checkResult = await checkAuditor.execute();
      expect(checkResult.status).toBe('failed');
      const bannedViolations = checkResult.findings.filter(
        (f) => f.ruleId === 'tsconfig-banned-option'
      );
      expect(bannedViolations.length).toBe(2);

      const fixAuditor = new ValidateTsconfigAuditor({ fix: true }, tmpDir);
      await fixAuditor.execute();

      const repaired = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8')) as TsConfigShape;
      expect(repaired.compilerOptions?.suppressImplicitAnyIndexErrors).toBeUndefined();
      expect(repaired.compilerOptions?.noImplicitThis).toBeUndefined();
    });

    it('Canary 6 (Source Include): detects missing src in include and adds in fix mode', async () => {
      const tsconfigPath = path.join(tmpDir, 'tsconfig.json');
      const missingSrc: TsConfigShape = {
        compilerOptions: {
          strict: true,
          noImplicitAny: true,
          noUncheckedIndexedAccess: true,
          moduleResolution: 'bundler'
        },
        include: ['tests/**/*']
      };
      fs.writeFileSync(tsconfigPath, JSON.stringify(missingSrc, null, 2), 'utf8');

      const checkAuditor = new ValidateTsconfigAuditor(undefined, tmpDir);
      const checkResult = await checkAuditor.execute();
      expect(checkResult.status).toBe('failed');
      expect(checkResult.findings.some((f) => f.ruleId === 'tsconfig-missing-source-include')).toBe(
        true
      );

      const fixAuditor = new ValidateTsconfigAuditor({ fix: true }, tmpDir);
      await fixAuditor.execute();

      const repaired = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8')) as TsConfigShape;
      expect(repaired.include).toContain('src/**/*');
    });

    it('Canary 7 (Secondary tsconfig.*.json & Dead Legacy Include Cleanup): scans tsconfig.*.json and purges dead vitest.config.ts', async () => {
      const tsconfigPath = path.join(tmpDir, 'tsconfig.json');
      const tsconfigAppPath = path.join(tmpDir, 'tsconfig.app.json');
      const rootCfg: TsConfigShape = {
        ...CANONICAL_TSCONFIG,
        include: ['src/**/*', 'vitest.config.ts']
      };
      fs.writeFileSync(tsconfigPath, JSON.stringify(rootCfg, null, 2), 'utf8');
      fs.writeFileSync(tsconfigAppPath, JSON.stringify(CANONICAL_TSCONFIG, null, 2), 'utf8');

      const fixAuditor = new ValidateTsconfigAuditor({ fix: true }, tmpDir);
      const fixResult = await fixAuditor.execute();
      expect(fixResult.status).toBe('passed');
      expect(fixResult.summary.errors).toBe(0);

      const repaired = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8')) as TsConfigShape;
      expect(repaired.include).not.toContain('vitest.config.ts');
    });
  });
});

/**
 * packages/auditor/tests/oxlint_forbidden_suppressions.test.ts
 *
 * HERMETIC TEST SUITE: Prohibiting ESLint Directives and Linter Suppressions
 *
 * Verifies that OxlintAuditor (validate_oxlint) and @francogp/domain-type
 * categorically detect and reject:
 * 1. ESLint directives (eslint-disable, eslint-disable-next-line, eslint-disable-line)
 *    in any file (.ts, .vue, .js, .d.ts).
 * 2. Oxlint and general suppressions (oxlint-disable, @ts-ignore, @ts-nocheck, fallow-ignore).
 * 3. Proves that ambient .d.ts files (like src/env.d.ts) are strictly audited.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import {
  offsetToLine,
  findForbiddenSuppressions,
  buildEslintDirectiveMessage,
  FORBIDDEN_SUPPRESSION_MESSAGE
} from '../src/core/suppressionDirectives.ts';
import { OxlintAuditor } from '../src/suites/architecture/validate_oxlint.ts';

describe('Forbidden ESLint Directives and Suppressions Scanner', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-suppressions-test-'));
    process.env.AUDIT_SUBPROCESS = 'true';
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  it('detects eslint-disable-next-line in a .ts file with explicit ESLint deprecation message', () => {
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    const testFile = path.join(srcDir, 'sample.ts');
    const directive = [
      '// eslint',
      'disable',
      'next',
      'line @typescript-eslint/no-explicit-any'
    ].join('-');
    fs.writeFileSync(
      testFile,
      `export const a = 1;\n${directive}\nexport const b: any = 2;\n`,
      'utf8'
    );

    const auditor = new OxlintAuditor({ projectRoot: tempDir });
    (
      auditor as unknown as {
        scanForbiddenSuppressionDirectives: (globs: readonly string[]) => void;
      }
    ).scanForbiddenSuppressionDirectives([]);

    const violations = auditor.getFindings();
    const match = violations.find((v) => v.ruleId === 'oxlint-forbidden-suppression');

    expect(match).toBeDefined();
    expect(match?.file).toBe('src/sample.ts');
    expect(match?.line).toBe(2);
    expect(match?.message).toContain('ESLint directive detected');
    expect(match?.message).toContain('ESLint is NOT used in this repository');
  });

  it('detects eslint-disable inside an ambient .d.ts file (e.g. src/env.d.ts)', () => {
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    const envFile = path.join(srcDir, 'env.d.ts');
    const directive = [
      '// eslint',
      'disable',
      'next',
      'line @typescript-eslint/no-explicit-any'
    ].join('-');
    fs.writeFileSync(
      envFile,
      `declare module "*.vue" {\n  ${directive}\n  const c: any;\n  export default c;\n}\n`,
      'utf8'
    );

    const auditor = new OxlintAuditor({ projectRoot: tempDir });
    (
      auditor as unknown as {
        scanForbiddenSuppressionDirectives: (globs: readonly string[]) => void;
      }
    ).scanForbiddenSuppressionDirectives([]);

    const violations = auditor.getFindings();
    const match = violations.find(
      (v) => v.ruleId === 'oxlint-forbidden-suppression' && v.file === 'src/env.d.ts'
    );

    expect(match).toBeDefined();
    expect(match?.line).toBe(2);
    expect(match?.message).toContain('ESLint is NOT used in this repository');
  });

  it('detects oxlint-disable and @ts-ignore as forbidden suppressions', () => {
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    const testFile = path.join(srcDir, 'suppressed.ts');
    const oxlintDirective = ['// oxlint', 'disable', 'next', 'line'].join('-');
    const tsIgnoreDirective = ['// @ts', 'ignore'].join('-');
    fs.writeFileSync(
      testFile,
      `${oxlintDirective}\nconst x = 1;\n${tsIgnoreDirective}\nconst y = 2;\n`,
      'utf8'
    );

    const auditor = new OxlintAuditor({ projectRoot: tempDir });
    (
      auditor as unknown as {
        scanForbiddenSuppressionDirectives: (globs: readonly string[]) => void;
      }
    ).scanForbiddenSuppressionDirectives([]);

    const violations = auditor
      .getFindings()
      .filter((v) => v.ruleId === 'oxlint-forbidden-suppression');

    expect(violations.length).toBeGreaterThanOrEqual(2);
    expect(
      violations.some(
        (v) => v.line === 1 && v.message.includes('Linter/type suppression directive detected')
      )
    ).toBe(true);
    expect(
      violations.some(
        (v) => v.line === 3 && v.message.includes('Linter/type suppression directive detected')
      )
    ).toBe(true);
  });

  it('detects multiline /* eslint-disable ... */ block comments accurately calculating line numbers', () => {
    const srcDir = path.join(tempDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    const testFile = path.join(srcDir, 'multiline.ts');
    const directiveBlock = ['/*', ' * eslint-disable', ' * no-explicit-any', ' */'].join('\n');
    fs.writeFileSync(
      testFile,
      `// Header comment\n${directiveBlock}\nexport const z = 42;\n`,
      'utf8'
    );

    const auditor = new OxlintAuditor({ projectRoot: tempDir });
    (
      auditor as unknown as {
        scanForbiddenSuppressionDirectives: (globs: readonly string[]) => void;
      }
    ).scanForbiddenSuppressionDirectives([]);

    const violations = auditor.getFindings();
    const match = violations.find(
      (v) => v.ruleId === 'oxlint-forbidden-suppression' && v.file === 'src/multiline.ts'
    );

    expect(match).toBeDefined();
    expect(match?.line).toBe(2);
    expect(match?.message).toContain('ESLint directive detected');
  });
});

describe('suppressionDirectives core utility', () => {
  it('calculates line numbers correctly across various offsets', () => {
    const text = 'line 1\nline 2\nline 3\n';
    expect(offsetToLine(text, 0)).toBe(1);
    expect(offsetToLine(text, 6)).toBe(1);
    expect(offsetToLine(text, 7)).toBe(2);
    expect(offsetToLine(text, 14)).toBe(3);
  });

  it('formats ESLint directive messages with deprecation explanation', () => {
    const msg = buildEslintDirectiveMessage('// eslint-disable-line');
    expect(msg).toContain('ESLint directive detected');
    expect(msg).toContain('ESLint is NOT used in this repository');
    expect(FORBIDDEN_SUPPRESSION_MESSAGE).toContain('strictly prohibited');
  });

  it('detects multiple mixed suppressions and sorts by line number', () => {
    const code = [
      'const a = 1;',
      '// oxlint' + '-disable-next-line',
      'const b = 2;',
      '/*',
      ' * eslint' + '-disable',
      ' * no-explicit-any',
      ' */',
      'const c = 3;',
      '// @ts' + '-ignore',
      'const d = 4;'
    ].join('\n');

    const matches = findForbiddenSuppressions(code);
    expect(matches).toHaveLength(3);
    expect(matches[0]?.type).toBe('suppression');
    expect(matches[0]?.line).toBe(2);
    expect(matches[1]?.type).toBe('eslint');
    expect(matches[1]?.line).toBe(4);
    expect(matches[2]?.type).toBe('suppression');
    expect(matches[2]?.line).toBe(9);
  });
});

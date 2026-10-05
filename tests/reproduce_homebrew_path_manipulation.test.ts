/**
 * tests/reproduce_homebrew_path_manipulation.test.ts
 *
 * Reproduction test suite for homebrew path manipulation detection (homebrew-path-manipulation).
 * Strictly adheres to Gate 1 of /systematic-debugging:
 * Assert that homebrew regex sanitization and naive traversal checks are detected and flagged.
 */

import { describe, it, expect } from 'vitest';
import {
  scanFileForNativePathViolations,
  NATIVE_PATH_RULES
} from '../src/suites/architecture/validate_native_paths.ts';

describe('Homebrew Path Manipulation Detection (homebrew-path-manipulation)', () => {
  it('registers homebrew-path-manipulation in declared rules', () => {
    expect(NATIVE_PATH_RULES).toContain('homebrew-path-manipulation');
  });

  it('detects homemade regex character stripping on path variables', () => {
    const stripCall = 'rawPath.' + 'replace(/[^a-zA-Z0-9_\\- /.:\\\\]/g, \'\');';
    const code = `
      export function cleanPath(rawPath: string): string {
        const clean = ${stripCall}
        return path.normalize(clean);
      }
    `;
    const violations = scanFileForNativePathViolations('src/utils/paths.ts', code);
    const violation = violations.find(v => v.ruleId === 'homebrew-path-manipulation');
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('error');
    expect(violation?.message).toContain('node:path');
  });

  it('detects homemade path traversal regex stripping', () => {
    const stripCall = 'p.' + 'replace(/(\\.\\.[\\/\\\\])+/g, \'\');';
    const code = `
      export function sanitize(p: string): string {
        return ${stripCall}
      }
    `;
    const violations = scanFileForNativePathViolations('src/core/pathSanitize.ts', code);
    const violation = violations.find(v => v.ruleId === 'homebrew-path-manipulation');
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('error');
  });

  it('detects naive string traversal checks like dot-dot path traversal', () => {
    const checkCall = 'if (filePath.' + 'includes(\'..\')) { throw new Error(\'Directory traversal attempt\'); }';
    const code = `
      export function checkSafe(filePath: string): void {
        ${checkCall}
      }
    `;
    const violations = scanFileForNativePathViolations('src/core/check.ts', code);
    const violation = violations.find(v => v.ruleId === 'homebrew-path-manipulation');
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('error');
  });

  it('passes on canonical Node.js native path resolution and containment', () => {
    const code = `
      import path from 'node:path';

      export function safeResolve(baseDir: string, userPath: string): string {
        const resolved = path.resolve(baseDir, userPath);
        const rel = path.relative(baseDir, resolved);
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
          throw new Error('Path escapes baseDir');
        }
        return resolved;
      }
    `;
    const violations = scanFileForNativePathViolations('src/core/cleanPath.ts', code);
    const homebrewViolations = violations.filter(v => v.ruleId === 'homebrew-path-manipulation');
    expect(homebrewViolations.length).toBe(0);
  });

  it('whitelists cross-platform directory separator normalization', () => {
    const code = `
      const relScriptPath = path.relative(process.cwd(), fullPath).replace(/\\\\/g, '/');
      const scriptArg = relScriptPath.startsWith('..') ? path.resolve(fullPath).replace(/\\\\/g, '/') : relScriptPath;
    `;
    const violations = scanFileForNativePathViolations('src/cli/scanner.ts', code);
    const homebrewViolations = violations.filter(v => v.ruleId === 'homebrew-path-manipulation');
    expect(homebrewViolations.length).toBe(0);
  });

  it('does not trigger on string ellipses in error messages or descriptions', () => {
    const code = `
      const msg = match.replace(/\\s+/g, ' ').slice(0, 90) + '...';
      const detail = 'Elemento interactivo... Todo elemento debe tener ID';
    `;
    const violations = scanFileForNativePathViolations('src/rules/check.ts', code);
    const homebrewViolations = violations.filter(v => v.ruleId === 'homebrew-path-manipulation');
    expect(homebrewViolations.length).toBe(0);
  });

  it('does not trigger on AST relative import extension repair regexes', () => {
    const code = `
      const fix = (match: string) => match.replace(/(['"])(\\.\\.?\\/[^'"]+)(?<!\\.[jt]s)(['"])/g, '$1$2.ts$3');
    `;
    const violations = scanFileForNativePathViolations('src/rules/fixer.ts', code);
    const homebrewViolations = violations.filter(v => v.ruleId === 'homebrew-path-manipulation');
    expect(homebrewViolations.length).toBe(0);
  });
});

/**
 * tests/reproduce_homebrew_path_manipulation.test.ts
 *
 * Rule-contract regression suite for the homebrew path rules of validate_native_paths:
 * - Character-class sanitizing and separator swapping → homebrew-path-manipulation.
 * - Traversal stripping and naive `..` checks → homebrew-path-containment (moved, no aliases).
 * - `path.relative(...).replace(/\\/g, '/')` is no longer whitelisted.
 * - Canonical containment, ellipses and import-repair regexes stay clean.
 * Exhaustive per-pattern coverage lives in tests/validate_native_paths_cases.test.ts.
 */

import { describe, it, expect } from 'vite-plus/test';

import {
  scanFileForNativePathViolations,
  NATIVE_PATH_RULES,
  type NativePathRuleId
} from '../src/suites/architecture/validate_native_paths.ts';

const NODE_PREAMBLE = "import path from 'node:path';\n";

function rulesFor(code: string, file = 'src/core/paths.ts'): NativePathRuleId[] {
  return scanFileForNativePathViolations(file, NODE_PREAMBLE + code).map((v) => v.ruleId);
}

describe('Homebrew path rule contracts', () => {
  it('registers the homebrew path rules', () => {
    expect(NATIVE_PATH_RULES).toEqual(
      expect.arrayContaining([
        'homebrew-path-manipulation',
        'homebrew-path-parsing',
        'homebrew-path-containment',
        'homebrew-file-url',
        'homebrew-url-parsing'
      ])
    );
  });

  it('reports character-class sanitizing on path variables as homebrew-path-manipulation', () => {
    const code = `
      export function cleanPath(rawPath: string): string {
        const clean = rawPath.replace(/[^a-zA-Z0-9_\\- /.:\\\\]/g, '');
        return path.normalize(clean);
      }
    `;
    const violation = scanFileForNativePathViolations('src/utils/paths.ts', code).find(
      (v) => v.ruleId === 'homebrew-path-manipulation'
    );
    expect(violation).toBeDefined();
    expect(violation?.severity).toBe('error');
    expect(violation?.line).toBe(3);
    expect(violation?.message).toContain('path.normalize()');
  });

  it('moves traversal-stripping regexes to homebrew-path-containment', () => {
    const rules = rulesFor(
      `export const sanitize = (p: string) => p.replace(/(\\.\\.[\\/\\\\])+/g, '');`
    );
    expect(rules).toContain('homebrew-path-containment');
    expect(rules).not.toContain('homebrew-path-manipulation');
  });

  it('moves naive dot-dot checks to homebrew-path-containment', () => {
    const rules = rulesFor(
      `if (filePath.includes('..')) { throw new Error('Directory traversal attempt'); }`
    );
    expect(rules).toEqual(['homebrew-path-containment']);
  });

  it('no longer whitelists separator swapping after path.relative()', () => {
    const code = `
      const relScriptPath = path.relative(process.cwd(), fullPath).replace(/\\\\/g, '/');
      const scriptArg = path.resolve(fullPath).replace(/\\\\/g, '/');
    `;
    const hits = scanFileForNativePathViolations('src/cli/scanner.ts', code).filter(
      (v) => v.ruleId === 'homebrew-path-manipulation'
    );
    expect(hits.map((v) => v.line)).toEqual([2, 3]);
  });

  it('accepts the canonical native separator conversions', () => {
    const code = `
      const a = path.relative(root, file).split(path.sep).join(path.posix.sep);
      const b = configGlob.replaceAll(path.win32.sep, path.posix.sep);
    `;
    expect(rulesFor(code)).toEqual([]);
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
    expect(rulesFor(code, 'src/core/cleanPath.ts')).toEqual([]);
  });

  it('does not trigger on string ellipses in error messages or descriptions', () => {
    const code = `
      const msg = match.replace(/\\s+/g, ' ').slice(0, 90) + '...';
      const detail = 'Elemento interactivo... Todo elemento debe tener ID';
    `;
    expect(rulesFor(code, 'src/rules/check.ts')).toEqual([]);
  });

  it('does not trigger on AST relative import extension repair regexes', () => {
    const code = `
      const fix = (match: string) => match.replace(/(['"])(\\.\\.?\\/[^'"]+)(?<!\\.[jt]s)(['"])/g, '$1$2.ts$3');
    `;
    expect(rulesFor(code, 'src/rules/fixer.ts')).toEqual([]);
  });
});

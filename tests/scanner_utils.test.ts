/**
 * packages/auditor/tests/scanner_utils.test.ts
 *
 * Dedicated unit test suite for scannerUtils:
 * - hasPrecedingComment lookback, directives, multiline templates
 * - advancePastStringOrComment, scanBalancedBraces, scanBalancedParens
 * - stripComments, stripCommentsAndStrings, isPositionInsideFunctionParams
 */

import { describe, it, expect } from 'vitest';
import {
  hasPrecedingComment,
  hasLineSuppression,
  advancePastStringOrComment,
  scanBalancedBraces,
  scanBalancedParens,
  stripComments,
  stripCommentsAndStrings,
  isPositionInsideFunctionParams
} from '../src/core/scannerUtils.ts';

describe('scannerUtils', () => {
  describe('hasPrecedingComment', () => {
    const directive = /<!--\s*ui-branching-ok:|\/\/\s*layout-ok:/i;

    it('returns true when directive is on the current line', () => {
      const lines = [
        'const a = 1;',
        'gsap.to(el, { height: 100 }); // layout-ok: accordion'
      ];
      expect(hasPrecedingComment(lines, 1, directive)).toBe(true);
    });

    it('returns true when directive is on immediately preceding line', () => {
      const lines = [
        '// layout-ok: justified accordion animation',
        'gsap.to(el, { height: 100 });'
      ];
      expect(hasPrecedingComment(lines, 1, directive)).toBe(true);
    });

    it('finds HTML comment in Vue SFC template spanning multiple lines with attributes', () => {
      const lines = [
        '<!-- ui-branching-ok: dynamic battle entity render -->',
        '<VirtualEntity',
        '  :id="entity.id"',
        '  :stats="entity.stats"',
        '  v-if="entity.isSpawned"',
        '/>'
      ];
      // Checking line 4 (v-if="entity.isSpawned")
      expect(hasPrecedingComment(lines, 4, directive)).toBe(true);
    });

    it('skips empty lines when ignoreEmptyLines is true (default)', () => {
      const lines = [
        '<!-- ui-branching-ok: verified isolated element -->',
        '',
        '   ',
        '<div v-if="condition">'
      ];
      expect(hasPrecedingComment(lines, 3, directive)).toBe(true);
    });

    it('stops at empty lines when ignoreEmptyLines is explicitly false', () => {
      const lines = [
        '<!-- ui-branching-ok: verified isolated element -->',
        '',
        '<div v-if="condition">'
      ];
      expect(hasPrecedingComment(lines, 2, directive, { ignoreEmptyLines: false })).toBe(false);
    });

    it('respects maxLookbackLines boundary', () => {
      const lines = [
        '// layout-ok: animation',
        'const a = 1;',
        'const b = 2;',
        'const c = 3;',
        'gsap.to(el, { height: 10 });'
      ];
      // Distance is 4 lines backwards
      expect(hasPrecedingComment(lines, 4, directive, { maxLookbackLines: 2 })).toBe(false);
      expect(hasPrecedingComment(lines, 4, directive, { maxLookbackLines: 5 })).toBe(true);
    });

    it('returns false for negative or out of bounds lineIndex', () => {
      const lines = ['const a = 1;'];
      expect(hasPrecedingComment(lines, -1, directive)).toBe(false);
      expect(hasPrecedingComment(lines, 5, directive)).toBe(false);
    });

    it('returns false when no matching directive exists', () => {
      const lines = [
        '// some regular comment',
        'const a = 1;',
        'gsap.to(el, { height: 10 });'
      ];
      expect(hasPrecedingComment(lines, 2, directive)).toBe(false);
    });
  });

  describe('hasLineSuppression', () => {
    const directive = /<!--\s*ui-branching-ok:|\/\/\s*layout-ok:/i;

    it('defaults to 3 lookback lines', () => {
      const lines = [
        '// layout-ok: allowed',
        'const a = 1;',
        'const b = 2;',
        'gsap.to(el, { height: 10 });'
      ];
      // Target line 3 (distance is 3 lines) -> matches
      expect(hasLineSuppression(lines, 3, directive)).toBe(true);

      const tooFarLines = [
        '// layout-ok: allowed',
        'const a = 1;',
        'const b = 2;',
        'const c = 3;',
        'gsap.to(el, { height: 10 });'
      ];
      // Target line 4 (distance is 4 lines) -> exceeds default 3 lookback lines
      expect(hasLineSuppression(tooFarLines, 4, directive)).toBe(false);
      // With custom lookbackLines = 5 -> matches
      expect(hasLineSuppression(tooFarLines, 4, directive, 5)).toBe(true);
    });
  });

  describe('advancePastStringOrComment', () => {
    it('advances past single, double, and template literal quotes with escapes', () => {
      const s1 = "'escaped \\' quote' tail";
      expect(advancePastStringOrComment(s1, 0, s1.length)).toBe(18);

      const s2 = '"double \\" quote" tail';
      expect(advancePastStringOrComment(s2, 0, s2.length)).toBe(17);

      const s3 = '`template \\` string` tail';
      expect(advancePastStringOrComment(s3, 0, s3.length)).toBe(20);
    });

    it('advances past line and block comments', () => {
      const lineComment = '// a comment\\ncode';
      expect(advancePastStringOrComment(lineComment, 0, lineComment.length)).toBe(lineComment.length);

      const blockComment = '/* block comment */ tail';
      expect(advancePastStringOrComment(blockComment, 0, blockComment.length)).toBe(19);
    });

    it('returns original index if not at string or comment', () => {
      const code = 'const x = 1;';
      expect(advancePastStringOrComment(code, 0, code.length)).toBe(0);
    });
  });

  describe('scanBalancedBraces and scanBalancedParens', () => {
    it('accurately balances nested braces', () => {
      const code = '{ { a: 1, b: { c: 2 } } }';
      const res = scanBalancedBraces(code, 1, code.length, 1);
      expect(res.depth).toBe(0);
      expect(res.end).toBe(code.length);
    });

    it('accurately balances nested parentheses', () => {
      const code = '( (a + b) * (c + d) )';
      const res = scanBalancedParens(code, 1, code.length);
      expect(res.depth).toBe(0);
      expect(res.end).toBe(code.length);
    });
  });

  describe('stripComments and stripCommentsAndStrings', () => {
    it('strips comments while keeping code and strings intact', () => {
      const src = 'const x = /* inline */ "hello // not comment"; // line comment';
      const stripped = stripComments(src);
      expect(stripped).toContain('"hello // not comment"');
      expect(stripped).not.toContain('/* inline */');
      expect(stripped).not.toContain('// line comment');
    });

    it('strips comments and string contents when stripCommentsAndStrings is used', () => {
      const src = 'const x = "secret"; // comment';
      const stripped = stripCommentsAndStrings(src);
      expect(stripped).toContain('""');
      expect(stripped).not.toContain('secret');
      expect(stripped).not.toContain('comment');
    });
  });

  describe('isPositionInsideFunctionParams', () => {
    it('determines if an index is inside parameter list', () => {
      const code = 'function test(a, b, c) { return a + b + c; }';
      const insidePos = code.indexOf('b, c');
      const outsidePos = code.indexOf('a + b');

      expect(isPositionInsideFunctionParams(code, insidePos)).toBe(true);
      expect(isPositionInsideFunctionParams(code, outsidePos)).toBe(false);
    });
  });
});

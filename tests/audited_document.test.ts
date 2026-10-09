/**
 * packages/auditor/tests/audited_document.test.ts
 *
 * COMPREHENSIVE UNIT TESTS FOR AuditedDocument CORE ENGINE
 */

import { describe, it, expect } from 'vitest';
import { AuditedDocument } from '../src/core/auditedDocument.ts';

describe('AuditedDocument', () => {
  describe('Line and Column Resolution', () => {
    it('computes exact 1-indexed line and column via binary search', () => {
      const code = 'const a = 1;\nconst b = 2;\nconst c = 3;';
      const doc = new AuditedDocument('test.ts', code);

      expect(doc.lines).toHaveLength(3);
      expect(doc.lineOffsets).toEqual([0, 13, 26]);

      // Offset 0 -> line 1, col 1
      const pos0 = doc.getLineAndColumn(0);
      expect(pos0).toEqual({ line: 1, column: 1, lineText: 'const a = 1;' });

      // Offset 13 -> start of line 2
      const pos13 = doc.getLineAndColumn(13);
      expect(pos13).toEqual({ line: 2, column: 1, lineText: 'const b = 2;' });

      // Offset 20 -> inside line 2
      const pos20 = doc.getLineAndColumn(20);
      expect(pos20.line).toBe(2);
      expect(pos20.column).toBe(8);

      // Inverse lookup: getOffset
      expect(doc.getOffset(1, 1)).toBe(0);
      expect(doc.getOffset(2, 1)).toBe(13);
      expect(doc.getOffset(2, 8)).toBe(20);
    });

    it('handles Windows CRLF without offset drift', () => {
      const crlfCode = 'first\r\nsecond\r\nthird';
      const doc = new AuditedDocument('crlf.ts', crlfCode);

      expect(doc.lines).toEqual(['first', 'second', 'third']);
      expect(doc.getLineAndColumn(0)).toEqual({ line: 1, column: 1, lineText: 'first' });
      expect(doc.getLineAndColumn(7)).toEqual({ line: 2, column: 1, lineText: 'second' });
      expect(doc.getLineAndColumn(15)).toEqual({ line: 3, column: 1, lineText: 'third' });
    });
  });

  describe('Lexical Range Indexing & Detection', () => {
    it('detects single-line and multi-line comments accurately', () => {
      const code = `
        // Line comment
        const x = 10; /* Block comment */
        /*
         * Multi-line comment
         */
        const y = 20;
      `;
      const doc = new AuditedDocument('comments.ts', code);

      // Offset inside // Line comment
      const lineCommentOffset = code.indexOf('Line comment');
      expect(doc.isInsideComment(lineCommentOffset)).toBe(true);
      expect(doc.isInsideString(lineCommentOffset)).toBe(false);

      // Offset inside const x
      const codeOffset = code.indexOf('const x');
      expect(doc.isInsideComment(codeOffset)).toBe(false);

      // Offset inside /* Block comment */
      const blockOffset = code.indexOf('Block comment');
      expect(doc.isInsideComment(blockOffset)).toBe(true);

      // Offset inside multi-line block
      const multiOffset = code.indexOf('Multi-line comment');
      expect(doc.isInsideComment(multiOffset)).toBe(true);
    });

    it('detects string literals and template strings', () => {
      const code = `
        const s1 = 'hello';
        const s2 = "world";
        const s3 = \`template string\`;
      `;
      const doc = new AuditedDocument('strings.ts', code);

      expect(doc.isInsideString(code.indexOf('hello'))).toBe(true);
      expect(doc.isInsideString(code.indexOf('world'))).toBe(true);
      expect(doc.isInsideString(code.indexOf('template string'))).toBe(true);
      expect(doc.isInsideString(code.indexOf('const s1'))).toBe(false);
    });

    it('advances past comments and strings cleanly', () => {
      const code = `/* comment */code`;
      const doc = new AuditedDocument('advance.ts', code);
      const afterComment = doc.advancePastCommentOrString(0);
      expect(afterComment).toBe(13); // Length of "/* comment */"
    });
  });

  describe('Escape Hatch Governance', () => {
    it('recognizes direct rule escape hatch on same line', () => {
      const code = `
        const val = 123; // custom-rule-ok: verified legacy constant
      `;
      const doc = new AuditedDocument('escape.ts', code);
      const targetOffset = code.indexOf('const val');
      expect(doc.hasEscapeHatch(targetOffset, 'custom-rule')).toBe(true);
      expect(doc.hasEscapeHatch(targetOffset, 'other-rule')).toBe(false);
    });

    it('recognizes escape hatch on preceding line', () => {
      const code = `
        // storage-ok: persistent state
        localStorage.setItem('key', 'val');
      `;
      const doc = new AuditedDocument('escape2.ts', code);
      const setItemOffset = code.indexOf('localStorage');
      expect(doc.hasEscapeHatch(setItemOffset, 'persistence-client-untyped-key')).toBe(true);
    });

    it('honors whole-file auditor-disable directives', () => {
      const code = `
        // auditor-disable gsap-no-layout-properties
        gsap.to(el, { top: 100 });
      `;
      const doc = new AuditedDocument('disable.ts', code);
      const tweenOffset = code.indexOf('gsap.to');
      expect(doc.hasEscapeHatch(tweenOffset, 'gsap-no-layout-properties')).toBe(true);
    });
  });

  describe('Vue SFC Block Extraction', () => {
    it('extracts script, template, and styles from .vue files with correct lines', () => {
      const vueSfc = `<template>
  <div class="box">Title</div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
const count = ref(0);
</script>

<style scoped lang="scss">
.box { color: red; }
</style>`;

      const doc = new AuditedDocument('src/components/MyComponent.vue', vueSfc);
      const blocks = doc.getVueBlocks();
      expect(blocks).toBeDefined();
      expect(blocks?.scripts).toHaveLength(1);
      expect(blocks?.scripts[0]?.isSetup).toBe(true);
      expect(blocks?.scripts[0]?.lang).toBe('ts');
      expect(blocks?.scripts[0]?.startLine).toBe(6);
      expect(blocks?.template?.startLine).toBe(2);
      expect(blocks?.styles).toHaveLength(1);
      expect(blocks?.styles[0]?.scoped).toBe(true);
    });

    it('generates TypeScript AST preserving line offsets in Vue SFCs', () => {
      const vueSfc = `<template>
  <div>Placeholder</div>
</template>

<script setup lang="ts">
const testVar = 42;
</script>`;

      const doc = new AuditedDocument('src/components/TestAst.vue', vueSfc);
      const ast = doc.getAst();
      expect(ast).toBeDefined();

      // Find testVar statement line in AST
      const statements = ast?.statements ?? [];
      expect(statements.length).toBeGreaterThan(0);
      const stmt = statements[0];
      const startPos = doc.getNodeLineAndColumn(stmt!, ast!);
      expect(startPos.line).toBe(6); // Lines 1-4 are template, 5 is script tag, 6 is testVar
      expect(startPos.lineText).toBe('const testVar = 42;');
    });
  });

  describe('Deterministic Auto-Fix Replacements', () => {
    it('applies non-overlapping replacements from end to start without offset corruption', () => {
      const original = 'alpha beta gamma';
      const doc = new AuditedDocument('fix.ts', original);

      // Replace 'alpha' with 'ALPHA'
      doc.registerFix({
        start: 0,
        end: 5,
        newText: 'ALPHA'
      });

      // Replace 'gamma' with 'GAMMA'
      doc.registerFix({
        start: 11,
        end: 16,
        newText: 'GAMMA'
      });

      expect(doc.hasFixes()).toBe(true);
      expect(doc.getFixCount()).toBe(2);

      const transformed = doc.getTransformedContent();
      expect(transformed).toBe('ALPHA beta GAMMA');
    });
  });
});

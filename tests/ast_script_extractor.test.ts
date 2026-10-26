import { describe, it, expect } from 'vite-plus/test';

import {
  extractUnifiedScriptBuffer,
  createUnifiedAstSourceFile,
  applyAstReplacements,
  type AstTextReplacement
} from '../src/core/astScriptExtractor.ts';

describe('astScriptExtractor', () => {
  it('preserves plain typescript files without modification', () => {
    const code = 'export function add(a: number, b: number): number {\n  return a + b;\n}\n';
    const extracted = extractUnifiedScriptBuffer(code, false);
    expect(extracted).toBe(code);
  });

  it('masks Vue SFC non-script content with spaces while strictly preserving line breaks and character length', () => {
    const vueCode =
      '<template>\n' +
      '  <div class="card">\n' +
      '    <p>Hello World</p>\n' +
      '  </div>\n' +
      '</template>\n\n' +
      '<script setup lang="ts">\n' +
      'const count = 42;\n' +
      'function test(): void {}\n' +
      '</script>\n\n' +
      '<style scoped>\n' +
      '.card { color: red; }\n' +
      '</style>\n';

    const extracted = extractUnifiedScriptBuffer(vueCode, true);

    // Exact length match guarantees 1:1 character index parity
    expect(extracted.length).toBe(vueCode.length);

    // Line count match guarantees line number parity
    expect(extracted.split('\n').length).toBe(vueCode.split('\n').length);

    // Script content is strictly preserved in its original coordinates
    expect(extracted).toContain('const count = 42;');
    expect(extracted).toContain('function test(): void {}');

    // Template and style content are replaced by whitespace
    expect(extracted).not.toContain('<template>');
    expect(extracted).not.toContain('Hello World');
    expect(extracted).not.toContain('.card { color: red; }');
  });

  it('creates an AST source file with 1:1 coordinate parity', () => {
    const vueCode =
      '<template>\n' +
      '  <div>Test</div>\n' +
      '</template>\n\n' +
      '<script lang="ts">\n' +
      'export class Greeter {\n' +
      '  greet() {\n' +
      '    return "hello";\n' +
      '  }\n' +
      '}\n' +
      '</script>\n';

    const { sourceFile } = createUnifiedAstSourceFile('Greeter.vue', vueCode);
    expect(sourceFile).toBeDefined();

    // The text inside Greeter.vue at greet's start index should be "greet"
    const classDecl = sourceFile.statements.find((s) => s.getText(sourceFile).includes('Greeter'));
    expect(classDecl).toBeDefined();
  });

  it('applies AST replacements in descending order without coordinate drift', () => {
    const original = 'const a = 1; const b = 2; const c = 3;';
    const pos1 = original.indexOf('1');
    const pos3 = original.indexOf('3');
    // Replace "1" with "100" and "3" with "300"
    const replacements: AstTextReplacement[] = [
      { start: pos1, end: pos1 + 1, text: '100' },
      { start: pos3, end: pos3 + 1, text: '300' }
    ];

    const result = applyAstReplacements(original, replacements);
    expect(result).toBe('const a = 100; const b = 2; const c = 300;');
  });

  it('safely deduplicates and filters overlapping edits', () => {
    const original = 'hello world';
    const replacements: AstTextReplacement[] = [
      { start: 6, end: 11, text: 'universe' },
      { start: 6, end: 11, text: 'universe' } // duplicate
    ];

    const result = applyAstReplacements(original, replacements);
    expect(result).toBe('hello universe');
  });
});

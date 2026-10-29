/**
 * packages/auditor/tests/ast_context.test.ts
 *
 * Unit tests for SharedAstContext.
 */

import ts from 'typescript';
import { describe, it, expect } from 'vite-plus/test';

import { SharedAstContext } from '../src/core/astContext.ts';

describe('SharedAstContext', () => {
  it('instantiates and creates ts.SourceFile on demand', () => {
    const ctx = new SharedAstContext();
    const code = 'export const PI = 3.14159;';
    const sf = ctx.getSourceFile('src/constants.ts', code);

    expect(sf).toBeDefined();
    expect(sf.fileName).toBe('constants.ts');
    expect(ts.isSourceFile(sf)).toBe(true);
    expect(ctx.hasSourceFile('src/constants.ts')).toBe(true);
    expect(ctx.size).toBe(1);
  });

  it('reuses the exact same AST instance on repeated calls (memoization / cache hit)', () => {
    const ctx = new SharedAstContext();
    const code = 'const count: number = 42;';
    const sf1 = ctx.getSourceFile('src/state.ts', code);
    const sf2 = ctx.getSourceFile('src/state.ts', code);

    expect(sf1).toBe(sf2); // Exact memory reference identity
    expect(ctx.size).toBe(1);
  });

  it('extracts script setup from Vue SFC preserving line offsets', () => {
    const ctx = new SharedAstContext();
    const vueCode = `<template>
  <div>Hello</div>
</template>

<script setup lang="ts">
const name = 'Pikachu';
</script>`;

    const sf = ctx.getSourceFile('src/components/Greeting.vue', vueCode);
    expect(sf).toBeDefined();
    expect(sf.text).toContain("const name = 'Pikachu';");

    const scriptInfo = ctx.extractScript(vueCode, 'src/components/Greeting.vue');
    expect(scriptInfo.scriptContent).toContain("const name = 'Pikachu';");
    expect(scriptInfo.offsetLine).toBe(5);
  });

  it('calculates exact line offsets in Vue SFCs containing both <script> and <script setup>', () => {
    const vueContent = [
      '<script lang="ts">', // L1
      'export interface DualScriptProps {', // L2
      '  id: string;', // L3
      '}', // L4
      '</script>', // L5
      '', // L6
      '<script setup lang="ts">', // L7
      'const firstSetupConst = 10;', // L8
      'const secondSetupConst = 20;', // L9
      '</script>', // L10
      '', // L11
      '<template>', // L12
      '  <div>{{ firstSetupConst + secondSetupConst }}</div>', // L13
      '</template>' // L14
    ].join('\n');

    const ctx = new SharedAstContext();
    const sf = ctx.getSourceFile('/virtual/DualBlockComponent.vue', vueContent);

    let firstConstLine = -1;
    ts.forEachChild(sf, (node) => {
      if (ts.isVariableStatement(node)) {
        const decl = node.declarationList.declarations[0];
        if (decl && ts.isIdentifier(decl.name) && decl.name.text === 'firstSetupConst') {
          firstConstLine = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        }
      }
    });

    expect(firstConstLine).toBe(8);
  });

  it('clears cache successfully', () => {
    const ctx = new SharedAstContext();
    ctx.getSourceFile('a.ts', 'const a = 1;');
    expect(ctx.size).toBe(1);

    ctx.clear();
    expect(ctx.size).toBe(0);
    expect(ctx.hasSourceFile('a.ts')).toBe(false);
  });
});

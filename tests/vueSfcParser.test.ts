/**
 * tests/vueSfcParser.test.ts
 *
 * Dedicated unit test suite for parseVueSfcBlocks.
 */

import { describe, it, expect } from 'vitest';
import { parseVueSfcBlocks } from '../src/core/vueSfcParser.ts';

describe('vueSfcParser core helper', () => {
  it('extracts template, script setup, and style blocks with metadata', () => {
    const sfc = `
<template>
  <div class="user-card">
    <span>{{ name }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
const name = ref('Antigravity');
</script>

<style scoped lang="scss">
.user-card {
  color: red;
}
</style>
`;
    const blocks = parseVueSfcBlocks(sfc);

    expect(blocks.template).toBeDefined();
    expect(blocks.template?.content).toContain('<div class="user-card">');
    expect(blocks.template?.startLine).toBe(2);

    expect(blocks.scripts).toHaveLength(1);
    const script = blocks.scripts[0];
    expect(script?.isSetup).toBe(true);
    expect(script?.lang).toBe('ts');
    expect(script?.content).toContain('const name = ref');

    expect(blocks.styles).toHaveLength(1);
    const style = blocks.styles[0];
    expect(style?.isScoped).toBe(true);
    expect(style?.lang).toBe('scss');
    expect(style?.content).toContain('.user-card');
  });

  it('handles multiple style blocks and standard script alongside script setup', () => {
    const sfc = `
<script lang="ts">
export default { name: 'MyComponent' };
</script>

<script setup lang="ts">
const id = 123;
</script>

<style>
body { margin: 0; }
</style>

<style scoped>
.local { padding: 10px; }
</style>
`;
    const blocks = parseVueSfcBlocks(sfc);

    expect(blocks.scripts).toHaveLength(2);
    expect(blocks.scripts[0]?.isSetup).toBe(false);
    expect(blocks.scripts[1]?.isSetup).toBe(true);

    expect(blocks.styles).toHaveLength(2);
    expect(blocks.styles[0]?.isScoped).toBe(false);
    expect(blocks.styles[1]?.isScoped).toBe(true);
  });

  it('handles empty or malformed strings gracefully without throwing', () => {
    const emptyResult = parseVueSfcBlocks('');
    expect(emptyResult.template).toBeUndefined();
    expect(emptyResult.scripts).toHaveLength(0);
    expect(emptyResult.styles).toHaveLength(0);

    const nonSfc = parseVueSfcBlocks('const x = 10;');
    expect(nonSfc.template).toBeUndefined();
    expect(nonSfc.scripts).toHaveLength(0);
    expect(nonSfc.styles).toHaveLength(0);
  });
});

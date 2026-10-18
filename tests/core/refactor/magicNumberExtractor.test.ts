import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { MagicNumberExtractor } from '../../../src/core/refactor/magicNumberExtractor.ts';

describe('MagicNumberExtractor', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-extractor-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('discovers scannable TypeScript and Vue files ignoring node_modules and dist', () => {
    const srcDir = path.join(tmpDir, 'src');
    const nodeModulesDir = path.join(tmpDir, 'node_modules');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.mkdirSync(nodeModulesDir, { recursive: true });

    fs.writeFileSync(path.join(srcDir, 'logic.ts'), 'export const a = 1;');
    fs.writeFileSync(path.join(srcDir, 'types.d.ts'), 'export type Foo = string;');
    fs.writeFileSync(path.join(srcDir, 'Component.vue'), '<template><div /></template>');
    fs.writeFileSync(path.join(nodeModulesDir, 'dep.ts'), 'export const b = 2;');

    const scannable = MagicNumberExtractor.discoverScannableFiles(tmpDir);
    expect(scannable).toContain(path.normalize('src/logic.ts'));
    expect(scannable).toContain(path.normalize('src/Component.vue'));
    expect(scannable).not.toContain(path.normalize('src/types.d.ts'));
    expect(scannable).not.toContain(path.normalize('node_modules/dep.ts'));
  });

  it('scans a file and extracts magic number occurrences with 0-token resolvability', () => {
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    const code = `
      function calculate(val: number): number {
        setTimeout(() => {}, 5000);
        if (val > 42) {
          return val * 100;
        }
        return val;
      }
    `;
    const relFile = 'src/testCode.ts';
    fs.writeFileSync(path.join(tmpDir, relFile), code);

    const extractor = new MagicNumberExtractor();
    const items = extractor.scanFile(tmpDir, relFile);

    expect(items.length).toBeGreaterThan(0);
    const has5000 = items.some((i) => i.rawValue === '5000');
    expect(has5000).toBe(true);

    const packet = extractor.generateSuperDiracPacket(tmpDir, relFile, items);
    expect(packet.totalItems).toBe(items.length);
    expect(packet.tokenSavingsPercent).toBeGreaterThanOrEqual(0);
    expect(packet.items.length).toBe(items.length);
  });

  it('scans SCSS stylesheets and extracts hardcoded z-index and hex colors', () => {
    const stylesDir = path.join(tmpDir, 'src', 'styles');
    fs.mkdirSync(stylesDir, { recursive: true });

    const scss = `
      .card {
        z-index: 1000;
        background-color: #ff5500;
      }
    `;
    const relFile = 'src/styles/card.scss';
    fs.writeFileSync(path.join(tmpDir, relFile), scss);

    const extractor = new MagicNumberExtractor();
    const items = extractor.scanFile(tmpDir, relFile);

    expect(items.length).toBe(2);
    const zIndexItem = items.find((i) => i.kind === 'z-index-scss');
    expect(zIndexItem).toBeDefined();
    expect(zIndexItem?.numericValue).toBe(1000);

    const colorItem = items.find((i) => i.kind === 'color-scss');
    expect(colorItem).toBeDefined();
    expect(colorItem?.rawValue).toBe('#ff5500');
  });
});

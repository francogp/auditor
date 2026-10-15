/**
 * tests/skill_templates_contract.test.ts
 *
 * Guards the authoring templates, extension blueprints and guide snippets distributed with the
 * `auditor` skill: every constructor example that declares `ruleDescriptions` MUST also declare
 * the mandatory `ruleRemediations` contract, so documentation can never teach an outdated contract.
 */

import { describe, it, expect } from 'vite-plus/test';
import fs from 'node:fs';
import path from 'node:path';

const SKILL_ROOT = path.resolve(import.meta.dirname, '../.agents/skills/auditor');
const TEMPLATE_DIRS = ['assets/templates', 'references/extensions'] as const;
const GUIDE_DIR = 'references';
const DESCRIPTIONS_KEY = 'ruleDescriptions';
const REMEDIATIONS_KEY = 'ruleRemediations';
const FENCE = '`'.repeat(3);

function listFiles(dir: string, predicate: (name: string) => boolean): string[] {
  const abs = path.join(SKILL_ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs)
    .filter((name) => predicate(name))
    .map((name) => path.join(abs, name));
}

describe('skill templates and blueprints contract (ruleRemediations)', () => {
  it('discovers templates and extension blueprints (Metadata)', () => {
    const files = TEMPLATE_DIRS.flatMap((dir) =>
      listFiles(
        dir,
        (n) => n.endsWith('.ts') && !n.includes('.test.') && !n.includes('vitest.coverage')
      )
    );
    expect(files.length).toBeGreaterThan(0);
  });

  for (const dir of TEMPLATE_DIRS) {
    for (const file of listFiles(
      dir,
      (n) => n.endsWith('.ts') && !n.includes('.test.') && !n.includes('vitest.coverage')
    )) {
      const source = fs.readFileSync(file, 'utf-8');
      if (!source.includes(DESCRIPTIONS_KEY)) continue;
      it(`${path.relative(SKILL_ROOT, file)} declares ruleRemediations alongside ruleDescriptions`, () => {
        expect(source.includes(`${REMEDIATIONS_KEY}`)).toBe(true);
      });
    }
  }

  it('every typescript snippet in reference guides that declares ruleDescriptions also declares ruleRemediations', () => {
    const offenders: string[] = [];
    for (const file of listFiles(GUIDE_DIR, (n) => n.endsWith('.md'))) {
      const blocks = fs.readFileSync(file, 'utf-8').split(FENCE);
      // Odd indexes are fenced code blocks
      for (let i = 1; i < blocks.length; i += 2) {
        const block = blocks[i]!;
        if (
          block.includes(DESCRIPTIONS_KEY) &&
          block.includes('super(') &&
          !block.includes(REMEDIATIONS_KEY)
        ) {
          offenders.push(`${path.relative(SKILL_ROOT, file)} (block #${Math.ceil(i / 2)})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('detects a snippet that omits ruleRemediations (violation path)', () => {
    const snippet = `super({ ${DESCRIPTIONS_KEY}: { 'a': 'b' } });`;
    expect(snippet.includes(REMEDIATIONS_KEY)).toBe(false);
  });

  for (const dir of TEMPLATE_DIRS) {
    for (const file of listFiles(
      dir,
      (n) => n.endsWith('.ts') && !n.includes('.test.') && !n.includes('vitest.coverage')
    )) {
      const source = fs.readFileSync(file, 'utf-8');
      if (!source.includes(DESCRIPTIONS_KEY)) continue;
      it(`${path.relative(SKILL_ROOT, file)} declares usesThirdPartyTool in constructor`, () => {
        expect(source.includes('usesThirdPartyTool:')).toBe(true);
      });
    }
  }
});

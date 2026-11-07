import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { describe, it, expect } from 'vite-plus/test';

import { DEFAULT_CANONICAL_LINT_RULES } from '../src/core/auditConfigDefaults.ts';
import { extractParsedConfigSummary } from '../src/core/viteConfigAst.ts';

describe('Fallow Deduplication Canary Suite (Zero Clones)', () => {
  it('Tier 1: DEFAULT_CANONICAL_LINT_RULES contains all canonical rules without regressions', () => {
    const rules = Object.keys(DEFAULT_CANONICAL_LINT_RULES);
    expect(rules.length).toBeGreaterThanOrEqual(60);
    expect(DEFAULT_CANONICAL_LINT_RULES['typescript/no-explicit-any']).toBe('error');
    expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-record-string-key']).toBe(
      'error'
    );
    expect(DEFAULT_CANONICAL_LINT_RULES['@francogp/domain-type/no-unbranded-id']).toBe('error');
    expect(DEFAULT_CANONICAL_LINT_RULES['unicorn/prefer-node-protocol']).toBe('error');
  });

  it('Tier 2: Fallow dupes reports exactly zero clone groups across the entire codebase', () => {
    const fallowBin = path.resolve(
      process.cwd(),
      process.platform === 'win32' ? 'node_modules/.bin/fallow.cmd' : 'node_modules/.bin/fallow'
    );
    expect(fs.existsSync(fallowBin)).toBe(true);

    const out = childProcess.execSync(
      `"${fallowBin}" dupes --min-occurrences 2 --dupes-near --dupes-mode strict --format json`,
      {
        cwd: process.cwd(),
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      }
    );

    const cleanOut = out.replace(/^\uFEFF/, '').trim();
    const parsed = JSON.parse(cleanOut) as {
      clone_groups?: readonly unknown[];
      stats?: { clone_groups?: number; duplicated_tokens?: number };
    };
    expect(parsed.clone_groups).toBeDefined();
    expect(parsed.clone_groups).toEqual([]);
    expect(parsed.stats?.clone_groups ?? 0).toBe(0);
    expect(parsed.stats?.duplicated_tokens ?? 0).toBe(0);
  });

  it('Tier 3: vite.config.ts declares LOCKED_SKILLS_IGNORE_PATTERNS and uses spread', () => {
    const viteConfigPath = path.resolve(process.cwd(), 'vite.config.ts');
    const content = fs.readFileSync(viteConfigPath, 'utf-8');

    expect(content).toContain('const LOCKED_SKILLS_IGNORE_PATTERNS =');
    expect(content).toContain('...LOCKED_SKILLS_IGNORE_PATTERNS');

    const summary = extractParsedConfigSummary(content);
    expect(summary.hasSection('lint')).toBe(true);
    expect(summary.hasSection('fmt')).toBe(true);
    expect(summary.lintIgnorePatterns.length).toBeGreaterThan(30);
    expect(summary.fmtIgnorePatterns.length).toBeGreaterThan(30);
    expect(summary.lintIgnorePatterns).toContain('.agents/skills/ci-cd-and-automation/**');
    expect(summary.fmtIgnorePatterns).toContain('.agents/skills/ci-cd-and-automation/**');
  });

  it('Tier 4: AST extraction accurately preserves comments and trailing comma conventions', () => {
    const viteConfigPath = path.resolve(process.cwd(), 'vite.config.ts');
    const content = fs.readFileSync(viteConfigPath, 'utf-8');

    expect(content).toContain('export default defineConfig({');
    expect(content).toContain('pack: {');
    expect(content).toContain('run: {');
  });
});

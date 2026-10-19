/**
 * tests/skills_conformance.test.ts
 *
 * Automated conformance testing for all skills in `.agents/skills/`
 * according to the canonical `skill-creator` standard:
 * 1. Every skill must have a valid `SKILL.md`
 * 2. YAML frontmatter must parse cleanly without syntax errors
 * 3. Required metadata (`name`, `description`) must be present and non-empty
 * 4. Skill `name` must match the parent directory name
 * 5. Primary `SKILL.md` must not exceed 500 lines (3-tier progressive disclosure)
 */

import fs from 'node:fs';
import path from 'node:path';

import { describe, it, expect } from 'vite-plus/test';
import yaml from 'yaml';

import { isLockedSkillPath } from '../src/core/auditorBase.ts';

const SKILLS_ROOT = path.resolve(import.meta.dirname, '../.agents/skills');

function getDiscoveredSkills(): string[] {
  if (!fs.existsSync(SKILLS_ROOT)) return [];
  return fs
    .readdirSync(SKILLS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

describe('Skill Creator Conformance & Frontmatter Verification', () => {
  const skills = getDiscoveredSkills();

  it('discovers skills in .agents/skills directory', () => {
    expect(skills.length).toBeGreaterThan(0);
  });

  for (const skillName of skills) {
    describe(`Skill: ${skillName}`, () => {
      const skillDir = path.join(SKILLS_ROOT, skillName);
      const skillMdPath = path.join(skillDir, 'SKILL.md');

      it('has SKILL.md file present', () => {
        expect(fs.existsSync(skillMdPath)).toBe(true);
      });

      it('does not exceed 500 lines in SKILL.md (3-tier progressive disclosure)', () => {
        if (isLockedSkillPath(skillMdPath)) {
          // Vendor locked skills from upstream ecosystem are immutable external assets
          return;
        }
        const content = fs.readFileSync(skillMdPath, 'utf8');
        const lineCount = content.split(/\r?\n/).length;
        expect(lineCount).toBeLessThanOrEqual(500);
      });

      it('contains valid, parseable YAML frontmatter with name and description', () => {
        const content = fs.readFileSync(skillMdPath, 'utf8');
        expect(content.startsWith('---')).toBe(true);

        const parts = content.split('---');
        expect(parts.length).toBeGreaterThanOrEqual(3);

        const frontmatterRaw = parts[1]!;
        let parsed: Record<string, unknown> | null = null;
        expect(() => {
          parsed = yaml.parse(frontmatterRaw);
        }).not.toThrow();

        expect(parsed).toBeDefined();
        expect(typeof parsed).toBe('object');
        expect(parsed).not.toBeNull();

        const data = parsed as unknown as Record<string, unknown>;

        // Verify name
        expect(typeof data.name).toBe('string');
        expect((data.name as string).trim().length).toBeGreaterThan(0);
        expect(data.name).toBe(skillName);

        // Verify description
        expect(typeof data.description).toBe('string');
        expect((data.description as string).trim().length).toBeGreaterThan(10);
      });
    });
  }
});

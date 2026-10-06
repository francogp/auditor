/**
 * tests/locked_skills.test.ts
 *
 * Unit tests for official locked skills isolation across the auditor framework.
 * Official vendor skills tracked in skills-lock.json must be treated as immutable 3rd-party assets:
 * 1. Ignored during file scanning (isPathIgnored)
 * 2. Dropped if reported by any AST or external linter (addFinding, addViolation)
 * 3. Protected from auto-fixing or modification (safeWriteFileSync, safeWriteFile)
 * 4. Custom in-house skills (not in skills-lock.json) remain fully audited and editable.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  loadLockedSkills,
  isLockedSkillPath,
  clearLockedSkillsCache,
  isPathIgnored,
  BaseAuditor,
  type AuditorOptions
} from '../src/core/auditorBase.ts';
import type { AuditFinding } from '../src/core/auditContract.ts';
import { safeWriteFileSync, safeWriteFile } from '../src/core/safePath.ts';

class TestSkillAuditor extends BaseAuditor<string> {
  constructor(options: AuditorOptions<string>) {
    super(options);
  }

  public override async runAudit(): Promise<void> {
    // no-op for isolated unit testing
  }

  public addContextFinding(f: AuditFinding): void {
    this.context.addFinding(f);
  }
}

describe('Official Locked Skills Isolation', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    process.env.AUDIT_SUBPROCESS = 'true';
    originalCwd = process.cwd();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-locked-skills-test-'));
    process.chdir(tempDir);
    clearLockedSkillsCache();
  });

  afterEach(() => {
    delete process.env.AUDIT_SUBPROCESS;
    process.chdir(originalCwd);
    clearLockedSkillsCache();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // catch-ok: cleanup
    }
  });

  describe('loadLockedSkills & Cache', () => {
    it('returns empty set when skills-lock.json does not exist', () => {
      const skills = loadLockedSkills(tempDir);
      expect(skills.size).toBe(0);
    });

    it('returns empty set when skills-lock.json is malformed or invalid JSON', () => {
      fs.writeFileSync(path.join(tempDir, 'skills-lock.json'), '{ invalid json');
      const skills = loadLockedSkills(tempDir);
      expect(skills.size).toBe(0);
    });

    it('loads and lowercases skill names from skills-lock.json', () => {
      const lockData = {
        version: 1,
        skills: {
          'gsap-core': { source: 'greensock/gsap-skills' },
          'Vitest': { source: 'antfu/skills' },
          'PLAYWRIGHT-CLI': { source: 'microsoft/playwright-cli' }
        }
      };
      fs.writeFileSync(path.join(tempDir, 'skills-lock.json'), JSON.stringify(lockData, null, 2));

      const skills = loadLockedSkills(tempDir);
      expect(skills.size).toBe(3);
      expect(skills.has('gsap-core')).toBe(true);
      expect(skills.has('vitest')).toBe(true);
      expect(skills.has('playwright-cli')).toBe(true);
    });

    it('caches parsed skills for the same project root and clears on clearLockedSkillsCache', () => {
      fs.writeFileSync(
        path.join(tempDir, 'skills-lock.json'),
        JSON.stringify({ version: 1, skills: { 'vitest': {} } })
      );

      const first = loadLockedSkills(tempDir);
      expect(first.has('vitest')).toBe(true);

      // Overwrite file without clearing cache
      fs.writeFileSync(
        path.join(tempDir, 'skills-lock.json'),
        JSON.stringify({ version: 1, skills: { 'vitest': {}, 'playwright': {} } })
      );
      const cached = loadLockedSkills(tempDir);
      expect(cached.has('playwright')).toBe(false);

      // Clear cache and verify updated content
      clearLockedSkillsCache();
      const refreshed = loadLockedSkills(tempDir);
      expect(refreshed.has('playwright')).toBe(true);
    });

    it('loads skills from .auditor/skills-lock.json when root file is absent', () => {
      const auditorDir = path.join(tempDir, '.auditor');
      fs.mkdirSync(auditorDir, { recursive: true });
      fs.writeFileSync(
        path.join(auditorDir, 'skills-lock.json'),
        JSON.stringify({ version: 1, skills: { 'auditor-locked-skill': {} } })
      );

      const skills = loadLockedSkills(tempDir);
      expect(skills.has('auditor-locked-skill')).toBe(true);
    });

    it('loads skills from .agents/skills-lock.json when root file is absent', () => {
      const agentsDir = path.join(tempDir, '.agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      fs.writeFileSync(
        path.join(agentsDir, 'skills-lock.json'),
        JSON.stringify({ version: 1, skills: { 'agents-locked-skill': {} } })
      );

      const skills = loadLockedSkills(tempDir);
      expect(skills.has('agents-locked-skill')).toBe(true);
    });

    it('merges skills when multiple candidate locations exist simultaneously', () => {
      fs.writeFileSync(
        path.join(tempDir, 'skills-lock.json'),
        JSON.stringify({ version: 1, skills: { 'root-skill': {} } })
      );
      const auditorDir = path.join(tempDir, '.auditor');
      fs.mkdirSync(auditorDir, { recursive: true });
      fs.writeFileSync(
        path.join(auditorDir, 'skills-lock.json'),
        JSON.stringify({ version: 1, skills: { 'auditor-skill': {} } })
      );

      const skills = loadLockedSkills(tempDir);
      expect(skills.has('root-skill')).toBe(true);
      expect(skills.has('auditor-skill')).toBe(true);
    });
  });

  describe('isLockedSkillPath', () => {
    beforeEach(() => {
      const lockData = {
        version: 1,
        skills: {
          'gsap-core': { source: 'greensock/gsap-skills' },
          'vitest': { source: 'antfu/skills' }
        }
      };
      fs.writeFileSync(path.join(tempDir, 'skills-lock.json'), JSON.stringify(lockData, null, 2));
    });

    it('identifies relative and absolute paths under .agents/skills/<locked>', () => {
      const relPath = '.agents/skills/gsap-core/SKILL.md';
      const absPath = path.join(tempDir, '.agents/skills/vitest/references/guide.md');

      expect(isLockedSkillPath(relPath, tempDir)).toBe(true);
      expect(isLockedSkillPath(absPath, tempDir)).toBe(true);
    });

    it('identifies paths under skills/<locked> and .skills/<locked>', () => {
      expect(isLockedSkillPath('skills/gsap-core/index.ts', tempDir)).toBe(true);
      expect(isLockedSkillPath('.skills/vitest/config.json', tempDir)).toBe(true);
    });

    it('handles Windows backslash separators', () => {
      const winPath = '.agents\\skills\\gsap-core\\SKILL.md';
      expect(isLockedSkillPath(winPath, tempDir)).toBe(true);
    });

    it('returns false for custom in-house skills not in skills-lock.json', () => {
      expect(isLockedSkillPath('.agents/skills/auditor/SKILL.md', tempDir)).toBe(false);
      expect(isLockedSkillPath('.agents/skills/safe-commit/SKILL.md', tempDir)).toBe(false);
      expect(isLockedSkillPath('skills/custom-tool/index.ts', tempDir)).toBe(false);
    });

    it('returns false for standard application source and test files', () => {
      expect(isLockedSkillPath('src/core/auditorBase.ts', tempDir)).toBe(false);
      expect(isLockedSkillPath('tests/foo.test.ts', tempDir)).toBe(false);
      expect(isLockedSkillPath('package.json', tempDir)).toBe(false);
    });
  });

  describe('isPathIgnored integration', () => {
    beforeEach(() => {
      fs.writeFileSync(
        path.join(tempDir, 'skills-lock.json'),
        JSON.stringify({ version: 1, skills: { 'gsap-core': {} } })
      );
    });

    it('ignores paths belonging to locked skills even if parent dir is unignored', () => {
      const lockedFile = '.agents/skills/gsap-core/SKILL.md';
      expect(isPathIgnored(lockedFile, [], ['.agents'], tempDir)).toBe(true);
    });

    it('does not ignore custom skills when parent dir is unignored', () => {
      const customSkill = '.agents/skills/auditor/SKILL.md';
      expect(isPathIgnored(customSkill, [], ['.agents'], tempDir)).toBe(false);
    });
  });

  describe('BaseAuditor & AuditorContext finding filtering', () => {
    beforeEach(() => {
      fs.writeFileSync(
        path.join(tempDir, 'skills-lock.json'),
        JSON.stringify({ version: 1, skills: { 'gsap-core': {} } })
      );
    });

    it('drops findings added to AuditorContext if originating in a locked skill', async () => {
      const auditor = new TestSkillAuditor({
        id: 'test_locked_context',
        name: 'Test Locked Context',
        description: 'Test Locked Context Auditor',
        family: 'hygiene',
        packageName: 'test',
        icon: '🧪',
        coverage: { include: ['**/*'] },
        ruleIds: ['test-rule'],
        ruleDescriptions: { 'test-rule': 'Regla de prueba' },
        projectRoot: tempDir
      });

      // Locked skill finding: should be silently dropped
      auditor.addContextFinding({
        severity: 'error',
        message: 'Broken markdown syntax',
        file: '.agents/skills/gsap-core/SKILL.md',
        ruleId: 'test-rule'
      });

      // Custom skill finding: should be preserved
      auditor.addContextFinding({
        severity: 'error',
        message: 'Auditor defect',
        file: '.agents/skills/auditor/SKILL.md',
        ruleId: 'test-rule'
      });

      // Regular source finding: should be preserved
      auditor.addContextFinding({
        severity: 'error',
        message: 'Source defect',
        file: 'src/main.ts',
        ruleId: 'test-rule'
      });

      const result = await auditor.finishAudit();
      const findings = result.findings;
      expect(findings.length).toBe(2);
      expect(findings.some(f => f.file?.includes('gsap-core'))).toBe(false);
      expect(findings.some(f => f.file?.includes('auditor'))).toBe(true);
      expect(findings.some(f => f.file?.includes('main.ts'))).toBe(true);
    });

    it('drops violations added via addViolation and does not increment rule counts', async () => {
      const auditor = new TestSkillAuditor({
        id: 'test_locked_violation',
        name: 'Test Locked Violation',
        description: 'Test Locked Violation Auditor',
        family: 'hygiene',
        packageName: 'test',
        icon: '🧪',
        coverage: { include: ['**/*'] },
        ruleIds: ['test-rule'],
        ruleDescriptions: { 'test-rule': 'Regla de prueba' },
        projectRoot: tempDir
      });

      // Locked skill violation: should be dropped, count remains 0
      auditor.addViolation({
        ruleId: 'test-rule',
        message: 'Violation in locked skill',
        file: path.join(tempDir, '.agents/skills/gsap-core/SKILL.md'),
        severity: 'error'
      });

      expect(auditor.getCountsByRule().get('test-rule')).toBe(0);

      // Custom skill violation: should be recorded
      auditor.addViolation({
        ruleId: 'test-rule',
        message: 'Violation in custom skill',
        file: path.join(tempDir, '.agents/skills/auditor/SKILL.md'),
        severity: 'error'
      });

      expect(auditor.getCountsByRule().get('test-rule')).toBe(1);

      const result = await auditor.finishAudit();
      expect(result.findings.length).toBe(1);
      expect(result.findings[0]?.file).toContain('auditor');
    });
  });

  describe('safeWriteFileSync & safeWriteFile immutability guards', () => {
    beforeEach(() => {
      fs.writeFileSync(
        path.join(tempDir, 'skills-lock.json'),
        JSON.stringify({ version: 1, skills: { 'gsap-core': {} } })
      );
    });

    it('blocks safeWriteFileSync to official locked skills', () => {
      const target = path.join(tempDir, '.agents/skills/gsap-core/SKILL.md');
      expect(() => {
        safeWriteFileSync(target, '# Corrupted Content');
      }).toThrow(/Security \/ Immutability Violation: Cannot write to official locked skill/);
    });

    it('blocks safeWriteFile to official locked skills', async () => {
      const target = path.join(tempDir, '.agents/skills/gsap-core/SKILL.md');
      await expect(
        safeWriteFile(target, '# Corrupted Content')
      ).rejects.toThrow(/Security \/ Immutability Violation: Cannot write to official locked skill/);
    });

    it('allows safeWriteFileSync and safeWriteFile to custom skills and project files', async () => {
      const customTarget = path.join(tempDir, '.agents/skills/auditor/SKILL.md');
      safeWriteFileSync(customTarget, '# Custom Auditor Skill');
      expect(fs.readFileSync(customTarget, 'utf-8')).toBe('# Custom Auditor Skill');

      const fileTarget = path.join(tempDir, 'src/test.txt');
      await safeWriteFile(fileTarget, 'Hello World');
      expect(fs.readFileSync(fileTarget, 'utf-8')).toBe('Hello World');
    });
  });
});

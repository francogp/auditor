/**
 * tests/validate_agent_plugin.test.ts
 *
 * Dedicated unit test suite for AgentPluginAuditor:
 * - Detects missing plugin registration in host projects (missing-agent-plugin-registration)
 * - Verifies clean execution when properly registered in .agents/plugins.json
 * - Verifies clean execution when running directly on @francogp/auditor provider
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import {
  AgentPluginAuditor,
  AGENT_PLUGIN_RULES
} from '../src/suites/architecture/validate_agent_plugin.ts';

describe('validate_agent_plugin (Agent Plugin & Skill Integration Auditor)', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-agent-plugin-test-'));
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe('Metadata & Configuration', () => {
    it('declares all expected canonical rules', () => {
      expect(AGENT_PLUGIN_RULES).toContain('missing-agent-plugin-registration');
    });

    it('initializes with correct canonical metadata and description lengths', () => {
      const auditor = new AgentPluginAuditor();
      expect(auditor.id).toBe('validate_agent_plugin');
      expect(auditor.family).toBe('architecture');
      expect(auditor.packageName).toBe('Agent');
      expect(auditor.description.length).toBeLessThanOrEqual(60);
      expect(
        auditor.formatRuleDescription('missing-agent-plugin-registration').length
      ).toBeLessThanOrEqual(50);
    });
  });

  describe('Violation Detection', () => {
    it('detects missing agent plugin registration when .agents/plugins.json does not exist', async () => {
      // Create a mock host project without .agents/plugins.json
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'my-host-app', version: '1.0.0' }, null, 2),
        'utf8'
      );

      const auditor = new AgentPluginAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      expect(result.summary.errors).toBe(1);
      expect(result.status).toBe('failed');

      const violation = result.findings.find(
        (f) => f.ruleId === 'missing-agent-plugin-registration'
      );
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
      expect(violation?.file).toBe('.agents/plugins.json');
      expect(violation?.context).toContain('auditor:init-agent');
    });

    it('detects missing agent plugin registration when .agents/plugins.json has unrelated plugins', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'my-host-app', version: '1.0.0' }, null, 2),
        'utf8'
      );
      const agentsDir = path.join(tempDir, '.agents');
      await fs.mkdir(agentsDir, { recursive: true });
      await fs.writeFile(
        path.join(agentsDir, 'plugins.json'),
        JSON.stringify({ entries: [{ path: 'node_modules/unrelated-plugin' }] }, null, 2),
        'utf8'
      );

      const auditor = new AgentPluginAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      expect(result.summary.errors).toBe(1);
      const violation = result.findings.find(
        (f) => f.ruleId === 'missing-agent-plugin-registration'
      );
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
    });
  });

  describe('Clean Execution (Negative Verification)', () => {
    it('runs on compliant host projects with registered @francogp/auditor plugin and reports zero errors', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'my-host-app', version: '1.0.0' }, null, 2),
        'utf8'
      );
      const agentsDir = path.join(tempDir, '.agents');
      await fs.mkdir(agentsDir, { recursive: true });
      await fs.writeFile(
        path.join(agentsDir, 'plugins.json'),
        JSON.stringify({ entries: [{ path: 'node_modules/@francogp/auditor' }] }, null, 2),
        'utf8'
      );
      await fs.writeFile(
        path.join(agentsDir, 'skills.json'),
        JSON.stringify(
          { entries: [{ path: 'node_modules/@francogp/auditor/.agents/skills' }] },
          null,
          2
        ),
        'utf8'
      );

      const auditor = new AgentPluginAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('detects missing registration when plugins.json exists but skills.json is missing', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'my-host-app', version: '1.0.0' }, null, 2),
        'utf8'
      );
      const agentsDir = path.join(tempDir, '.agents');
      await fs.mkdir(agentsDir, { recursive: true });
      await fs.writeFile(
        path.join(agentsDir, 'plugins.json'),
        JSON.stringify({ entries: [{ path: 'node_modules/@francogp/auditor' }] }, null, 2),
        'utf8'
      );

      const auditor = new AgentPluginAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      expect(result.summary.errors).toBe(1);
      expect(result.status).toBe('failed');
      const violation = result.findings.find(
        (f) => f.ruleId === 'missing-agent-plugin-registration'
      );
      expect(violation).toBeDefined();
    });

    it('runs on the @francogp/auditor provider repository itself and reports zero errors', async () => {
      // In the provider repo, package.json has name @francogp/auditor and root plugin.json exists
      const auditor = new AgentPluginAuditor();
      const result = await auditor.audit();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('skips gracefully when explicitly disabled with agentPlugin.enabled: false', async () => {
      await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, '.auditor', 'audit.config.json'),
        JSON.stringify({ name: 'disabled-plugin-app', agentPlugin: { enabled: false } }),
        'utf8'
      );
      const auditor = new AgentPluginAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('auto-registers missing agent plugin and skills when executed with fix: true', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'my-host-app', version: '1.0.0' }, null, 2),
        'utf8'
      );
      const auditor = new AgentPluginAuditor({ projectRoot: tempDir });
      const result = await auditor.fix();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });

    it('detects invalid YAML syntax in skill SKILL.md frontmatter', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'my-host-app', version: '1.0.0' }, null, 2),
        'utf8'
      );
      const skillDir = path.join(tempDir, '.agents/skills/broken-skill');
      await fs.mkdir(skillDir, { recursive: true });
      // Invalid YAML: unquoted colon followed by space inside mapping
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: broken-skill\ndescription: unquoted: nested key\n---\n# Broken Skill\n',
        'utf8'
      );

      const auditor = new AgentPluginAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      const violation = result.findings.find((f) => f.ruleId === 'skill-invalid-yaml-frontmatter');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
      expect(violation?.message).toContain('YAML syntax error in frontmatter');
    });

    it('detects missing name or description in skill SKILL.md frontmatter', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'my-host-app', version: '1.0.0' }, null, 2),
        'utf8'
      );
      const skillDir = path.join(tempDir, '.agents/skills/nameless-skill');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        '---\ndescription: Has description but no name\n---\n# Nameless\n',
        'utf8'
      );

      const auditor = new AgentPluginAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      const violation = result.findings.find(
        (f) => f.ruleId === 'skill-invalid-yaml-frontmatter' && f.context === 'nameless-skill'
      );
      expect(violation).toBeDefined();
      expect(violation?.message).toContain("Missing 'name' field in frontmatter");
    });

    it('detects invalid JSON syntax in a skill secondary asset', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'my-host-app', version: '1.0.0' }, null, 2),
        'utf8'
      );
      const skillDir = path.join(tempDir, '.agents/skills/json-broken-skill');
      await fs.mkdir(path.join(skillDir, 'evals'), { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: json-broken-skill\ndescription: >-\n  Valid description\n---\n# Skill\n',
        'utf8'
      );
      // Malformed JSON (trailing comma, unquoted key)
      await fs.writeFile(path.join(skillDir, 'evals', 'evals.json'), '{ "broken": , }', 'utf8');

      const auditor = new AgentPluginAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      const violation = result.findings.find((f) => f.ruleId === 'skill-invalid-asset-syntax');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
      expect(violation?.file).toContain('evals.json');
      expect(violation?.message).toContain('JSON syntax error');
    });

    it('detects invalid TypeScript syntax in a skill template asset', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'my-host-app', version: '1.0.0' }, null, 2),
        'utf8'
      );
      const skillDir = path.join(tempDir, '.agents/skills/ts-broken-skill');
      await fs.mkdir(path.join(skillDir, 'templates'), { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        '---\nname: ts-broken-skill\ndescription: >-\n  Valid description\n---\n# Skill\n',
        'utf8'
      );
      // Malformed TypeScript syntax
      await fs.writeFile(
        path.join(skillDir, 'templates', 'broken.ts'),
        'export const a = ;;; const',
        'utf8'
      );

      const auditor = new AgentPluginAuditor({ projectRoot: tempDir });
      const result = await auditor.audit();

      const violation = result.findings.find((f) => f.ruleId === 'skill-invalid-asset-syntax');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
      expect(violation?.file).toContain('broken.ts');
      expect(violation?.message).toContain('TypeScript syntax error');
    });

    interface SkillFixtureOptions {
      fix?: boolean;
      customPkg?: Record<string, unknown>;
    }

    async function executeSkillFixture(
      skillName: string,
      frontmatterContent: string,
      options: SkillFixtureOptions = {}
    ) {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify(options.customPkg ?? { name: 'my-host-app', version: '1.0.0' }, null, 2),
        'utf8'
      );
      const skillDir = path.join(tempDir, '.agents/skills', skillName);
      await fs.mkdir(skillDir, { recursive: true });
      const skillPath = path.join(skillDir, 'SKILL.md');
      await fs.writeFile(skillPath, frontmatterContent, 'utf8');

      const auditor = new AgentPluginAuditor({
        projectRoot: tempDir
      });
      const result = options.fix ? await auditor.fix() : await auditor.audit();
      return { result, skillPath, skillDir };
    }

    it('detects custom skill with flat description and flags skill-invalid-yaml-frontmatter', async () => {
      const { result } = await executeSkillFixture(
        'custom-flat-skill',
        '---\nname: custom-flat-skill\ndescription: "Flat single line description"\n---\n# Custom Skill\n'
      );

      const violation = result.findings.find(
        (f) => f.ruleId === 'skill-invalid-yaml-frontmatter' && f.context === 'custom-flat-skill'
      );
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
      expect(violation?.message).toContain(
        "must define 'description' using folded block scalar syntax ('description: >-')"
      );
    });

    it('auto-fixes custom skill description to description: >- format when fix: true', async () => {
      const { result, skillPath } = await executeSkillFixture(
        'custom-autofix-skill',
        '---\nname: custom-autofix-skill\ndescription: A long single line description without folding\n---\n# Custom Autofix Skill\n',
        { fix: true }
      );

      const frontmatterViolation = result.findings.find(
        (f) => f.ruleId === 'skill-invalid-yaml-frontmatter' && f.context === 'custom-autofix-skill'
      );
      expect(frontmatterViolation).toBeUndefined();

      const updatedContent = await fs.readFile(skillPath, 'utf8');
      expect(updatedContent).toContain('description: >-');
      expect(updatedContent).toContain('  A long single line description without folding');
    });

    it('detects custom skill exceeding 500 lines limit', async () => {
      const lines = [
        '---',
        'name: huge-custom-skill',
        'description: >-',
        '  Description for huge skill',
        '---',
        '# Huge Custom Skill',
        ...Array.from({ length: 500 }, (_, i) => `Line content ${i + 1}`)
      ];
      const { result } = await executeSkillFixture('huge-custom-skill', lines.join('\n'));

      const violation = result.findings.find((f) => f.ruleId === 'skill-exceeds-line-limit');
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
      expect(violation?.message).toContain('exceeds the 500 lines threshold');
      expect(violation?.file).toContain('huge-custom-skill');
    });

    it('exempts locked skills from 500 lines limit and strict description folding', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'my-host-app', version: '1.0.0' }, null, 2),
        'utf8'
      );
      // Create skills-lock.json with locked-skill
      await fs.writeFile(
        path.join(tempDir, 'skills-lock.json'),
        JSON.stringify(
          {
            version: 1,
            skills: {
              'locked-skill': {
                source: 'test/upstream',
                computedHash: 'abc123'
              }
            }
          },
          null,
          2
        ),
        'utf8'
      );

      const skillDir = path.join(tempDir, '.agents/skills/locked-skill');
      await fs.mkdir(skillDir, { recursive: true });
      // Locked skill has flat description AND >500 lines, but should pass because it's locked
      const lines = [
        '---',
        'name: locked-skill',
        'description: Flat description from third-party vendor without folding',
        '---',
        '# Locked Upstream Skill',
        ...Array.from({ length: 550 }, (_, i) => `Upstream content ${i + 1}`)
      ];
      await fs.writeFile(path.join(skillDir, 'SKILL.md'), lines.join('\n'), 'utf8');

      const auditor = new AgentPluginAuditor({ projectRoot: tempDir });
      const result = await auditor.fix();

      const lineLimitViolation = result.findings.find(
        (f) => f.ruleId === 'skill-exceeds-line-limit'
      );
      expect(lineLimitViolation).toBeUndefined();

      const yamlViolation = result.findings.find(
        (f) => f.ruleId === 'skill-invalid-yaml-frontmatter' && f.context === 'locked-skill'
      );
      expect(yamlViolation).toBeUndefined();
    });

    it('rejects pipe block scalar (description: |) in custom skills', async () => {
      const { result } = await executeSkillFixture(
        'pipe-skill',
        '---\nname: pipe-skill\ndescription: |\n  Line one of description\n  Line two of description\n---\n# Pipe Skill\n'
      );

      const violation = result.findings.find(
        (f) => f.ruleId === 'skill-invalid-yaml-frontmatter' && f.context === 'pipe-skill'
      );
      expect(violation).toBeDefined();
      expect(violation?.message).toContain(
        "must define 'description' using folded block scalar syntax ('description: >-')"
      );
    });

    it('rejects unchomped folded scalar (description: >) in custom skills', async () => {
      const { result } = await executeSkillFixture(
        'unchomped-skill',
        '---\nname: unchomped-skill\ndescription: >\n  Line one of description\n---\n# Unchomped Skill\n'
      );

      const violation = result.findings.find(
        (f) => f.ruleId === 'skill-invalid-yaml-frontmatter' && f.context === 'unchomped-skill'
      );
      expect(violation).toBeDefined();
      expect(violation?.message).toContain(
        "must define 'description' using folded block scalar syntax ('description: >-')"
      );
    });

    it('rejects custom skill description block lines with invalid indentation', async () => {
      const { result } = await executeSkillFixture(
        'bad-indent-skill',
        '---\nname: bad-indent-skill\ndescription: >-\n    Four spaces indented description\n---\n# Bad Indent Skill\n'
      );

      const violation = result.findings.find(
        (f) => f.ruleId === 'skill-invalid-yaml-frontmatter' && f.context === 'bad-indent-skill'
      );
      expect(violation).toBeDefined();
      expect(violation?.message).toContain(
        'must indent description block lines with exactly 2 spaces'
      );
    });

    it('rejects custom skill with inline text after description: >-', async () => {
      const { result } = await executeSkillFixture(
        'inline-text-skill',
        '---\nname: inline-text-skill\ndescription: >- Inline text that is not on a newline\n---\n# Inline Skill\n'
      );

      const violation = result.findings.find(
        (f) => f.ruleId === 'skill-invalid-yaml-frontmatter' && f.context === 'inline-text-skill'
      );
      expect(violation).toBeDefined();
      expect(violation?.severity).toBe('error');
      expect(violation?.message).toMatch(/YAML syntax error|must define 'description'/);
    });

    it('auto-fixes custom skill with unquoted special characters (colon space) in description', async () => {
      const { result, skillPath } = await executeSkillFixture(
        'unquoted-colon-skill',
        '---\nname: unquoted-colon-skill\ndescription: Core framework: automated analysis and rules\n---\n# Special Skill\n',
        { fix: true }
      );

      const frontmatterViolation = result.findings.find(
        (f) => f.ruleId === 'skill-invalid-yaml-frontmatter' && f.context === 'unquoted-colon-skill'
      );
      expect(frontmatterViolation).toBeUndefined();

      const updatedContent = await fs.readFile(skillPath, 'utf8');
      expect(updatedContent).toContain('description: >-');
      expect(updatedContent).toContain('  Core framework: automated analysis and rules');
    });

    it('preserves all continuation lines and $ tokens when auto-fixing multiline description or blank frontmatter lines', async () => {
      const { result, skillPath } = await executeSkillFixture(
        'multiline-dollar-skill',
        [
          '---',
          'name: multiline-dollar-skill',
          'description: First line with colon: unquoted and $HOME and $& token',
          '  second continuation line that must not be lost',
          '  third continuation line for the skill',
          '',
          '  indented-comment-or-metadata: value',
          'license: MIT',
          '---',
          '# Multiline Skill',
          ''
        ].join('\n'),
        { fix: true }
      );

      const frontmatterViolation = result.findings.find(
        (f) =>
          f.ruleId === 'skill-invalid-yaml-frontmatter' && f.context === 'multiline-dollar-skill'
      );
      expect(frontmatterViolation).toBeUndefined();

      const updatedContent = await fs.readFile(skillPath, 'utf8');
      const normalizedWhitespace = updatedContent.replace(/\s+/g, ' ');
      expect(updatedContent).toContain('description: >-');
      // $& must stay literal '$& token', never expand to the full regex match 'description: First line...'
      expect(updatedContent).not.toContain('description: First line');
      expect(normalizedWhitespace).toContain('$HOME and $& token');
      expect(normalizedWhitespace).toContain('second continuation line that must not be lost');
      expect(normalizedWhitespace).toContain('third continuation line for the skill');
      expect(updatedContent).toContain('indented-comment-or-metadata: value');
      expect(updatedContent).toContain('license: MIT');
    });

    it('flags host-duplicate-auditor-skill when a consumer project duplicates or locks an @francogp/auditor skill and auto-cleans in fix mode', async () => {
      await fs.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify({ name: 'my-host-app', version: '1.0.0' }, null, 2),
        'utf8'
      );
      const agentsDir = path.join(tempDir, '.agents');
      await fs.mkdir(agentsDir, { recursive: true });
      await fs.writeFile(
        path.join(agentsDir, 'plugins.json'),
        JSON.stringify({ entries: [{ path: 'node_modules/@francogp/auditor' }] }, null, 2),
        'utf8'
      );
      await fs.writeFile(
        path.join(agentsDir, 'skills.json'),
        JSON.stringify(
          { entries: [{ path: 'node_modules/@francogp/auditor/.agents/skills' }] },
          null,
          2
        ),
        'utf8'
      );

      // Simulate installed @francogp/auditor in node_modules owning 'fallow'
      const auditorNodeModDir = path.join(tempDir, 'node_modules/@francogp/auditor');
      await fs.mkdir(path.join(auditorNodeModDir, '.agents/skills/fallow'), { recursive: true });
      await fs.writeFile(
        path.join(auditorNodeModDir, 'skills-lock.json'),
        JSON.stringify(
          {
            version: 1,
            skills: {
              fallow: { source: 'fallow-rs/fallow-skills', computedHash: '123' }
            }
          },
          null,
          2
        ),
        'utf8'
      );

      // Consumer host project illegally clones 'fallow' locally and locks it in skills-lock.json
      const hostFallowDir = path.join(tempDir, '.agents/skills/fallow');
      await fs.mkdir(hostFallowDir, { recursive: true });
      await fs.writeFile(
        path.join(hostFallowDir, 'SKILL.md'),
        '---\nname: fallow\ndescription: >-\n  Duplicate fallow skill in host\n---\n# Fallow\n',
        'utf8'
      );
      await fs.writeFile(
        path.join(tempDir, 'skills-lock.json'),
        JSON.stringify(
          {
            version: 1,
            skills: {
              fallow: { source: 'fallow-rs/fallow-skills', computedHash: '123' }
            }
          },
          null,
          2
        ),
        'utf8'
      );

      const checkAuditor = new AgentPluginAuditor({ projectRoot: tempDir });
      const checkResult = await checkAuditor.audit();
      const dupFindings = checkResult.findings.filter(
        (f) => f.ruleId === 'host-duplicate-auditor-skill'
      );
      expect(dupFindings.length).toBe(2);

      // Run in fix mode to verify auto-cleanup
      const fixAuditor = new AgentPluginAuditor({ projectRoot: tempDir });
      const fixResult = await fixAuditor.fix();
      expect(fixResult.summary.errors).toBe(0);
    });
  });
});

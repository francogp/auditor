/**
 * tests/init_agent.test.ts
 *
 * Unit tests for init_agent CLI tool (registering plugins.json and skills.json in consumer host projects).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { initAgentSkill } from '../src/cli/init_agent.ts';

describe('init_agent CLI Tool', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-init-agent-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // catch-ok
    }
  });

  it('skips registration when run on the self-provider @francogp/auditor repository', () => {
    const result = initAgentSkill({ targetDir: process.cwd() });
    expect(result.success).toBe(true);
    expect(result.created).toBe(false);
    expect(result.message).toContain('Repositorio proveedor');
  });

  it('registers auditor in .agents/plugins.json and skills.json for host projects', () => {
    // Setup host project with distinct name
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'consumer-app' }), 'utf-8');

    const result = initAgentSkill({ targetDir: tempDir });
    expect(result.success).toBe(true);
    expect(result.created).toBe(true);

    const pluginsJsonPath = path.join(tempDir, '.agents/plugins.json');
    expect(fs.existsSync(pluginsJsonPath)).toBe(true);
    const plugins = JSON.parse(fs.readFileSync(pluginsJsonPath, 'utf-8'));
    expect(plugins.entries).toEqual(
      expect.arrayContaining([{ path: 'node_modules/@francogp/auditor' }])
    );

    const skillsJsonPath = path.join(tempDir, '.agents/skills.json');
    expect(fs.existsSync(skillsJsonPath)).toBe(true);
    const skills = JSON.parse(fs.readFileSync(skillsJsonPath, 'utf-8'));
    expect(skills.entries).toEqual(
      expect.arrayContaining([{ path: 'node_modules/@francogp/auditor/.agents/skills' }])
    );
  });

  it('is idempotent when already registered in host project', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'consumer-app' }), 'utf-8');

    // First run
    initAgentSkill({ targetDir: tempDir });

    // Second run
    const secondResult = initAgentSkill({ targetDir: tempDir });
    expect(secondResult.success).toBe(true);
    expect(secondResult.created).toBe(false);
    expect(secondResult.message).toContain('ya se encuentran registrados');
  });

  it('respects dryRun option without writing to disk', () => {
    fs.writeFileSync(path.join(tempDir, 'package.json'), JSON.stringify({ name: 'consumer-app' }), 'utf-8');

    const result = initAgentSkill({ targetDir: tempDir, dryRun: true });
    expect(result.success).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.agents/plugins.json'))).toBe(false);
  });
});

/**
 * tests/validate_agent_plugin.test.ts
 *
 * Dedicated unit test suite for AgentPluginAuditor:
 * - Detects missing plugin registration in host projects (missing-agent-plugin-registration)
 * - Verifies clean execution when properly registered in .agents/plugins.json
 * - Verifies clean execution when running directly on @francogp/auditor provider
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
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
      expect(auditor.packageName).toBe('Agente');
      expect(auditor.description.length).toBeLessThanOrEqual(60);
      expect(auditor.formatRuleDescription('missing-agent-plugin-registration').length).toBeLessThanOrEqual(50);
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
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(1);
      expect(result.status).toBe('failed');

      const violation = result.findings.find(f => f.ruleId === 'missing-agent-plugin-registration');
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
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(1);
      const violation = result.findings.find(f => f.ruleId === 'missing-agent-plugin-registration');
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
        JSON.stringify({ entries: [{ path: 'node_modules/@francogp/auditor/.agents/skills' }] }, null, 2),
        'utf8'
      );

      const auditor = new AgentPluginAuditor({ projectRoot: tempDir });
      const result = await auditor.execute();

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
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(1);
      expect(result.status).toBe('failed');
      const violation = result.findings.find(f => f.ruleId === 'missing-agent-plugin-registration');
      expect(violation).toBeDefined();
    });

    it('runs on the @francogp/auditor provider repository itself and reports zero errors', async () => {
      // In the provider repo, package.json has name @francogp/auditor and root plugin.json exists
      const auditor = new AgentPluginAuditor();
      const result = await auditor.execute();

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
      const result = await auditor.execute();

      expect(result.summary.errors).toBe(0);
      expect(result.status).toBe('passed');
    });
  });
});

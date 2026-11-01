import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';

import { resetAuditConfig } from '../src/core/auditConfig.ts';
import { BaseAuditor } from '../src/core/auditorBase.ts';
import { toPosixPath } from '../src/core/safePath.ts';
import { ValidateAuditConfigAuditor } from '../src/suites/architecture/validate_audit_config.ts';

const AUDIT_CONFIG_MODULE_PATH = toPosixPath(
  path.resolve(import.meta.dirname, '../src/core/auditConfig.ts')
);

// Dynamic custom subauditor simulating any built-in suite or third-party extension
class DynamicSampleAuditor extends BaseAuditor<'sample-rule'> {
  public constructor(projectRoot: string) {
    super({
      id: 'validate_dynamic_sample',
      name: 'Dynamic Sample Auditor',
      description: 'Tests dynamic agnostic configuration discovery and injection',
      family: 'architecture',
      ruleIds: ['sample-rule'],
      ruleRemediationPhases: { 'sample-rule': 'setup' },
      ruleDescriptions: { 'sample-rule': 'Sample description' },
      ruleRemediations: { 'sample-rule': 'Sample remediation' },
      packageName: 'Sample',
      icon: '🚀',
      configKey: 'dynamicFeature.enabled',
      defaultConfig: {
        enabled: true,
        enableSafetyLock: true,
        tier: 'ultra',
        subSettings: {
          enforceStrict: true,
          limit: 42
        }
      },
      criticalConfig: {},
      usesThirdPartyTool: false,
      requiredPermissions: [],
      ruleFixers: {},
      coverage: { include: ['**/*.ts'] },
      ruleCapabilities: {
        'sample-rule': {
          speed: 'light',
          phase: 'setup',
          md: false,
          ast: false,
          changedOnly: false,
          critical: false
        }
      },
      projectRoot
    });
  }

  public override async runAudit(): Promise<void> {
    // no-op for config test
  }
}

describe('Dynamic Agnostic Sub-auditor Configuration Invariant', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auditor-dynamic-test-'));
    resetAuditConfig();
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('automatically detects and injects missing scalar properties into an existing section', async () => {
    // Config has dynamicFeature, but is missing enableSafetyLock and tier and subSettings
    const initialConfig = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';

export default defineAuditConfig({
  name: 'test-app',
  paths: { srcRoots: ['src'] },
  dynamicFeature: {
    enabled: true
  }
});
`;
    const configPath = path.join(tempDir, '.auditor', 'audit.config.ts');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, initialConfig, 'utf-8');

    const sampleAuditor = new DynamicSampleAuditor(tempDir);
    const taskDef = {
      id: sampleAuditor.id,
      name: sampleAuditor.name,
      family: sampleAuditor.family,
      scriptPath: 'scripts/validate_dynamic_sample.ts',
      command: 'node',
      args: [],
      configKey: sampleAuditor.configKey,
      defaultConfig: sampleAuditor.defaultConfig,
      criticalConfig: sampleAuditor.criticalConfig
    };

    const validator = new ValidateAuditConfigAuditor({ projectRoot: tempDir, tasks: [taskDef] });

    // 1. Check mode must report missing scalar properties and sub-settings
    const checkResult = await validator.audit();
    expect(checkResult.status).toBe('failed');
    const missingFindings = checkResult.findings.filter(
      (f) => f.ruleId === 'audit-config-missing-section'
    );
    expect(missingFindings.some((f) => f.context === 'dynamicFeature.enableSafetyLock')).toBe(true);
    expect(missingFindings.some((f) => f.context === 'dynamicFeature.tier')).toBe(true);
    expect(missingFindings.some((f) => f.context?.startsWith('dynamicFeature.subSettings'))).toBe(
      true
    );

    // 2. Fix mode must auto-inject missing properties into the existing dynamicFeature block via AST
    resetAuditConfig();
    const fixValidator = new ValidateAuditConfigAuditor({ projectRoot: tempDir, tasks: [taskDef] });
    await fixValidator.fix();

    const updatedCode = await fs.readFile(configPath, 'utf-8');
    expect(updatedCode).toContain('enableSafetyLock: true');
    expect(updatedCode).toContain("tier: 'ultra'");
    expect(updatedCode).toContain('enforceStrict: true');
    expect(updatedCode).toContain('limit: 42');

    // 3. Re-check must pass cleanly
    resetAuditConfig();
    const recheckValidator = new ValidateAuditConfigAuditor({
      projectRoot: tempDir,
      tasks: [taskDef]
    });
    const recheckResult = await recheckValidator.audit();
    const remainingMissing = recheckResult.findings.filter(
      (f) => f.ruleId === 'audit-config-missing-section' && f.context?.startsWith('dynamicFeature')
    );
    expect(remainingMissing).toHaveLength(0);
  });

  it('automatically detects and injects a completely missing section declared by a subauditor', async () => {
    // Config does NOT have dynamicFeature at all
    const initialConfig = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';

export default defineAuditConfig({
  name: 'test-app',
  paths: { srcRoots: ['src'] }
});
`;
    const configPath = path.join(tempDir, '.auditor', 'audit.config.ts');
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, initialConfig, 'utf-8');

    const sampleAuditor = new DynamicSampleAuditor(tempDir);
    const taskDef = {
      id: sampleAuditor.id,
      name: sampleAuditor.name,
      family: sampleAuditor.family,
      scriptPath: 'scripts/validate_dynamic_sample.ts',
      command: 'node',
      args: [],
      configKey: sampleAuditor.configKey,
      defaultConfig: sampleAuditor.defaultConfig,
      criticalConfig: sampleAuditor.criticalConfig
    };

    const validator = new ValidateAuditConfigAuditor({ projectRoot: tempDir, tasks: [taskDef] });

    // 1. Check mode must report missing section
    const checkResult = await validator.audit();
    expect(checkResult.status).toBe('failed');
    const missingFindings = checkResult.findings.filter(
      (f) => f.ruleId === 'audit-config-missing-section'
    );
    expect(missingFindings.some((f) => f.context === 'dynamicFeature')).toBe(true);

    // 2. Fix mode must auto-inject dynamicFeature with all defaults
    resetAuditConfig();
    const fixValidator = new ValidateAuditConfigAuditor({ projectRoot: tempDir, tasks: [taskDef] });
    await fixValidator.fix();

    const updatedCode = await fs.readFile(configPath, 'utf-8');
    expect(updatedCode).toContain('dynamicFeature:');
    expect(updatedCode).toContain('enableSafetyLock: true');
    expect(updatedCode).toContain("tier: 'ultra'");
    expect(updatedCode).toContain('subSettings:');
    expect(updatedCode).toContain('enforceStrict: true');
    expect(updatedCode).toContain('limit: 42');

    // 3. Re-check must pass cleanly
    resetAuditConfig();
    const recheckValidator = new ValidateAuditConfigAuditor({
      projectRoot: tempDir,
      tasks: [taskDef]
    });
    const recheckResult = await recheckValidator.audit();
    const remainingMissing = recheckResult.findings.filter(
      (f) => f.ruleId === 'audit-config-missing-section' && f.context?.startsWith('dynamicFeature')
    );
    expect(remainingMissing).toHaveLength(0);
  });
});

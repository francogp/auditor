import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { initProject } from '../src/cli/init_project.ts';
import { ValidatePackageScriptsAuditor } from '../src/suites/architecture/validate_package_scripts.ts';
import { TestFragmentationAuditor } from '../src/suites/architecture/validate_test_fragmentation.ts';
import { ValidateTsconfigAuditor } from '../src/suites/architecture/validate_tsconfig.ts';
import { ZIndexAuditor } from '../src/suites/architecture/validate_z_index.ts';
import { AgentsConfigMandateAuditor } from '../src/suites/documentation/validate_agents_config_mandate.ts';
import { MarkdownSyntaxAuditor } from '../src/suites/documentation/validate_markdown_syntax.ts';

describe('Fresh Project (Day 0) Initialization & Tolerance', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auditor-day0-test-'));
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('initializes a virgin project cleanly without errors', async () => {
    // 1. Run initProject on completely empty directory
    const result = await initProject({
      projectRoot: tempDir,
      install: false,
      quiet: true
    });

    expect(result.packageCreated).toBe(true);
    expect(result.agentsCreated).toBe(true);
    expect(result.tsconfigCreated).toBe(true);
    expect(result.configBootstrapped).toBe(true);

    // 2. Verify package.json ESM compliance
    const pkg = JSON.parse(fs.readFileSync(path.join(tempDir, 'package.json'), 'utf-8'));
    expect(pkg.type).toBe('module');
    expect(pkg.scripts.auditor).toBeDefined();

    // 3. Verify AGENTS.md has all required local contracts
    const agentsMd = fs.readFileSync(path.join(tempDir, 'AGENTS.md'), 'utf-8');
    expect(agentsMd).toContain('Local Contracts');
    expect(agentsMd).toContain('PreToolUse');

    // 4. Verify tsconfig.json has allowImportingTsExtensions and noEmit
    const tsconfig = JSON.parse(fs.readFileSync(path.join(tempDir, 'tsconfig.json'), 'utf-8'));
    expect(tsconfig.compilerOptions.allowImportingTsExtensions).toBe(true);
    expect(tsconfig.compilerOptions.noEmit).toBe(true);

    // 5. Verify minimal src and tests scaffolding exist
    expect(fs.existsSync(path.join(tempDir, 'src/index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'tests/index.test.ts'))).toBe(true);
  });

  it('passes all Day 0 sub-auditors without false positive blocking errors', async () => {
    await initProject({
      projectRoot: tempDir,
      install: false,
      quiet: true
    });

    // Sub-Auditor 1: validate_z_index (should NOT fail with z-index-read-error on project without SCSS)
    const zIndexAuditor = new ZIndexAuditor({ projectRoot: tempDir });
    await zIndexAuditor.runAudit();
    const zErrors = zIndexAuditor.getFindings().filter((v) => v.severity === 'error');
    expect(zErrors).toHaveLength(0);

    // Sub-Auditor 2: validate_package_scripts (should NOT fail on virgin git repo without commits)
    const scriptsAuditor = new ValidatePackageScriptsAuditor({ projectRoot: tempDir });
    await scriptsAuditor.runAudit();
    const scriptsErrors = scriptsAuditor
      .getFindings()
      .filter((v) => v.ruleId === 'package-scripts-invalid-production-ref');
    expect(scriptsErrors).toHaveLength(0);

    // Sub-Auditor 3: validate_markdown_syntax (should NOT trigger coverage-dormant-rule when no fenced blocks)
    const mdAuditor = new MarkdownSyntaxAuditor({ projectRoot: tempDir });
    await mdAuditor.runAudit();
    const mdErrors = mdAuditor.getFindings().filter((v) => v.severity === 'error');
    expect(mdErrors).toHaveLength(0);

    // Sub-Auditor 4: validate_test_fragmentation (should NOT penalize initial micro-test)
    const fragAuditor = new TestFragmentationAuditor({ projectRoot: tempDir });
    await fragAuditor.runAudit();
    const fragErrors = fragAuditor
      .getFindings()
      .filter((v) => v.ruleId === 'no-fragmented-tests' && v.severity === 'error');
    expect(fragErrors).toHaveLength(0);

    // Sub-Auditor 5: validate_agents_config_mandate
    const agentsAuditor = new AgentsConfigMandateAuditor({ projectRoot: tempDir });
    await agentsAuditor.runAudit();
    const agentsErrors = agentsAuditor.getFindings().filter((v) => v.severity === 'error');
    expect(agentsErrors).toHaveLength(0);

    // Sub-Auditor 6: validate_tsconfig
    const tsconfigAuditor = new ValidateTsconfigAuditor({ projectRoot: tempDir });
    await tsconfigAuditor.runAudit();
    const tsErrors = tsconfigAuditor.getFindings().filter((v) => v.severity === 'error');
    expect(tsErrors).toHaveLength(0);
  });
});

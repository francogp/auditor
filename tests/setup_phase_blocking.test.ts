import { describe, it, expect } from 'vite-plus/test';

import { sortTasksByOrder, resolveFixOrderWeight } from '../src/cli/audit_full.ts';
import { AUDIT_EXECUTION_PHASES } from '../src/core/auditContract.ts';
import { renderSetupBlockingBanner } from '../src/core/unifiedTheme.ts';
import { ValidateAuditConfigAuditor } from '../src/suites/architecture/validate_audit_config.ts';
import { ValidateDependencyMinimumsAuditor } from '../src/suites/architecture/validate_dependency_minimums.ts';
import { ValidateDependencyVulnerabilitiesAuditor } from '../src/suites/architecture/validate_dependency_vulnerabilities.ts';
import { ValidateDockerConfigAuditor } from '../src/suites/architecture/validate_docker_config.ts';
import { ValidateEditorconfigAuditor } from '../src/suites/architecture/validate_editorconfig.ts';
import { ValidateEnvironmentEnginesAuditor } from '../src/suites/architecture/validate_environment_engines.ts';
import { ValidateFallowConfigAuditor } from '../src/suites/architecture/validate_fallow_config.ts';
import { ValidateGitConfigAuditor } from '../src/suites/architecture/validate_git_config.ts';
import { ValidateHtmlValidateConfigAuditor } from '../src/suites/architecture/validate_html_validate_config.ts';
import { ValidateNpmrcConfigAuditor } from '../src/suites/architecture/validate_npmrc_config.ts';
import { ValidatePackageHygieneAuditor } from '../src/suites/architecture/validate_package_hygiene.ts';
import { ValidatePackageScriptsAuditor } from '../src/suites/architecture/validate_package_scripts.ts';
import { ValidatePlaywrightConfigAuditor } from '../src/suites/architecture/validate_playwright_config.ts';
import { ValidateScriptCommandsAuditor } from '../src/suites/architecture/validate_script_commands.ts';
import { ValidateScriptExtensionsAuditor } from '../src/suites/architecture/validate_script_extensions.ts';
import { ValidateStylelintConfigAuditor } from '../src/suites/architecture/validate_stylelint_config.ts';
import { ValidateTsconfigAuditor } from '../src/suites/architecture/validate_tsconfig.ts';
import { ValidateVitePlusConfigAuditor } from '../src/suites/architecture/validate_vite_plus_config.ts';
import { AgentsConfigMandateAuditor } from '../src/suites/documentation/validate_agents_config_mandate.ts';
import { ValidateMarkdownLintConfigAuditor } from '../src/suites/documentation/validate_markdown_lint_config.ts';

describe('Setup Phase Contract & Imperative Blocking', () => {
  it('includes "setup" in AUDIT_EXECUTION_PHASES', () => {
    expect(AUDIT_EXECUTION_PHASES).toContain('setup');
  });

  it('guarantees all 20 canonical setup suites declare phase: "setup"', () => {
    const suites = [
      new ValidateAuditConfigAuditor(),
      new ValidateTsconfigAuditor(),
      new ValidateVitePlusConfigAuditor(),
      new ValidateStylelintConfigAuditor(),
      new ValidateFallowConfigAuditor(),
      new ValidateHtmlValidateConfigAuditor(),
      new ValidatePlaywrightConfigAuditor(),
      new ValidateDockerConfigAuditor(),
      new ValidateEditorconfigAuditor(),
      new ValidateNpmrcConfigAuditor(),
      new ValidateGitConfigAuditor(),
      new ValidateEnvironmentEnginesAuditor(),
      new ValidateDependencyMinimumsAuditor(),
      new ValidateDependencyVulnerabilitiesAuditor(),
      new ValidatePackageHygieneAuditor(),
      new ValidatePackageScriptsAuditor(),
      new ValidateScriptCommandsAuditor(),
      new ValidateScriptExtensionsAuditor(),
      new ValidateMarkdownLintConfigAuditor(),
      new AgentsConfigMandateAuditor()
    ];

    expect(suites).toHaveLength(20);
    for (const suite of suites) {
      const manifest = suite.toManifest();
      expect(manifest.capabilities.phase).toBe('setup');
    }
  });

  it('renders prominent imperative setup blocking banner with red border and correct counts', () => {
    const banner = renderSetupBlockingBanner(5, 1200);
    expect(banner).toContain('BLOQUEO CRÍTICO');
    expect(banner).toContain('CONFIGURACIÓN Y PROYECTO (FASE SETUP)');
    expect(banner).toContain('5');
    expect(banner).toContain('1.200');
    expect(banner).toContain('ESTOS ERRORES DEBEN REPARARSE PRIMERO');
    expect(banner).toContain('npm run auditor:fix');
  });

  it('renders contextual npm install instructions when lockfile mismatch exists', () => {
    const banner = renderSetupBlockingBanner(2, 50, { hasLockfileMismatch: true });
    expect(banner).toContain('npm install');
    expect(banner).toContain('Paso 1 imperativo — Sincroniza dependencias con el lockfile');
    expect(banner).toContain('Paso 2 posterior — Ejecuta la auto-reparación del auditor');
    expect(banner).toContain('npm run auditor:fix');
  });

  it('renders contextual nvm/fnm instructions when engine mismatch exists', () => {
    const banner = renderSetupBlockingBanner(1, 10, { hasEngineMismatch: true });
    expect(banner).toContain('nvm use / fnm use');
    expect(banner).toContain('Sincroniza la versión del motor de ejecución');
  });

  it('renders guide consultation instruction when errors are not auto-fixable', () => {
    const banner = renderSetupBlockingBanner(1, 0, { hasFixableErrors: false });
    expect(banner).toContain('npm run auditor:guide -- <ruleId>');
    expect(banner).toContain('Resuelve los errores de configuración');
  });

  it('strictly executes setup phase suites before all application and linter suites in fix mode', () => {
    const tasks: any[] = [
      {
        id: 'validate_oxfmt',
        name: 'Oxfmt Formatter',
        family: 'architecture',
        scriptPath: '',
        args: [],
        capabilities: { phase: 'normal', fix: 'normal' }
      },
      {
        id: 'validate_stylelint',
        name: 'Stylelint',
        family: 'architecture',
        scriptPath: '',
        args: [],
        capabilities: { phase: 'normal', fix: 'priority' }
      },
      {
        id: 'validate_audit_config',
        name: 'Audit Config',
        family: 'architecture',
        scriptPath: '',
        args: [],
        capabilities: { phase: 'setup', fix: 'priority' }
      },
      {
        id: 'validate_tsconfig',
        name: 'TS Config',
        family: 'architecture',
        scriptPath: '',
        args: [],
        capabilities: { phase: 'setup', fix: 'priority' }
      },
      {
        id: 'custom_setup_extension',
        name: 'Custom Setup Extension',
        family: 'architecture',
        scriptPath: '',
        args: [],
        capabilities: { phase: 'setup', fix: 'priority' }
      }
    ];

    sortTasksByOrder(tasks, true);

    const setupIndices = tasks
      .map((t, idx) => (t.capabilities.phase === 'setup' ? idx : -1))
      .filter((idx) => idx !== -1);
    const nonSetupIndices = tasks
      .map((t, idx) => (t.capabilities.phase !== 'setup' ? idx : -1))
      .filter((idx) => idx !== -1);

    const maxSetupIndex = Math.max(...setupIndices);
    const minNonSetupIndex = Math.min(...nonSetupIndices);

    expect(maxSetupIndex).toBeLessThan(minNonSetupIndex);
    expect(resolveFixOrderWeight(tasks[0])).toBeLessThan(200);
  });
});

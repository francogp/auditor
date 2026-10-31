import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vite-plus/test';

import { collectAllPackageScriptRequirements } from '../src/cli/auditScanner.ts';
import { migrateLegacyAuditConfig } from '../src/cli/migrateAuditConfig.ts';
import {
  resetAuditConfig,
  defineAuditConfig,
  assertNoLegacyRootConfig,
  loadAuditConfig
} from '../src/core/auditConfig.ts';
import { GitIgnoreRegistry } from '../src/core/gitIgnoreRegistry.ts';
import { PackageScriptRegistry } from '../src/core/packageScriptRegistry.ts';
import { toPosixPath } from '../src/core/safePath.ts';
import { ValidateAuditConfigAuditor } from '../src/suites/architecture/validate_audit_config.ts';

const AUDIT_CONFIG_MODULE_PATH = toPosixPath(
  path.resolve(import.meta.dirname, '../src/core/auditConfig.ts')
);
const BASE_AUDITOR_PATH = toPosixPath(
  path.resolve(import.meta.dirname, '../src/core/auditorBase.ts')
);

const BASE_TEST_CONFIG_SECTIONS = `
  persistence: { engine: 'none', schemaQualified: false },
  styles: { enabled: false, zLayersEnabled: false },
  stylelint: { enabled: false },
  valibot: { enabled: true, targets: [] },
  oxlint: { enabled: true },
  oxfmt: { enabled: true },
  vitePlusConfig: { enabled: true, precompress: { enabled: false } },
  htmlValidate: { enabled: true },
  pinia: { enabled: false },
  domain: { enabled: false },
  bundle: { enabled: false },
  fallow: { enabled: false },
  packageDistribution: { enabled: false },
  packageHygiene: { enabled: false },
  accessibility: { enabled: false },
  typeCoverage: { enabled: false },
  testCoverage: { enabled: false },
  secretLeaks: { enabled: false },
  dependencyVulnerabilities: { enabled: false },
  constants: { enabled: false },
  documentation: { enabled: false },
  templates: { requireInputIds: false },
  agentPlugin: { enabled: false },
  environment: { enabled: false },
  coverage: { enabled: false },
  auditorHygiene: { enabled: false },
  packageScripts: { enabled: true, enforceBuildAudit: true, recommendedScripts: true },
  scriptExtensions: { enabled: false },
  webPerformance: { enabled: false },
  queryPerformance: { enabled: false },
  securityHardening: { enabled: false },
  codeSimplification: { enabled: false },
  scssArchitecture: { enabled: false },
  animation: { enabled: false },
  types: { enabled: false },
  dox: { enabled: false },
  encoding: { enabled: false }
`;

describe('ValidateAuditConfigAuditor', () => {
  let tempDir: string;
  let baselinePackageJson: string;

  beforeAll(async () => {
    const baselineScripts: Record<string, string> = {
      build: 'npm run auditor:full && vite build && npm run auditor:post-build'
    };
    const allReqs = await collectAllPackageScriptRequirements(process.cwd());
    for (const req of allReqs) {
      baselineScripts[req.name] = req.command;
    }
    baselinePackageJson =
      JSON.stringify(
        {
          name: 'test-app',
          scripts: baselineScripts
        },
        null,
        2
      ) + '\n';
  });

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    resetAuditConfig();
    GitIgnoreRegistry.reset();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-config-test-'));

    // Baseline valid .gitignore with standard tool caches so path tests isolate cleanly
    await fs.writeFile(
      path.join(tempDir, '.gitignore'),
      'node_modules/\nscratch/\n.oxlintcache\n.stylelintcache\n.fallow/\ndist/\ndev-dist/\ncoverage/\n.vitest-cache/\ntest-results/\n.tsbuildinfo\n*.log\n',
      'utf-8'
    );

    await fs.writeFile(path.join(tempDir, 'package.json'), baselinePackageJson, 'utf-8');
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    GitIgnoreRegistry.reset();
    PackageScriptRegistry.reset();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('instantiates with correct metadata conforming to BaseAuditor contracts', () => {
    const auditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    expect(auditor.id).toBe('validate_audit_config');
    expect(auditor.family).toBe('architecture');
    expect(auditor.ruleIds).toEqual([
      'audit-config-missing-path',
      'audit-config-missing-file',
      'audit-config-invalid-extension',
      'audit-config-missing-gitignore-entry',
      'audit-config-missing-section',
      'audit-config-unknown-field',
      'audit-config-critical-violation',
      'audit-config-unacknowledged-degradation',
      'audit-config-ratchet-relaxation'
    ]);
  });

  it('reports an error when audit.config.ts is missing from project root', async () => {
    const auditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    const result = await auditor.audit();

    expect(result.status).toBe('failed');
    expect(result.summary.errors).toBe(1);
    const missingFinding = result.findings.find((f) => f.ruleId === 'audit-config-missing-file');
    expect(missingFinding).toBeDefined();
    expect(missingFinding?.message).toContain('.auditor/audit.config.ts does not exist');
  });

  it('scaffolds default .auditor/audit.config.ts when missing in fix mode', async () => {
    const configPath = path.join(tempDir, '.auditor', 'audit.config.ts');
    expect(
      await fs
        .access(configPath)
        .then(() => true)
        .catch(() => false)
    ).toBe(false);

    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'tests'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'scripts'), { recursive: true });

    const auditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    await auditor.fix();

    expect(
      await fs
        .access(configPath)
        .then(() => true)
        .catch(() => false)
    ).toBe(true);
    const content = await fs.readFile(configPath, 'utf-8');
    expect(content).toContain('defineAuditConfig');
    expect(content).toContain("language: 'en'");
  });

  it('reports an error when .gitignore is missing from project root', async () => {
    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'test-app',
  paths: { srcRoots: ['src'] },
  persistence: { engine: 'none', schemaQualified: false },
  styles: { zLayersEnabled: false }
});
    `;
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.unlink(path.join(tempDir, '.gitignore'));

    const auditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    const result = await auditor.audit();

    expect(result.status).toBe('failed');
    const missingGitignore = result.findings.find(
      (f) => f.file === '.gitignore' && f.ruleId === 'audit-config-missing-file'
    );
    expect(missingGitignore).toBeDefined();
    expect(missingGitignore?.message).toContain('.gitignore does not exist');
  });

  it('reports errors when required submodule entries are missing from .gitignore', async () => {
    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'test-app',
  paths: { srcRoots: ['src'] },
  persistence: { engine: 'none', schemaQualified: false },
  styles: { zLayersEnabled: false }
});
    `;
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    // Incomplete .gitignore with only node_modules
    await fs.writeFile(path.join(tempDir, '.gitignore'), 'node_modules/\n', 'utf-8');

    const auditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    const result = await auditor.audit();

    expect(result.status).toBe('failed');
    const missingEntries = result.findings.filter(
      (f) => f.ruleId === 'audit-config-missing-gitignore-entry'
    );
    expect(missingEntries.length).toBeGreaterThan(0);
    const contexts = missingEntries.map((f) => f.context);
    expect(contexts).toContain('scratch/');
    expect(contexts).toContain('.oxlintcache');
    expect(contexts).toContain('*.log');
  });

  it('automatically repairs .gitignore when fix mode is requested', async () => {
    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'test-app',
  paths: { srcRoots: ['src'] },
  persistence: { engine: 'none', schemaQualified: false },
  styles: { zLayersEnabled: false }
});
    `;
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.gitignore'), 'node_modules/\n', 'utf-8');

    const auditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    await auditor.fix();

    const repairedContent = await fs.readFile(path.join(tempDir, '.gitignore'), 'utf-8');
    expect(repairedContent).toContain('scratch/');
    expect(repairedContent).toContain('.oxlintcache');
    expect(repairedContent).toContain('*.log');

    // Re-running in normal mode should pass without gitignore errors
    const checkAuditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    const checkResult = await checkAuditor.audit();
    const gitignoreFindings = checkResult.findings.filter(
      (f) => f.ruleId === 'audit-config-missing-gitignore-entry'
    );
    expect(gitignoreFindings.length).toBe(0);
  });

  it('dynamically collects and enforces gitignore requirements from user-extended subauditor modules', async () => {
    const extensionCode = `
import { BaseAuditor } from '${BASE_AUDITOR_PATH}';

export class CustomExtAuditor extends BaseAuditor {
  public static readonly gitIgnoreEntries = [
    {
      id: 'custom-tool-cache',
      pattern: '.custom-tool-cache/',
      reason: 'Caché de herramienta extendida por el usuario'
    }
  ];

  constructor(options: { projectRoot?: string } = {}) {
    super({
      ruleFixers: {},
      id: 'validate_custom_tool',
      name: 'Custom Tool Validator',
      description: 'Valida herramientas del usuario',
      family: 'architecture',
      packageName: 'CustomTool',
      icon: '🔧',
      configKey: 'paths',
      defaultConfig: {},
      requiredPermissions: [],
      criticalConfig: {},
      usesThirdPartyTool: false,
      ruleIds: ['custom-tool-rule'],
      ruleDescriptions: {
        'custom-tool-rule': 'Regla de herramienta custom'
      },
      ruleRemediations: {
        'custom-tool-rule': 'Soluciona custom-tool-rule.'
      },
      ruleRemediationPhases: {
        'custom-tool-rule': 'setup'
      },
      ruleCapabilities: {
        'custom-tool-rule': {
          speed: 'light',
          phase: 'normal',
          md: false,
          ast: false,
          changedOnly: false,
          critical: false
        }
      },
      coverage: { include: ['src/**'] },
      gitIgnoreEntries: CustomExtAuditor.gitIgnoreEntries
    });
  }

  public override async runAudit(): Promise<void> {}
}
    `;
    await fs.mkdir(path.join(tempDir, 'scripts'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'scripts/custom_ext.ts'), extensionCode, 'utf-8');

    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'test-app',
  paths: { srcRoots: ['src'] },
  ${BASE_TEST_CONFIG_SECTIONS},
  extensions: ['scripts/custom_ext.ts']
});
    `;
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    // .gitignore currently only has baseline entries, missing .custom-tool-cache/
    const auditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    const result = await auditor.audit();

    expect(result.status).toBe('failed');
    const customMissing = result.findings.find((f) => f.context === '.custom-tool-cache/');
    expect(customMissing).toBeDefined();
    expect(customMissing?.ruleId).toBe('audit-config-missing-gitignore-entry');
    expect(customMissing?.message).toContain('Caché de herramienta extendida por el usuario');

    // Fix mode appends the extension requirement to .gitignore
    const fixAuditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    await fixAuditor.fix();

    const repairedContent = await fs.readFile(path.join(tempDir, '.gitignore'), 'utf-8');
    expect(repairedContent).toContain('.custom-tool-cache/');

    // Re-verify clean run
    const verifyAuditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    const verifyResult = await verifyAuditor.audit();
    expect(verifyResult.summary.errors).toBe(0);
    expect(verifyResult.status).toBe('passed');
  });

  it('detects non-existent directories declared in paths', async () => {
    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'test-app',
  paths: {
    srcRoots: ['src', 'non_existent_src'],
    testRoots: ['tests'],
    componentsRoots: ['src/non_existent_components']
  },
  ${BASE_TEST_CONFIG_SECTIONS}
});
    `;
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), configContent, 'utf-8');

    // Create only 'src' and 'tests', leaving 'non_existent_src' and 'src/non_existent_components' missing
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'tests'), { recursive: true });

    const auditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    const result = await auditor.audit();

    expect(result.status).toBe('failed');
    expect(result.summary.errors).toBe(2);

    const missingPaths = result.findings
      .filter((f) => f.ruleId === 'audit-config-missing-path')
      .map((f) => f.context);
    expect(missingPaths).toContain('non_existent_src');
    expect(missingPaths).toContain('src/non_existent_components');
  });

  it('detects non-existent persistence files and migrations directory', async () => {
    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'test-app',
  paths: {
    srcRoots: ['src'],
    migrationsDir: 'supabase/migrations'
  },
  persistence: {
    engine: 'supabase',
    schemaQualified: true,
    authorizedSaveFiles: ['src/stores/authStore.ts', 'src/missing_store.ts']
  },
  styles: { zLayersEnabled: false }
});
    `;
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src/stores'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'src/stores/authStore.ts'), '// auth', 'utf-8');

    const auditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    const result = await auditor.audit();

    expect(result.status).toBe('failed');
    const missingMigration = result.findings.find((f) => f.context === 'supabase/migrations');
    expect(missingMigration).toBeDefined();

    const missingSaveFile = result.findings.find((f) => f.context === 'src/missing_store.ts');
    expect(missingSaveFile).toBeDefined();
    expect(missingSaveFile?.ruleId).toBe('audit-config-missing-file');
  });

  it('detects non-existent extensions and style files', async () => {
    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'test-app',
  paths: {
    srcRoots: ['src']
  },
  persistence: { engine: 'none', schemaQualified: false },
  styles: {
    zLayersEnabled: true,
    baseScssFile: 'src/styles/missing_base.scss'
  },
  extensions: ['scripts/auditors/missing_ext.ts']
});
    `;
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    const auditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    const result = await auditor.audit();

    expect(result.status).toBe('failed');
    const extFinding = result.findings.find((f) => f.ruleId === 'audit-config-invalid-extension');
    expect(extFinding).toBeDefined();
    expect(extFinding?.context).toBe('scripts/auditors/missing_ext.ts');

    const scssFinding = result.findings.find((f) => f.context === 'src/styles/missing_base.scss');
    expect(scssFinding).toBeDefined();
    expect(scssFinding?.ruleId).toBe('audit-config-missing-file');
  });

  it('passes cleanly with zero errors when all configured paths exist on disk', async () => {
    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'valid-app',
  paths: {
    srcRoots: ['src'],
    testRoots: ['tests'],
    cliRoots: ['src/cli'],
    componentsRoots: ['src/components'],
    migrationsDir: 'migrations'
  },
  ${BASE_TEST_CONFIG_SECTIONS},
  persistence: {
    enabled: true,
    engine: 'sqlite',
    schemaQualified: false,
    authorizedSaveFiles: ['src/save.ts']
  },
  styles: {
    enabled: true,
    enforceScss: true,
    zLayersEnabled: true,
    baseScssFile: 'src/styles/_base.scss'
  },
  extensions: ['scripts/custom.ts']
});
    `;
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src/cli'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'src/components'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'src/styles'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'tests'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'migrations'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'scripts'), { recursive: true });

    await fs.writeFile(path.join(tempDir, 'src/save.ts'), '// save', 'utf-8');
    await fs.writeFile(path.join(tempDir, 'src/styles/_base.scss'), '// base scss', 'utf-8');
    await fs.writeFile(
      path.join(tempDir, 'scripts/custom.ts'),
      `
import { BaseAuditor } from '${BASE_AUDITOR_PATH}';
export default class CustomAuditor extends BaseAuditor<'custom-rule'> {
  constructor(options: { projectRoot?: string } = {}) {
    super({
      ruleFixers: {},
      id: 'custom',
      name: 'Custom Auditor',
      description: 'Custom Auditor desc',
      family: 'architecture',
      packageName: 'Custom',
      icon: '🔧',
      configKey: 'paths',
      defaultConfig: {},
      requiredPermissions: [],
      criticalConfig: {},
      usesThirdPartyTool: false,
      ruleCapabilities: {
        'custom-rule': { speed: 'light', phase: 'normal', md: false, ast: false, changedOnly: false, critical: false }
      },
      ruleIds: ['custom-rule'],
      ruleDescriptions: { 'custom-rule': 'Desc' },
      ruleRemediations: { 'custom-rule': 'Remediacion' },
      ruleRemediationPhases: { 'custom-rule': 'setup' },
      coverage: { include: ['src/**'] },
      projectRoot: options.projectRoot
    });
  }
  public override async runAudit() {}
}
`,
      'utf-8'
    );

    const auditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    const result = await auditor.audit();

    // Mandatory clean path verification per Hermetic Testing Mandate
    expect(result.summary.errors).toBe(0);
    expect(result.summary.warnings).toBe(0);
    expect(result.status).toBe('passed');
    expect(result.findings.length).toBe(0);
  });

  it('reports audit-config-invalid-extension when extension misses remediationPhase contract', async () => {
    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'test-app',
  paths: { srcRoots: ['src'] },
  extensions: ['./scripts/auditors/invalid_extension.ts'],
  ${BASE_TEST_CONFIG_SECTIONS}
});
    `;
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'scripts', 'auditors'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, 'scripts', 'auditors', 'invalid_extension.ts'),
      `
import { BaseAuditor } from '${BASE_AUDITOR_PATH}';
export class InvalidAuditor extends BaseAuditor {
  constructor(options: { projectRoot?: string } = {}) {
    super({
      id: 'invalid_ext',
      name: 'Invalid',
      description: 'Desc',
      family: 'architecture',
      packageName: 'Invalid',
      configKey: 'paths',
      defaultConfig: {},
      requiredPermissions: [],
      criticalConfig: {},
      usesThirdPartyTool: false,
      ruleCapabilities: {},
      ruleIds: [],
      ruleDescriptions: {},
      ruleRemediations: {},
      projectRoot: options.projectRoot
    });
  }
  public override async runAudit() {}
}
`,
      'utf-8'
    );

    const auditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    const result = await auditor.audit();

    expect(result.status).toBe('failed');
    const finding = result.findings.find((f) => f.ruleId === 'audit-config-invalid-extension');
    expect(finding).toBeDefined();
    expect(finding?.message).toContain("missing mandatory 'remediationPhase'");
  });

  it('throws a loud error when ratchet.baselineFile escapes the project or is not JSON', () => {
    expect(() =>
      defineAuditConfig({ name: 'x', ratchet: { baselineFile: '../baseline.json' } })
    ).toThrow(/ratchet\.baselineFile/);
    expect(() =>
      defineAuditConfig({ name: 'x', ratchet: { baselineFile: 'baseline.txt' } })
    ).toThrow(/ratchet\.baselineFile/);
    expect(() =>
      defineAuditConfig({ name: 'x', ratchet: { productionRef: '--upload-pack=x' } })
    ).toThrow(/ratchet\.productionRef/);
  });

  it('throws a loud error when packageScripts.recommendedScripts is not a boolean (e.g. string "off")', () => {
    expect(() => {
      defineAuditConfig({
        name: 'invalid-app',
        paths: { srcRoots: ['src'] },
        persistence: { engine: 'none', schemaQualified: false },
        styles: { zLayersEnabled: false },
        packageScripts: { recommendedScripts: 'off' as unknown as boolean }
      });
    }).toThrow(/Type error in 'packageScripts\.recommendedScripts'/);
  });

  it('throws a loud error when accessibility.rules contains non-boolean values', () => {
    expect(() => {
      defineAuditConfig({
        name: 'invalid-app',
        paths: { srcRoots: ['src'] },
        persistence: { engine: 'none', schemaQualified: false },
        styles: { zLayersEnabled: false },
        accessibility: { rules: { 'alt-text': 'off' as unknown as boolean } }
      });
    }).toThrow(/Error de tipo en 'accessibility\.rules\.alt-text'/);
  });

  it('reports errors when required configuration sections are missing from audit.config.ts', async () => {
    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'test-app',
  paths: { srcRoots: ['src'] }
});
    `;
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    const auditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    const result = await auditor.audit();

    expect(result.status).toBe('failed');
    const missingSections = result.findings.filter(
      (f) => f.ruleId === 'audit-config-missing-section'
    );
    expect(missingSections.length).toBeGreaterThan(0);
    expect(missingSections.some((f) => f.context === 'valibot')).toBe(true);
    expect(missingSections.some((f) => f.context === 'oxlint')).toBe(true);
    expect(missingSections.some((f) => f.context === 'pinia')).toBe(true);
    expect(missingSections.some((f) => f.context === 'htmlValidate')).toBe(true);
  });

  it('automatically appends missing configuration sections in fix mode', async () => {
    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'test-app',
  paths: { srcRoots: ['src'] },
  ${BASE_TEST_CONFIG_SECTIONS}
});
    `;
    // Remove valibot from config
    const configWithoutValibot = configContent.replace(/valibot:\s*\{[^}]*\},/g, '');
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, '.auditor', 'audit.config.ts'),
      configWithoutValibot,
      'utf-8'
    );
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    // Verify it fails in check mode
    const checkAuditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    const checkResult = await checkAuditor.audit();
    expect(
      checkResult.findings.some(
        (f) => f.ruleId === 'audit-config-missing-section' && f.context === 'valibot'
      )
    ).toBe(true);

    // Run in fix mode
    resetAuditConfig();
    const fixAuditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    await fixAuditor.fix();

    // Verify valibot was added to audit.config.ts
    const updatedContent = await fs.readFile(
      path.join(tempDir, '.auditor', 'audit.config.ts'),
      'utf-8'
    );
    expect(updatedContent).toContain('valibot:');
    expect(updatedContent).toContain('enabled: true');

    // Re-run check mode: should pass cleanly
    resetAuditConfig();
    const recheckAuditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    const recheckResult = await recheckAuditor.audit();
    const valibotFinding = recheckResult.findings.find(
      (f) => f.ruleId === 'audit-config-missing-section' && f.context === 'valibot'
    );
    expect(valibotFinding).toBeUndefined();
  });

  it('automatically injects missing sub-configurations recursively in fix mode (e.g. precompress)', async () => {
    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'test-app',
  paths: { srcRoots: ['src'] },
  ${BASE_TEST_CONFIG_SECTIONS}
});
    `;
    // Replace vitePlusConfig to not have precompress
    const configWithoutPrecompress = configContent.replace(
      'vitePlusConfig: { enabled: true, precompress: { enabled: false } },',
      'vitePlusConfig: { enabled: true },'
    );
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, '.auditor', 'audit.config.ts'),
      configWithoutPrecompress,
      'utf-8'
    );
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    // Verify it fails in check mode detecting missing sub-configuration
    const checkAuditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    const checkResult = await checkAuditor.audit();
    const missingSubFinding = checkResult.findings.find(
      (f) =>
        f.ruleId === 'audit-config-missing-section' && f.context === 'vitePlusConfig.precompress'
    );
    expect(missingSubFinding).toBeDefined();
    expect(missingSubFinding?.message).toContain('vitePlusConfig.precompress');

    // Run in fix mode
    resetAuditConfig();
    const fixAuditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    await fixAuditor.fix();

    // Verify precompress was injected inside vitePlusConfig in audit.config.ts
    const updatedContent = await fs.readFile(
      path.join(tempDir, '.auditor', 'audit.config.ts'),
      'utf-8'
    );
    expect(updatedContent).toContain('precompress:');
    expect(updatedContent).toContain("server: 'nginx'");

    // Re-run check mode: should pass cleanly
    resetAuditConfig();
    const recheckAuditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    const recheckResult = await recheckAuditor.audit();
    const resolvedFinding = recheckResult.findings.find(
      (f) =>
        f.ruleId === 'audit-config-missing-section' && f.context === 'vitePlusConfig.precompress'
    );
    expect(resolvedFinding).toBeUndefined();
  });

  it('correctly handles trailing comments and missing commas when injecting sub-configurations', async () => {
    const configWithTrailingCommentNoComma = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'test-app',
  paths: { srcRoots: ['src'] },
  ${BASE_TEST_CONFIG_SECTIONS.replace(
    'vitePlusConfig: { enabled: true, precompress: { enabled: false } },',
    `vitePlusConfig: {
    enabled: true // Line comment without trailing comma
  },`
  )}
});
    `;
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, '.auditor', 'audit.config.ts'),
      configWithTrailingCommentNoComma,
      'utf-8'
    );
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    // Run in fix mode
    resetAuditConfig();
    const fixAuditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    await fixAuditor.fix();

    // Verify comma is placed before the comment, not at the end of the line
    const updatedContent = await fs.readFile(
      path.join(tempDir, '.auditor', 'audit.config.ts'),
      'utf-8'
    );
    expect(updatedContent).toContain('enabled: true, // Line comment without trailing comma');
    expect(updatedContent).toContain('precompress:');

    // Re-run check mode: should pass cleanly
    resetAuditConfig();
    const recheckAuditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    const recheckResult = await recheckAuditor.audit();
    const resolvedFinding = recheckResult.findings.find(
      (f) =>
        f.ruleId === 'audit-config-missing-section' && f.context === 'vitePlusConfig.precompress'
    );
    expect(resolvedFinding).toBeUndefined();
  });

  it('enforces required configuration section declared by host extensions', async () => {
    const extensionCode = `
import { BaseAuditor } from '${BASE_AUDITOR_PATH}';

export class CustomExtAuditor extends BaseAuditor {
  constructor(options: { projectRoot?: string } = {}) {
    super({
      ruleFixers: {},
      id: 'custom_ext_suite',
      name: 'Custom Ext Suite',
      description: 'Custom extension description',
      family: 'architecture',
      ruleIds: ['custom-rule'],
      packageName: 'Ext',
      icon: '🧩',
      coverage: { include: ['scripts/**'] },
      configKey: 'customExt.enabled',
      defaultConfig: { enabled: true, customOption: 'default_val' },
      requiredPermissions: [],
      criticalConfig: {},
      ruleCapabilities: {
        'custom-rule': { speed: 'light', phase: 'normal', md: false, ast: false, changedOnly: false, critical: false }
      },
      ruleDescriptions: { 'custom-rule': 'Regla de extension' },
      ruleRemediations: { 'custom-rule': 'Soluciona la regla custom-rule ajustando la configuración.' },
      ruleRemediationPhases: { 'custom-rule': 'setup' },
      usesThirdPartyTool: false,
      projectRoot: options?.projectRoot
    });
  }
  public override async runAudit(): Promise<void> {}
}
    `;
    await fs.mkdir(path.join(tempDir, 'scripts'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'scripts/custom_ext.ts'), extensionCode, 'utf-8');

    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'test-app',
  paths: { srcRoots: ['src'] },
  ${BASE_TEST_CONFIG_SECTIONS},
  extensions: ['scripts/custom_ext.ts']
});
    `;
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    // Extension declared, but customExt section is missing
    const auditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    const result = await auditor.audit();

    expect(result.status).toBe('failed');
    const extFinding = result.findings.find(
      (f) => f.ruleId === 'audit-config-missing-section' && f.context === 'customExt'
    );
    expect(extFinding).toBeDefined();
    expect(extFinding?.message).toContain('customExt');

    // Fix mode should auto-scaffold customExt section
    const fixAuditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    await fixAuditor.fix();

    const repairedContent = await fs.readFile(
      path.join(tempDir, '.auditor', 'audit.config.ts'),
      'utf-8'
    );
    expect(repairedContent).toContain('customExt:');
    expect(repairedContent).toContain('customOption');
  });

  it('detects unknown top-level sections and reports audit-config-unknown-field', async () => {
    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'test-app',
  paths: { srcRoots: ['src'] },
  ${BASE_TEST_CONFIG_SECTIONS},
  unknownLegacySection: { enabled: true }
});
    `;
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    const auditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    const result = await auditor.audit();

    expect(result.status).toBe('failed');
    const finding = result.findings.find(
      (f) => f.ruleId === 'audit-config-unknown-field' && f.context === 'unknownLegacySection'
    );
    expect(finding).toBeDefined();
    expect(finding?.message).toContain(
      'Unknown or legacy top-level section "unknownLegacySection"'
    );
  });

  it('detects legacy paths.constantsRoots and reports audit-config-unknown-field', async () => {
    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'test-app',
  paths: {
    srcRoots: ['src'],
    constantsRoots: ['src/constants']
  },
  ${BASE_TEST_CONFIG_SECTIONS}
});
    `;
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    const auditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    const result = await auditor.audit();

    expect(result.status).toBe('failed');
    const finding = result.findings.find(
      (f) => f.ruleId === 'audit-config-unknown-field' && f.context === 'paths.constantsRoots'
    );
    expect(finding).toBeDefined();
    expect(finding?.message).toContain('Unknown or legacy field "paths.constantsRoots"');
  });

  it('detects legacy constants.exemptGlobs and reports audit-config-unknown-field', async () => {
    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'test-app',
  paths: { srcRoots: ['src'] },
  constants: {
    exemptGlobs: ['src/**/*.ts']
  },
  ${BASE_TEST_CONFIG_SECTIONS.replace(/constants:\s*\{[^}]*\},/g, '')}
});
    `;
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    const auditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    const result = await auditor.audit();

    expect(result.status).toBe('failed');
    const finding = result.findings.find(
      (f) => f.ruleId === 'audit-config-unknown-field' && f.context === 'constants.exemptGlobs'
    );
    expect(finding).toBeDefined();
    expect(finding?.message).toContain('Unknown or legacy field "constants.exemptGlobs"');
  });

  it('detects unknown fields in bundle.budgets and reports audit-config-unknown-field', async () => {
    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'test-app',
  paths: { srcRoots: ['src'] },
  bundle: {
    enabled: true,
    budgets: [
      { pattern: 'index', maxBytes: 1200 * 1024 }
    ]
  },
  ${BASE_TEST_CONFIG_SECTIONS.replace(/bundle:\s*\{[^}]*\},/g, '')}
});
    `;
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    const auditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    const result = await auditor.audit();

    expect(result.status).toBe('failed');
    const finding = result.findings.find(
      (f) => f.ruleId === 'audit-config-unknown-field' && f.context === 'bundle.budgets.pattern'
    );
    expect(finding).toBeDefined();
    expect(finding?.message).toContain('Unknown field "bundle.budgets[0].pattern"');
  });

  it('detects unacknowledged coverage degradations when scripts contain code files', async () => {
    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'test-app',
  paths: {
    srcRoots: ['src'],
    testRoots: ['tests'],
    scriptsRoots: ['scripts']
  },
  ${BASE_TEST_CONFIG_SECTIONS.replace('coverage: { enabled: false },', 'coverage: { enabled: true },')}
});
    `;
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'tests'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'scripts'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'scripts', 'build.ts'), 'export const a = 1;', 'utf-8');

    const auditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    const result = await auditor.audit();

    expect(result.status).toBe('failed');
    const finding = result.findings.find(
      (f) => f.ruleId === 'audit-config-unacknowledged-degradation'
    );
    expect(finding).toBeDefined();
    expect(finding?.message).toContain("Path 'scripts' contains 1 code file(s)");
  });

  it('prohibits automatic repair of unacknowledged coverage degradations in fix mode (must be manually documented)', async () => {
    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'test-app',
  paths: {
    srcRoots: ['src'],
    testRoots: ['tests'],
    scriptsRoots: ['scripts']
  },
  ${BASE_TEST_CONFIG_SECTIONS.replace('coverage: { enabled: false },', 'coverage: { enabled: true },')}
});
    `;
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'tests'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'scripts'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'scripts', 'build.ts'), 'export const a = 1;', 'utf-8');

    const fixAuditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir });
    const fixResult = await fixAuditor.fix();
    const fixErrors = fixResult.findings.filter(
      (f) => f.ruleId === 'audit-config-unacknowledged-degradation'
    );
    // In accordance with the Anti-Bypass Mandate, fix mode must NOT inject acknowledged degradations automatically
    expect(fixErrors.length).toBeGreaterThan(0);

    const updatedConfig = await fs.readFile(
      path.join(tempDir, '.auditor', 'audit.config.ts'),
      'utf-8'
    );
    expect(updatedConfig).not.toContain('acknowledgedDegradations');
  });
});

describe('migrateLegacyAuditConfig', () => {
  let root: string;

  beforeEach(async () => {
    resetAuditConfig();
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'migrate-audit-config-'));
  });

  afterEach(async () => {
    resetAuditConfig();
    await fs.rm(root, { recursive: true, force: true });
  });

  it('fails loudly while a configuration remains at the project root', async () => {
    await fs.writeFile(
      path.join(root, 'audit.config.ts'),
      'export default { name: "x" };\n',
      'utf-8'
    );
    expect(() => assertNoLegacyRootConfig(root)).toThrow(/auditor fix/);
    await expect(loadAuditConfig(root)).rejects.toThrow(/no longer supported/);
  });

  it('moves the config into .auditor/ and rebases relative imports via the AST', async () => {
    const code = [
      "import { defineAuditConfig } from './src/core/auditConfig.ts';",
      'export { helper } from "./scripts/helper.ts";',
      "import pkg from '@francogp/auditor';",
      "const lazy = () => import('./scripts/lazy.ts');",
      "export default defineAuditConfig({ name: './not-a-module.ts' });",
      ''
    ].join('\n');
    await fs.writeFile(path.join(root, 'audit.config.ts'), code, 'utf-8');

    expect(migrateLegacyAuditConfig(root)).toEqual(['audit.config.ts']);
    const migrated = await fs.readFile(path.join(root, '.auditor', 'audit.config.ts'), 'utf-8');
    expect(migrated).toContain("from '../src/core/auditConfig.ts'");
    expect(migrated).toContain('from "../scripts/helper.ts"');
    expect(migrated).toContain("from '@francogp/auditor'");
    expect(migrated).toContain("import('../scripts/lazy.ts')");
    expect(migrated).toContain("name: './not-a-module.ts'");
    expect(() => assertNoLegacyRootConfig(root)).not.toThrow();
  });

  it('refuses to overwrite an existing .auditor/ configuration', async () => {
    await fs.mkdir(path.join(root, '.auditor'));
    await fs.writeFile(path.join(root, '.auditor', 'audit.config.json'), '{}', 'utf-8');
    await fs.writeFile(path.join(root, 'audit.config.json'), '{}', 'utf-8');
    expect(() => migrateLegacyAuditConfig(root)).toThrow(/Both/);
  });

  it('is a no-op on already migrated projects', () => {
    expect(migrateLegacyAuditConfig(root)).toEqual([]);
  });

  it('registers auditor:dependencies in CORE_PACKAGE_SCRIPT_REQUIREMENTS', () => {
    const depScript = PackageScriptRegistry.get('auditor:dependencies');
    expect(depScript).toBeDefined();
    expect(depScript?.command).toBe('auditor-dependencies');
  });
});

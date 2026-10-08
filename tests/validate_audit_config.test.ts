import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { ValidateAuditConfigAuditor } from '../src/suites/architecture/validate_audit_config.ts';
import { migrateLegacyAuditConfig } from '../src/cli/migrateAuditConfig.ts';
import { resetAuditConfig, defineAuditConfig, assertNoLegacyRootConfig, loadAuditConfig } from '../src/core/auditConfig.ts';
import { GitIgnoreRegistry } from '../src/core/gitIgnoreRegistry.ts';
import { PackageScriptRegistry } from '../src/core/packageScriptRegistry.ts';
import { collectAllPackageScriptRequirements } from '../src/cli/auditScanner.ts';

const AUDIT_CONFIG_MODULE_PATH = path.resolve(import.meta.dirname, '../src/core/auditConfig.ts').replace(/\\/g, '/');
const BASE_AUDITOR_PATH = path.resolve(import.meta.dirname, '../src/core/auditorBase.ts').replace(/\\/g, '/');

const BASE_TEST_CONFIG_SECTIONS = `
  persistence: { engine: 'none', schemaQualified: false },
  styles: { zLayersEnabled: false },
  valibot: { enabled: true, targets: [] },
  eslint: { enabled: true },
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
  coverage: { enabled: false }
`;

describe('ValidateAuditConfigAuditor', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    resetAuditConfig();
    GitIgnoreRegistry.reset();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-config-test-'));
    // Git sandbox whose origin/main resolves, satisfying the default ratchet production ref
    const git = (...args: string[]): void => { execFileSync('git', args, { cwd: tempDir, stdio: 'ignore' }); };
    git('init', '-q');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '-m', 'init');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');

    // Baseline valid .gitignore with standard tool caches so path tests isolate cleanly
    await fs.writeFile(
      path.join(tempDir, '.gitignore'),
      'node_modules/\nscratch/\n.eslintcache\n.stylelintcache\ndist/\n*.log\n',
      'utf-8'
    );

    // Baseline valid package.json with standard build and auditor scripts
    const baselineScripts: Record<string, string> = {
      build: 'auditor && vite build && npm run auditor:build'
    };
    const allReqs = await collectAllPackageScriptRequirements(tempDir);
    for (const req of allReqs) {
      baselineScripts[req.name] = req.command;
    }
    resetAuditConfig();

    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-app',
          scripts: baselineScripts
        },
        null,
        2
      ) + '\n',
      'utf-8'
    );
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
    GitIgnoreRegistry.reset();
    PackageScriptRegistry.reset();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('instantiates with correct metadata conforming to BaseAuditor contracts', () => {
    const auditor = new ValidateAuditConfigAuditor(tempDir);
    expect(auditor.id).toBe('validate_audit_config');
    expect(auditor.family).toBe('architecture');
    expect(auditor.packageName).toBe('Config');
    expect(auditor.ruleIds).toContain('audit-config-missing-path');
    expect(auditor.ruleIds).toContain('audit-config-missing-file');
    expect(auditor.ruleIds).toContain('audit-config-invalid-extension');
    expect(auditor.ruleIds).toContain('audit-config-missing-gitignore-entry');
    expect(auditor.ruleIds).toContain('audit-config-missing-build-audit');
    expect(auditor.ruleIds).toContain('audit-config-removed-commit-gate');
    expect(auditor.ruleIds).toContain('audit-config-invalid-production-ref');
    expect(auditor.ruleIds).toContain('audit-config-invalid-baseline');
    expect(auditor.ruleIds).toContain('audit-config-missing-recommended-script');
    expect(auditor.ruleIds).toContain('audit-config-missing-section');
    expect(auditor.ruleIds).toContain('audit-config-obsolete-script');
  });

  it('reports an error when audit.config.ts is missing from project root', async () => {
    const auditor = new ValidateAuditConfigAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    expect(result.summary.errors).toBe(1);
    const missingFinding = result.findings.find(f => f.ruleId === 'audit-config-missing-file');
    expect(missingFinding).toBeDefined();
    expect(missingFinding?.message).toContain('.auditor/audit.config.ts does not exist');
  });

  it('scaffolds default .auditor/audit.config.ts when missing in fix mode', async () => {
    const configPath = path.join(tempDir, '.auditor', 'audit.config.ts');
    expect(await fs.access(configPath).then(() => true).catch(() => false)).toBe(false);

    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'tests'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'scripts'), { recursive: true });

    const auditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir, fix: true });
    await auditor.execute();

    expect(await fs.access(configPath).then(() => true).catch(() => false)).toBe(true);
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

    const auditor = new ValidateAuditConfigAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const missingGitignore = result.findings.find(f => f.file === '.gitignore' && f.ruleId === 'audit-config-missing-file');
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

    const auditor = new ValidateAuditConfigAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const missingEntries = result.findings.filter(f => f.ruleId === 'audit-config-missing-gitignore-entry');
    expect(missingEntries.length).toBeGreaterThan(0);
    const contexts = missingEntries.map(f => f.context);
    expect(contexts).toContain('scratch/');
    expect(contexts).toContain('.eslintcache');
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

    const auditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir, fix: true });
    await auditor.execute();

    const repairedContent = await fs.readFile(path.join(tempDir, '.gitignore'), 'utf-8');
    expect(repairedContent).toContain('scratch/');
    expect(repairedContent).toContain('.eslintcache');
    expect(repairedContent).toContain('*.log');

    // Re-running in normal mode should pass without gitignore errors
    const checkAuditor = new ValidateAuditConfigAuditor(tempDir);
    const checkResult = await checkAuditor.execute();
    const gitignoreFindings = checkResult.findings.filter(f => f.ruleId === 'audit-config-missing-gitignore-entry');
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

  constructor() {
    super({
      id: 'validate_custom_tool',
      name: 'Custom Tool Validator',
      description: 'Valida herramientas del usuario',
      family: 'architecture',
      packageName: 'CustomTool',
      icon: '🔧',
      configKey: 'paths',
      defaultConfig: {},
      ruleDescriptions: {
        'custom-tool-rule': 'Regla de herramienta custom'
      },
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
    const auditor = new ValidateAuditConfigAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const customMissing = result.findings.find(f => f.context === '.custom-tool-cache/');
    expect(customMissing).toBeDefined();
    expect(customMissing?.ruleId).toBe('audit-config-missing-gitignore-entry');
    expect(customMissing?.message).toContain('Caché de herramienta extendida por el usuario');

    // Fix mode appends the extension requirement to .gitignore
    const fixAuditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir, fix: true });
    await fixAuditor.execute();

    const repairedContent = await fs.readFile(path.join(tempDir, '.gitignore'), 'utf-8');
    expect(repairedContent).toContain('.custom-tool-cache/');

    // Re-verify clean run
    const verifyAuditor = new ValidateAuditConfigAuditor(tempDir);
    const verifyResult = await verifyAuditor.execute();
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

    const auditor = new ValidateAuditConfigAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    expect(result.summary.errors).toBe(2);

    const missingPaths = result.findings
      .filter(f => f.ruleId === 'audit-config-missing-path')
      .map(f => f.context);
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

    const auditor = new ValidateAuditConfigAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const missingMigration = result.findings.find(f => f.context === 'supabase/migrations');
    expect(missingMigration).toBeDefined();

    const missingSaveFile = result.findings.find(f => f.context === 'src/missing_store.ts');
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

    const auditor = new ValidateAuditConfigAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const extFinding = result.findings.find(f => f.ruleId === 'audit-config-invalid-extension');
    expect(extFinding).toBeDefined();
    expect(extFinding?.context).toBe('scripts/auditors/missing_ext.ts');

    const scssFinding = result.findings.find(f => f.context === 'src/styles/missing_base.scss');
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
    engine: 'sqlite',
    schemaQualified: false,
    authorizedSaveFiles: ['src/save.ts']
  },
  styles: {
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
    await fs.writeFile(path.join(tempDir, 'scripts/custom.ts'), '// extension', 'utf-8');

    const auditor = new ValidateAuditConfigAuditor(tempDir);
    const result = await auditor.execute();

    // Mandatory clean path verification per Hermetic Testing Mandate
    expect(result.summary.errors).toBe(0);
    expect(result.summary.warnings).toBe(0);
    expect(result.status).toBe('passed');
    expect(result.findings.length).toBe(0);
  });

  it('reports an error when package.json is missing from project root', async () => {
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
    await fs.unlink(path.join(tempDir, 'package.json'));

    const auditor = new ValidateAuditConfigAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const missingPkg = result.findings.find(f => f.file === 'package.json' && f.ruleId === 'audit-config-missing-file');
    expect(missingPkg).toBeDefined();
    expect(missingPkg?.message).toContain('package.json does not exist');
  });

  it('reports an error when build script does not chain auditor before compilation', async () => {
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

    // package.json with build script that does NOT chain auditor
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        scripts: {
          build: 'vite build',
          audit: 'auditor',
          'audit:fix': 'auditor fix',
          'audit:lint': 'auditor preset=lint',
          'audit:md': 'auditor preset=md',
            'audit:build': 'auditor preset=build',
          'auditor:update': 'auditor-update',
          'auditor:version': 'auditor-version'
        }
      }, null, 2),
      'utf-8'
    );

    const auditor = new ValidateAuditConfigAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const missingBuildAudit = result.findings.find(f => f.ruleId === 'audit-config-missing-build-audit');
    expect(missingBuildAudit).toBeDefined();
    expect(missingBuildAudit?.message).toContain('does not chain auditor before compilation');
  });

  it('reports removed audit:for-commit gate references and repairs them in fix mode', async () => {
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
    const pkgPath = path.join(tempDir, 'package.json');
    const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
    pkg.scripts.build = 'npm run audit:for-commit && vite build';
    pkg.scripts['audit:for-commit'] = 'auditor-commit';
    await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8');

    const result = await new ValidateAuditConfigAuditor(tempDir).execute();
    expect(result.status).toBe('failed');
    const removedGate = result.findings.filter(f => f.ruleId === 'audit-config-removed-commit-gate');
    expect(removedGate.map(f => f.context?.split(':')[0]).sort()).toEqual(['audit', 'build']);

    resetAuditConfig();
    const fixResult = await new ValidateAuditConfigAuditor({ projectRoot: tempDir, fix: true }).execute();
    expect(fixResult.summary.errors).toBe(0);
    const repaired = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
    expect(repaired.scripts['audit:for-commit']).toBeUndefined();
    expect(repaired.scripts.build).toBe('auditor && vite build && npm run auditor:build');
  });

  it('reports an error when the ratchet production ref does not resolve in git', async () => {
    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'test-app',
  paths: { srcRoots: ['src'] },
  persistence: { engine: 'none', schemaQualified: false },
  styles: { zLayersEnabled: false },
  ratchet: { productionRef: 'origin/does-not-exist' }
});
    `;
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    const result = await new ValidateAuditConfigAuditor(tempDir).execute();
    expect(result.status).toBe('failed');
    const invalidRef = result.findings.find(f => f.ruleId === 'audit-config-invalid-production-ref');
    expect(invalidRef?.context).toBe('ratchet.productionRef=origin/does-not-exist');
  });

  it('reports a malformed ratchet baseline committed in .auditor/', async () => {
    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'test-app',
  paths: { srcRoots: ['src'] },
  ${BASE_TEST_CONFIG_SECTIONS}
});
    `;
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.auditor', 'audit-baseline.json'), '{"schemaVersion":2,"warnings":[]}', 'utf-8');

    const result = await new ValidateAuditConfigAuditor(tempDir).execute();
    expect(result.status).toBe('failed');
    expect(result.findings.find(f => f.ruleId === 'audit-config-invalid-baseline')?.file).toBe('.auditor/audit-baseline.json');

    await fs.writeFile(path.join(tempDir, '.auditor', 'audit-baseline.json'), '{"schemaVersion":1,"warnings":[]}\n', 'utf-8');
    resetAuditConfig();
    const clean = await new ValidateAuditConfigAuditor(tempDir).execute();
    expect(clean.summary.errors).toBe(0);
    expect(clean.status).toBe('passed');
  });

  it('throws a loud error when ratchet.baselineFile escapes the project or is not JSON', () => {
    expect(() => defineAuditConfig({ name: 'x', ratchet: { baselineFile: '../baseline.json' } })).toThrow(/ratchet\.baselineFile/);
    expect(() => defineAuditConfig({ name: 'x', ratchet: { baselineFile: 'baseline.txt' } })).toThrow(/ratchet\.baselineFile/);
    expect(() => defineAuditConfig({ name: 'x', ratchet: { productionRef: '--upload-pack=x' } })).toThrow(/ratchet\.productionRef/);
  });

  it('automatically repairs build script with auditor in fix mode', async () => {
    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'test-app',
  paths: { srcRoots: ['src'] },
  ${BASE_TEST_CONFIG_SECTIONS}
});
    `;
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    // Unchained build script
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        scripts: {
          build: 'vite build',
          audit: 'auditor',
          'audit:fix': 'auditor fix',
          'audit:lint': 'auditor preset=lint',
          'audit:md': 'auditor preset=md',
            'audit:build': 'auditor preset=build',
          'auditor:update': 'auditor-update',
          'auditor:version': 'auditor-version'
        }
      }, null, 2),
      'utf-8'
    );

    const fixAuditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir, fix: true });
    const fixResult = await fixAuditor.execute();
    expect(fixResult.status).toBe('passed');

    const updatedPkg = JSON.parse(await fs.readFile(path.join(tempDir, 'package.json'), 'utf-8'));
    expect(updatedPkg.scripts.build).toBe('auditor && vite build && npm run auditor:build');

    // Run clean check
    const verifyAuditor = new ValidateAuditConfigAuditor(tempDir);
    const verifyResult = await verifyAuditor.execute();
    expect(verifyResult.summary.errors).toBe(0);
    expect(verifyResult.status).toBe('passed');
  });

  it('reports warnings when recommended auditor scripts are missing from package.json', async () => {
    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'test-app',
  paths: { srcRoots: ['src'] },
  ${BASE_TEST_CONFIG_SECTIONS}
});
    `;
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    // package.json missing some recommended scripts
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        scripts: {
          build: 'auditor && vite build && npm run auditor:build',
          auditor: 'auditor'
        }
      }, null, 2),
      'utf-8'
    );

    const auditor = new ValidateAuditConfigAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.summary.warnings).toBeGreaterThan(0);
    expect(result.status).toBe('passed');
    const missingRecommended = result.findings.filter(f => f.ruleId === 'audit-config-missing-recommended-script');
    expect(missingRecommended.length).toBeGreaterThan(0);
    expect(missingRecommended.some(f => f.context === 'auditor:lint')).toBe(true);
    expect(missingRecommended.some(f => f.context === 'auditor:fix')).toBe(true);
  });

  it('automatically adds missing recommended scripts in fix mode', async () => {
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

    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        scripts: {
          build: 'auditor && vite build && npm run auditor:build',
          auditor: 'auditor',
          'custom:task': 'echo custom'
        }
      }, null, 2),
      'utf-8'
    );

    const fixAuditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir, fix: true });
    const fixResult = await fixAuditor.execute();
    expect(fixResult.status).toBe('passed');

    const updatedPkg = JSON.parse(await fs.readFile(path.join(tempDir, 'package.json'), 'utf-8'));
    expect(updatedPkg.scripts['custom:task']).toBe('echo custom');
    expect(updatedPkg.scripts['build']).toBe('auditor && vite build && npm run auditor:build');
    expect(updatedPkg.scripts['auditor']).toBe('auditor');
    expect(updatedPkg.scripts['auditor:fix']).toBe('auditor fix');
    expect(updatedPkg.scripts['auditor:by-file']).toBe('auditor-by-file');
    expect(updatedPkg.scripts['auditor:lint']).toBe('auditor preset=lint');
    expect(updatedPkg.scripts['auditor:md']).toBe('auditor preset=md');
    expect(updatedPkg.scripts['auditor:build']).toBe('auditor preset=build');
    expect(updatedPkg.scripts['auditor:update']).toBe('auditor-update');
    expect(updatedPkg.scripts['auditor:version']).toBe('auditor-version');
  });

  it('detects obsolete and legacy auditor scripts in package.json', async () => {
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

    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        scripts: {
          build: 'auditor && vite build',
          auditor: 'auditor',
          audit: 'auditor',
          'init-agent': 'auditor-init-agent',
          'sync:env': 'auditor-sync-env',
          'audit:family:documentation': 'auditor family=documentation',
          'validate:script-hardcoding': 'auditor task=validate_script_hardcoding'
        }
      }, null, 2),
      'utf-8'
    );

    const auditor = new ValidateAuditConfigAuditor(tempDir);
    const result = await auditor.execute();

    const obsoleteFindings = result.findings.filter(f => f.ruleId === 'audit-config-obsolete-script');
    expect(obsoleteFindings.length).toBeGreaterThanOrEqual(4);
    expect(obsoleteFindings.some(f => f.context.includes('init-agent'))).toBe(true);
    expect(obsoleteFindings.some(f => f.context.includes('sync:env'))).toBe(true);
    expect(obsoleteFindings.some(f => f.context.includes('audit:family:documentation'))).toBe(true);
    expect(obsoleteFindings.some(f => f.context.includes('validate:script-hardcoding'))).toBe(true);
  });

  it('prunes obsolete scripts and surgically rewrites build and lint in fix mode', async () => {
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

    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        scripts: {
          build: 'npm run servers:configure && npm run audit && vite build',
          lint: 'npm run audit:lint',
          'init-agent': 'auditor-init-agent',
          'sync:env': 'auditor-sync-env',
          'env:setup': 'auditor-setup-env',
          'env:check': 'auditor-check-env',
          'audit:family:documentation': 'auditor family=documentation',
          'validate:script-hardcoding': 'auditor task=validate_script_hardcoding',
          'custom:preserve': 'echo hello'
        }
      }, null, 2),
      'utf-8'
    );

    const fixAuditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir, fix: true });
    await fixAuditor.execute();

    const updatedPkg = JSON.parse(await fs.readFile(path.join(tempDir, 'package.json'), 'utf-8'));
    // Surgical rewrite preserved custom prefix and suffix and appended post-build auditor
    expect(updatedPkg.scripts.build).toBe('npm run servers:configure && npm run auditor && vite build && npm run auditor:build');
    expect(updatedPkg.scripts.lint).toBe('npm run auditor:lint');
    expect(updatedPkg.scripts['custom:preserve']).toBe('echo hello');

    // Obsolete scripts were pruned
    expect(updatedPkg.scripts['init-agent']).toBeUndefined();
    expect(updatedPkg.scripts['sync:env']).toBeUndefined();
    expect(updatedPkg.scripts['env:setup']).toBeUndefined();
    expect(updatedPkg.scripts['env:check']).toBeUndefined();
    expect(updatedPkg.scripts['audit:family:documentation']).toBeUndefined();
    expect(updatedPkg.scripts['validate:script-hardcoding']).toBeUndefined();
    expect(updatedPkg.scripts['audit']).toBeUndefined();

    // Canonical auditor scripts were populated
    expect(updatedPkg.scripts['auditor']).toBe('auditor');
    expect(updatedPkg.scripts['auditor:fix']).toBe('auditor fix');
    expect(updatedPkg.scripts['auditor:lint']).toBe('auditor preset=lint');
  });

  it('enforces build script chaining even when packageDistribution.enabled is true', async () => {
    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'package-lib',
  paths: { srcRoots: ['src'] },
  persistence: { engine: 'none', schemaQualified: false },
  styles: { zLayersEnabled: false },
  packageDistribution: { enabled: true }
});
    `;
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    // Standalone build script without auditor
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'package-lib',
        scripts: {
          build: 'tsc -p tsconfig.build.json',
          audit: 'auditor',
          'audit:fix': 'auditor fix',
          'audit:lint': 'auditor preset=lint',
          'audit:md': 'auditor preset=md',
            'audit:build': 'auditor preset=build',
          'auditor:update': 'auditor-update',
          'auditor:version': 'auditor-version'
        }
      }, null, 2),
      'utf-8'
    );

    const auditor = new ValidateAuditConfigAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const missingBuildAudit = result.findings.find(f => f.ruleId === 'audit-config-missing-build-audit');
    expect(missingBuildAudit).toBeDefined();
  });

  it('bypasses build script chaining enforcement when packageScripts.enforceBuildAudit is false', async () => {
    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'custom-app',
  paths: { srcRoots: ['src'] },
  ${BASE_TEST_CONFIG_SECTIONS},
  packageScripts: { enforceBuildAudit: false, recommendedScripts: false }
});
    `;
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'custom-app',
        scripts: {
          build: 'vite build'
        }
      }, null, 2),
      'utf-8'
    );

    const auditor = new ValidateAuditConfigAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
  });

  it('bypasses recommended scripts verification when packageScripts.recommendedScripts is false', async () => {
    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'custom-app',
  paths: { srcRoots: ['src'] },
  ${BASE_TEST_CONFIG_SECTIONS},
  packageScripts: { enforceBuildAudit: false, recommendedScripts: false }
});
    `;
    await fs.mkdir(path.join(tempDir, '.auditor'), { recursive: true });
    await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'custom-app',
        scripts: {
          build: 'vite build'
        }
      }, null, 2),
      'utf-8'
    );

    const auditor = new ValidateAuditConfigAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.summary.errors).toBe(0);
    expect(result.status).toBe('passed');
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
    }).toThrow(/Error de tipo en 'packageScripts\.recommendedScripts'/);
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

  it('throws a loud error when constants.exemptGlobs contains universal wildcards', () => {
    expect(() => {
      defineAuditConfig({
        name: 'invalid-app',
        paths: { srcRoots: ['src'] },
        persistence: { engine: 'none', schemaQualified: false },
        styles: { zLayersEnabled: false },
        constants: { exemptGlobs: ['**'] }
      });
    }).toThrow(/comodín global no permitido/);
  });

  it('throws a loud error when constants.exemptGlobs targets protected production roots', () => {
    expect(() => {
      defineAuditConfig({
        name: 'invalid-app',
        paths: { srcRoots: ['src'] },
        persistence: { engine: 'none', schemaQualified: false },
        styles: { zLayersEnabled: false },
        constants: { exemptGlobs: ['src/logic/battle/**'] }
      });
    }).toThrow(/ruta de lógica de producción protegida/);
  });

  it('throws a loud error when constants.exemptGlobs exceeds the ceiling limit of 15', () => {
    const manyGlobs = Array.from({ length: 16 }, (_, i) => `scripts/seed_${i}.ts`);
    expect(() => {
      defineAuditConfig({
        name: 'invalid-app',
        paths: { srcRoots: ['src'] },
        persistence: { engine: 'none', schemaQualified: false },
        styles: { zLayersEnabled: false },
        constants: { exemptGlobs: manyGlobs }
      });
    }).toThrow(/excede el límite máximo de 15 patrones/);
  });

  it('accepts legitimate non-production patterns in constants.exemptGlobs', () => {
    const config = defineAuditConfig({
      name: 'valid-app',
      paths: { srcRoots: ['src'] },
      persistence: { engine: 'none', schemaQualified: false },
      styles: { zLayersEnabled: false },
      constants: {
        exemptGlobs: ['scripts/database/seeds/**', 'ui-demo/**']
      }
    });

    expect(config.constants?.exemptGlobs).toEqual(['scripts/database/seeds/**', 'ui-demo/**']);
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

    const auditor = new ValidateAuditConfigAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const missingSections = result.findings.filter(f => f.ruleId === 'audit-config-missing-section');
    expect(missingSections.length).toBeGreaterThan(0);
    expect(missingSections.some(f => f.context === 'valibot')).toBe(true);
    expect(missingSections.some(f => f.context === 'eslint')).toBe(true);
    expect(missingSections.some(f => f.context === 'pinia')).toBe(true);
    expect(missingSections.some(f => f.context === 'htmlValidate')).toBe(true);
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
    await fs.writeFile(path.join(tempDir, '.auditor', 'audit.config.ts'), configWithoutValibot, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    // Verify it fails in check mode
    const checkAuditor = new ValidateAuditConfigAuditor(tempDir);
    const checkResult = await checkAuditor.execute();
    expect(checkResult.findings.some(f => f.ruleId === 'audit-config-missing-section' && f.context === 'valibot')).toBe(true);

    // Run in fix mode
    resetAuditConfig();
    const fixAuditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir, fix: true });
    await fixAuditor.execute();

    // Verify valibot was added to audit.config.ts
    const updatedContent = await fs.readFile(path.join(tempDir, '.auditor', 'audit.config.ts'), 'utf-8');
    expect(updatedContent).toContain('valibot:');
    expect(updatedContent).toContain('enabled: true');

    // Re-run check mode: should pass cleanly
    resetAuditConfig();
    const recheckAuditor = new ValidateAuditConfigAuditor(tempDir);
    const recheckResult = await recheckAuditor.execute();
    const valibotFinding = recheckResult.findings.find(f => f.ruleId === 'audit-config-missing-section' && f.context === 'valibot');
    expect(valibotFinding).toBeUndefined();
  });

  it('enforces required configuration section declared by host extensions', async () => {
    const extensionCode = `
import { BaseAuditor } from '${BASE_AUDITOR_PATH}';

export class CustomExtAuditor extends BaseAuditor {
  constructor(opts) {
    super({
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
      ruleDescriptions: { 'custom-rule': 'Regla de extension' },
      projectRoot: opts?.projectRoot
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
    const auditor = new ValidateAuditConfigAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const extFinding = result.findings.find(f => f.ruleId === 'audit-config-missing-section' && f.context === 'customExt');
    expect(extFinding).toBeDefined();
    expect(extFinding?.message).toContain('customExt');

    // Fix mode should auto-scaffold customExt section
    const fixAuditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir, fix: true });
    await fixAuditor.execute();

    const repairedContent = await fs.readFile(path.join(tempDir, '.auditor', 'audit.config.ts'), 'utf-8');
    expect(repairedContent).toContain('customExt:');
    expect(repairedContent).toContain('customOption');
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
    await fs.writeFile(path.join(root, 'audit.config.ts'), 'export default { name: "x" };\n', 'utf-8');
    expect(() => assertNoLegacyRootConfig(root)).toThrow(/auditor fix/);
    await expect(loadAuditConfig(root)).rejects.toThrow(/no longer supported/);
  });

  it('moves the config into .auditor/ and rebases relative imports via the AST', async () => {
    const code = [
      "import { defineAuditConfig } from './src/core/auditConfig.ts';",
      "export { helper } from \"./scripts/helper.ts\";",
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
});

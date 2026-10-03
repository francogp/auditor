import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ValidateAuditConfigAuditor } from '../src/suites/architecture/validate_audit_config.ts';
import { resetAuditConfig, defineAuditConfig } from '../src/core/auditConfig.ts';
import { GitIgnoreRegistry } from '../src/core/gitIgnoreRegistry.ts';

const AUDIT_CONFIG_MODULE_PATH = path.resolve(import.meta.dirname, '../src/core/auditConfig.ts').replace(/\\/g, '/');
const BASE_AUDITOR_PATH = path.resolve(import.meta.dirname, '../src/core/auditorBase.ts').replace(/\\/g, '/');

describe('ValidateAuditConfigAuditor', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    resetAuditConfig();
    GitIgnoreRegistry.reset();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-config-test-'));

    // Baseline valid .gitignore with standard tool caches so path tests isolate cleanly
    await fs.writeFile(
      path.join(tempDir, '.gitignore'),
      'node_modules/\nscratch/\n.eslintcache\n.stylelintcache\ndist/\n*.log\n',
      'utf-8'
    );

    // Baseline valid package.json with standard build and auditor scripts
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify(
        {
          name: 'test-app',
          scripts: {
            build: 'auditor && vite build',
            audit: 'auditor',
            'audit:for-commit': 'auditor-commit',
            'audit:fix': 'auditor fix',
            'audit:lint': 'auditor preset=lint',
            'audit:md': 'auditor preset=md',
            'auditor:update': 'auditor-update',
            'auditor:version': 'auditor-version'
          }
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
    expect(auditor.ruleIds).toContain('audit-config-invalid-build-script');
    expect(auditor.ruleIds).toContain('audit-config-missing-recommended-script');
  });

  it('reports an error when audit.config.ts is missing from project root', async () => {
    const auditor = new ValidateAuditConfigAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    expect(result.summary.errors).toBe(1);
    const missingFinding = result.findings.find(f => f.ruleId === 'audit-config-missing-file');
    expect(missingFinding).toBeDefined();
    expect(missingFinding?.message).toContain('audit.config.ts does not exist');
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
    await fs.writeFile(path.join(tempDir, 'audit.config.ts'), configContent, 'utf-8');
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
    await fs.writeFile(path.join(tempDir, 'audit.config.ts'), configContent, 'utf-8');
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
    await fs.writeFile(path.join(tempDir, 'audit.config.ts'), configContent, 'utf-8');
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
  persistence: { engine: 'none', schemaQualified: false },
  styles: { zLayersEnabled: false },
  extensions: ['scripts/custom_ext.ts']
});
    `;
    await fs.writeFile(path.join(tempDir, 'audit.config.ts'), configContent, 'utf-8');
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
  persistence: { engine: 'none', schemaQualified: false },
  styles: { zLayersEnabled: false }
});
    `;
    await fs.writeFile(path.join(tempDir, 'audit.config.ts'), configContent, 'utf-8');

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
    await fs.writeFile(path.join(tempDir, 'audit.config.ts'), configContent, 'utf-8');
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
    await fs.writeFile(path.join(tempDir, 'audit.config.ts'), configContent, 'utf-8');
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
    await fs.writeFile(path.join(tempDir, 'audit.config.ts'), configContent, 'utf-8');
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
    await fs.writeFile(path.join(tempDir, 'audit.config.ts'), configContent, 'utf-8');
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
    await fs.writeFile(path.join(tempDir, 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    // package.json with build script that does NOT chain auditor
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        scripts: {
          build: 'vite build',
          audit: 'auditor',
          'audit:for-commit': 'auditor-commit',
          'audit:fix': 'auditor fix',
          'audit:lint': 'auditor preset=lint',
          'audit:md': 'auditor preset=md',
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

  it('reports an error when build script uses audit:for-commit instead of full auditor', async () => {
    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'test-app',
  paths: { srcRoots: ['src'] },
  persistence: { engine: 'none', schemaQualified: false },
  styles: { zLayersEnabled: false }
});
    `;
    await fs.writeFile(path.join(tempDir, 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    // package.json with build script that uses audit:for-commit
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        scripts: {
          build: 'npm run audit:for-commit && vite build',
          audit: 'auditor',
          'audit:for-commit': 'auditor-commit',
          'audit:fix': 'auditor fix',
          'audit:lint': 'auditor preset=lint',
          'audit:md': 'auditor preset=md',
          'auditor:update': 'auditor-update',
          'auditor:version': 'auditor-version'
        }
      }, null, 2),
      'utf-8'
    );

    const auditor = new ValidateAuditConfigAuditor(tempDir);
    const result = await auditor.execute();

    expect(result.status).toBe('failed');
    const invalidBuild = result.findings.find(f => f.ruleId === 'audit-config-invalid-build-script');
    expect(invalidBuild).toBeDefined();
    expect(invalidBuild?.message).toContain('uses audit:for-commit');
  });

  it('automatically repairs build script with auditor in fix mode', async () => {
    const configContent = `
import { defineAuditConfig } from '${AUDIT_CONFIG_MODULE_PATH}';
export default defineAuditConfig({
  name: 'test-app',
  paths: { srcRoots: ['src'] },
  persistence: { engine: 'none', schemaQualified: false },
  styles: { zLayersEnabled: false }
});
    `;
    await fs.writeFile(path.join(tempDir, 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    // Unchained build script
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        scripts: {
          build: 'vite build',
          audit: 'auditor',
          'audit:for-commit': 'auditor-commit',
          'audit:fix': 'auditor fix',
          'audit:lint': 'auditor preset=lint',
          'audit:md': 'auditor preset=md',
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
    expect(updatedPkg.scripts.build).toBe('auditor && vite build');

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
  persistence: { engine: 'none', schemaQualified: false },
  styles: { zLayersEnabled: false }
});
    `;
    await fs.writeFile(path.join(tempDir, 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    // package.json missing some recommended scripts
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        scripts: {
          build: 'auditor && vite build',
          audit: 'auditor'
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
    expect(missingRecommended.some(f => f.context === 'audit:for-commit')).toBe(true);
    expect(missingRecommended.some(f => f.context === 'audit:fix')).toBe(true);
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
    await fs.writeFile(path.join(tempDir, 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'test-app',
        scripts: {
          build: 'auditor && vite build',
          audit: 'auditor'
        }
      }, null, 2),
      'utf-8'
    );

    const fixAuditor = new ValidateAuditConfigAuditor({ projectRoot: tempDir, fix: true });
    const fixResult = await fixAuditor.execute();
    expect(fixResult.status).toBe('passed');

    const updatedPkg = JSON.parse(await fs.readFile(path.join(tempDir, 'package.json'), 'utf-8'));
    expect(updatedPkg.scripts['audit:for-commit']).toBe('auditor-commit');
    expect(updatedPkg.scripts['audit:fix']).toBe('auditor fix');
    expect(updatedPkg.scripts['audit:lint']).toBe('auditor preset=lint');
    expect(updatedPkg.scripts['audit:md']).toBe('auditor preset=md');
    expect(updatedPkg.scripts['auditor:update']).toBe('auditor-update');
    expect(updatedPkg.scripts['auditor:version']).toBe('auditor-version');
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
    await fs.writeFile(path.join(tempDir, 'audit.config.ts'), configContent, 'utf-8');
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });

    // Standalone build script without auditor
    await fs.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({
        name: 'package-lib',
        scripts: {
          build: 'tsc -p tsconfig.build.json',
          audit: 'auditor',
          'audit:for-commit': 'auditor-commit',
          'audit:fix': 'auditor fix',
          'audit:lint': 'auditor preset=lint',
          'audit:md': 'auditor preset=md',
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
  persistence: { engine: 'none', schemaQualified: false },
  styles: { zLayersEnabled: false },
  packageScripts: { enforceBuildAudit: false, recommendedScripts: false }
});
    `;
    await fs.writeFile(path.join(tempDir, 'audit.config.ts'), configContent, 'utf-8');
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
  persistence: { engine: 'none', schemaQualified: false },
  styles: { zLayersEnabled: false },
  packageScripts: { enforceBuildAudit: false, recommendedScripts: false }
});
    `;
    await fs.writeFile(path.join(tempDir, 'audit.config.ts'), configContent, 'utf-8');
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
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { ValidateAuditConfigAuditor } from '../src/suites/architecture/validate_audit_config.ts';
import { resetAuditConfig } from '../src/core/auditConfig.ts';

const AUDIT_CONFIG_MODULE_PATH = path.resolve(import.meta.dirname, '../src/core/auditConfig.ts').replace(/\\/g, '/');

describe('ValidateAuditConfigAuditor', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    resetAuditConfig();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-config-test-'));
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    resetAuditConfig();
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
});

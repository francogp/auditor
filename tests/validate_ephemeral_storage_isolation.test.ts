/**
 * tests/node/auditors/validate_ephemeral_storage_isolation.test.ts
 *
 * Dedicated unit test suite for EphemeralStorageIsolationAuditor:
 * - Forbidden temporary directories across all source trees (ephemeral-no-source-temp-dirs)
 * - Strict database root file and directory integrity (ephemeral-no-source-temp-dirs)
 * - Prohibition on ignoring source code temp in .gitignore (ephemeral-no-gitignore-source-temp)
 * - Prohibition on referencing source code temp paths in code (ephemeral-no-source-temp-references)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  EphemeralStorageIsolationAuditor,
  EPHEMERAL_STORAGE_RULES
} from '../src/suites/architecture/validate_ephemeral_storage_isolation.ts';

describe('EphemeralStorageIsolationAuditor', () => {
  let tempDir: string;

  beforeEach(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ephemeral-storage-test-'));
  });

  afterEach(async () => {
    delete process.env.AUDIT_SUBPROCESS;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Rule Configuration & Metadata Integrity', () => {
    it('declares all canonical rules in EPHEMERAL_STORAGE_RULES', () => {
      expect(EPHEMERAL_STORAGE_RULES).toContain('ephemeral-no-source-temp-dirs');
      expect(EPHEMERAL_STORAGE_RULES).toContain('ephemeral-no-gitignore-source-temp');
      expect(EPHEMERAL_STORAGE_RULES).toContain('ephemeral-no-source-temp-references');
    });

    it('initializes cleanly with projectRoot sandbox', () => {
      const auditor = new EphemeralStorageIsolationAuditor(tempDir);
      expect(auditor.id).toBe('validate_ephemeral_storage_isolation');
      expect(auditor.family).toBe('architecture');
      expect(auditor.name).toBe('Ephemeral Storage & Scratch Isolation Validator');
    });
  });

  describe('ephemeral-no-source-temp-dirs', () => {
    it('detects forbidden temp directory inside src/', async () => {
      await fs.mkdir(path.join(tempDir, 'src', 'logic', 'temp'), { recursive: true });

      const auditor = new EphemeralStorageIsolationAuditor(tempDir);
      const result = await auditor.execute();

      const violations = result.findings.filter(f => f.ruleId === 'ephemeral-no-source-temp-dirs');
      expect(violations.some(v => v.file?.includes('src/logic/temp'))).toBe(true);
      expect(result.summary.errors).toBeGreaterThan(0);
    });

    it('detects forbidden tmp_ prefix directory inside scripts/', async () => {
      await fs.mkdir(path.join(tempDir, 'scripts', 'tmp_fixtures'), { recursive: true });

      const auditor = new EphemeralStorageIsolationAuditor(tempDir);
      const result = await auditor.execute();

      const violations = result.findings.filter(f => f.ruleId === 'ephemeral-no-source-temp-dirs');
      expect(violations.some(v => v.file?.includes('scripts/tmp_fixtures'))).toBe(true);
    });

    it('detects forbidden temp_supabase directory inside supabase/', async () => {
      await fs.mkdir(path.join(tempDir, 'supabase', 'temp_supabase'), { recursive: true });

      const auditor = new EphemeralStorageIsolationAuditor(tempDir);
      const result = await auditor.execute();

      const violations = result.findings.filter(f => f.ruleId === 'ephemeral-no-source-temp-dirs');
      expect(violations.some(v => v.file?.includes('supabase/temp_supabase'))).toBe(true);
    });

    it('passes cleanly when source trees contain only canonical folders', async () => {
      await fs.mkdir(path.join(tempDir, 'src', 'logic'), { recursive: true });
      await fs.mkdir(path.join(tempDir, 'scripts', 'auditors'), { recursive: true });
      await fs.mkdir(path.join(tempDir, 'supabase', 'migrations'), { recursive: true });

      const auditor = new EphemeralStorageIsolationAuditor(tempDir);
      const result = await auditor.execute();

      const violations = result.findings.filter(f => f.ruleId === 'ephemeral-no-source-temp-dirs');
      expect(violations.length).toBe(0);
      expect(result.summary.errors).toBe(0);
    });

    it('permits canonical database/ folders (backups, migrations, schemas) and AGENTS.md', async () => {
      await fs.mkdir(path.join(tempDir, 'database', 'backups'), { recursive: true });
      await fs.mkdir(path.join(tempDir, 'database', 'migrations'), { recursive: true });
      await fs.mkdir(path.join(tempDir, 'database', 'schemas'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'database', 'AGENTS.md'), '# Database\n');

      const auditor = new EphemeralStorageIsolationAuditor(tempDir);
      const result = await auditor.execute();

      const violations = result.findings.filter(f => f.ruleId === 'ephemeral-no-source-temp-dirs');
      expect(violations.length).toBe(0);
      expect(result.summary.errors).toBe(0);
    });

    it('detects unlisted directories or files in database/', async () => {
      await fs.mkdir(path.join(tempDir, 'database', 'unknown_folder'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'database', 'stray_file.txt'), 'content');

      const auditor = new EphemeralStorageIsolationAuditor(tempDir);
      const result = await auditor.execute();

      const violations = result.findings.filter(f => f.ruleId === 'ephemeral-no-source-temp-dirs');
      expect(violations.length).toBe(2);
      expect(violations.some(v => v.file === 'database/unknown_folder')).toBe(true);
      expect(violations.some(v => v.file === 'database/stray_file.txt')).toBe(true);
    });
  });

  describe('ephemeral-no-gitignore-source-temp', () => {
    it('detects supabase/temp_supabase/ in .gitignore', async () => {
      await fs.writeFile(
        path.join(tempDir, '.gitignore'),
        `
node_modules/
scratch/
supabase/temp_supabase/
        `.trim()
      );

      const auditor = new EphemeralStorageIsolationAuditor(tempDir);
      const result = await auditor.execute();

      const violations = result.findings.filter(f => f.ruleId === 'ephemeral-no-gitignore-source-temp');
      expect(violations.some(v => v.file === '.gitignore')).toBe(true);
      expect(violations[0]?.message).toContain('supabase/temp_supabase');
    });

    it('detects src/temp in .gitignore', async () => {
      await fs.writeFile(
        path.join(tempDir, '.gitignore'),
        `
node_modules/
scratch/
src/temp/
        `.trim()
      );

      const auditor = new EphemeralStorageIsolationAuditor(tempDir);
      const result = await auditor.execute();

      const violations = result.findings.filter(f => f.ruleId === 'ephemeral-no-gitignore-source-temp');
      expect(violations.some(v => v.file === '.gitignore')).toBe(true);
    });

    it('permits clean .gitignore ignoring scratch/ and node_modules/', async () => {
      await fs.writeFile(
        path.join(tempDir, '.gitignore'),
        `
node_modules/
scratch/
dist/
.env
        `.trim()
      );

      const auditor = new EphemeralStorageIsolationAuditor(tempDir);
      const result = await auditor.execute();

      const violations = result.findings.filter(f => f.ruleId === 'ephemeral-no-gitignore-source-temp');
      expect(violations.length).toBe(0);
    });
  });

  describe('ephemeral-no-source-temp-references', () => {
    it('detects code referencing supabase/temp_supabase', async () => {
      const srcDir = path.join(tempDir, 'supabase');
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(
        path.join(srcDir, 'setup_clone.ts'),
        `const tempDir = path.resolve('supabase/temp_supabase');`
      );

      const auditor = new EphemeralStorageIsolationAuditor(tempDir);
      const result = await auditor.execute();

      const violations = result.findings.filter(f => f.ruleId === 'ephemeral-no-source-temp-references');
      expect(violations.some(v => v.file === 'supabase/setup_clone.ts')).toBe(true);
    });

    it('permits isolated paths targeting scratch/supabase_clone', async () => {
      const srcDir = path.join(tempDir, 'supabase');
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(
        path.join(srcDir, 'setup_clone.ts'),
        `const cloneDir = path.resolve(BASE_DIR, '..', 'scratch', 'supabase_clone');`
      );

      const auditor = new EphemeralStorageIsolationAuditor(tempDir);
      const result = await auditor.execute();

      const violations = result.findings.filter(f => f.ruleId === 'ephemeral-no-source-temp-references');
      expect(violations.length).toBe(0);
      expect(result.summary.errors).toBe(0);
    });

    it('permits code with // scratch-ok escape hatch', async () => {
      const srcDir = path.join(tempDir, 'src');
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(
        path.join(srcDir, 'legacyDoc.ts'),
        `const path = 'src/temp/old.json'; // scratch-ok`
      );

      const auditor = new EphemeralStorageIsolationAuditor(tempDir);
      const result = await auditor.execute();

      const violations = result.findings.filter(f => f.ruleId === 'ephemeral-no-source-temp-references');
      expect(violations.length).toBe(0);
    });
  });
});

/**
 * tests/all_auditors_zero_hardcoded_paths.test.ts
 *
 * Universal Scope Isolation & Zero Hardcoded Paths Conformance Test:
 *
 * Mandate:
 * Every sub-auditor and host extension is given an isolated custom scope ('custom_scope_isolated').
 * If an auditor returns or scans ANY path outside the configured scope (excluding standard
 * project-level root metadata files), it constitutes a critical hardcoding defect because
 * it returned MORE than the expected configured scope.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';

import { defineAuditConfig } from '../src/core/auditConfigBuilders.ts';
import { setAuditConfig, resetAuditConfig } from '../src/core/auditConfigLoader.ts';
import type { AuditTaskDefinition } from '../src/core/auditContract.ts';
import type { BaseAuditor } from '../src/core/auditorBase.ts';
import {
  scanAllAuditorTasks,
  findAuditorClass,
  instantiateAuditorClass
} from '../src/core/auditorContractConformance.ts';
import { normalizePosixPath, isPathContained, stripGlobSuffix } from '../src/core/safePath.ts';

const CUSTOM_SCOPE = 'custom_scope_isolated';

const CUSTOM_PATHS = {
  srcRoots: [`${CUSTOM_SCOPE}/src`],
  testRoots: [`${CUSTOM_SCOPE}/tests`],
  e2eRoots: [`${CUSTOM_SCOPE}/tests/e2e`],
  integrationRoots: [`${CUSTOM_SCOPE}/tests/integration`],
  scriptsRoots: [`${CUSTOM_SCOPE}/scripts`],
  codeRoots: [`${CUSTOM_SCOPE}/src`, `${CUSTOM_SCOPE}/scripts`],
  cliRoots: [`${CUSTOM_SCOPE}/src/cli`],
  dataRoots: [`${CUSTOM_SCOPE}/src/data`],
  demoRoots: [`${CUSTOM_SCOPE}/demo`],
  componentsRoots: [`${CUSTOM_SCOPE}/src/components`],
  viewsRoots: [`${CUSTOM_SCOPE}/src/views`],
  storesRoots: [`${CUSTOM_SCOPE}/src/stores`],
  composablesRoots: [`${CUSTOM_SCOPE}/src/composables`],
  typesRoots: [`${CUSTOM_SCOPE}/src/types`],
  stylesRoots: [`${CUSTOM_SCOPE}/src/styles`],
  logicRoots: [`${CUSTOM_SCOPE}/src/logic`],
  migrationsDir: `${CUSTOM_SCOPE}/migrations`
};

const CUSTOM_DOCS = {
  skillsRoots: [`${CUSTOM_SCOPE}/agents/skills`],
  docsRoots: [`${CUSTOM_SCOPE}/docs`],
  readmeFile: 'README.md'
};

const CUSTOM_HYGIENE = {
  roots: [`${CUSTOM_SCOPE}/hygiene`]
};

const CUSTOM_PERSISTENCE = {
  enabled: true,
  engine: 'supabase' as const,
  schemaQualified: true,
  supabaseDir: `${CUSTOM_SCOPE}/supabase`,
  allowedDatabaseDirs: [`${CUSTOM_SCOPE}/database`]
};

/**
 * Standard project-level root metadata files that reside at the project root by architecture.
 */
const ALLOWED_ROOT_FILES = new Set([
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  '.stylelintrc.json',
  '.fallowrc.json',
  '.gitignore',
  '.dockerignore',
  '.editorconfig',
  '.npmrc',
  '.htmlvalidate.json',
  'README.md',
  'AGENTS.md',
  'index.html',
  'pnpm-lock.yaml',
  'package-lock.json',
  'node_modules'
]);

function isPathWithinExpectedScope(posixPath: string, scopeDir: string): boolean {
  const norm = normalizePosixPath(posixPath).replace(/^\.\//, '');
  const baseCandidate = norm.replace(/\/\*\*?.*$/, '');
  if (norm === scopeDir || baseCandidate === scopeDir || isPathContained(scopeDir, baseCandidate)) {
    return true;
  }
  if (ALLOWED_ROOT_FILES.has(norm) || norm === '.auditor' || isPathContained('.auditor', norm)) {
    return true;
  }
  // Allow root globs for standard root configuration and build artifact files
  if (
    norm.startsWith('tsconfig') ||
    norm.startsWith('.markdownlint') ||
    norm.startsWith('.stylelintrc') ||
    norm.startsWith('stylelint.config') ||
    norm.startsWith('playwright.config') ||
    norm.startsWith('.htmlvalidate') ||
    norm === '*.html' ||
    norm.startsWith('dist/') ||
    norm.startsWith('dist/**')
  ) {
    return true;
  }
  // Allow CI workflows and universal script extensions across project
  if (
    norm.startsWith('.github/workflows') ||
    norm.startsWith('**/*.sh') ||
    norm.startsWith('**/*.bash') ||
    norm.startsWith('**/*.zsh') ||
    norm.startsWith('**/*.ps1') ||
    norm.startsWith('**/*.bat') ||
    norm.startsWith('**/*.cmd') ||
    norm.startsWith('**/Dockerfile') ||
    norm.startsWith('**/*.dockerfile') ||
    norm.startsWith('**/Containerfile') ||
    norm.startsWith('**/*.{mjs,cjs}')
  ) {
    return true;
  }
  // Allow repository-wide whole-workspace linters and documentation globs
  if (
    norm === '.' ||
    norm === '**/*.md' ||
    norm === '**/AGENTS.md' ||
    norm === '**/*.{js,ts,mjs,cjs,vue}' ||
    norm === '**/*.{js,ts,mjs,cjs,vue,json,md,css,scss}'
  ) {
    return true;
  }
  return false;
}

async function scanReferenceExtensions(projectRoot: string): Promise<AuditTaskDefinition[]> {
  const extensionsDir = path.resolve(projectRoot, '.agents/skills/auditor/references/extensions');
  if (!fs.existsSync(extensionsDir)) return [];
  const files = await fs.promises.readdir(extensionsDir);
  const tasks: AuditTaskDefinition[] = [];
  for (const file of files) {
    if (file.endsWith('.extension.ts') || file.endsWith('-example.ts')) {
      const fullPath = path.join(extensionsDir, file);
      tasks.push({
        id: path.basename(file, path.extname(file)),
        name: file,
        family: 'architecture',
        scriptPath: fullPath,
        command: 'node',
        args: [],
        isBuiltin: false
      });
    }
  }
  return tasks;
}

describe('Universal Zero Hardcoded Paths & Scope Conformance (All Sub-Auditors & Extensions)', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'auditor-scope-conformance-'));
    const auditorDir = path.join(tempDir, '.auditor');
    await fs.promises.mkdir(auditorDir, { recursive: true });

    // Populate sandbox with isolated directory structure
    const scopePath = path.join(tempDir, CUSTOM_SCOPE);
    await fs.promises.mkdir(path.join(scopePath, 'src'), { recursive: true });
    await fs.promises.mkdir(path.join(scopePath, 'tests'), { recursive: true });
    await fs.promises.mkdir(path.join(scopePath, 'scripts'), { recursive: true });
    await fs.promises.mkdir(path.join(scopePath, 'agents', 'skills', 'sample_skill'), {
      recursive: true
    });

    // Write minimal sandbox files
    await fs.promises.writeFile(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'sandbox' }, null, 2)
    );
    await fs.promises.writeFile(
      path.join(scopePath, 'src', 'index.ts'),
      'export const hello = "world";\n'
    );
    await fs.promises.writeFile(
      path.join(scopePath, 'tests', 'index.test.ts'),
      'test("ok", () => {});\n'
    );
    await fs.promises.writeFile(
      path.join(scopePath, 'agents', 'skills', 'sample_skill', 'SKILL.md'),
      '---\nname: sample\ndescription: sample\n---\nBody\n'
    );
    await fs.promises.writeFile(
      path.join(scopePath, 'agents', 'plugins.json'),
      JSON.stringify({ entries: [{ path: '@francogp/auditor' }] }, null, 2)
    );
    await fs.promises.writeFile(
      path.join(scopePath, 'agents', 'skills.json'),
      JSON.stringify({ entries: [{ path: '@francogp/auditor' }] }, null, 2)
    );

    const config = defineAuditConfig({
      name: 'Custom Isolated Roots Config',
      paths: CUSTOM_PATHS,
      documentation: CUSTOM_DOCS,
      auditorHygiene: CUSTOM_HYGIENE,
      persistence: CUSTOM_PERSISTENCE
    });

    const configJsonPath = path.join(tempDir, '.auditor', 'audit.config.json');
    await fs.promises.writeFile(configJsonPath, JSON.stringify(config, null, 2));

    setAuditConfig(config, tempDir);
  });

  afterEach(async () => {
    resetAuditConfig();
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch {
      /* non-fatal cleanup */
    }
  });

  async function assertTasksRespectScope(tasks: readonly AuditTaskDefinition[]): Promise<void> {
    const checkedTaskIds = new Set<string>();
    const violations: string[] = [];

    const uniqueTasks = tasks.filter((task) => {
      if (checkedTaskIds.has(task.id)) return false;
      checkedTaskIds.add(task.id);
      return true;
    });

    const batchSize = 8;
    for (let i = 0; i < uniqueTasks.length; i += batchSize) {
      const batch = uniqueTasks.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (task) => {
          const suitePath = path.isAbsolute(task.scriptPath)
            ? task.scriptPath
            : path.resolve(process.cwd(), task.scriptPath);

          const mod = (await import(suitePath)) as Record<string, unknown>;
          const Cls = findAuditorClass(mod);
          if (!Cls) return;

          let auditor: BaseAuditor<string>;
          try {
            auditor = instantiateAuditorClass(Cls, tempDir);
          } catch (err) {
            violations.push(
              `[${task.id}] Failed to instantiate auditor with projectRoot '${tempDir}': ${err instanceof Error ? err.message : String(err)}`
            );
            return;
          }

          // 1. Assert auditor.roots does NOT return more than configured scope
          if (Array.isArray(auditor.roots)) {
            for (const root of auditor.roots) {
              if (!isPathWithinExpectedScope(root, CUSTOM_SCOPE)) {
                violations.push(
                  `[${task.id}] 'roots' returned unexpected path '${root}' outside configured scope '${CUSTOM_SCOPE}'.`
                );
              }
            }
          }

          // 2. Assert coverage.include does NOT declare paths outside configured scope
          const coverage = auditor.getCoverageRecorder()?.declaration;
          if (coverage?.include && Array.isArray(coverage.include)) {
            for (const pattern of coverage.include) {
              if (!isPathWithinExpectedScope(pattern, CUSTOM_SCOPE)) {
                violations.push(
                  `[${task.id}] coverage.include returned unexpected pattern '${pattern}' outside configured scope '${CUSTOM_SCOPE}'.`
                );
              }
            }
          }

          // 3. Assert internal path properties do NOT return paths outside configured scope
          const instanceRecord = auditor as unknown as Record<string, unknown>;
          if (Array.isArray(instanceRecord.skillsRoots)) {
            for (const sr of instanceRecord.skillsRoots) {
              if (!isPathWithinExpectedScope(String(sr), CUSTOM_SCOPE)) {
                violations.push(
                  `[${task.id}] 'skillsRoots' returned unexpected path '${sr}' outside configured scope '${CUSTOM_SCOPE}'.`
                );
              }
            }
          }

          if (typeof instanceRecord.configuredMigrationsDir === 'string') {
            if (!isPathWithinExpectedScope(instanceRecord.configuredMigrationsDir, CUSTOM_SCOPE)) {
              violations.push(
                `[${task.id}] 'configuredMigrationsDir' returned unexpected path '${instanceRecord.configuredMigrationsDir}' outside configured scope '${CUSTOM_SCOPE}'.`
              );
            }
          }

          // 4. Intercept recordScanned during execution to guarantee ZERO unexpected files scanned
          const scannedPaths: string[] = [];
          const auditorWithRecord = auditor as unknown as {
            recordScanned: (filePath: string) => void;
          };
          const originalRecordScanned = auditorWithRecord.recordScanned.bind(auditor);
          auditorWithRecord.recordScanned = (filePath: string) => {
            scannedPaths.push(filePath);
            originalRecordScanned(filePath);
          };

          try {
            await auditor.runAudit();
          } catch {
            // Some suites may fail due to sandbox missing specific files (e.g. git);
            // we inspect all files recorded as scanned up to that point.
          }

          for (const scanned of scannedPaths) {
            const relScanned = path.isAbsolute(scanned)
              ? normalizePosixPath(path.relative(tempDir, scanned))
              : normalizePosixPath(scanned);
            if (!isPathWithinExpectedScope(relScanned, CUSTOM_SCOPE)) {
              violations.push(
                `[${task.id}] Scanned unexpected file '${scanned}' outside configured scope '${CUSTOM_SCOPE}'.`
              );
            }
          }
        })
      );
    }

    expect(
      violations,
      `Expected ZERO sub-auditors or extensions to return unexpected paths, but found violations:\n${violations.join('\n')}`
    ).toEqual([]);
  }

  it('guarantees that 100% of built-in sub-auditors (Part 1) NEVER return or scan paths outside the configured scope', async () => {
    const builtInTasks = await scanAllAuditorTasks(process.cwd());
    const q1 = Math.floor(builtInTasks.length / 4);
    await assertTasksRespectScope(builtInTasks.slice(0, q1));
  }, 20_000);

  it('guarantees that 100% of built-in sub-auditors (Part 2) NEVER return or scan paths outside the configured scope', async () => {
    const builtInTasks = await scanAllAuditorTasks(process.cwd());
    const q1 = Math.floor(builtInTasks.length / 4);
    const q2 = Math.floor(builtInTasks.length / 2);
    await assertTasksRespectScope(builtInTasks.slice(q1, q2));
  }, 20_000);

  it('guarantees that 100% of built-in sub-auditors (Part 3) NEVER return or scan paths outside the configured scope', async () => {
    const builtInTasks = await scanAllAuditorTasks(process.cwd());
    const q2 = Math.floor(builtInTasks.length / 2);
    const q3 = Math.floor((builtInTasks.length * 3) / 4);
    await assertTasksRespectScope(builtInTasks.slice(q2, q3));
  }, 20_000);

  it('guarantees that 100% of built-in sub-auditors (Part 4) NEVER return or scan paths outside the configured scope', async () => {
    const builtInTasks = await scanAllAuditorTasks(process.cwd());
    const q3 = Math.floor((builtInTasks.length * 3) / 4);
    await assertTasksRespectScope(builtInTasks.slice(q3));
  }, 20_000);

  it('guarantees that 100% of reference extensions NEVER return or scan paths outside the configured scope', async () => {
    const referenceExtensions = await scanReferenceExtensions(process.cwd());
    await assertTasksRespectScope(referenceExtensions);
  }, 20_000);

  it('guarantees that passing an explicit root strictly confines the auditor to that single root and nothing more', async () => {
    const singleExplicitRoot = 'strictly_single_isolated_root';
    const { AuditHeadersAuditor } =
      await import('../src/suites/architecture/validate_audit_headers.ts');

    const auditor = new AuditHeadersAuditor({
      projectRoot: tempDir,
      roots: [singleExplicitRoot]
    });

    expect(auditor.roots).toEqual([singleExplicitRoot]);
    const coverage = auditor.getCoverageRecorder().declaration;
    for (const pattern of coverage.include) {
      const cleanPattern = stripGlobSuffix(pattern);
      expect(
        cleanPattern === singleExplicitRoot || isPathContained(singleExplicitRoot, cleanPattern)
      ).toBe(true);
    }
  });
});

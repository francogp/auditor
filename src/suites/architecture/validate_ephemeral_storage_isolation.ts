/**
 * scripts/auditors/architecture/validate_ephemeral_storage_isolation.ts
 *
 * EPHEMERAL STORAGE & SCRATCH ISOLATION AUDITOR (Node.js 26+ Native)
 *
 * Enforces repository architecture, file hygiene, and ephemeral storage isolation:
 *   1. Ephemeral Directories in Source Roots (`ephemeral-no-source-temp-dirs`):
 *      Forbids temporary or ephemeral folders (`temp/`, `tmp/`, `temp_*`, `ephemeral/`, `scratch/`)
 *      inside source code directories (`src/`, `scripts/`, `tests/`, `supabase/`, `data/`, `database/`).
 *   2. Prohibit Ignoring Source Code Temp in .gitignore (`ephemeral-no-gitignore-source-temp`):
 *      Forbids adding temporary directories or files inside source trees to `.gitignore`
 *      (e.g. `src/temp`, `supabase/temp_supabase/`, `database/temp`). All temporary persistence
 *      and scratch artifacts MUST reside in `scratch/`.
 *   3. Ephemeral Source Directory References in Code (`ephemeral-no-source-temp-references`):
 *      Forbids source code, scripts, or tests from targeting or referencing ephemeral paths
 *      inside source trees instead of `scratch/`.
 *
 * Escape Hatches:
 *   `// scratch-ok`, `// temp-ok`, `-- scratch-ok`
 *
 * Usage:
 *   node --permission --experimental-strip-types --allow-fs-read=* scripts/auditors/architecture/validate_ephemeral_storage_isolation.ts
 *   npm run validate:ephemeral-storage-isolation
 */

import fs from 'node:fs';
import path from 'node:path';
import { enableCompileCache } from 'node:module';
import { BaseAuditor } from '../../core/auditorBase.ts';

enableCompileCache();

export type EphemeralStorageRuleId =
  | 'ephemeral-no-source-temp-dirs'
  | 'ephemeral-no-gitignore-source-temp'
  | 'ephemeral-no-source-temp-references';

export const EPHEMERAL_STORAGE_RULES: readonly EphemeralStorageRuleId[] = [
  'ephemeral-no-source-temp-dirs',
  'ephemeral-no-gitignore-source-temp',
  'ephemeral-no-source-temp-references'
] as const;

export const CANONICAL_SOURCE_ROOTS = ['src', 'scripts', 'tests', 'supabase', 'data', 'database'] as const;
const FORBIDDEN_DIR_NAMES = new Set(['temp', 'tmp', '.temp', '.tmp', 'ephemeral', 'scratch']);
const FORBIDDEN_DIR_PREFIXES = ['temp_', 'tmp_'];

const DEFAULT_ALLOWED_DATABASE_DIRS = new Set(['backups', 'migrations', 'schemas']);
const DEFAULT_ALLOWED_DATABASE_FILES = new Set(['AGENTS.md', '.gitkeep']);

const FORBIDDEN_CODE_REF_REGEX = /(?:['"`]|(?:path\.(?:resolve|join)\([^)]*))\b(?:src|scripts|tests|supabase|data|database)\/(?:temp|tmp|temp_[a-zA-Z0-9_]+|tmp_[a-zA-Z0-9_]+)\b/;
const GITIGNORE_FORBIDDEN_REGEX = /(?:^|\/)(?:src|scripts|tests|supabase|data|database)\/(?:temp|tmp|\.temp|\.tmp|temp_|tmp_)/;

export interface EphemeralStorageIsolationAuditorOptions {
  projectRoot?: string;
  allowedDatabaseDirs?: ReadonlySet<string>;
  allowedDatabaseFiles?: ReadonlySet<string>;
}

export class EphemeralStorageIsolationAuditor extends BaseAuditor<EphemeralStorageRuleId> {
  private readonly allowedDatabaseDirs: ReadonlySet<string>;
  private readonly allowedDatabaseFiles: ReadonlySet<string>;

  constructor(optionsOrRoot?: EphemeralStorageIsolationAuditorOptions | string) {
    const options: EphemeralStorageIsolationAuditorOptions =
      typeof optionsOrRoot === 'string'
        ? { projectRoot: optionsOrRoot }
        : (optionsOrRoot ?? {});

    super({
      id: 'validate_ephemeral_storage_isolation',
      name: 'Ephemeral Storage & Scratch Isolation Validator',
      description: 'Aislamiento estricto de archivos temporales en scratch/',
      family: 'architecture',
      ruleIds: EPHEMERAL_STORAGE_RULES,
      packageName: 'Aislamiento',
      ruleDescriptions: {
        'ephemeral-no-source-temp-dirs': 'Carpeta temporal en código',
        'ephemeral-no-gitignore-source-temp': 'Entrada temporal en .gitignore',
        'ephemeral-no-source-temp-references': 'Referencia a carpeta temporal'
      },
      roots: [...CANONICAL_SOURCE_ROOTS],
      allowedExtensions: new Set(['.ts', '.vue', '.js', '.sql', '.sh']),
      projectRoot: options.projectRoot
    });

    this.allowedDatabaseDirs = options.allowedDatabaseDirs ?? DEFAULT_ALLOWED_DATABASE_DIRS;
    this.allowedDatabaseFiles = options.allowedDatabaseFiles ?? DEFAULT_ALLOWED_DATABASE_FILES;
  }

  public override runAudit(): void {
    this.context.logStep(1, 3, 'Verificando ausencia de directorios efímeros en árboles de código fuente...');
    this.scanSourceDirectoriesOnDisk();

    this.context.logStep(2, 3, 'Auditando reglas de .gitignore contra rutas temporales de código fuente...');
    this.scanGitignoreRules();

    this.context.logStep(3, 3, 'Inspeccionando referencias a carpetas temporales en código fuente...');
    this.scanSourceCodeReferences();
  }

  private scanSourceDirectoriesOnDisk(): void {
    for (const root of CANONICAL_SOURCE_ROOTS) {
      const rootDir = path.resolve(this.projectRoot, root);
      if (!fs.existsSync(rootDir)) continue;

      this.walkAndCheckDirectory(rootDir, root);
    }
  }

  private walkAndCheckDirectory(currentDir: string, rootName: string): void {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    const relToRoot = path.relative(this.projectRoot, currentDir).split(path.sep).join(path.posix.sep);

    // Strict validation for database root if present
    if (rootName === 'database' && relToRoot === 'database') {
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (!this.allowedDatabaseDirs.has(entry.name)) {
            this.addViolation({
              ruleId: 'ephemeral-no-source-temp-dirs',
              severity: 'error',
              file: `database/${entry.name}`,
              line: 1,
              message: `Forbidden directory 'database/${entry.name}' detected. All temporary databases, test simulation exports, and scratch artifacts must reside strictly inside 'scratch/database/'.`,
              context: `database/${entry.name}`
            });
          }
        } else if (entry.isFile()) {
          if (!entry.name.startsWith('.') && !this.allowedDatabaseFiles.has(entry.name)) {
            this.addViolation({
              ruleId: 'ephemeral-no-source-temp-dirs',
              severity: 'error',
              file: `database/${entry.name}`,
              line: 1,
              message: `Forbidden file 'database/${entry.name}' detected under database root. Ephemeral files must reside in 'scratch/database/'.`,
              context: `database/${entry.name}`
            });
          }
        }
      }
    }

    // Generic recursive check across all source directories
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name === 'node_modules' || entry.name === '.git') continue;

      const subPath = path.join(currentDir, entry.name);
      const relSubPath = path.relative(this.projectRoot, subPath).split(path.sep).join(path.posix.sep);

      const isForbiddenName =
        FORBIDDEN_DIR_NAMES.has(entry.name.toLowerCase()) ||
        FORBIDDEN_DIR_PREFIXES.some(prefix => entry.name.toLowerCase().startsWith(prefix));

      if (isForbiddenName) {
        this.addViolation({
          ruleId: 'ephemeral-no-source-temp-dirs',
          severity: 'error',
          file: relSubPath,
          line: 1,
          message: `Forbidden ephemeral directory '${relSubPath}' detected in source tree. All temporary artifacts, test dumps, and caches must reside strictly in 'scratch/'.`,
          context: relSubPath
        });
      }

      this.walkAndCheckDirectory(subPath, rootName);
    }
  }

  private scanGitignoreRules(): void {
    const gitignorePath = path.resolve(this.projectRoot, '.gitignore');
    if (!fs.existsSync(gitignorePath)) return;

    try {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]?.trim() || '';
        if (!line || line.startsWith('#')) continue;

        if (
          GITIGNORE_FORBIDDEN_REGEX.test(line) &&
          !this.isLineIgnored(line, ['scratch-ok', 'temp-ok'])
        ) {
          this.addViolation({
            ruleId: 'ephemeral-no-gitignore-source-temp',
            severity: 'error',
            file: '.gitignore',
            line: i + 1,
            message: `Ignoring temporary folders inside source directories in .gitignore is forbidden ('${line}'). Ephemeral assets must reside in 'scratch/', not inside source code trees.`,
            context: line
          });
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  private scanSourceCodeReferences(): void {
    const existingRoots = CANONICAL_SOURCE_ROOTS.filter(r => fs.existsSync(path.resolve(this.projectRoot, r)));
    const scannableFiles = this.context.collectFiles(
      existingRoots,
      new Set(['.ts', '.vue', '.js', '.sql', '.sh'])
    );

    for (const filePath of scannableFiles) {
      const relPath = path.relative(this.projectRoot, filePath).split(path.sep).join(path.posix.sep);

      // Skip this auditor and its unit test to prevent self-referential false positives
      if (
        relPath.endsWith('validate_ephemeral_storage_isolation.ts') ||
        relPath.endsWith('validate_ephemeral_storage_isolation.test.ts')
      ) {
        continue;
      }

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        this.filesScannedCount++;

        if (content.includes('/temp') || content.includes('/tmp')) {
          const lines = content.split('\n');
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i] || '';
            if (this.isLineIgnored(line, ['scratch-ok', 'temp-ok'])) continue;

            if (FORBIDDEN_CODE_REF_REGEX.test(line)) {
              this.addViolation({
                ruleId: 'ephemeral-no-source-temp-references',
                severity: 'error',
                file: relPath,
                line: i + 1,
                message: `Forbidden reference to ephemeral path inside source code tree. All temporary databases, test simulation exports, and scratch artifacts must reside strictly inside 'scratch/'.`,
                context: line.trim()
              });
            }
          }
        }
      } catch {
        // Ignore read errors
      }
    }
  }
}

// ─── CLI Entrypoint ─────────────────────────────────────────────────────────
if (
  process.argv[1] &&
  import.meta.filename &&
  path.basename(process.argv[1]) === path.basename(import.meta.filename)
) {
  await BaseAuditor.runCli(new EphemeralStorageIsolationAuditor());
}

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
import { BaseAuditor } from '../../core/auditorBase.ts';
export type EphemeralStorageRuleId = 'ephemeral-no-source-temp-dirs' | 'ephemeral-no-gitignore-source-temp' | 'ephemeral-no-source-temp-references';
export declare const EPHEMERAL_STORAGE_RULES: readonly EphemeralStorageRuleId[];
export declare const CANONICAL_SOURCE_ROOTS: readonly ["src", "scripts", "tests", "supabase", "data", "database"];
export declare function getEffectiveSourceRoots(projectRoot?: string): readonly string[];
export interface EphemeralStorageIsolationAuditorOptions {
    projectRoot?: string;
    roots?: readonly string[];
    allowedDatabaseDirs?: ReadonlySet<string>;
    allowedDatabaseFiles?: ReadonlySet<string>;
}
export declare class EphemeralStorageIsolationAuditor extends BaseAuditor<EphemeralStorageRuleId> {
    private readonly allowedDatabaseDirs;
    private readonly allowedDatabaseFiles;
    constructor(optionsOrRoot?: EphemeralStorageIsolationAuditorOptions | string);
    runAudit(): void;
    private scanSourceDirectoriesOnDisk;
    private checkDatabaseDirectoryEntry;
    private checkSubDirectory;
    private walkAndCheckDirectory;
    private scanGitignoreRules;
    private scanSourceCodeReferences;
}
//# sourceMappingURL=validate_ephemeral_storage_isolation.d.ts.map
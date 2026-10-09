/**
 * scripts/auditors/persistence/validate_sql_anti_patterns.ts
 *
 * SQL & PERSISTENCE ANTI-PATTERNS AUDITOR (Node.js 26+ Native)
 *
 * Enforces database schema, SQL integrity, and persistence architecture rules:
 *   1. No Positional Array Mutations (`sql-no-positional-arrays`):
 *      Forbids hardcoded array indices (e.g. `$.team[0]`, `team->0`, `jsonb_set(..., '{team,0}', ...)`)
 *      in SQL migrations and queries modifying serialized JSON/JSONB fields.
 *   2. PL/pgSQL Variable Declaration Integrity (`sql-plpgsql-declared-variables`):
 *      Ensures loop variables in `FOR var IN ... LOOP` within PL/pgSQL functions or `DO $$` blocks
 *      are explicitly declared in the `DECLARE` section to prevent runtime database failures.
 *   3. RLS Policy Grant Integrity (`sql-rls-policy-grant-integrity`):
 *      Ensures every table with `ENABLE ROW LEVEL SECURITY` has at least one associated `CREATE POLICY`.
 *   4. Database Payload Snake Case Mandate (`db-payload-snake-case`):
 *      Detects camelCase keys in object literals passed to `.insert()`, `.update()`, or `.upsert()`
 *      on database tables in `src/`, requiring strictly `snake_case` column keys.
 *   5. Uncoordinated Save Storage Bypass (`storage-uncoordinated-save-bypass`):
 *      Detects direct `localStorage.setItem` calls mutating state outside the authorized
 *      persistence architecture.
 *
 * Escape Hatches:
 *   `-- sql-ok`, `// sql-ok`, `-- plpgsql-ok`, `-- rls-ok`, `// db-ok`, `// storage-ok`
 *
 * Usage:
 *   npm run validate:sql-anti-patterns
 */
import { BaseAuditor } from '../../core/auditorBase.ts';
export type SqlAntiPatternRuleId = 'sql-no-positional-arrays' | 'sql-plpgsql-declared-variables' | 'sql-rls-policy-grant-integrity' | 'db-payload-snake-case';
export declare const SQL_ANTI_PATTERN_RULES: readonly SqlAntiPatternRuleId[];
export declare function getPositionalJsonMutationRegex(): RegExp;
export declare const POSITIONAL_JSON_MUTATION_REGEX: RegExp;
export declare class SqlAntiPatternsAuditor extends BaseAuditor<SqlAntiPatternRuleId> {
    private readonly configuredMigrationsDir;
    constructor(customMigrationsDir?: string, projectRoot?: string);
    runAudit(): void;
    private markSqlRulesNotApplicable;
    private resolveMigrationScanDirs;
    private scanSingleSqlFile;
    private scanSingleSqlDirectory;
    private collectAndScanMigrations;
    private scanSourceFiles;
    private scanSqlFile;
    private checkPlpgsqlLoops;
    private scanPlpgsqlUndeclaredVariables;
    private collectRlsMigrations;
    private scanRlsPolicyIntegrity;
    protected scanTypeScriptFile(relPath: string, content: string): void;
}
//# sourceMappingURL=validate_sql_anti_patterns.d.ts.map
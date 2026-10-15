import { BaseAuditor } from "../../core/auditorBase.js";
//#region src/suites/persistence/validate_sql_anti_patterns.d.ts
export type SqlAntiPatternRuleId = 'sql-no-positional-arrays' | 'sql-plpgsql-declared-variables' | 'sql-rls-policy-grant-integrity' | 'db-payload-snake-case';
export declare const SQL_ANTI_PATTERN_RULES: readonly SqlAntiPatternRuleId[];
export declare const SQL_LOOP_HEADER_MAX_CHARS = 120;
export declare function getPositionalJsonMutationRegex(): RegExp;
export declare const POSITIONAL_JSON_MUTATION_REGEX: RegExp;
export declare class SqlAntiPatternsAuditor extends BaseAuditor<SqlAntiPatternRuleId> {
  private readonly configuredMigrationsDir;
  constructor(customMigrationsDir?: string, projectRoot?: string);
  runAudit(): void;
  private scanPositionalArrays;
  private scanPlpgsqlVariables;
  private resolveMigrationScanDirs;
  private collectSqlMigrations;
  private scanSourceFiles;
  private checkPlpgsqlLoops;
  private scanPlpgsqlUndeclaredVariables;
  private collectRlsMigrations;
  private scanRlsPolicyIntegrity;
  protected scanTypeScriptFile(relPath: string, content: string): void;
}
//#endregion
import { BaseAuditor } from "../../core/auditorBase.js";
export type SqlAntiPatternRuleId = 'sql-no-positional-arrays' | 'sql-plpgsql-declared-variables' | 'sql-rls-policy-grant-integrity' | 'db-payload-snake-case';
export declare const SQL_ANTI_PATTERN_RULES: readonly SqlAntiPatternRuleId[];
export declare const SQL_LOOP_HEADER_MAX_CHARS = 120;
export declare function getPositionalJsonMutationRegex(): RegExp;
export declare const POSITIONAL_JSON_MUTATION_REGEX: RegExp;
export interface SqlAntiPatternsAuditorOptions {
  readonly customMigrationsDir?: string;
  readonly projectRoot?: string;
}
export declare class SqlAntiPatternsAuditor extends BaseAuditor<SqlAntiPatternRuleId> {
  private readonly configuredMigrationsDir;
  constructor(options?: SqlAntiPatternsAuditorOptions);
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
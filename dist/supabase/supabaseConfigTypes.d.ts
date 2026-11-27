/**
 * src/supabase/supabaseConfigTypes.ts
 *
 * Domain contracts and zero-hardcoding validation for `@francogp/auditor/supabase`.
 */
export declare const SUPABASE_LITE_STORAGE_MODES: readonly ["volume", "tmpfs"];
export type SupabaseLiteStorageMode = (typeof SUPABASE_LITE_STORAGE_MODES)[number];
export declare const SUPABASE_PROFILE_KINDS: readonly ["remote", "localFull", "lite"];
export type SupabaseProfileKind = (typeof SUPABASE_PROFILE_KINDS)[number];
export type SupabaseComposeProfileKind = Exclude<SupabaseProfileKind, 'lite'>;
export interface SupabaseDockerImageConfig {
  readonly registry?: string;
  readonly user: string;
  readonly repo: string;
  readonly tag: string;
}
export interface SupabaseRemoteProfileConfig {
  readonly enabled: boolean;
  readonly includeLogs: boolean;
  readonly image: SupabaseDockerImageConfig;
  readonly volumes: {
    readonly shared: string;
    readonly dbData: string;
    readonly dbConfig: string;
    readonly storage: string;
  };
  readonly security: {
    readonly bindLoopback: boolean;
  };
  readonly postGenerateCommand?: string;
}
export interface SupabaseLocalFullProfileConfig {
  readonly enabled: boolean;
  readonly includeLogs: boolean;
  readonly realtimeTenantName: string;
  readonly ports: {
    readonly api: number;
    readonly postgres: number;
    readonly pooler: number;
    readonly studio: number;
  };
  readonly autoApplyMigrations: boolean;
  readonly postGenerateCommand?: string;
}
export interface SupabaseLiteNginxConfig {
  readonly clientMaxBodySize?: string;
  readonly proxyRoot?: boolean;
  readonly extraDirectives?: string;
}
export interface SupabaseLiteProfileConfig {
  readonly enabled: boolean;
  readonly storage: SupabaseLiteStorageMode;
  readonly volumeName?: string;
  readonly externalVolume?: boolean;
  readonly nginx?: SupabaseLiteNginxConfig;
  readonly images: {
    readonly postgres: string;
    readonly postgrest: string;
    readonly nginx: string;
  };
  readonly ports: {
    readonly postgres: number;
    readonly gateway: number;
  };
  readonly schemas: readonly string[];
  readonly autoSyncMigrations: boolean;
  readonly postGenerateCommand?: string;
  readonly dbEnv?: ReadonlyMap<string, string>;
  readonly restEnv?: ReadonlyMap<string, string>;
  readonly customComposeOverlay?: string;
}
export declare const MIN_POSTGRES_MAJOR: 12;
export interface SupabaseDockerExtensionsConfig {
  readonly extraEnvVars?: ReadonlyMap<string, string>;
  readonly customComposeOverlay?: string;
  readonly postMigrateSql?: string;
  readonly initDir?: string;
  readonly migrationExcludePatterns?: readonly string[];
}
export interface SupabaseDockerConfig {
  readonly enabled: boolean;
  readonly projectSlug: string;
  readonly upstreamRef: string;
  readonly supabaseDir: string;
  readonly masterEnvFile: string;
  readonly postgres: {
    readonly expectedMajor: number;
    readonly allowMajorUpgrade?: boolean;
    readonly adminRole?: string;
  };
  readonly extensions?: SupabaseDockerExtensionsConfig;
  readonly profiles: {
    readonly remote?: SupabaseRemoteProfileConfig;
    readonly localFull?: SupabaseLocalFullProfileConfig;
    readonly lite?: ReadonlyMap<string, SupabaseLiteProfileConfig>;
  };
}
export interface SupabaseValidationReport {
  readonly valid: boolean;
  readonly profile: SupabaseProfileKind;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}
export interface SupabaseComposeTransformOptions {
  readonly logsComposeYaml?: string;
  readonly overlayYaml?: string;
}
export interface SupabaseComposeTransformResult {
  readonly yaml: string;
  readonly report: SupabaseValidationReport;
}
export interface SupabaseLiteComposeTarget {
  readonly projectSlug: string;
  readonly profileName: string;
  readonly profile: SupabaseLiteProfileConfig;
}
export interface SupabaseLiteCredentials {
  readonly postgresPassword: string;
  readonly jwtSecret: string;
}
export interface SupabaseLiteRuntimeEnv {
  readonly url: string;
  readonly anonKey: string;
  readonly serviceRoleKey: string;
  readonly postgresUrl: string;
  readonly postgresPassword: string;
  readonly jwtSecret: string;
  readonly envFilePath: string;
}
export interface SupabaseUpgradeManifestInput {
  readonly fromVolume: string;
  readonly toVolume: string;
  readonly fromMajor: number;
  readonly toMajor: number;
  readonly backupFile: string;
  readonly backupContent: Buffer;
  readonly tableCounts: ReadonlyMap<string, number>;
}
export interface SupabaseUpgradeOptions {
  readonly fromVolume: string;
  readonly toVolume: string;
  readonly fromMajor: number;
  readonly targetMajor: number;
  readonly liteProfileName?: string;
  readonly dbConfigVolume?: string;
  readonly sourceContainer?: string;
  readonly targetContainer?: string;
}
export interface SupabaseMigrationSyncResult {
  readonly applied: readonly string[];
  readonly skipped: number;
}
export interface SupabaseUpgradeManifest {
  readonly timestamp: string;
  readonly fromVolume: string;
  readonly toVolume: string;
  readonly fromMajor: number;
  readonly toMajor: number;
  readonly backupFile: string;
  readonly sha256: string;
  readonly tableCounts: ReadonlyMap<string, number>;
}
export interface SupabaseUpstreamMetadata {
  readonly postgresImage: string;
  readonly postgresTag: string;
  readonly postgresMajor: number;
  readonly postgrestImage: string;
  readonly gatewayService: string;
}
export declare const DEFAULT_SUPABASE_DOCKER_CONFIG: SupabaseDockerConfig;
/**
 * Validates that a `SupabaseDockerConfig` declares all mandatory fields when enabled.
 */
export declare function validateSupabaseDockerConfig(config: SupabaseDockerConfig): readonly string[];
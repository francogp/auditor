/**
 * src/supabase/supabaseConfigTypes.ts
 *
 * Domain contracts and zero-hardcoding validation for `@francogp/auditor/supabase`.
 */

export const SUPABASE_LITE_STORAGE_MODES = ['volume', 'tmpfs'] as const;
export type SupabaseLiteStorageMode = (typeof SUPABASE_LITE_STORAGE_MODES)[number];

export const SUPABASE_PROFILE_KINDS = ['remote', 'localFull', 'lite'] as const;
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

const MAX_TCP_PORT = 65535 as const;
export const MIN_POSTGRES_MAJOR = 12 as const;

export interface SupabaseDockerExtensionsConfig {
  readonly extraEnvVars?: ReadonlyMap<string, string>;
  readonly customComposeOverlay?: string;
  readonly postMigrateSql?: string;
  readonly initDir?: string;
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

export const DEFAULT_SUPABASE_DOCKER_CONFIG: SupabaseDockerConfig = {
  enabled: false,
  projectSlug: '',
  upstreamRef: '',
  supabaseDir: '',
  masterEnvFile: '',
  postgres: {
    expectedMajor: 0,
    allowMajorUpgrade: false
  },
  profiles: {}
};

function requireNonEmpty(value: string | undefined, field: string, errors: string[]): void {
  if (!value || value.trim().length === 0) {
    errors.push(`supabaseDocker.${field} is required when supabaseDocker.enabled is true.`);
  }
}

function requireValidPort(port: number | undefined, field: string, errors: string[]): void {
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > MAX_TCP_PORT) {
    errors.push(`supabaseDocker.${field} must be a valid TCP port (1-${MAX_TCP_PORT}).`);
  }
}

function validateRemoteProfile(
  remote: SupabaseRemoteProfileConfig | undefined,
  errors: string[]
): void {
  if (!remote?.enabled) return;
  requireNonEmpty(remote.image?.user, 'profiles.remote.image.user', errors);
  requireNonEmpty(remote.image?.repo, 'profiles.remote.image.repo', errors);
  requireNonEmpty(remote.image?.tag, 'profiles.remote.image.tag', errors);
  requireNonEmpty(remote.volumes?.shared, 'profiles.remote.volumes.shared', errors);
  requireNonEmpty(remote.volumes?.dbData, 'profiles.remote.volumes.dbData', errors);
  requireNonEmpty(remote.volumes?.dbConfig, 'profiles.remote.volumes.dbConfig', errors);
  requireNonEmpty(remote.volumes?.storage, 'profiles.remote.volumes.storage', errors);
}

function validateLocalFullProfile(
  localFull: SupabaseLocalFullProfileConfig | undefined,
  errors: string[]
): void {
  if (!localFull?.enabled) return;
  requireNonEmpty(localFull.realtimeTenantName, 'profiles.localFull.realtimeTenantName', errors);
  requireValidPort(localFull.ports?.api, 'profiles.localFull.ports.api', errors);
  requireValidPort(localFull.ports?.postgres, 'profiles.localFull.ports.postgres', errors);
  requireValidPort(localFull.ports?.pooler, 'profiles.localFull.ports.pooler', errors);
  requireValidPort(localFull.ports?.studio, 'profiles.localFull.ports.studio', errors);
}

function validateLiteProfiles(
  lite: ReadonlyMap<string, SupabaseLiteProfileConfig> | undefined,
  errors: string[]
): void {
  if (!lite) return;
  for (const [name, profile] of lite.entries()) {
    if (!profile.enabled) continue;
    requireNonEmpty(profile.images?.postgres, `profiles.lite.${name}.images.postgres`, errors);
    requireNonEmpty(profile.images?.postgrest, `profiles.lite.${name}.images.postgrest`, errors);
    requireNonEmpty(profile.images?.nginx, `profiles.lite.${name}.images.nginx`, errors);
    requireValidPort(profile.ports?.postgres, `profiles.lite.${name}.ports.postgres`, errors);
    requireValidPort(profile.ports?.gateway, `profiles.lite.${name}.ports.gateway`, errors);
    if (!Array.isArray(profile.schemas) || profile.schemas.length === 0) {
      errors.push(`supabaseDocker.profiles.lite.${name}.schemas must contain at least one schema.`);
    }
  }
}

/**
 * Validates that a `SupabaseDockerConfig` declares all mandatory fields when enabled.
 */
export function validateSupabaseDockerConfig(config: SupabaseDockerConfig): readonly string[] {
  if (!config.enabled) return [];
  const errors: string[] = [];

  requireNonEmpty(config.projectSlug, 'projectSlug', errors);
  requireNonEmpty(config.upstreamRef, 'upstreamRef', errors);
  requireNonEmpty(config.supabaseDir, 'supabaseDir', errors);
  requireNonEmpty(config.masterEnvFile, 'masterEnvFile', errors);

  if (
    !Number.isInteger(config.postgres?.expectedMajor) ||
    config.postgres.expectedMajor < MIN_POSTGRES_MAJOR
  ) {
    errors.push(
      `supabaseDocker.postgres.expectedMajor must be an integer >= ${MIN_POSTGRES_MAJOR}.`
    );
  }

  validateRemoteProfile(config.profiles?.remote, errors);
  validateLocalFullProfile(config.profiles?.localFull, errors);
  validateLiteProfiles(config.profiles?.lite, errors);

  return errors;
}

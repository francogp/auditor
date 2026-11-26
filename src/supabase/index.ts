/**
 * src/supabase/index.ts
 *
 * Public entrypoint for `@francogp/auditor/supabase`.
 */

export {
  DEFAULT_SUPABASE_DOCKER_CONFIG,
  SUPABASE_LITE_STORAGE_MODES,
  SUPABASE_PROFILE_KINDS,
  validateSupabaseDockerConfig,
  type SupabaseComposeTransformOptions,
  type SupabaseComposeTransformResult,
  type SupabaseDockerConfig,
  type SupabaseDockerExtensionsConfig,
  type SupabaseDockerImageConfig,
  type SupabaseLiteComposeTarget,
  type SupabaseLiteCredentials,
  type SupabaseLiteNginxConfig,
  type SupabaseLiteProfileConfig,
  type SupabaseLiteRuntimeEnv,
  type SupabaseLiteStorageMode,
  type SupabaseLocalFullProfileConfig,
  type SupabaseMigrationSyncResult,
  type SupabaseProfileKind,
  type SupabaseRemoteProfileConfig,
  type SupabaseUpgradeManifest,
  type SupabaseUpgradeManifestInput,
  type SupabaseUpgradeOptions,
  type SupabaseUpstreamMetadata,
  type SupabaseValidationReport
} from './supabaseConfigTypes.ts';

export {
  cloneUpstreamSupabaseDocker,
  generateCustomDbDockerfile,
  inspectUpstreamCompose,
  parsePostgresMajorVersion
} from './upstreamSync.ts';

export {
  buildDummyValidationEnv,
  extractComposeEnvPlaceholders,
  transformLocalFullComposeYaml,
  transformRemoteComposeYaml,
  validateComposeWithDocker
} from './composeAstEngine.ts';

export {
  generateLiteBootstrapSql,
  generateLiteComposeYaml,
  generateLiteNginxConf,
  resolveLiteCredentials,
  resolveLiteRuntimeEnv,
  writeLiteProfileArtifacts
} from './liteStackGenerator.ts';

export {
  ensureServerKeys,
  extractServerVars,
  generateServerEnvFiles,
  generateSupabaseKeys,
  isInsecurePlaceholder,
  isManagedCloudServer,
  isValidHs256Jwt,
  listMasterServers,
  parseEnvContent,
  upsertServerBlock,
  validateEnvSecrets,
  type GeneratedServerEnvFile
} from './envOrchestrator.ts';

export {
  buildCustomDbImage,
  composeDown,
  composeRestart,
  composeUp,
  detectContainerPostgresMajor,
  getDetailedStackStatus,
  getStackStatus,
  listOrderedMigrationFiles,
  publishCustomDbImage,
  resolveProfileDbContainerName,
  resolveRemoteImageRef,
  syncDatabaseMigrations,
  type SupabaseMigrationFile
} from './runtimeOrchestrator.ts';

export {
  createUpgradeManifest,
  findUpstreamUpgradeScript,
  runUpgradePostgres
} from './upgradePostgres.ts';

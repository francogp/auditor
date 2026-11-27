#!/usr/bin/env node
/**
 * src/cli/supabase_manage.ts
 *
 * Unified CLI (`auditor-supabase`) for managing Supabase Docker stacks (`remote`, `localFull`, `lite`).
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { enableCompileCache } from 'node:module';
import path from 'node:path';
import readline from 'node:readline/promises';

import { loadAuditConfig, resetAuditConfig } from '../core/auditConfigLoader.ts';
import { COMMON_CLI_ARGS, defineCommand, runMain } from '../core/cli/cittyHarness.ts';
import { safeReadFile, safeResolve, safeWriteFile } from '../core/safePath.ts';
import {
  buildDummyValidationEnv,
  extractComposeEnvPlaceholders,
  transformLocalFullComposeYaml,
  transformRemoteComposeYaml,
  validateComposeWithDocker
} from '../supabase/composeAstEngine.ts';
import {
  ensureServerKeys,
  extractServerVars,
  generateServerEnvFiles,
  isManagedCloudServer,
  listMasterServers,
  upsertServerBlock,
  validateEnvSecrets
} from '../supabase/envOrchestrator.ts';
import {
  generateLiteBootstrapSql,
  resolveLiteCredentials,
  writeLiteProfileArtifacts
} from '../supabase/liteStackGenerator.ts';
import {
  applyBootstrapSql,
  buildCustomDbImage,
  composeDown,
  composeRestart,
  composeUp,
  detectContainerPostgresMajor,
  getDetailedStackStatus,
  publishCustomDbImage,
  resolveProfileDbContainerName,
  syncDatabaseMigrations
} from '../supabase/runtimeOrchestrator.ts';
import {
  MIN_POSTGRES_MAJOR,
  validateSupabaseDockerConfig,
  type SupabaseComposeTransformOptions,
  type SupabaseComposeTransformResult,
  type SupabaseDockerConfig
} from '../supabase/supabaseConfigTypes.ts';
import { runUpgradePostgres } from '../supabase/upgradePostgres.ts';
import {
  cloneUpstreamSupabaseDocker,
  regenerateCustomDbDockerfile
} from '../supabase/upstreamSync.ts';
import { buildQuietNodeEnv, isMainModule } from './cliUtils.ts';

enableCompileCache();

const SUPABASE_CLI_ARGS = {
  ...COMMON_CLI_ARGS,
  config: { type: 'string', description: 'Path to audit.config.ts' }
} as const;

interface LoadedSupabaseContext {
  readonly projectRoot: string;
  readonly config: SupabaseDockerConfig;
  readonly migrationsDir: string;
}

interface GenerateContext {
  readonly projectRoot: string;
  readonly config: SupabaseDockerConfig;
  readonly dockerComposePath: string;
  readonly logsComposePath: string;
  readonly overlayYaml?: string;
}

function resolveProjectRoot(projectArg: string, configArg?: string): string {
  if (!configArg) return path.resolve(projectArg || '.');
  const resolvedConfig = path.resolve(configArg);
  const parent = path.dirname(resolvedConfig);
  return path.basename(parent) === '.auditor' ? path.dirname(parent) : parent;
}

async function loadValidSupabaseConfig(
  projectArg: string,
  configArg?: string
): Promise<LoadedSupabaseContext> {
  const projectRoot = resolveProjectRoot(projectArg, configArg);
  const prevAuditConfig = process.env.AUDIT_CONFIG;
  if (configArg) {
    resetAuditConfig();
    process.env.AUDIT_CONFIG = path.resolve(configArg);
  }
  const auditConfig = await loadAuditConfig(projectRoot).finally(() => {
    if (configArg) {
      if (prevAuditConfig === undefined) delete process.env.AUDIT_CONFIG;
      else process.env.AUDIT_CONFIG = prevAuditConfig;
      resetAuditConfig();
    }
  });
  const supabaseDocker = auditConfig.supabaseDocker;
  if (!supabaseDocker?.enabled) {
    process.stderr.write(
      'supabaseDocker is not enabled in .auditor/audit.config.ts. Set supabaseDocker.enabled = true.\n'
    );
    process.exit(2);
  }
  const errors = validateSupabaseDockerConfig(supabaseDocker);
  if (errors.length > 0) {
    process.stderr.write(`Invalid supabaseDocker configuration:\n- ${errors.join('\n- ')}\n`);
    process.exit(2);
  }
  const migrationsRel = auditConfig.paths.migrationsDir || 'supabase/migrations';
  return {
    projectRoot,
    config: supabaseDocker,
    migrationsDir: safeResolve(projectRoot, migrationsRel)
  };
}

function resolveProfileComposePath(
  projectRoot: string,
  config: SupabaseDockerConfig,
  profile: string
): string {
  if (profile === 'localFull') {
    return safeResolve(
      projectRoot,
      config.supabaseDir,
      'generated',
      'local-full',
      'docker-compose.yml'
    );
  }
  return safeResolve(
    projectRoot,
    config.supabaseDir,
    'generated',
    'lite',
    profile,
    'docker-compose.yml'
  );
}

interface ProfileRuntimeContextArgs {
  readonly project: string;
  readonly profile: string;
  readonly config?: string;
}

interface ProfileRuntimeContext {
  readonly profile: string;
  readonly loaded: LoadedSupabaseContext;
  readonly composePath: string;
  readonly envFilePath?: string;
}

interface RunGenerateOptions {
  readonly profileFilter?: string;
  readonly strictKeys?: boolean;
}

async function loadProfileRuntimeContext(
  args: ProfileRuntimeContextArgs
): Promise<ProfileRuntimeContext> {
  const { profile } = args;
  const loaded = await loadValidSupabaseConfig(args.project, args.config);
  const composePath = resolveProfileComposePath(loaded.projectRoot, loaded.config, profile);
  const envFilePath = await resolveProfileEnvFile(loaded.projectRoot, loaded.config, profile);
  return { profile, loaded, composePath, envFilePath };
}

async function ensureUpstreamCloned(ctx: GenerateContext): Promise<string> {
  if (!fs.existsSync(ctx.dockerComposePath)) {
    await cloneUpstreamSupabaseDocker(ctx.projectRoot, ctx.config);
  }
  return safeReadFile(ctx.dockerComposePath);
}

async function validateGeneratedCompose(
  projectRoot: string,
  outCompose: string,
  yamlContent: string,
  explicitEnvFilePath?: string
): Promise<void> {
  if (explicitEnvFilePath) {
    const check = validateComposeWithDocker(outCompose, explicitEnvFilePath);
    if (!check.ok) {
      process.stderr.write(`docker compose config -q failed:\n${check.stderr}\n`);
      process.exit(1);
    }
    return;
  }
  const placeholders = extractComposeEnvPlaceholders(yamlContent);
  const dummyPath = safeResolve(projectRoot, 'scratch', 'supabase-validate.env');
  const dummyEnv = buildDummyValidationEnv(placeholders);
  try {
    await safeWriteFile(dummyPath, [...dummyEnv.entries()].map(([k, v]) => `${k}=${v}`).join('\n'));
    const composeCheck = validateComposeWithDocker(outCompose, dummyPath);
    if (!composeCheck.ok) {
      process.stderr.write(`docker compose config -q failed:\n${composeCheck.stderr}\n`);
      process.exit(1);
    }
  } finally {
    fs.rmSync(dummyPath, { force: true });
  }
}

async function prepareAndTransformCompose(
  ctx: GenerateContext,
  includeLogs: boolean,
  transformer: (
    baseYaml: string,
    config: SupabaseDockerConfig,
    options?: SupabaseComposeTransformOptions
  ) => SupabaseComposeTransformResult
): Promise<SupabaseComposeTransformResult> {
  const baseYaml = await ensureUpstreamCloned(ctx);
  const logsYaml =
    includeLogs && fs.existsSync(ctx.logsComposePath)
      ? await safeReadFile(ctx.logsComposePath)
      : undefined;
  const transformed = transformer(baseYaml, ctx.config, {
    logsComposeYaml: logsYaml,
    overlayYaml: ctx.overlayYaml
  });
  if (!transformed.report.valid) {
    process.stderr.write(
      `${transformed.report.profile} compose validation failed:\n- ${transformed.report.errors.join('\n- ')}\n`
    );
    process.exit(2);
  }
  return transformed;
}

function runPostGenerateCommand(projectRoot: string, command?: string): void {
  if (!command?.trim()) return;
  const tokens = [...command.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/gu)].map(
    (m) => m[1] ?? m[2] ?? m[3] ?? ''
  );
  const [cmd, ...args] = tokens.filter(Boolean);
  if (cmd)
    execFileSync(cmd, args, { cwd: projectRoot, stdio: 'inherit', env: buildQuietNodeEnv() });
}

function resolveLocalFullEnvFile(
  projectRoot: string,
  config: SupabaseDockerConfig
): string | undefined {
  const localAlias = safeResolve(projectRoot, config.supabaseDir, 'generated', 'local.env');
  if (fs.existsSync(localAlias)) return localAlias;
  const dockerEnv = safeResolve(projectRoot, config.supabaseDir, 'docker', '.env');
  if (fs.existsSync(dockerEnv)) return dockerEnv;
  const masterEnv = safeResolve(projectRoot, config.masterEnvFile);
  return fs.existsSync(masterEnv) ? masterEnv : undefined;
}

async function resolveProfileEnvFile(
  projectRoot: string,
  config: SupabaseDockerConfig,
  profile: string
): Promise<string | undefined> {
  if (profile === 'localFull') {
    return resolveLocalFullEnvFile(projectRoot, config);
  }
  if (config.profiles.lite?.get(profile)) {
    const creds = await resolveLiteCredentials(projectRoot, config, profile);
    return creds.envFilePath;
  }
  return undefined;
}

async function generateRemoteProfile(ctx: GenerateContext, strictKeys: boolean): Promise<void> {
  const remote = ctx.config.profiles.remote;
  if (!remote?.enabled) return;

  const transformed = await prepareAndTransformCompose(
    ctx,
    remote.includeLogs,
    transformRemoteComposeYaml
  );
  const outCompose = safeResolve(
    ctx.projectRoot,
    ctx.config.supabaseDir,
    'generated',
    'docker-compose.yml'
  );
  await safeWriteFile(outCompose, transformed.yaml);
  const placeholders = extractComposeEnvPlaceholders(transformed.yaml, { requiredOnly: true });

  const masterPath = safeResolve(ctx.projectRoot, ctx.config.masterEnvFile);
  let validationEnvFile: string | undefined;
  if (fs.existsSync(masterPath)) {
    const emittedServers = await generateServerEnvFiles(ctx.projectRoot, ctx.config, {
      ensureKeys: !strictKeys
    });
    for (const entry of emittedServers) {
      if (isManagedCloudServer(entry.vars)) continue;
      const secretErrors = validateEnvSecrets(entry.vars, placeholders);
      if (secretErrors.length > 0) {
        process.stderr.write(
          `Env secret validation failed for server '${entry.server}' (${entry.filePath}):\n- ${secretErrors.join('\n- ')}\n`
        );
        process.exit(2);
      }
      validationEnvFile ??= entry.filePath;
    }
  }
  await validateGeneratedCompose(ctx.projectRoot, outCompose, transformed.yaml, validationEnvFile);
  runPostGenerateCommand(ctx.projectRoot, remote.postGenerateCommand);
  process.stdout.write(`Generated remote compose: ${outCompose}\n`);
}

async function generateLocalFullProfile(ctx: GenerateContext): Promise<void> {
  const localFull = ctx.config.profiles.localFull;
  if (!localFull?.enabled) return;

  const transformed = await prepareAndTransformCompose(
    ctx,
    localFull.includeLogs,
    transformLocalFullComposeYaml
  );
  const outCompose = resolveProfileComposePath(ctx.projectRoot, ctx.config, 'localFull');
  await safeWriteFile(outCompose, transformed.yaml);
  const envFile = resolveLocalFullEnvFile(ctx.projectRoot, ctx.config);
  await validateGeneratedCompose(ctx.projectRoot, outCompose, transformed.yaml, envFile);
  runPostGenerateCommand(ctx.projectRoot, localFull.postGenerateCommand);
  process.stdout.write(`Generated localFull compose: ${outCompose}\n`);
}

async function generateLiteProfiles(
  projectRoot: string,
  config: SupabaseDockerConfig,
  profileFilter?: string
): Promise<void> {
  if (!config.profiles.lite) return;
  for (const [name, liteProfile] of config.profiles.lite.entries()) {
    if (!liteProfile.enabled) continue;
    if (profileFilter && profileFilter !== name && profileFilter !== 'lite') continue;
    const artifacts = await writeLiteProfileArtifacts(projectRoot, config, name);
    const composeCheck = validateComposeWithDocker(artifacts.composePath, artifacts.envFilePath);
    if (!composeCheck.ok) {
      process.stderr.write(
        `docker compose config -q failed for lite.${name}:\n${composeCheck.stderr}\n`
      );
      process.exit(1);
    }
    runPostGenerateCommand(projectRoot, liteProfile.postGenerateCommand);
    process.stdout.write(`Generated lite.${name} compose: ${artifacts.composePath}\n`);
  }
}

async function runGenerate(
  projectRoot: string,
  config: SupabaseDockerConfig,
  options: RunGenerateOptions = {}
): Promise<void> {
  const { profileFilter, strictKeys = false } = options;
  const ctx: GenerateContext = {
    projectRoot,
    config,
    dockerComposePath: safeResolve(projectRoot, config.supabaseDir, 'docker', 'docker-compose.yml'),
    logsComposePath: safeResolve(
      projectRoot,
      config.supabaseDir,
      'docker',
      'docker-compose.logs.yml'
    ),
    overlayYaml: config.extensions?.customComposeOverlay
      ? await safeReadFile(safeResolve(projectRoot, config.extensions.customComposeOverlay))
      : undefined
  };

  const wantsRemote =
    (!profileFilter || profileFilter === 'remote') && Boolean(config.profiles.remote?.enabled);
  const wantsLocalFull =
    (!profileFilter || profileFilter === 'localFull') &&
    Boolean(config.profiles.localFull?.enabled);
  if ((wantsRemote || wantsLocalFull) && fs.existsSync(ctx.dockerComposePath)) {
    await regenerateCustomDbDockerfile(projectRoot, config);
  }

  if (!profileFilter || profileFilter === 'remote') {
    await generateRemoteProfile(ctx, strictKeys);
  }
  if (!profileFilter || profileFilter === 'localFull') {
    await generateLocalFullProfile(ctx);
  }
  await generateLiteProfiles(projectRoot, config, profileFilter);
}

interface SyncMigrationsForProfileOptions {
  readonly bootstrapSqlOverride?: string;
  readonly skipPreflight?: boolean;
}

async function syncMigrationsForProfile(
  loaded: LoadedSupabaseContext,
  profile: string,
  options: SyncMigrationsForProfileOptions = {}
): Promise<void> {
  const { projectRoot, config, migrationsDir } = loaded;
  const containerName = resolveProfileDbContainerName(config.projectSlug, profile);
  const postMigrateSql = config.extensions?.postMigrateSql;
  const preflightDryRun = !options.skipPreflight;

  const excludePatterns = config.extensions?.migrationExcludePatterns;

  if (profile === 'localFull') {
    if (config.profiles.localFull?.autoApplyMigrations) {
      syncDatabaseMigrations(containerName, migrationsDir, {
        preflightDryRun,
        postMigrateSql,
        adminRole: config.postgres.adminRole,
        excludePatterns
      });
    }
    return;
  }
  if (config.profiles.lite?.get(profile)?.autoSyncMigrations) {
    let bootstrap = options.bootstrapSqlOverride;
    if (!bootstrap) {
      const creds = await resolveLiteCredentials(projectRoot, config, profile);
      bootstrap = generateLiteBootstrapSql(creds.jwtSecret, creds.postgresPassword);
    }
    syncDatabaseMigrations(containerName, migrationsDir, {
      bootstrapSql: bootstrap,
      preflightDryRun,
      postMigrateSql,
      adminRole: config.postgres.adminRole,
      excludePatterns
    });
  }
}

export const supabaseManageCommand = defineCommand({
  meta: {
    name: 'auditor-supabase',
    description: 'Unified Supabase Docker stack orchestrator (@francogp/auditor/supabase)'
  },
  args: {
    ...SUPABASE_CLI_ARGS
  },
  subCommands: {
    clone: defineCommand({
      meta: { name: 'clone', description: 'Clone official Supabase docker/ at upstreamRef' },
      args: { ...SUPABASE_CLI_ARGS, ref: { type: 'string', description: 'Override upstreamRef' } },
      async run({ args }) {
        const { projectRoot, config } = await loadValidSupabaseConfig(
          String(args.project),
          args.config
        );
        const meta = await cloneUpstreamSupabaseDocker(projectRoot, config, args.ref);
        process.stdout.write(
          `Cloned upstream docker/ (Postgres ${meta.postgresTag}, gateway=${meta.gatewayService}).\n`
        );
      }
    }),
    generate: defineCommand({
      meta: { name: 'generate', description: 'Generate compose, nginx, and .env artifacts' },
      args: {
        ...SUPABASE_CLI_ARGS,
        profile: { type: 'string', description: 'Filter profile name' },
        'strict-keys': {
          type: 'boolean',
          default: false,
          description: 'Fail without mutating master .env if secrets or JWTs are missing/expired'
        }
      },
      async run({ args }) {
        const { projectRoot, config } = await loadValidSupabaseConfig(
          String(args.project),
          args.config
        );
        await runGenerate(projectRoot, config, {
          profileFilter: args.profile,
          strictKeys: Boolean(args['strict-keys'])
        });
      }
    }),
    'add-server': defineCommand({
      meta: {
        name: 'add-server',
        description:
          'Register or update a remote server in master .env without clobbering valid keys'
      },
      args: {
        ...SUPABASE_CLI_ARGS,
        name: { type: 'string', required: true, description: 'Server name' },
        'non-interactive': {
          type: 'boolean',
          default: false,
          description: 'Generate missing server keys automatically without prompts'
        },
        id: { type: 'string', description: 'Server ID metadata' },
        displayName: { type: 'string', description: 'Server display NAME' },
        region: { type: 'string', description: 'Server REGION' },
        tenantId: { type: 'string', description: 'Tenant ID propagated to POOLER/STORAGE' },
        dashboardUsername: { type: 'string', description: 'Studio DASHBOARD_USERNAME' },
        dashboardPassword: { type: 'string', description: 'Studio DASHBOARD_PASSWORD' },
        apiGwHttpPort: { type: 'string', description: 'API Gateway HTTP port (API_GW_HTTP_PORT)' },
        deployMode: { type: 'string', description: 'Deployment mode (self-hosted or cloud)' }
      },
      async run({ args }) {
        const { projectRoot, config } = await loadValidSupabaseConfig(
          String(args.project),
          args.config
        );
        const serverName = String(args.name);
        const masterPath = safeResolve(projectRoot, config.masterEnvFile);
        const existing = fs.existsSync(masterPath) ? await safeReadFile(masterPath) : '';
        const existingServerVars = extractServerVars(existing, serverName);
        const mergedVars = new Map<string, string>(existingServerVars);
        const optionalMetadata: ReadonlyArray<readonly [string, string | undefined]> = [
          ['ID', args.id],
          ['NAME', args.displayName],
          ['REGION', args.region],
          ['TENANT_ID', args.tenantId],
          ['DASHBOARD_USERNAME', args.dashboardUsername],
          ['DASHBOARD_PASSWORD', args.dashboardPassword],
          ['API_GW_HTTP_PORT', args.apiGwHttpPort],
          ['DEPLOY_MODE', args.deployMode]
        ];
        for (const [envKey, val] of optionalMetadata) {
          if (val?.trim()) mergedVars.set(envKey, val.trim());
        }

        const isCloud = isManagedCloudServer(mergedVars);
        const serverVars = isCloud
          ? mergedVars
          : new Map<string, string>(ensureServerKeys(projectRoot, config, mergedVars).vars);

        if (!isCloud) {
          const errs = validateEnvSecrets(serverVars);
          if (errs.length > 0) {
            process.stderr.write(`Generated keys failed validation:\n- ${errs.join('\n- ')}\n`);
            process.exit(2);
          }
        }

        let publicUrl =
          serverVars.get('API_EXTERNAL_URL') || (isCloud ? '' : 'http://localhost:8000');
        if (!args['non-interactive'] && process.stdin.isTTY) {
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          try {
            const answer = await rl.question(`Public API URL [${publicUrl}]: `);
            if (answer.trim()) publicUrl = answer.trim();
          } finally {
            rl.close();
          }
        }
        if (publicUrl) {
          serverVars.set('API_EXTERNAL_URL', publicUrl);
          serverVars.set('SUPABASE_PUBLIC_URL', publicUrl);
          serverVars.set('SITE_URL', publicUrl);
        }

        const updated = upsertServerBlock(existing, serverName, serverVars);
        await safeWriteFile(masterPath, updated);
        process.stdout.write(
          `Server '${serverName}' updated in ${masterPath}${args['non-interactive'] ? ' (non-interactive)' : ''}.\n`
        );
      }
    }),
    list: defineCommand({
      meta: { name: 'list', description: 'List configured remote servers in master .env' },
      args: { ...SUPABASE_CLI_ARGS },
      async run({ args }) {
        const { projectRoot, config } = await loadValidSupabaseConfig(
          String(args.project),
          args.config
        );
        const masterPath = safeResolve(projectRoot, config.masterEnvFile);
        const content = fs.existsSync(masterPath) ? await safeReadFile(masterPath) : '';
        const servers = listMasterServers(content);
        if (args.json) {
          process.stdout.write(`${JSON.stringify({ servers })}\n`);
          return;
        }
        process.stdout.write(
          servers.length > 0 ? `Servers: ${servers.join(', ')}\n` : 'No servers configured.\n'
        );
      }
    }),
    build: defineCommand({
      meta: { name: 'build', description: 'Build custom Postgres image from <supabaseDir>/docker' },
      args: { ...SUPABASE_CLI_ARGS, tag: { type: 'string', description: 'Override image tag' } },
      async run({ args }) {
        const { projectRoot, config } = await loadValidSupabaseConfig(
          String(args.project),
          args.config
        );
        const image = buildCustomDbImage(projectRoot, config, args.tag);
        process.stdout.write(`Built image: ${image}\n`);
      }
    }),
    publish: defineCommand({
      meta: { name: 'publish', description: 'Push custom Postgres image to registry' },
      args: { ...SUPABASE_CLI_ARGS, tag: { type: 'string', description: 'Override image tag' } },
      async run({ args }) {
        const { config } = await loadValidSupabaseConfig(String(args.project), args.config);
        const image = publishCustomDbImage(config, args.tag);
        process.stdout.write(`Published image: ${image}\n`);
      }
    }),
    release: defineCommand({
      meta: { name: 'release', description: 'Build and publish custom Postgres image' },
      args: { ...SUPABASE_CLI_ARGS, tag: { type: 'string', description: 'Override image tag' } },
      async run({ args }) {
        const { projectRoot, config } = await loadValidSupabaseConfig(
          String(args.project),
          args.config
        );
        buildCustomDbImage(projectRoot, config, args.tag);
        const image = publishCustomDbImage(config, args.tag);
        process.stdout.write(`Released image: ${image}\n`);
      }
    }),
    all: defineCommand({
      meta: { name: 'all', description: 'Clone, generate, build, and publish in sequence' },
      args: { ...SUPABASE_CLI_ARGS, tag: { type: 'string', description: 'Override image tag' } },
      async run({ args }) {
        const { projectRoot, config } = await loadValidSupabaseConfig(
          String(args.project),
          args.config
        );
        await cloneUpstreamSupabaseDocker(projectRoot, config);
        await runGenerate(projectRoot, config, { profileFilter: 'remote' });
        buildCustomDbImage(projectRoot, config, args.tag);
        const image = publishCustomDbImage(config, args.tag);
        process.stdout.write(`All stages completed for: ${image}\n`);
      }
    }),
    up: defineCommand({
      meta: { name: 'up', description: 'Start localFull or lite stack and sync migrations' },
      args: {
        ...SUPABASE_CLI_ARGS,
        profile: {
          type: 'string',
          required: true,
          description: 'Profile name (localFull or lite key)'
        }
      },
      async run({ args }) {
        const loaded = await loadValidSupabaseConfig(String(args.project), args.config);
        const profile = String(args.profile);
        if (profile === 'localFull') {
          await runGenerate(loaded.projectRoot, loaded.config, { profileFilter: profile });
          const composePath = resolveProfileComposePath(
            loaded.projectRoot,
            loaded.config,
            'localFull'
          );
          const envFile = resolveLocalFullEnvFile(loaded.projectRoot, loaded.config);
          composeUp(composePath, envFile);
          await syncMigrationsForProfile(loaded, profile);
          return;
        }
        const artifacts = await writeLiteProfileArtifacts(
          loaded.projectRoot,
          loaded.config,
          profile
        );
        const dbService = resolveProfileDbContainerName(loaded.config.projectSlug, profile);
        composeUp(artifacts.composePath, artifacts.envFilePath, [dbService]);
        if (loaded.config.profiles.lite?.get(profile)?.autoSyncMigrations) {
          await syncMigrationsForProfile(loaded, profile, {
            bootstrapSqlOverride: artifacts.bootstrapSql
          });
        } else {
          applyBootstrapSql(dbService, artifacts.bootstrapSql, loaded.config.postgres.adminRole);
        }
        composeUp(artifacts.composePath, artifacts.envFilePath);
      }
    }),
    down: defineCommand({
      meta: { name: 'down', description: 'Stop localFull or lite stack' },
      args: {
        ...SUPABASE_CLI_ARGS,
        profile: { type: 'string', required: true, description: 'Profile name' },
        volumes: { type: 'boolean', default: false, description: 'Remove volumes' }
      },
      async run({ args }) {
        const { composePath, envFilePath } = await loadProfileRuntimeContext(args);
        composeDown(composePath, { removeVolumes: Boolean(args.volumes), envFilePath });
      }
    }),
    restart: defineCommand({
      meta: { name: 'restart', description: 'Restart localFull or lite stack' },
      args: {
        ...SUPABASE_CLI_ARGS,
        profile: { type: 'string', required: true, description: 'Profile name' }
      },
      async run({ args }) {
        const { profile, loaded, composePath, envFilePath } = await loadProfileRuntimeContext(args);
        composeRestart(composePath, envFilePath);
        await syncMigrationsForProfile(loaded, profile);
      }
    }),
    status: defineCommand({
      meta: {
        name: 'status',
        description: 'Show running Supabase containers, PG version, and migrations'
      },
      args: {
        ...SUPABASE_CLI_ARGS,
        profile: { type: 'string', description: 'Optional profile name (localFull or lite key)' }
      },
      async run({ args }) {
        const { config } = await loadValidSupabaseConfig(String(args.project), args.config);
        process.stdout.write(`${getDetailedStackStatus(config, args.profile)}\n`);
      }
    }),
    migrate: defineCommand({
      meta: {
        name: 'migrate',
        description: 'Apply pending SQL migrations to running DB container'
      },
      args: {
        ...SUPABASE_CLI_ARGS,
        profile: { type: 'string', required: true, description: 'Profile name' },
        'skip-preflight': {
          type: 'boolean',
          default: false,
          description: 'Skip transactional BEGIN...ROLLBACK pre-flight dry-run'
        }
      },
      async run({ args }) {
        const { projectRoot, config, migrationsDir } = await loadValidSupabaseConfig(
          String(args.project),
          args.config
        );
        const profile = String(args.profile);
        const containerName = resolveProfileDbContainerName(config.projectSlug, profile);
        let bootstrap: string | undefined;
        if (profile !== 'localFull' && config.profiles.lite?.get(profile)) {
          const creds = await resolveLiteCredentials(projectRoot, config, profile);
          bootstrap = generateLiteBootstrapSql(creds.jwtSecret, creds.postgresPassword);
        }
        const result = syncDatabaseMigrations(containerName, migrationsDir, {
          bootstrapSql: bootstrap,
          preflightDryRun: !args['skip-preflight'],
          postMigrateSql: config.extensions?.postMigrateSql,
          adminRole: config.postgres.adminRole,
          excludePatterns: config.extensions?.migrationExcludePatterns
        });
        process.stdout.write(
          `Migrations synced: ${result.applied.length} applied, ${result.skipped} skipped.\n`
        );
      }
    }),
    'upgrade-pg': defineCommand({
      meta: { name: 'upgrade-pg', description: 'Execute non-destructive major Postgres upgrade' },
      args: {
        ...SUPABASE_CLI_ARGS,
        'from-volume': { type: 'string', description: 'Source Docker volume' },
        'to-volume': { type: 'string', description: 'Target Docker volume' },
        profile: { type: 'string', description: 'Lite profile name (alternative to volume flags)' }
      },
      async run({ args }) {
        const { projectRoot, config } = await loadValidSupabaseConfig(
          String(args.project),
          args.config
        );
        const profile = args.profile ? String(args.profile) : undefined;
        const fromVolume =
          args['from-volume'] ?? (profile ? `${config.projectSlug}-${profile}-pgdata` : undefined);
        const toVolume =
          args['to-volume'] ??
          (profile
            ? `${config.projectSlug}-${profile}-pgdata-pg${config.postgres.expectedMajor}`
            : undefined);
        if (!fromVolume || !toVolume) {
          process.stderr.write(
            'upgrade-pg requires either --from-volume and --to-volume, or --profile <name>.\n'
          );
          process.exit(2);
        }
        const sourceContainer = resolveProfileDbContainerName(
          config.projectSlug,
          profile ?? 'remote'
        );
        const detectedMajor = detectContainerPostgresMajor(sourceContainer);
        const fromMajor =
          detectedMajor ?? Math.max(MIN_POSTGRES_MAJOR, config.postgres.expectedMajor - 1);
        const manifest = await runUpgradePostgres(projectRoot, config, {
          fromVolume,
          toVolume,
          fromMajor,
          targetMajor: config.postgres.expectedMajor,
          liteProfileName: profile,
          dbConfigVolume: config.profiles.remote?.volumes.dbConfig,
          sourceContainer,
          targetContainer: sourceContainer
        });
        process.stdout.write(
          `Upgrade manifest recorded (${manifest.fromMajor} -> ${manifest.toMajor}): sha256=${manifest.sha256}\n`
        );
        process.stdout.write(
          `Next: update .auditor/audit.config.ts -> supabaseDocker.profiles.remote.volumes.dbData = '${manifest.toVolume}' and supabaseDocker.postgres.expectedMajor = ${manifest.toMajor}.\n`
        );
      }
    })
  }
});

if (isMainModule(import.meta.url, ['auditor-supabase'])) {
  void runMain(supabaseManageCommand);
}

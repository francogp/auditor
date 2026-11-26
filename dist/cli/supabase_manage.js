#!/usr/bin/env node
import { loadAuditConfig, resetAuditConfig } from "../core/auditConfigLoader.js";
import { COMMON_CLI_ARGS, defineCommand, runMain } from "../core/cli/cittyHarness.js";
import { safeReadFile, safeResolve, safeWriteFile } from "../core/safePath.js";
import { buildDummyValidationEnv, extractComposeEnvPlaceholders, transformLocalFullComposeYaml, transformRemoteComposeYaml, validateComposeWithDocker } from "../supabase/composeAstEngine.js";
import { generateServerEnvFiles, generateSupabaseKeys, listMasterServers, upsertServerBlock, validateEnvSecrets } from "../supabase/envOrchestrator.js";
import { generateLiteBootstrapSql, resolveLiteCredentials, writeLiteProfileArtifacts } from "../supabase/liteStackGenerator.js";
import { buildCustomDbImage, composeDown, composeRestart, composeUp, detectContainerPostgresMajor, getDetailedStackStatus, publishCustomDbImage, resolveProfileDbContainerName, syncDatabaseMigrations } from "../supabase/runtimeOrchestrator.js";
import { validateSupabaseDockerConfig } from "../supabase/supabaseConfigTypes.js";
import { runUpgradePostgres } from "../supabase/upgradePostgres.js";
import { cloneUpstreamSupabaseDocker } from "../supabase/upstreamSync.js";
import { isMainModule } from "./cliUtils.js";
import { enableCompileCache } from "node:module";
import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import readline from "node:readline/promises";
// src/cli/supabase_manage.ts
/**
* src/cli/supabase_manage.ts
*
* Unified CLI (`auditor-supabase`) for managing Supabase Docker stacks (`remote`, `localFull`, `lite`).
*/
enableCompileCache();
const SUPABASE_CLI_ARGS = {
	...COMMON_CLI_ARGS,
	config: {
		type: "string",
		description: "Path to audit.config.ts"
	}
};
function resolveProjectRoot(projectArg, configArg) {
	if (!configArg) return path.resolve(projectArg || ".");
	const resolvedConfig = path.resolve(configArg);
	const parent = path.dirname(resolvedConfig);
	return path.basename(parent) === ".auditor" ? path.dirname(parent) : parent;
}
async function loadValidSupabaseConfig(projectArg, configArg) {
	const projectRoot = resolveProjectRoot(projectArg, configArg);
	const prevAuditConfig = process.env.AUDIT_CONFIG;
	if (configArg) {
		resetAuditConfig();
		process.env.AUDIT_CONFIG = path.resolve(configArg);
	}
	const auditConfig = await loadAuditConfig(projectRoot).finally(() => {
		if (configArg) {
			if (prevAuditConfig === void 0) delete process.env.AUDIT_CONFIG;
			else process.env.AUDIT_CONFIG = prevAuditConfig;
			resetAuditConfig();
		}
	});
	const supabaseDocker = auditConfig.supabaseDocker;
	if (!supabaseDocker?.enabled) {
		process.stderr.write("supabaseDocker is not enabled in .auditor/audit.config.ts. Set supabaseDocker.enabled = true.\n");
		process.exit(2);
	}
	const errors = validateSupabaseDockerConfig(supabaseDocker);
	if (errors.length > 0) {
		process.stderr.write(`Invalid supabaseDocker configuration:\n- ${errors.join("\n- ")}\n`);
		process.exit(2);
	}
	const migrationsRel = auditConfig.paths.migrationsDir || "supabase/migrations";
	return {
		projectRoot,
		config: supabaseDocker,
		migrationsDir: safeResolve(projectRoot, migrationsRel)
	};
}
function resolveProfileComposePath(projectRoot, config, profile) {
	if (profile === "localFull") return safeResolve(projectRoot, config.supabaseDir, "generated", "local-full", "docker-compose.yml");
	return safeResolve(projectRoot, config.supabaseDir, "generated", "lite", profile, "docker-compose.yml");
}
async function loadProfileComposeContext(projectArg, profileArg, configArg) {
	const loaded = await loadValidSupabaseConfig(projectArg, configArg);
	return {
		loaded,
		composePath: resolveProfileComposePath(loaded.projectRoot, loaded.config, profileArg)
	};
}
async function ensureUpstreamCloned(ctx) {
	if (!fs.existsSync(ctx.dockerComposePath)) await cloneUpstreamSupabaseDocker(ctx.projectRoot, ctx.config);
	return safeReadFile(ctx.dockerComposePath);
}
async function validateGeneratedCompose(projectRoot, outCompose, yamlContent, explicitEnvFilePath) {
	if (explicitEnvFilePath) {
		const check = validateComposeWithDocker(outCompose, explicitEnvFilePath);
		if (!check.ok) {
			process.stderr.write(`docker compose config -q failed:\n${check.stderr}\n`);
			process.exit(1);
		}
		return;
	}
	const placeholders = extractComposeEnvPlaceholders(yamlContent);
	const dummyPath = safeResolve(projectRoot, "scratch", "supabase-validate.env");
	const dummyEnv = buildDummyValidationEnv(placeholders);
	try {
		await safeWriteFile(dummyPath, [...dummyEnv.entries()].map(([k, v]) => `${k}=${v}`).join("\n"));
		const composeCheck = validateComposeWithDocker(outCompose, dummyPath);
		if (!composeCheck.ok) {
			process.stderr.write(`docker compose config -q failed:\n${composeCheck.stderr}\n`);
			process.exit(1);
		}
	} finally {
		fs.rmSync(dummyPath, { force: true });
	}
}
async function prepareAndTransformCompose(ctx, includeLogs, transformer) {
	const baseYaml = await ensureUpstreamCloned(ctx);
	const logsYaml = includeLogs && fs.existsSync(ctx.logsComposePath) ? await safeReadFile(ctx.logsComposePath) : void 0;
	const transformed = transformer(baseYaml, ctx.config, {
		logsComposeYaml: logsYaml,
		overlayYaml: ctx.overlayYaml
	});
	if (!transformed.report.valid) {
		process.stderr.write(`${transformed.report.profile} compose validation failed:\n- ${transformed.report.errors.join("\n- ")}\n`);
		process.exit(2);
	}
	return transformed;
}
async function generateRemoteProfile(ctx) {
	const remote = ctx.config.profiles.remote;
	if (!remote?.enabled) return;
	const transformed = await prepareAndTransformCompose(ctx, remote.includeLogs, transformRemoteComposeYaml);
	const outCompose = safeResolve(ctx.projectRoot, ctx.config.supabaseDir, "generated", "docker-compose.yml");
	await safeWriteFile(outCompose, transformed.yaml);
	const placeholders = extractComposeEnvPlaceholders(transformed.yaml);
	const masterPath = safeResolve(ctx.projectRoot, ctx.config.masterEnvFile);
	let validationEnvFile;
	if (fs.existsSync(masterPath)) {
		const emittedServers = await generateServerEnvFiles(ctx.projectRoot, ctx.config);
		for (const entry of emittedServers) {
			const secretErrors = validateEnvSecrets(entry.vars, placeholders);
			if (secretErrors.length > 0) {
				process.stderr.write(`Env secret validation failed for server '${entry.server}' (${entry.filePath}):\n- ${secretErrors.join("\n- ")}\n`);
				process.exit(2);
			}
			validationEnvFile ??= entry.filePath;
		}
	}
	await validateGeneratedCompose(ctx.projectRoot, outCompose, transformed.yaml, validationEnvFile);
	if (remote.postGenerateCommand) {
		const [cmd, ...args] = [...remote.postGenerateCommand.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/gu)].map((m) => m[1] ?? m[2] ?? m[3] ?? "").filter(Boolean);
		if (cmd) execFileSync(cmd, args, {
			cwd: ctx.projectRoot,
			stdio: "inherit"
		});
	}
	process.stdout.write(`Generated remote compose: ${outCompose}\n`);
}
async function generateLocalFullProfile(ctx) {
	const localFull = ctx.config.profiles.localFull;
	if (!localFull?.enabled) return;
	const transformed = await prepareAndTransformCompose(ctx, localFull.includeLogs, transformLocalFullComposeYaml);
	const outCompose = resolveProfileComposePath(ctx.projectRoot, ctx.config, "localFull");
	await safeWriteFile(outCompose, transformed.yaml);
	await validateGeneratedCompose(ctx.projectRoot, outCompose, transformed.yaml);
	process.stdout.write(`Generated localFull compose: ${outCompose}\n`);
}
async function generateLiteProfiles(projectRoot, config, profileFilter) {
	if (!config.profiles.lite) return;
	for (const [name, liteProfile] of config.profiles.lite.entries()) {
		if (!liteProfile.enabled) continue;
		if (profileFilter && profileFilter !== name && profileFilter !== "lite") continue;
		const artifacts = await writeLiteProfileArtifacts(projectRoot, config, name);
		const composeCheck = validateComposeWithDocker(artifacts.composePath, artifacts.envFilePath);
		if (!composeCheck.ok) {
			process.stderr.write(`docker compose config -q failed for lite.${name}:\n${composeCheck.stderr}\n`);
			process.exit(1);
		}
		process.stdout.write(`Generated lite.${name} compose: ${artifacts.composePath}\n`);
	}
}
async function runGenerate(projectRoot, config, profileFilter) {
	const ctx = {
		projectRoot,
		config,
		dockerComposePath: safeResolve(projectRoot, config.supabaseDir, "docker", "docker-compose.yml"),
		logsComposePath: safeResolve(projectRoot, config.supabaseDir, "docker", "docker-compose.logs.yml"),
		overlayYaml: config.extensions?.customComposeOverlay ? await safeReadFile(safeResolve(projectRoot, config.extensions.customComposeOverlay)) : void 0
	};
	if (!profileFilter || profileFilter === "remote") await generateRemoteProfile(ctx);
	if (!profileFilter || profileFilter === "localFull") await generateLocalFullProfile(ctx);
	await generateLiteProfiles(projectRoot, config, profileFilter);
}
async function syncMigrationsForProfile(loaded, profile, bootstrapSqlOverride) {
	const { projectRoot, config, migrationsDir } = loaded;
	const containerName = resolveProfileDbContainerName(config.projectSlug, profile);
	if (profile === "localFull") {
		if (config.profiles.localFull?.autoApplyMigrations) syncDatabaseMigrations(containerName, migrationsDir);
		return;
	}
	if (config.profiles.lite?.get(profile)?.autoSyncMigrations) {
		let bootstrap = bootstrapSqlOverride;
		if (!bootstrap) {
			const creds = await resolveLiteCredentials(projectRoot, config, profile);
			bootstrap = generateLiteBootstrapSql(creds.jwtSecret, creds.postgresPassword);
		}
		syncDatabaseMigrations(containerName, migrationsDir, bootstrap);
	}
}
const supabaseManageCommand = defineCommand({
	meta: {
		name: "auditor-supabase",
		description: "Unified Supabase Docker stack orchestrator (@francogp/auditor/supabase)"
	},
	args: { ...SUPABASE_CLI_ARGS },
	subCommands: {
		clone: defineCommand({
			meta: {
				name: "clone",
				description: "Clone official Supabase docker/ at upstreamRef"
			},
			args: {
				...SUPABASE_CLI_ARGS,
				ref: {
					type: "string",
					description: "Override upstreamRef"
				}
			},
			async run({ args }) {
				const { projectRoot, config } = await loadValidSupabaseConfig(String(args.project), args.config);
				const meta = await cloneUpstreamSupabaseDocker(projectRoot, config, args.ref);
				process.stdout.write(`Cloned upstream docker/ (Postgres ${meta.postgresTag}, gateway=${meta.gatewayService}).\n`);
			}
		}),
		generate: defineCommand({
			meta: {
				name: "generate",
				description: "Generate compose, nginx, and .env artifacts"
			},
			args: {
				...SUPABASE_CLI_ARGS,
				profile: {
					type: "string",
					description: "Filter profile name"
				}
			},
			async run({ args }) {
				const { projectRoot, config } = await loadValidSupabaseConfig(String(args.project), args.config);
				await runGenerate(projectRoot, config, args.profile);
			}
		}),
		"add-server": defineCommand({
			meta: {
				name: "add-server",
				description: "Register or update a remote server in master .env"
			},
			args: {
				...SUPABASE_CLI_ARGS,
				name: {
					type: "string",
					required: true,
					description: "Server name"
				},
				"non-interactive": {
					type: "boolean",
					default: false,
					description: "Generate server keys automatically without prompts"
				}
			},
			async run({ args }) {
				const { projectRoot, config } = await loadValidSupabaseConfig(String(args.project), args.config);
				const masterPath = safeResolve(projectRoot, config.masterEnvFile);
				const existing = fs.existsSync(masterPath) ? await safeReadFile(masterPath) : "";
				const keys = generateSupabaseKeys(projectRoot, config);
				const errs = validateEnvSecrets(keys);
				if (errs.length > 0) {
					process.stderr.write(`Generated keys failed validation:\n- ${errs.join("\n- ")}\n`);
					process.exit(2);
				}
				let publicUrl = "http://localhost:8000";
				if (!args["non-interactive"] && process.stdin.isTTY) {
					const rl = readline.createInterface({
						input: process.stdin,
						output: process.stdout
					});
					try {
						const answer = await rl.question("Public API URL [http://localhost:8000]: ");
						if (answer.trim()) publicUrl = answer.trim();
					} finally {
						rl.close();
					}
				}
				const serverVars = new Map(keys);
				serverVars.set("API_EXTERNAL_URL", publicUrl);
				serverVars.set("SUPABASE_PUBLIC_URL", publicUrl);
				serverVars.set("SITE_URL", publicUrl);
				const updated = upsertServerBlock(existing, String(args.name), serverVars);
				await safeWriteFile(masterPath, updated);
				process.stdout.write(`Server '${args.name}' updated in ${masterPath}${args["non-interactive"] ? " (non-interactive)" : ""}.\n`);
			}
		}),
		list: defineCommand({
			meta: {
				name: "list",
				description: "List configured remote servers in master .env"
			},
			args: { ...SUPABASE_CLI_ARGS },
			async run({ args }) {
				const { projectRoot, config } = await loadValidSupabaseConfig(String(args.project), args.config);
				const masterPath = safeResolve(projectRoot, config.masterEnvFile);
				const content = fs.existsSync(masterPath) ? await safeReadFile(masterPath) : "";
				const servers = listMasterServers(content);
				if (args.json) {
					process.stdout.write(`${JSON.stringify({ servers })}\n`);
					return;
				}
				process.stdout.write(servers.length > 0 ? `Servers: ${servers.join(", ")}\n` : "No servers configured.\n");
			}
		}),
		build: defineCommand({
			meta: {
				name: "build",
				description: "Build custom Postgres image from <supabaseDir>/docker"
			},
			args: {
				...SUPABASE_CLI_ARGS,
				tag: {
					type: "string",
					description: "Override image tag"
				}
			},
			async run({ args }) {
				const { projectRoot, config } = await loadValidSupabaseConfig(String(args.project), args.config);
				const image = buildCustomDbImage(projectRoot, config, args.tag);
				process.stdout.write(`Built image: ${image}\n`);
			}
		}),
		publish: defineCommand({
			meta: {
				name: "publish",
				description: "Push custom Postgres image to registry"
			},
			args: {
				...SUPABASE_CLI_ARGS,
				tag: {
					type: "string",
					description: "Override image tag"
				}
			},
			async run({ args }) {
				const { config } = await loadValidSupabaseConfig(String(args.project), args.config);
				const image = publishCustomDbImage(config, args.tag);
				process.stdout.write(`Published image: ${image}\n`);
			}
		}),
		release: defineCommand({
			meta: {
				name: "release",
				description: "Build and publish custom Postgres image"
			},
			args: {
				...SUPABASE_CLI_ARGS,
				tag: {
					type: "string",
					description: "Override image tag"
				}
			},
			async run({ args }) {
				const { projectRoot, config } = await loadValidSupabaseConfig(String(args.project), args.config);
				buildCustomDbImage(projectRoot, config, args.tag);
				const image = publishCustomDbImage(config, args.tag);
				process.stdout.write(`Released image: ${image}\n`);
			}
		}),
		all: defineCommand({
			meta: {
				name: "all",
				description: "Clone, generate, build, and publish in sequence"
			},
			args: {
				...SUPABASE_CLI_ARGS,
				tag: {
					type: "string",
					description: "Override image tag"
				}
			},
			async run({ args }) {
				const { projectRoot, config } = await loadValidSupabaseConfig(String(args.project), args.config);
				await cloneUpstreamSupabaseDocker(projectRoot, config);
				await runGenerate(projectRoot, config, "remote");
				buildCustomDbImage(projectRoot, config, args.tag);
				const image = publishCustomDbImage(config, args.tag);
				process.stdout.write(`All stages completed for: ${image}\n`);
			}
		}),
		up: defineCommand({
			meta: {
				name: "up",
				description: "Start localFull or lite stack and sync migrations"
			},
			args: {
				...SUPABASE_CLI_ARGS,
				profile: {
					type: "string",
					required: true,
					description: "Profile name (localFull or lite key)"
				}
			},
			async run({ args }) {
				const loaded = await loadValidSupabaseConfig(String(args.project), args.config);
				const profile = String(args.profile);
				if (profile === "localFull") {
					await runGenerate(loaded.projectRoot, loaded.config, profile);
					const composePath = resolveProfileComposePath(loaded.projectRoot, loaded.config, "localFull");
					composeUp(composePath);
					await syncMigrationsForProfile(loaded, profile);
					return;
				}
				const artifacts = await writeLiteProfileArtifacts(loaded.projectRoot, loaded.config, profile);
				composeUp(artifacts.composePath, artifacts.envFilePath);
				await syncMigrationsForProfile(loaded, profile, artifacts.bootstrapSql);
			}
		}),
		down: defineCommand({
			meta: {
				name: "down",
				description: "Stop localFull or lite stack"
			},
			args: {
				...SUPABASE_CLI_ARGS,
				profile: {
					type: "string",
					required: true,
					description: "Profile name"
				},
				volumes: {
					type: "boolean",
					default: false,
					description: "Remove volumes"
				}
			},
			async run({ args }) {
				const { composePath } = await loadProfileComposeContext(String(args.project), String(args.profile), args.config);
				composeDown(composePath, Boolean(args.volumes));
			}
		}),
		restart: defineCommand({
			meta: {
				name: "restart",
				description: "Restart localFull or lite stack"
			},
			args: {
				...SUPABASE_CLI_ARGS,
				profile: {
					type: "string",
					required: true,
					description: "Profile name"
				}
			},
			async run({ args }) {
				const profile = String(args.profile);
				const { loaded, composePath } = await loadProfileComposeContext(String(args.project), profile, args.config);
				composeRestart(composePath);
				await syncMigrationsForProfile(loaded, profile);
			}
		}),
		status: defineCommand({
			meta: {
				name: "status",
				description: "Show running Supabase containers, PG version, and migrations"
			},
			args: {
				...SUPABASE_CLI_ARGS,
				profile: {
					type: "string",
					description: "Optional profile name (localFull or lite key)"
				}
			},
			async run({ args }) {
				const { config } = await loadValidSupabaseConfig(String(args.project), args.config);
				process.stdout.write(`${getDetailedStackStatus(config, args.profile)}\n`);
			}
		}),
		migrate: defineCommand({
			meta: {
				name: "migrate",
				description: "Apply pending SQL migrations to running DB container"
			},
			args: {
				...SUPABASE_CLI_ARGS,
				profile: {
					type: "string",
					required: true,
					description: "Profile name"
				}
			},
			async run({ args }) {
				const { projectRoot, config, migrationsDir } = await loadValidSupabaseConfig(String(args.project), args.config);
				const profile = String(args.profile);
				const containerName = resolveProfileDbContainerName(config.projectSlug, profile);
				let bootstrap;
				if (profile !== "localFull" && config.profiles.lite?.get(profile)) {
					const creds = await resolveLiteCredentials(projectRoot, config, profile);
					bootstrap = generateLiteBootstrapSql(creds.jwtSecret, creds.postgresPassword);
				}
				const result = syncDatabaseMigrations(containerName, migrationsDir, bootstrap);
				process.stdout.write(`Migrations synced: ${result.applied.length} applied, ${result.skipped} skipped.\n`);
			}
		}),
		"upgrade-pg": defineCommand({
			meta: {
				name: "upgrade-pg",
				description: "Execute non-destructive major Postgres upgrade"
			},
			args: {
				...SUPABASE_CLI_ARGS,
				"from-volume": {
					type: "string",
					description: "Source Docker volume"
				},
				"to-volume": {
					type: "string",
					description: "Target Docker volume"
				},
				profile: {
					type: "string",
					description: "Lite profile name (alternative to volume flags)"
				}
			},
			async run({ args }) {
				const { projectRoot, config } = await loadValidSupabaseConfig(String(args.project), args.config);
				const profile = args.profile ? String(args.profile) : void 0;
				const fromVolume = args["from-volume"] ?? (profile ? `${config.projectSlug}-${profile}-pgdata` : void 0);
				const toVolume = args["to-volume"] ?? (profile ? `${config.projectSlug}-${profile}-pgdata-pg${config.postgres.expectedMajor}` : void 0);
				if (!fromVolume || !toVolume) {
					process.stderr.write("upgrade-pg requires either --from-volume and --to-volume, or --profile <name>.\n");
					process.exit(2);
				}
				const sourceContainer = resolveProfileDbContainerName(config.projectSlug, profile ?? "remote");
				const fromMajor = detectContainerPostgresMajor(sourceContainer) ?? Math.max(12, config.postgres.expectedMajor - 1);
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
				process.stdout.write(`Upgrade manifest recorded (${manifest.fromMajor} -> ${manifest.toMajor}): sha256=${manifest.sha256}\n`);
				process.stdout.write(`Next: update .auditor/audit.config.ts -> supabaseDocker.profiles.remote.volumes.dbData = '${manifest.toVolume}' and supabaseDocker.postgres.expectedMajor = ${manifest.toMajor}.\n`);
			}
		})
	}
});
if (isMainModule(import.meta.url, ["auditor-supabase"])) runMain(supabaseManageCommand);
export { supabaseManageCommand };

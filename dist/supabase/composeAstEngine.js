import { tryCatchSync } from "../core/safeUtils.js";
import { inspectUpstreamCompose } from "./upstreamSync.js";
import { execFileSync } from "node:child_process";
import { parseDocument } from "yaml";
// src/supabase/composeAstEngine.ts
/**
* src/supabase/composeAstEngine.ts
*
* YAML AST transformer and fail-loud validator for `remote` and `localFull` Supabase stacks.
*/
const ENV_PLACEHOLDER_REGEX = /\$\{([A-Z0-9_]+)(?::[-?]?[^}]*)?\}/gu;
const RELATIVE_MOUNT_REGEX = /^\.\.?\//u;
const SUPAVISOR_NOFILE_LIMIT = 65536;
function nodeItemToString(item) {
	if (typeof item === "string" || typeof item === "number") return String(item);
	if (item && typeof item === "object" && "value" in item) {
		const val = item.value;
		if (typeof val === "string" || typeof val === "number") return String(val);
	}
	return "";
}
function rewriteServiceVolumes(doc, serviceName, mapper) {
	const volumesNode = doc.getIn([
		"services",
		serviceName,
		"volumes"
	]);
	if (!volumesNode || !Array.isArray(volumesNode.items)) return;
	const updated = [];
	for (const item of volumesNode.items) {
		const mapped = mapper(nodeItemToString(item));
		if (mapped !== null) updated.push(mapped);
	}
	doc.setIn([
		"services",
		serviceName,
		"volumes"
	], doc.createNode(updated));
}
function pairKeyToString(pair) {
	return String(pair.key?.value ?? pair.key);
}
function addDependsOn(doc, serviceName, relation) {
	const { dep, condition } = relation;
	if (!doc.getIn([
		"services",
		serviceName,
		"depends_on"
	])) {
		doc.setIn([
			"services",
			serviceName,
			"depends_on"
		], { [dep]: { condition } });
		return;
	}
	doc.setIn([
		"services",
		serviceName,
		"depends_on",
		dep
	], { condition });
}
function applyLoopbackPorts(doc, serviceName) {
	const portsNode = doc.getIn([
		"services",
		serviceName,
		"ports"
	]);
	if (!portsNode || !Array.isArray(portsNode.items)) return;
	const updated = portsNode.items.map((item) => {
		const raw = nodeItemToString(item);
		if (raw.startsWith("127.0.0.1:")) return raw;
		return `127.0.0.1:${raw}`;
	});
	doc.setIn([
		"services",
		serviceName,
		"ports"
	], updated);
}
function mergeLogsCompose(doc, logsDoc) {
	const logServices = logsDoc.get("services");
	if (!logServices || !Array.isArray(logServices.items)) return;
	for (const pair of logServices.items) {
		const key = pairKeyToString(pair);
		if (!doc.getIn(["services", key])) doc.setIn(["services", key], pair.value);
	}
}
function mergeOverlay(doc, overlayYaml) {
	const services = parseDocument(overlayYaml).get("services");
	if (!services || !Array.isArray(services.items)) return;
	for (const pair of services.items) {
		const svc = pairKeyToString(pair);
		const svcMap = pair.value;
		if (!svcMap || !Array.isArray(svcMap.items)) continue;
		for (const inner of svcMap.items) {
			const prop = pairKeyToString(inner);
			doc.setIn([
				"services",
				svc,
				prop
			], inner.value);
		}
	}
}
function collectResidualRelativeMounts(doc) {
	const errors = [];
	const services = doc.get("services");
	if (!services || !Array.isArray(services.items)) return errors;
	for (const pair of services.items) {
		const svcName = pairKeyToString(pair);
		const vols = doc.getIn([
			"services",
			svcName,
			"volumes"
		]);
		if (!vols || !Array.isArray(vols.items)) continue;
		for (const item of vols.items) {
			const raw = nodeItemToString(item);
			const source = raw.split(":")[0]?.trim() ?? "";
			if (RELATIVE_MOUNT_REGEX.test(source)) errors.push(`Residual local bind-mount in services.${svcName}.volumes: '${raw}'`);
		}
	}
	return errors;
}
const REMOTE_CUSTOM_DB_IMAGE = "${DOCKER_USER}/${DOCKER_REPO_DB}:${DOCKER_TAG_DB}";
function transformRemoteCoreServices(doc, config, remote) {
	const { shared, dbData, dbConfig } = remote.volumes;
	doc.setIn(["services", "supabase-config-init"], {
		container_name: `${config.projectSlug}-supabase-config-init`,
		image: REMOTE_CUSTOM_DB_IMAGE,
		restart: "no",
		entrypoint: ["/bin/sh", "-c"],
		command: ["cp -rf /supabase-volumes/* /target-volumes/"],
		volumes: [`${shared}:/target-volumes:Z`]
	});
	doc.setIn([
		"services",
		"db",
		"image"
	], REMOTE_CUSTOM_DB_IMAGE);
	rewriteServiceVolumes(doc, "db", (entry) => {
		if (entry.includes("./volumes/db/data")) return `${dbData}:/var/lib/postgresql/data:Z`;
		if (entry.startsWith("db-config:")) return `${dbConfig}:/etc/postgresql-custom:Z`;
		if (entry.includes("./volumes/db/")) return null;
		return entry;
	});
	const dbVolsRaw = doc.getIn([
		"services",
		"db",
		"volumes"
	]);
	const dbVols = Array.isArray(dbVolsRaw) ? dbVolsRaw : dbVolsRaw?.toJSON() ?? [];
	doc.setIn([
		"services",
		"db",
		"volumes"
	], doc.createNode([...dbVols, `${shared}:/supabase-volumes:Z`]));
	if (doc.getIn(["services", "api-gw"])) {
		doc.setIn([
			"services",
			"api-gw",
			"volumes"
		], [`${shared}:/supabase-volumes:ro,z`]);
		doc.setIn([
			"services",
			"api-gw",
			"entrypoint"
		], ["/bin/sh", "/supabase-volumes/api/envoy/docker-entrypoint.sh"]);
		doc.setIn([
			"services",
			"api-gw",
			"environment",
			"ENVOY_CONFIG_DIR"
		], "/supabase-volumes/api/envoy");
		addDependsOn(doc, "api-gw", {
			dep: "supabase-config-init",
			condition: "service_completed_successfully"
		});
	}
	if (doc.getIn(["services", "studio"])) {
		doc.setIn([
			"services",
			"studio",
			"volumes"
		], [`${shared}:/supabase-volumes:Z`]);
		doc.setIn([
			"services",
			"studio",
			"environment",
			"SNIPPETS_MANAGEMENT_FOLDER"
		], "/supabase-volumes/snippets");
		doc.setIn([
			"services",
			"studio",
			"environment",
			"EDGE_FUNCTIONS_MANAGEMENT_FOLDER"
		], "/supabase-volumes/functions");
		if (remote.includeLogs) doc.setIn([
			"services",
			"studio",
			"environment",
			"ENABLED_FEATURES_LOGS_ALL"
		], "true");
		addDependsOn(doc, "studio", {
			dep: "supabase-config-init",
			condition: "service_completed_successfully"
		});
	}
}
function validateUpstreamPostgresMajor(composeYaml, config) {
	const upstreamMeta = inspectUpstreamCompose(composeYaml);
	if (upstreamMeta.postgresMajor === config.postgres.expectedMajor) return {
		error: null,
		warning: null
	};
	const msg = `Upstream PostgreSQL major (${upstreamMeta.postgresMajor}) does not match expectedMajor (${config.postgres.expectedMajor}). Run 'auditor-supabase upgrade-pg' before upgrading.`;
	if (!config.postgres.allowMajorUpgrade) return {
		error: msg,
		warning: null
	};
	return {
		error: null,
		warning: `${msg} (allowed by postgres.allowMajorUpgrade=true)`
	};
}
function rewriteSeqCommand(doc, serviceName, replacement) {
	const cmd = doc.getIn([
		"services",
		serviceName,
		"command"
	]);
	if (!cmd || !Array.isArray(cmd.items)) return;
	const rewrittenCmd = cmd.items.map((item) => nodeItemToString(item).replaceAll(replacement.fromText, replacement.toText));
	doc.setIn([
		"services",
		serviceName,
		"command"
	], rewrittenCmd);
}
function transformRemoteSupportServices(doc, volumes) {
	const { shared, storage } = volumes;
	if (doc.getIn(["services", "functions"])) {
		rewriteServiceVolumes(doc, "functions", (entry) => entry.includes("./volumes/functions") ? `${shared}:/home/deno:Z` : entry);
		addDependsOn(doc, "functions", {
			dep: "supabase-config-init",
			condition: "service_completed_successfully"
		});
	}
	for (const svc of ["storage", "imgproxy"]) {
		if (!doc.getIn(["services", svc])) continue;
		rewriteServiceVolumes(doc, svc, (entry) => entry.includes("./volumes/storage") ? `${storage}:/var/lib/storage:Z` : entry);
	}
	if (doc.getIn(["services", "realtime"])) {
		doc.setIn([
			"services",
			"realtime",
			"volumes"
		], [`${shared}:/supabase-volumes:ro,z`]);
		doc.setIn([
			"services",
			"realtime",
			"entrypoint"
		], ["/bin/sh", "/supabase-volumes/realtime/docker-entrypoint.sh"]);
		addDependsOn(doc, "realtime", {
			dep: "supabase-config-init",
			condition: "service_completed_successfully"
		});
	}
	if (doc.getIn(["services", "supavisor"])) {
		doc.setIn([
			"services",
			"supavisor",
			"volumes"
		], [`${shared}:/supabase-volumes:ro,z`]);
		doc.setIn([
			"services",
			"supavisor",
			"ulimits"
		], { nofile: {
			soft: SUPAVISOR_NOFILE_LIMIT,
			hard: SUPAVISOR_NOFILE_LIMIT
		} });
		doc.setIn([
			"services",
			"supavisor",
			"environment",
			"RLIMIT_NOFILE"
		], String(SUPAVISOR_NOFILE_LIMIT));
		rewriteSeqCommand(doc, "supavisor", {
			fromText: "/etc/pooler/pooler.exs",
			toText: "/supabase-volumes/pooler/pooler.exs"
		});
		addDependsOn(doc, "supavisor", {
			dep: "supabase-config-init",
			condition: "service_completed_successfully"
		});
	}
}
function transformRemoteLoggingServices(doc, shared) {
	if (doc.getIn(["services", "vector"])) {
		rewriteServiceVolumes(doc, "vector", (entry) => entry.includes("./volumes/logs/vector.yml") ? `${shared}:/supabase-volumes:ro,z` : entry);
		rewriteSeqCommand(doc, "vector", {
			fromText: "/etc/vector/vector.yml",
			toText: "/supabase-volumes/logs/vector.yml"
		});
		addDependsOn(doc, "vector", {
			dep: "db",
			condition: "service_healthy"
		});
		addDependsOn(doc, "vector", {
			dep: "supabase-config-init",
			condition: "service_completed_successfully"
		});
	}
	if (doc.getIn(["services", "analytics"])) doc.setIn([
		"services",
		"analytics",
		"healthcheck",
		"start_period"
	], "60s");
}
function reconcileRemoteRootVolumes(doc, volumes) {
	const rootVols = doc.get("volumes")?.toJSON();
	const nextRootVols = {};
	if (rootVols) {
		for (const [k, v] of Object.entries(rootVols)) if (k !== "db-config") nextRootVols[k] = v ?? {};
	}
	nextRootVols[volumes.shared] = {};
	nextRootVols[volumes.dbData] = {};
	nextRootVols[volumes.dbConfig] = {};
	nextRootVols[volumes.storage] = {};
	doc.set("volumes", nextRootVols);
}
function disabledComposeResult(composeYaml, profile) {
	return {
		yaml: composeYaml,
		report: {
			valid: false,
			profile,
			errors: [`profiles.${profile} is not enabled in supabaseDocker config.`],
			warnings: []
		}
	};
}
function initTransformedComposeDoc(composeYaml, config, initOpts) {
	const errors = [];
	const warnings = [];
	const pgCheck = validateUpstreamPostgresMajor(composeYaml, config);
	if (pgCheck.error) errors.push(pgCheck.error);
	if (pgCheck.warning) warnings.push(pgCheck.warning);
	const doc = parseDocument(composeYaml);
	if (initOpts.includeLogs && initOpts.transformOptions?.logsComposeYaml) mergeLogsCompose(doc, parseDocument(initOpts.transformOptions.logsComposeYaml));
	return {
		doc,
		errors,
		warnings
	};
}
/**
* Transforms an upstream Supabase `docker-compose.yml` into a bind-mount-free `remote` stack.
*/
function transformRemoteComposeYaml(composeYaml, config, options) {
	const remote = config.profiles.remote;
	if (!remote?.enabled) return disabledComposeResult(composeYaml, "remote");
	const { doc, errors, warnings } = initTransformedComposeDoc(composeYaml, config, {
		includeLogs: remote.includeLogs,
		transformOptions: options
	});
	const { shared } = remote.volumes;
	transformRemoteCoreServices(doc, config, remote);
	transformRemoteSupportServices(doc, remote.volumes);
	transformRemoteLoggingServices(doc, shared);
	if (remote.security.bindLoopback) {
		applyLoopbackPorts(doc, "db");
		applyLoopbackPorts(doc, "supavisor");
		applyLoopbackPorts(doc, "api-gw");
	}
	reconcileRemoteRootVolumes(doc, remote.volumes);
	if (options?.overlayYaml) mergeOverlay(doc, options.overlayYaml);
	errors.push(...collectResidualRelativeMounts(doc));
	return {
		yaml: doc.toString(),
		report: {
			valid: errors.length === 0,
			profile: "remote",
			errors,
			warnings
		}
	};
}
/**
* Transforms an upstream compose file for isolated concurrent `localFull` execution.
*/
function transformLocalFullComposeYaml(composeYaml, config, options) {
	const localFull = config.profiles.localFull;
	if (!localFull?.enabled) return disabledComposeResult(composeYaml, "localFull");
	const { doc, errors, warnings } = initTransformedComposeDoc(composeYaml, config, {
		includeLogs: localFull.includeLogs,
		transformOptions: options
	});
	doc.set("name", `${config.projectSlug}-local-full`);
	const services = doc.get("services");
	if (services && Array.isArray(services.items)) for (const pair of services.items) {
		const svc = pairKeyToString(pair);
		const existingName = doc.getIn([
			"services",
			svc,
			"container_name"
		]);
		if (existingName) {
			if (svc === "realtime") doc.setIn([
				"services",
				svc,
				"container_name"
			], `${localFull.realtimeTenantName}.${config.projectSlug}-realtime`);
			else doc.setIn([
				"services",
				svc,
				"container_name"
			], `${config.projectSlug}-${nodeItemToString(existingName)}`);
		}
	}
	if (doc.getIn(["services", "api-gw"])) doc.setIn([
		"services",
		"api-gw",
		"ports"
	], [`${localFull.ports.api}:8000/tcp`]);
	if (doc.getIn(["services", "supavisor"])) doc.setIn([
		"services",
		"supavisor",
		"ports"
	], [`${localFull.ports.postgres}:5432`, `${localFull.ports.pooler}:6543`]);
	if (doc.getIn(["services", "studio"])) doc.setIn([
		"services",
		"studio",
		"ports"
	], [`${localFull.ports.studio}:3000`]);
	if (options?.overlayYaml) mergeOverlay(doc, options.overlayYaml);
	return {
		yaml: doc.toString(),
		report: {
			valid: errors.length === 0,
			profile: "localFull",
			errors,
			warnings
		}
	};
}
/**
* Extracts all `${VAR}` placeholder names referenced inside a compose YAML file.
*/
function extractComposeEnvPlaceholders(composeYaml) {
	const vars = /* @__PURE__ */ new Set();
	for (const match of composeYaml.matchAll(ENV_PLACEHOLDER_REGEX)) if (match[1]) vars.add(match[1]);
	return [...vars].sort();
}
/**
* Builds deterministic dummy values for `docker compose config -q` when no server `.env` exists yet.
*/
function buildDummyValidationEnv(placeholders) {
	const env = /* @__PURE__ */ new Map();
	for (const key of placeholders) if (key.includes("PORT")) env.set(key, "5432");
	else if (key.includes("URL")) env.set(key, "http://localhost:8000");
	else env.set(key, "validation-placeholder-value");
	return env;
}
/**
* Runs `docker compose -f <composePath> config -q` to validate final Compose syntax.
*/
function validateComposeWithDocker(composePath, envFilePath) {
	const args = [
		"compose",
		"-f",
		composePath
	];
	if (envFilePath) args.push("--env-file", envFilePath);
	args.push("config", "-q");
	const result = tryCatchSync(() => execFileSync("docker", args, {
		encoding: "utf8",
		stdio: [
			"ignore",
			"pipe",
			"pipe"
		]
	}));
	if (result.status === "success") return {
		ok: true,
		stderr: ""
	};
	const err = result.error;
	return {
		ok: false,
		stderr: String(err.stderr ?? err.message ?? "docker compose config failed")
	};
}
export { buildDummyValidationEnv, extractComposeEnvPlaceholders, transformLocalFullComposeYaml, transformRemoteComposeYaml, validateComposeWithDocker };

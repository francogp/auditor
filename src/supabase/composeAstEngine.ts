/**
 * src/supabase/composeAstEngine.ts
 *
 * YAML AST transformer and fail-loud validator for `remote` and `localFull` Supabase stacks.
 */

import { execFileSync } from 'node:child_process';

import {
  isMap,
  isScalar,
  isSeq,
  parseDocument,
  type Document,
  type YAMLMap,
  type YAMLSeq
} from 'yaml';

import { tryCatchSync } from '../core/safeUtils.ts';
import type {
  SupabaseComposeProfileKind,
  SupabaseComposeTransformOptions,
  SupabaseComposeTransformResult,
  SupabaseDockerConfig,
  SupabaseRemoteProfileConfig
} from './supabaseConfigTypes.ts';
import { inspectUpstreamCompose } from './upstreamSync.ts';

const RELATIVE_MOUNT_REGEX = /^\.\.?\//u;
const SUPAVISOR_NOFILE_LIMIT = 65536 as const;
const PLACEHOLDER_EXPR_REGEX = /^([A-Z0-9_]+)(.*)$/su;

function nodeItemToString(item: unknown): string {
  if (typeof item === 'string' || typeof item === 'number') return String(item);
  if (item && typeof item === 'object' && 'value' in item) {
    const val = (item as { readonly value: unknown }).value;
    if (typeof val === 'string' || typeof val === 'number') return String(val);
  }
  return '';
}

function rewriteServiceVolumes(
  doc: Document,
  serviceName: string,
  mapper: (entry: string) => string | null
): void {
  const volumesNode = doc.getIn(['services', serviceName, 'volumes']) as YAMLSeq | undefined;
  if (!volumesNode || !Array.isArray(volumesNode.items)) return;

  const updated: string[] = [];
  for (const item of volumesNode.items) {
    const raw = nodeItemToString(item);
    const mapped = mapper(raw);
    if (mapped !== null) {
      updated.push(mapped);
    }
  }
  doc.setIn(['services', serviceName, 'volumes'], doc.createNode(updated));
}

function pairKeyToString(pair: { readonly key: unknown }): string {
  return String((pair.key as { value?: unknown })?.value ?? pair.key);
}

function addDependsOn(
  doc: Document,
  serviceName: string,
  relation: { readonly dep: string; readonly condition: string }
): void {
  const { dep, condition } = relation;
  const existing = doc.getIn(['services', serviceName, 'depends_on']) as YAMLMap | undefined;
  if (!existing) {
    doc.setIn(['services', serviceName, 'depends_on'], { [dep]: { condition } });
    return;
  }
  doc.setIn(['services', serviceName, 'depends_on', dep], { condition });
}

const EXPLICIT_HOST_PORT_REGEX = /^([^/\s]+):(\d+:\d+(?:\/\w+)?)$/u;

function applyLoopbackPorts(doc: Document, serviceName: string): void {
  const portsNode = doc.getIn(['services', serviceName, 'ports']) as YAMLSeq | undefined;
  if (!portsNode || !Array.isArray(portsNode.items)) return;

  const updated = portsNode.items.map((item) => {
    const raw = nodeItemToString(item);
    if (raw.startsWith('127.0.0.1:')) return raw;
    const hostMatch = EXPLICIT_HOST_PORT_REGEX.exec(raw);
    if (hostMatch?.[2]) {
      return `127.0.0.1:${hostMatch[2]}`;
    }
    return `127.0.0.1:${raw}`;
  });
  doc.setIn(['services', serviceName, 'ports'], updated);
}

function isYamlMapNode(node: unknown): node is YAMLMap {
  return Boolean(
    node &&
    typeof node === 'object' &&
    'items' in node &&
    Array.isArray(node.items) &&
    !('min' in node) &&
    'get' in node
  );
}

function deepMergeYamlMap(doc: Document, targetPath: readonly string[], overlayMap: YAMLMap): void {
  for (const inner of overlayMap.items) {
    const prop = pairKeyToString(inner);
    const nextPath = [...targetPath, prop];
    const existingNode = doc.getIn(nextPath);
    if (isYamlMapNode(existingNode) && isYamlMapNode(inner.value)) {
      deepMergeYamlMap(doc, nextPath, inner.value);
    } else {
      doc.setIn(nextPath, inner.value);
    }
  }
}

export function mergeOverlay(doc: Document, overlayYaml: string): void {
  const overlayDoc = parseDocument(overlayYaml);
  const services = overlayDoc.get('services') as YAMLMap | undefined;
  if (!services || !Array.isArray(services.items)) return;
  for (const pair of services.items) {
    const svc = pairKeyToString(pair);
    const svcMap = pair.value as YAMLMap | undefined;
    if (!svcMap || !Array.isArray(svcMap.items)) continue;
    deepMergeYamlMap(doc, ['services', svc], svcMap);
  }
}

function mergeLogsCompose(doc: Document, logsDoc: Document): void {
  const logServices = logsDoc.get('services') as YAMLMap | undefined;
  if (!logServices || !Array.isArray(logServices.items)) return;
  for (const pair of logServices.items) {
    const key = pairKeyToString(pair);
    if (!doc.getIn(['services', key])) {
      doc.setIn(['services', key], pair.value);
    }
  }
}

function collectResidualRelativeMounts(doc: Document): readonly string[] {
  const errors: string[] = [];
  const services = doc.get('services') as YAMLMap | undefined;
  if (!services || !Array.isArray(services.items)) return errors;

  for (const pair of services.items) {
    const svcName = pairKeyToString(pair);
    const vols = doc.getIn(['services', svcName, 'volumes']) as YAMLSeq | undefined;
    if (!vols || !Array.isArray(vols.items)) continue;
    for (const item of vols.items) {
      const raw = nodeItemToString(item);
      const source = raw.split(':')[0]?.trim() ?? '';
      if (RELATIVE_MOUNT_REGEX.test(source)) {
        errors.push(`Residual local bind-mount in services.${svcName}.volumes: '${raw}'`);
      }
    }
  }
  return errors;
}

const REMOTE_CUSTOM_DB_IMAGE = '${DOCKER_USER}/${DOCKER_REPO_DB}:${DOCKER_TAG_DB}' as const;

function transformRemoteCoreServices(
  doc: Document,
  config: SupabaseDockerConfig,
  remote: NonNullable<SupabaseDockerConfig['profiles']['remote']>
): void {
  const { shared, dbData, dbConfig } = remote.volumes;
  doc.setIn(['services', 'supabase-config-init'], {
    container_name: `${config.projectSlug}-supabase-config-init`,
    image: REMOTE_CUSTOM_DB_IMAGE,
    restart: 'no',
    entrypoint: ['/bin/sh', '-c'],
    command: ['cp -rf /supabase-volumes/* /target-volumes/'],
    volumes: [`${shared}:/target-volumes:Z`]
  });

  doc.setIn(['services', 'db', 'image'], REMOTE_CUSTOM_DB_IMAGE);
  rewriteServiceVolumes(doc, 'db', (entry) => {
    if (entry.includes('./volumes/db/data')) return `${dbData}:/var/lib/postgresql/data:Z`;
    if (entry.startsWith('db-config:')) return `${dbConfig}:/etc/postgresql-custom:Z`;
    if (entry.includes('./volumes/db/')) return null;
    return entry;
  });

  if (doc.getIn(['services', 'api-gw'])) {
    doc.setIn(['services', 'api-gw', 'volumes'], [`${shared}:/supabase-volumes:ro,z`]);
    doc.setIn(
      ['services', 'api-gw', 'entrypoint'],
      [
        '/bin/sh',
        '-c',
        'cp -rf /supabase-volumes/api/envoy/* /etc/envoy/ && exec /bin/sh /etc/envoy/docker-entrypoint.sh'
      ]
    );
    doc.deleteIn(['services', 'api-gw', 'environment', 'ENVOY_CONFIG_DIR']);
    addDependsOn(doc, 'api-gw', {
      dep: 'supabase-config-init',
      condition: 'service_completed_successfully'
    });
  }

  if (doc.getIn(['services', 'studio'])) {
    doc.setIn(['services', 'studio', 'volumes'], [`${shared}:/supabase-volumes:Z`]);
    doc.setIn(
      ['services', 'studio', 'environment', 'SNIPPETS_MANAGEMENT_FOLDER'],
      '/supabase-volumes/snippets'
    );
    doc.setIn(
      ['services', 'studio', 'environment', 'EDGE_FUNCTIONS_MANAGEMENT_FOLDER'],
      '/supabase-volumes/functions'
    );
    if (remote.includeLogs) {
      doc.setIn(['services', 'studio', 'environment', 'ENABLED_FEATURES_LOGS_ALL'], 'true');
    }
    addDependsOn(doc, 'studio', {
      dep: 'supabase-config-init',
      condition: 'service_completed_successfully'
    });
  }
}

function validateUpstreamPostgresMajor(
  composeYaml: string,
  config: SupabaseDockerConfig
): { readonly error: string | null; readonly warning: string | null } {
  const upstreamMeta = inspectUpstreamCompose(composeYaml);
  if (upstreamMeta.postgresMajor === config.postgres.expectedMajor) {
    return { error: null, warning: null };
  }
  const msg = `Upstream PostgreSQL major (${upstreamMeta.postgresMajor}) does not match expectedMajor (${config.postgres.expectedMajor}). Run 'auditor-supabase upgrade-pg' before upgrading.`;
  if (!config.postgres.allowMajorUpgrade) {
    return { error: msg, warning: null };
  }
  return { error: null, warning: `${msg} (allowed by postgres.allowMajorUpgrade=true)` };
}

function rewriteSeqCommand(
  doc: Document,
  serviceName: string,
  replacement: { readonly fromText: string; readonly toText: string }
): void {
  const cmd = doc.getIn(['services', serviceName, 'command']) as YAMLSeq | undefined;
  if (!cmd || !Array.isArray(cmd.items)) return;
  const rewrittenCmd = cmd.items.map((item) =>
    nodeItemToString(item).replaceAll(replacement.fromText, replacement.toText)
  );
  doc.setIn(['services', serviceName, 'command'], rewrittenCmd);
}

function transformRemoteSupportServices(
  doc: Document,
  volumes: SupabaseRemoteProfileConfig['volumes']
): void {
  const { shared, storage } = volumes;
  if (doc.getIn(['services', 'functions'])) {
    rewriteServiceVolumes(doc, 'functions', (entry) =>
      entry.includes('./volumes/functions') ? `${shared}:/home/deno:Z` : entry
    );
    addDependsOn(doc, 'functions', {
      dep: 'supabase-config-init',
      condition: 'service_completed_successfully'
    });
  }

  for (const svc of ['storage', 'imgproxy']) {
    if (!doc.getIn(['services', svc])) continue;
    rewriteServiceVolumes(doc, svc, (entry) =>
      entry.includes('./volumes/storage') ? `${storage}:/var/lib/storage:Z` : entry
    );
  }

  const realtimeVols = doc.getIn(['services', 'realtime', 'volumes']) as YAMLSeq | undefined;
  const hasUpstreamRealtimeMount = Boolean(
    realtimeVols &&
    Array.isArray(realtimeVols.items) &&
    realtimeVols.items.some((item) => nodeItemToString(item).includes('./volumes/realtime'))
  );
  if (doc.getIn(['services', 'realtime']) && hasUpstreamRealtimeMount) {
    doc.setIn(['services', 'realtime', 'volumes'], [`${shared}:/supabase-volumes:ro,z`]);
    doc.setIn(
      ['services', 'realtime', 'entrypoint'],
      ['/bin/sh', '/supabase-volumes/realtime/docker-entrypoint.sh']
    );
    addDependsOn(doc, 'realtime', {
      dep: 'supabase-config-init',
      condition: 'service_completed_successfully'
    });
  }

  if (doc.getIn(['services', 'supavisor'])) {
    doc.setIn(['services', 'supavisor', 'volumes'], [`${shared}:/supabase-volumes:ro,z`]);
    doc.setIn(['services', 'supavisor', 'ulimits'], {
      nofile: { soft: SUPAVISOR_NOFILE_LIMIT, hard: SUPAVISOR_NOFILE_LIMIT }
    });
    doc.setIn(
      ['services', 'supavisor', 'environment', 'RLIMIT_NOFILE'],
      String(SUPAVISOR_NOFILE_LIMIT)
    );
    rewriteSeqCommand(doc, 'supavisor', {
      fromText: '/etc/pooler/pooler.exs',
      toText: '/supabase-volumes/pooler/pooler.exs'
    });
    addDependsOn(doc, 'supavisor', {
      dep: 'supabase-config-init',
      condition: 'service_completed_successfully'
    });
  }
}

function transformRemoteLoggingServices(doc: Document, shared: string): void {
  if (doc.getIn(['services', 'vector'])) {
    rewriteServiceVolumes(doc, 'vector', (entry) =>
      entry.includes('./volumes/logs/vector.yml') ? `${shared}:/supabase-volumes:ro,z` : entry
    );
    rewriteSeqCommand(doc, 'vector', {
      fromText: '/etc/vector/vector.yml',
      toText: '/supabase-volumes/logs/vector.yml'
    });
    addDependsOn(doc, 'vector', { dep: 'db', condition: 'service_healthy' });
    addDependsOn(doc, 'vector', {
      dep: 'supabase-config-init',
      condition: 'service_completed_successfully'
    });
  }
  if (doc.getIn(['services', 'analytics'])) {
    doc.setIn(['services', 'analytics', 'healthcheck', 'start_period'], '60s');
  }
}

function reconcileRemoteRootVolumes(
  doc: Document,
  volumes: SupabaseRemoteProfileConfig['volumes']
): void {
  const rootVols = (doc.get('volumes') as YAMLMap | undefined)?.toJSON() as
    | Record<string, unknown>
    | undefined;
  const nextRootVols: Record<string, unknown> = {};
  if (rootVols) {
    for (const [k, v] of Object.entries(rootVols)) {
      if (k !== 'db-config') nextRootVols[k] = v ?? {};
    }
  }
  nextRootVols[volumes.shared] = {};
  nextRootVols[volumes.dbData] = {};
  nextRootVols[volumes.dbConfig] = {};
  nextRootVols[volumes.storage] = {};
  doc.set('volumes', nextRootVols);
}

function disabledComposeResult(
  composeYaml: string,
  profile: SupabaseComposeProfileKind
): SupabaseComposeTransformResult {
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

interface ComposeInitOptions {
  readonly includeLogs: boolean;
  readonly transformOptions?: SupabaseComposeTransformOptions;
}

function initTransformedComposeDoc(
  composeYaml: string,
  config: SupabaseDockerConfig,
  initOpts: ComposeInitOptions
): {
  readonly doc: Document;
  readonly errors: string[];
  readonly warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const pgCheck = validateUpstreamPostgresMajor(composeYaml, config);
  if (pgCheck.error) errors.push(pgCheck.error);
  if (pgCheck.warning) warnings.push(pgCheck.warning);
  const doc = parseDocument(composeYaml);
  if (initOpts.includeLogs && initOpts.transformOptions?.logsComposeYaml) {
    mergeLogsCompose(doc, parseDocument(initOpts.transformOptions.logsComposeYaml));
  }
  return { doc, errors, warnings };
}

function prefixServiceContainerNames(
  doc: Document,
  projectSlug: string,
  realtimeTenantName?: string
): void {
  const services = doc.get('services') as YAMLMap | undefined;
  if (!services || !Array.isArray(services.items)) return;
  for (const pair of services.items) {
    const svc = pairKeyToString(pair);
    const existingName = doc.getIn(['services', svc, 'container_name']);
    if (!existingName) continue;
    const rawName = nodeItemToString(existingName);
    if (svc === 'realtime' && realtimeTenantName) {
      doc.setIn(
        ['services', svc, 'container_name'],
        `${realtimeTenantName}.${projectSlug}-realtime`
      );
      continue;
    }
    if (!rawName.startsWith(`${projectSlug}-`)) {
      doc.setIn(['services', svc, 'container_name'], `${projectSlug}-${rawName}`);
    }
  }
}

/**
 * Transforms an upstream Supabase `docker-compose.yml` into a bind-mount-free `remote` stack.
 */
export function transformRemoteComposeYaml(
  composeYaml: string,
  config: SupabaseDockerConfig,
  options?: SupabaseComposeTransformOptions
): SupabaseComposeTransformResult {
  const remote = config.profiles.remote;
  if (!remote?.enabled) {
    return disabledComposeResult(composeYaml, 'remote');
  }

  const { doc, errors, warnings } = initTransformedComposeDoc(composeYaml, config, {
    includeLogs: remote.includeLogs,
    transformOptions: options
  });
  const { shared } = remote.volumes;

  transformRemoteCoreServices(doc, config, remote);
  transformRemoteSupportServices(doc, remote.volumes);
  transformRemoteLoggingServices(doc, shared);
  prefixServiceContainerNames(doc, config.projectSlug);

  if (remote.security.bindLoopback) {
    applyLoopbackPorts(doc, 'db');
    applyLoopbackPorts(doc, 'supavisor');
    applyLoopbackPorts(doc, 'api-gw');
  }

  reconcileRemoteRootVolumes(doc, remote.volumes);

  if (options?.overlayYaml) {
    mergeOverlay(doc, options.overlayYaml);
  }

  errors.push(...collectResidualRelativeMounts(doc));

  return {
    yaml: doc.toString(),
    report: {
      valid: errors.length === 0,
      profile: 'remote',
      errors,
      warnings
    }
  };
}

function rebaseRelativeMountSource(source: string, relativePrefix: string): string {
  if (!source.startsWith('./')) return source;
  const cleanPrefix = relativePrefix.replace(/\/+$/u, '');
  return `${cleanPrefix}/${source.slice(2)}`;
}

function rebaseVolumeEntry(entry: unknown, relativePrefix: string): void {
  if (isScalar(entry) && typeof entry.value === 'string') {
    const colonIdx = entry.value.indexOf(':');
    const source = colonIdx === -1 ? entry.value : entry.value.slice(0, colonIdx);
    const rebased = rebaseRelativeMountSource(source, relativePrefix);
    if (rebased !== source) {
      entry.value = colonIdx === -1 ? rebased : `${rebased}${entry.value.slice(colonIdx)}`;
    }
    return;
  }
  if (!isMap(entry)) return;
  const srcNode = entry.get('source', true);
  if (!isScalar(srcNode) || typeof srcNode.value !== 'string') return;
  const rebased = rebaseRelativeMountSource(srcNode.value, relativePrefix);
  if (rebased !== srcNode.value) {
    srcNode.value = rebased;
  }
}

function rebaseLocalFullRelativeMounts(doc: Document, relativePrefix = '../../docker'): void {
  const services = doc.get('services');
  if (!isMap(services)) return;
  for (const pair of services.items) {
    const svc = pairKeyToString(pair);
    const volumes = doc.getIn(['services', svc, 'volumes']);
    if (!isSeq(volumes)) continue;
    for (const item of volumes.items) {
      rebaseVolumeEntry(item, relativePrefix);
    }
  }
}

/**
 * Transforms an upstream compose file for isolated concurrent `localFull` execution.
 */
export function transformLocalFullComposeYaml(
  composeYaml: string,
  config: SupabaseDockerConfig,
  options?: SupabaseComposeTransformOptions
): SupabaseComposeTransformResult {
  const localFull = config.profiles.localFull;
  if (!localFull?.enabled) {
    return disabledComposeResult(composeYaml, 'localFull');
  }

  const { doc, errors, warnings } = initTransformedComposeDoc(composeYaml, config, {
    includeLogs: localFull.includeLogs,
    transformOptions: options
  });
  doc.set('name', `${config.projectSlug}-local-full`);
  prefixServiceContainerNames(doc, config.projectSlug, localFull.realtimeTenantName);
  rebaseLocalFullRelativeMounts(doc);

  if (doc.getIn(['services', 'api-gw'])) {
    doc.setIn(['services', 'api-gw', 'ports'], [`${localFull.ports.api}:8000/tcp`]);
  }
  if (doc.getIn(['services', 'supavisor'])) {
    doc.setIn(
      ['services', 'supavisor', 'ports'],
      [`${localFull.ports.postgres}:5432`, `${localFull.ports.pooler}:6543`]
    );
  }
  if (doc.getIn(['services', 'studio'])) {
    doc.setIn(['services', 'studio', 'ports'], [`${localFull.ports.studio}:3000`]);
  }

  if (options?.overlayYaml) {
    mergeOverlay(doc, options.overlayYaml);
  }

  return {
    yaml: doc.toString(),
    report: {
      valid: errors.length === 0,
      profile: 'localFull',
      errors,
      warnings
    }
  };
}

export interface ExtractComposePlaceholdersOptions {
  readonly requiredOnly?: boolean;
}

function findClosingBrace(text: string, openBraceIdx: number): number {
  let depth = 1;
  for (let idx = openBraceIdx + 1; idx < text.length; idx++) {
    if (text[idx] === '$' && text[idx + 1] === '{') {
      depth += 1;
      idx += 1;
    } else if (text[idx] === '}') {
      depth -= 1;
      if (depth === 0) return idx;
    }
  }
  return -1;
}

function scanScalarEnvPlaceholders(text: string, requiredOnly: boolean, out: Set<string>): void {
  for (let idx = 0; idx < text.length; idx++) {
    if (text[idx] === '$' && text[idx + 1] === '$') {
      idx += 1;
      continue;
    }
    if (text[idx] !== '$' || text[idx + 1] !== '{') continue;
    const closeIdx = findClosingBrace(text, idx + 1);
    if (closeIdx < 0) continue;

    const expr = text.slice(idx + 2, closeIdx);
    const match = PLACEHOLDER_EXPR_REGEX.exec(expr);
    if (match?.[1]) {
      const varName = match[1];
      const suffix = match[2] ?? '';
      const isOptional =
        suffix.startsWith(':-') ||
        suffix.startsWith('-') ||
        suffix.startsWith(':+') ||
        suffix.startsWith('+');
      if (!requiredOnly || !isOptional) {
        out.add(varName);
      }
      if (!requiredOnly && suffix) {
        scanScalarEnvPlaceholders(suffix, false, out);
      }
    }
    idx = closeIdx;
  }
}

function collectYamlNodePlaceholders(node: unknown, requiredOnly: boolean, out: Set<string>): void {
  if (isMap(node)) {
    for (const pair of node.items) {
      collectYamlNodePlaceholders(pair.key, requiredOnly, out);
      collectYamlNodePlaceholders(pair.value, requiredOnly, out);
    }
    return;
  }
  if (isSeq(node)) {
    for (const item of node.items) {
      collectYamlNodePlaceholders(item, requiredOnly, out);
    }
    return;
  }
  if (isScalar(node) && typeof node.value === 'string') {
    scanScalarEnvPlaceholders(node.value, requiredOnly, out);
  }
}

/**
 * Extracts `${VAR}` placeholder names referenced inside non-comment YAML nodes of a compose file.
 * When `requiredOnly` is true, excludes placeholders with defaults or conditionals (`${VAR:-...}`, `${VAR-...}`, `${VAR:+...}`, `${VAR+...}`).
 */
export function extractComposeEnvPlaceholders(
  composeYaml: string,
  options: ExtractComposePlaceholdersOptions = {}
): readonly string[] {
  const vars = new Set<string>();
  const doc = parseDocument(composeYaml);
  collectYamlNodePlaceholders(doc.contents, options.requiredOnly ?? false, vars);
  return [...vars].sort();
}

/**
 * Builds deterministic dummy values for `docker compose config -q` when no server `.env` exists yet.
 */
export function buildDummyValidationEnv(placeholders: readonly string[]): Map<string, string> {
  const env = new Map<string, string>();
  for (const key of placeholders) {
    if (key.includes('PORT')) env.set(key, '5432');
    else if (key.includes('URL')) env.set(key, 'http://localhost:8000');
    else env.set(key, 'validation-placeholder-value');
  }
  return env;
}

/**
 * Runs `docker compose -f <composePath> config -q` to validate final Compose syntax.
 */
export function validateComposeWithDocker(
  composePath: string,
  envFilePath?: string
): { readonly ok: boolean; readonly stderr: string } {
  const args = ['compose', '-f', composePath];
  if (envFilePath) {
    args.push('--env-file', envFilePath);
  }
  args.push('config', '-q');

  const result = tryCatchSync(() =>
    execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  );
  if (result.status === 'success') {
    return { ok: true, stderr: '' };
  }
  const err = result.error as { readonly stderr?: string; readonly message?: string };
  return { ok: false, stderr: String(err.stderr ?? err.message ?? 'docker compose config failed') };
}

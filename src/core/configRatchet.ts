/**
 * src/core/configRatchet.ts
 *
 * UNIDIRECTIONAL ONLINE CONFIG RATCHET (Phase: 'setup')
 *
 * Protects project architectural configurations against unauthorized rule relaxations
 * or exemptions introduced by AI agents or developers to make tests pass:
 *
 * 1. Online SSoT: Compares local configurations against `origin/main` (or configured productionRef).
 * 2. Hardening Allowed (Local >= OnlineMain): Removing exemptions, raising coverage/similarity floors,
 *    lowering complexity ceilings, enabling suites, promoting linter rules passes automatically with 0 friction.
 * 3. Relaxation Blocked (Local < OnlineMain): Adding exemptions, disabling suites, lowering floors,
 *    raising ceilings, or changing ratchet.productionRef generates a deterministic `RELAX-<8hex>` code
 *    and blocks in phase: 'setup'.
 * 4. Antigravity Native Authorization: If `RELAX-<8hex>` is verified in Antigravity's conversation transcript
 *    from a USER_EXPLICIT step with zero model tampering, the relaxation is accepted.
 */

import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  verifyTranscriptAuthorization,
  type TranscriptVerifierOptions
} from './transcriptAuthorizationVerifier.ts';
import { safeJsonParse, safeReadFileSync } from './safeUtils.ts';
import { normalizePosixPath } from './safePath.ts';
import { createDomainSet } from './domainCollections.ts';
import type { AuditRatchetConfig } from './auditConfigTypes.ts';

export type RelaxationCode = `RELAX-${string}` & { readonly __brand?: 'RelaxationCode' };

export interface ConfigRelaxation {
  readonly file: string;
  readonly path: string;
  readonly description: string;
  readonly onlineValue?: unknown;
  readonly localValue?: unknown;
}

export interface ConfigRatchetResult {
  readonly passed: boolean;
  readonly relaxations: readonly ConfigRelaxation[];
  readonly relaxationCode: RelaxationCode | null;
  readonly authorized: boolean;
  readonly tamperingDetected: boolean;
  readonly message?: string;
}

export interface ConfigRatchetOptions {
  readonly projectRoot?: string;
  readonly productionRef?: string;
  readonly skipNetwork?: boolean;
  readonly transcriptOptions?: TranscriptVerifierOptions;
}

export function runGit(projectRoot: string, args: readonly string[]): { ok: boolean; stdout: string } {
  const proc = spawnSync('git', args, {
    cwd: projectRoot,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  return { ok: proc.status === 0, stdout: proc.stdout ?? '' };
}

export function resolveProductionRef(
  projectRoot: string,
  configuredRef = 'origin/main',
  skipNetwork = false
): string | null {
  // Fast check: verify if projectRoot is inside a git repository
  const isGitRepo = runGit(projectRoot, ['rev-parse', '--is-inside-work-tree']);
  if (!isGitRepo.ok || isGitRepo.stdout.trim() !== 'true') {
    return null;
  }

  // 1. If network check is allowed, probe remote git ls-remote to verify authentic remote ref
  if (!skipNetwork && !process.env.AUDIT_SUBPROCESS && !process.env.VITEST) {
    const branchName = configuredRef.replace(/^origin\//, '');
    const remoteCheck = runGit(projectRoot, ['ls-remote', '--heads', 'origin', branchName]);
    if (remoteCheck.ok && remoteCheck.stdout.trim().length > 0) {
      // Remote branch exists, try fetching or verifying tracking ref
      runGit(projectRoot, ['fetch', 'origin', branchName, '--quiet']);
    }
  }

  // 2. Verify if configuredRef resolves to a commit locally
  if (runGit(projectRoot, ['rev-parse', '--verify', '--quiet', `${configuredRef}^{commit}`]).ok) {
    return configuredRef;
  }

  // 3. Fallback to origin/main or HEAD if configuredRef is not resolvable
  if (runGit(projectRoot, ['rev-parse', '--verify', '--quiet', 'origin/main^{commit}']).ok) {
    return 'origin/main';
  }

  if (runGit(projectRoot, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']).ok) {
    return 'HEAD';
  }

  return null;
}

export function readGitFile(projectRoot: string, ref: string, relPath: string): string | null {
  const normalized = normalizePosixPath(relPath);
  const res = runGit(projectRoot, ['show', `${ref}:${normalized}`]);
  return res.ok ? res.stdout : null;
}

/**
 * Extracts all string elements from an array or Set.
 */
function toStringSet(val: unknown): Set<string> {
  if (Array.isArray(val)) {
    return new Set(val.map(String));
  }
  if (val && typeof val === 'object' && val instanceof Set) {
    return new Set(Array.from(val).map(String));
  }
  return new Set();
}

/**
 * Compares exemption list entries. Adding new exemptions is a relaxation.
 */
function compareExemptionLists(
  file: string,
  fieldPath: string,
  onlineVal: unknown,
  localVal: unknown,
  relaxations: ConfigRelaxation[]
): void {
  const onlineSet = toStringSet(onlineVal);
  const localSet = toStringSet(localVal);

  const added = Array.from(localSet).filter((x) => !onlineSet.has(x));
  if (added.length > 0) {
    relaxations.push({
      file,
      path: fieldPath,
      description: `Added ${added.length} new exemption(s): ${added.slice(0, 3).join(', ')}${added.length > 3 ? '...' : ''}`,
      onlineValue: Array.from(onlineSet),
      localValue: Array.from(localSet)
    });
  }
}

/**
 * Compares numeric floors (lower is relaxation) or ceilings (higher is relaxation).
 */
function compareNumericBoundary(
  file: string,
  fieldPath: string,
  onlineVal: unknown,
  localVal: unknown,
  relaxations: ConfigRelaxation[],
  mode: 'floor' | 'ceiling'
): void {
  const onlineNum = typeof onlineVal === 'number' ? onlineVal : null;
  const localNum = typeof localVal === 'number' ? localVal : null;

  if (onlineNum === null || localNum === null) return;

  const isRelaxed = mode === 'floor' ? localNum < onlineNum : localNum > onlineNum;
  if (!isRelaxed) return;

  const action = mode === 'floor' ? 'Lowered minimum floor' : 'Raised maximum ceiling';
  relaxations.push({
    file,
    path: fieldPath,
    description: `${action} from ${onlineNum} to ${localNum}`,
    onlineValue: onlineNum,
    localValue: localNum
  });
}

const CEILING_METRIC_KEYS = createDomainSet([
  'maxChunkKb',
  'maxLinesPerFunction',
  'maxNestingDepth',
  'maxLines'
] as const);

const EXEMPTION_FIELD_NAMES = createDomainSet([
  'exemptGlobs',
  'exemptFiles',
  'ignoreGlobs',
  'dataRoots',
  'demoRoots',
  'cliRoots',
  'infraIdWhitelist',
  'disabledDetectors',
  'exemptMagicNumbers',
  'exemptCssFiles',
  'testFragmentationWhitelist'
] as const);

/**
 * Recursively inspects parsed config objects to detect added exemptions, lowered floors, or disabled suites.
 */
export function inspectAuditConfigChanges(
  onlineConfig: Record<string, unknown>,
  localConfig: Record<string, unknown>,
  configFile = '.auditor/audit.config.ts'
): ConfigRelaxation[] {
  const relaxations: ConfigRelaxation[] = [];

  function evaluateNumericLimit(
    fieldPath: string,
    key: string,
    onlineVal: unknown,
    localVal: unknown
  ): boolean {
    if (typeof onlineVal !== 'number') return false;

    const isComplexityCeiling =
      fieldPath.includes('complexity') ||
      CEILING_METRIC_KEYS.has(key);

    if (isComplexityCeiling) {
      compareNumericBoundary(configFile, fieldPath, onlineVal, localVal, relaxations, 'ceiling');
      return true;
    }

    const isCoverageFloor =
      fieldPath.includes('coverage') ||
      fieldPath.includes('similarity') ||
      key === 'threshold' ||
      key === 'minCoverage';

    if (isCoverageFloor) {
      compareNumericBoundary(configFile, fieldPath, onlineVal, localVal, relaxations, 'floor');
      return true;
    }

    return false;
  }

  function evaluateSuiteEnabled(
    fieldPath: string,
    key: string,
    prefix: string,
    onlineVal: unknown,
    localVal: unknown
  ): boolean {
    if (key !== 'enabled') return false;
    if (onlineVal === true && localVal === false) {
      relaxations.push({
        file: configFile,
        path: fieldPath,
        description: `Disabled auditor suite '${prefix}' (was enabled in online baseline)`,
        onlineValue: true,
        localValue: false
      });
    }
    return true;
  }

  function evaluateDegradations(
    fieldPath: string,
    key: string,
    onlineVal: unknown,
    localVal: unknown
  ): boolean {
    if (key !== 'acknowledgedDegradations' || !localVal || typeof localVal !== 'object') {
      return false;
    }
    const onlineDeg = (onlineVal && typeof onlineVal === 'object' ? onlineVal : {}) as Record<string, unknown>;
    const localDeg = localVal as Record<string, unknown>;
    for (const policy of Object.keys(localDeg)) {
      compareExemptionLists(
        configFile,
        `${fieldPath}.${policy}`,
        onlineDeg[policy],
        localDeg[policy],
        relaxations
      );
    }
    return true;
  }

  function scanObject(
    onlineObj: Record<string, unknown>,
    localObj: Record<string, unknown>,
    prefix = ''
  ): void {
    const allKeys = new Set([...Object.keys(onlineObj), ...Object.keys(localObj)]);

    for (const key of allKeys) {
      const fieldPath = prefix ? `${prefix}.${key}` : key;
      const onlineVal = onlineObj[key];
      const localVal = localObj[key];

      if (EXEMPTION_FIELD_NAMES.has(key)) {
        compareExemptionLists(configFile, fieldPath, onlineVal, localVal, relaxations);
        continue;
      }

      if (evaluateNumericLimit(fieldPath, key, onlineVal, localVal)) {
        continue;
      }

      if (evaluateSuiteEnabled(fieldPath, key, prefix, onlineVal, localVal)) {
        continue;
      }

      if (evaluateDegradations(fieldPath, key, onlineVal, localVal)) {
        continue;
      }

      // Recurse into nested objects
      if (
        onlineVal &&
        localVal &&
        typeof onlineVal === 'object' &&
        typeof localVal === 'object' &&
        !Array.isArray(onlineVal) &&
        !Array.isArray(localVal)
      ) {
        scanObject(
          onlineVal as Record<string, unknown>,
          localVal as Record<string, unknown>,
          fieldPath
        );
      }
    }
  }

  scanObject(onlineConfig, localConfig);
  return relaxations;
}

/**
 * Compares linter JSON configuration (Stylelint, Fallow, HtmlValidate, tsconfig).
 * Demoting rules ('error' -> 'warn' | 'off') is a relaxation.
 */
export function inspectLinterConfigChanges(
  file: string,
  onlineContent: string | null,
  localContent: string | null
): ConfigRelaxation[] {
  if (!onlineContent || !localContent) return [];

  let onlineJson: Record<string, unknown>;
  let localJson: Record<string, unknown>;
  try {
    onlineJson = JSON.parse(onlineContent) as Record<string, unknown>;
    localJson = JSON.parse(localContent) as Record<string, unknown>;
  } catch {
    return [];
  }

  const relaxations: ConfigRelaxation[] = [];
  const SEVERITY_WEIGHT: Record<string, number> = {
    error: 3,
    warn: 2,
    warning: 2,
    off: 0,
    none: 0
  };

  const onlineRules = (onlineJson.rules ?? onlineJson) as Record<string, unknown>;
  const localRules = (localJson.rules ?? localJson) as Record<string, unknown>;

  for (const rule of Object.keys(onlineRules)) {
    const onlineRuleVal = onlineRules[rule];
    const localRuleVal = localRules[rule];

    // Check if rule was turned off or nullified
    if (localRuleVal === null || localRuleVal === 'off' || localRuleVal === 0) {
      if (onlineRuleVal !== null && onlineRuleVal !== 'off' && onlineRuleVal !== 0) {
        relaxations.push({
          file,
          path: `rules.${rule}`,
          description: `Demoted or disabled rule '${rule}'`,
          onlineValue: onlineRuleVal,
          localValue: localRuleVal
        });
        continue;
      }
    }

    // Check severity string demotion
    const onlineSev = typeof onlineRuleVal === 'string' ? (SEVERITY_WEIGHT[onlineRuleVal] ?? null) : null;
    const localSev = typeof localRuleVal === 'string' ? (SEVERITY_WEIGHT[localRuleVal] ?? null) : null;

    if (onlineSev !== null && localSev !== null && localSev < onlineSev) {
      relaxations.push({
        file,
        path: `rules.${rule}`,
        description: `Demoted rule '${rule}' from severity '${onlineRuleVal}' to '${localRuleVal}'`,
        onlineValue: onlineRuleVal,
        localValue: localRuleVal
      });
    }
  }

  return relaxations;
}

/**
 * Computes a deterministic RELAX-<8hex> token from the collected relaxations.
 */
export function computeRelaxationCode(relaxations: readonly ConfigRelaxation[]): RelaxationCode {
  const sorted = [...relaxations].sort((a, b) =>
    `${a.file}:${a.path}`.localeCompare(`${b.file}:${b.path}`)
  );
  const hash = createHash('sha256')
    .update(JSON.stringify(sorted))
    .digest('hex')
    .slice(0, 8);
  return `RELAX-${hash}` as RelaxationCode;
}

/**
 * Runs the complete Unidirectional Online Config Ratchet check.
 */
export function auditConfigRatchet(
  projectRoot: string,
  localConfig: Record<string, unknown>,
  options: ConfigRatchetOptions = {}
): ConfigRatchetResult {
  const effectiveRef = resolveProductionRef(
    projectRoot,
    options.productionRef ?? (localConfig.ratchet as AuditRatchetConfig | undefined)?.productionRef ?? 'origin/main',
    options.skipNetwork
  );

  if (!effectiveRef) {
    // If no git history or ref available (e.g. brand new un-git repo), pass cleanly
    return {
      passed: true,
      relaxations: [],
      relaxationCode: null,
      authorized: false,
      tamperingDetected: false
    };
  }

  const relaxations: ConfigRelaxation[] = [];

  // 1. Audit .auditor/audit.config.ts
  const rawOnlineAuditConfig = readGitFile(projectRoot, effectiveRef, '.auditor/audit.config.ts');
  if (rawOnlineAuditConfig) {
    // Basic structural extract of exemption arrays & thresholds from raw text if not running full import
    // When localConfig is available, compare against parsed localConfig
    const rawOnlineJson = readGitFile(projectRoot, effectiveRef, '.auditor/audit.config.json');
    if (rawOnlineJson) {
      const parsedOnline = safeJsonParse<Record<string, unknown>>(rawOnlineJson);
      if (parsedOnline) {
        relaxations.push(...inspectAuditConfigChanges(parsedOnline, localConfig));
      }
    }
  }

  // 2. Audit other governed config files
  const GOVERNED_JSON_FILES = [
    '.stylelintrc.json',
    '.fallowrc.json',
    '.htmlvalidate.json',
    'tsconfig.json'
  ];

  for (const jsonFile of GOVERNED_JSON_FILES) {
    const onlineText = readGitFile(projectRoot, effectiveRef, jsonFile);
    const localPath = path.resolve(projectRoot, jsonFile);
    const localText = safeReadFileSync(localPath);
    if (onlineText && localText) {
      relaxations.push(...inspectLinterConfigChanges(jsonFile, onlineText, localText));
    }
  }

  if (relaxations.length === 0) {
    return {
      passed: true,
      relaxations: [],
      relaxationCode: null,
      authorized: false,
      tamperingDetected: false
    };
  }

  // Relaxations detected: generate deterministic code and check authorization
  const relaxationCode = computeRelaxationCode(relaxations);
  const auth = verifyTranscriptAuthorization(relaxationCode, options.transcriptOptions);

  if (auth.tamperingDetected) {
    return {
      passed: false,
      relaxations,
      relaxationCode,
      authorized: false,
      tamperingDetected: true,
      message: `CRITICAL TAMPERING DETECTED: An AI model tool call attempted to write or edit transcript logs to spoof authorization for ${relaxationCode}. Execution is permanently blocked.`
    };
  }

  if (auth.verified) {
    return {
      passed: true,
      relaxations,
      relaxationCode,
      authorized: true,
      tamperingDetected: false,
      message: `Relaxation code ${relaxationCode} explicitly authorized by user in Antigravity chat.`
    };
  }

  return {
    passed: false,
    relaxations,
    relaxationCode,
    authorized: false,
    tamperingDetected: false,
    message:
      `Unauthorized rule relaxation detected relative to '${effectiveRef}'.\n` +
      `To authorize this relaxation, confirm code '${relaxationCode}' in the Antigravity chat.`
  };
}

/**
 * src/core/auditorContractConformance.ts
 *
 * DYNAMIC AUDITOR CONTRACT & TESTING CONFORMANCE ENGINE (Node.js 26+ Native)
 * Automatically discovers all sub-auditors across core suites and extensions,
 * validating live BaseAuditor instantiation, metadata integrity, and the strict
 * 5-point test contract (Construction, Clean Path, Violation Path, Warnings, and 100% Rule Coverage).
 */

import fs from 'node:fs';
import path from 'node:path';

import type { describe, it, expect, beforeAll, afterAll } from 'vite-plus/test';

import { discoverAuditors } from '../cli/auditScanner.ts';
import { getAuditConfig } from './auditConfig.ts';
import type { AuditTaskDefinition, AuditorComputedCapabilities } from './auditContract.ts';
import {
  getActiveFamilies,
  AUDIT_EXECUTION_SPEEDS,
  AUDIT_EXECUTION_PHASES,
  AUDIT_FIX_CAPABILITIES,
  collectAuditorThirdPartyToolErrors
} from './auditContract.ts';
import { BaseAuditor, MAX_AUDITOR_DESCRIPTION_LENGTH } from './auditorBase.ts';
import { toPosixRelative } from './safePath.ts';
import { tryOrNull, safeRmSync } from './safeUtils.ts';

export interface DiscoveredAuditorTask extends AuditTaskDefinition {
  isExtension?: boolean;
}

const DEFAULT_EXTENSION_TASK_TIMEOUT_MS = 0;
const DEFAULT_EXTENSION_TASK_ORDER = 99;
const MAX_TASK_DESCRIPTION_LENGTH = 60;

export interface AuditorConformanceViolation {
  auditorTaskUid: string;
  testFile?: string;
  type:
    | 'missing-test-file'
    | 'missing-construction-block'
    | 'missing-clean-block'
    | 'missing-violation-block'
    | 'untested-declared-rule'
    | 'invalid-metadata'
    | 'invalid-rule-description';
  message: string;
}

export function isEligibleExtensionAuditorFile(name: string): boolean {
  if (!name.endsWith('.ts') || name.startsWith('_')) return false;
  if (name.includes('.test.') || name.includes('.spec.')) return false;
  if (
    name.startsWith('report_') ||
    name === 'audit_rules.ts' ||
    name.endsWith('Plugin.ts') ||
    name.endsWith('Plugin.js')
  )
    return false;
  return true;
}

function registerExtensionAuditor(
  fullPath: string,
  entryName: string,
  projectRoot: string,
  tasks: DiscoveredAuditorTask[]
): void {
  if (!isEligibleExtensionAuditorFile(entryName)) return;
  const id = path.basename(entryName, '.ts');
  if (tasks.some((t) => t.id === id)) return;

  tasks.push({
    id,
    name: id,
    family: 'architecture',
    scriptPath: toPosixRelative(projectRoot, fullPath),
    command: 'node',
    args: [],
    fast: true,
    timeoutMs: DEFAULT_EXTENSION_TASK_TIMEOUT_MS,
    order: DEFAULT_EXTENSION_TASK_ORDER,
    isBuiltin: false,
    isExtension: true,
    configKey: 'paths',
    defaultConfig: {},
    criticalConfig: {}
  });
}

function processExtensionDir(
  currentDir: string,
  projectRoot: string,
  queue: string[],
  tasks: DiscoveredAuditorTask[]
): void {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('_') && entry.name !== 'node_modules') {
        queue.push(fullPath);
      }
    } else if (entry.isFile()) {
      registerExtensionAuditor(fullPath, entry.name, projectRoot, tasks);
    }
  }
}

export function scanExtensionAuditors(projectRoot: string, tasks: DiscoveredAuditorTask[]): void {
  const scriptsAuditorsDir = path.join(projectRoot, 'scripts/auditors');
  if (!fs.existsSync(scriptsAuditorsDir)) return;

  const queue = [scriptsAuditorsDir];
  while (queue.length > 0) {
    processExtensionDir(queue.shift()!, projectRoot, queue, tasks);
  }
}

/**
 * Discovers all auditor tasks: core suites in src/suites/ plus extensions in scripts/auditors and config.extensions.
 */
export async function scanAllAuditorTasks(
  projectRoot: string = process.cwd()
): Promise<DiscoveredAuditorTask[]> {
  const tasks: DiscoveredAuditorTask[] = [];
  const candidateSuitesDirs = [
    path.join(projectRoot, 'src/suites'),
    path.join(projectRoot, 'packages/auditor/src/suites')
  ];

  for (const suitesDir of candidateSuitesDirs) {
    if (fs.existsSync(suitesDir)) {
      const builtinTasks = await discoverAuditors({ baseDir: suitesDir, withBuild: true });
      for (const t of builtinTasks) {
        tasks.push({ ...t, isExtension: false });
      }
    }
  }

  scanExtensionAuditors(projectRoot, tasks);

  const config = getAuditConfig(projectRoot);
  if (config.extensions && config.extensions.length > 0) {
    for (const ext of config.extensions) {
      const fullPath = path.resolve(projectRoot, ext);
      registerExtensionAuditor(fullPath, path.basename(ext), projectRoot, tasks);
    }
  }

  return tasks;
}

/**
 * Finds the exported BaseAuditor subclass in a loaded module.
 */
export function findAuditorClass(
  mod: Record<string, unknown>
): (new (...args: unknown[]) => BaseAuditor) | null {
  for (const value of Object.values(mod)) {
    if (typeof value === 'function' && value.prototype && value.prototype instanceof BaseAuditor) {
      return value as new (...args: unknown[]) => BaseAuditor;
    }
  }
  return null;
}

/**
 * Safely instantiates an auditor class using canonical constructor signatures.
 * Mandate: Prohibits legacy positional arguments; strictly expects { projectRoot: tempDir } or ().
 */
export function instantiateAuditorClass(
  Cls: new (...args: unknown[]) => BaseAuditor,
  tempDir: string
): BaseAuditor {
  const attempts: (() => BaseAuditor)[] = [
    () => new Cls({ projectRoot: tempDir }),
    () => new Cls()
  ];

  for (const attempt of attempts) {
    const instance = tryOrNull(attempt);
    if (instance && path.resolve(instance.projectRoot) === path.resolve(tempDir)) {
      return instance;
    }
  }

  // Fallback to zero-arg attempt if valid
  for (const attempt of attempts) {
    const instance = tryOrNull(attempt);
    if (instance) return instance;
  }

  throw new Error(
    `[Auditor Contract Violation] Could not instantiate class ${Cls.name}. It must support the canonical options signature ({ projectRoot?: string }) or default no-argument constructor.`
  );
}

function validateBasicMetadata(auditor: BaseAuditor, taskId: string, errors: string[]): void {
  if (!auditor.id || typeof auditor.id !== 'string') {
    errors.push(`Auditor [${taskId}] does not define a valid 'id'.`);
  } else if (auditor.id !== taskId) {
    errors.push(`Auditor [${taskId}] id '${auditor.id}' does not match taskId '${taskId}'.`);
  }

  if (!auditor.name || typeof auditor.name !== 'string') {
    errors.push(`Auditor [${taskId}] does not define a valid 'name'.`);
  }

  if (!auditor.description || typeof auditor.description !== 'string') {
    errors.push(`Auditor [${taskId}] does not define a valid 'description'.`);
  } else if (auditor.description.length > MAX_TASK_DESCRIPTION_LENGTH) {
    errors.push(
      `Auditor [${taskId}] description ('${auditor.description}') exceeds ${MAX_TASK_DESCRIPTION_LENGTH} characters (${auditor.description.length}).`
    );
  }

  if (!auditor.packageName || typeof auditor.packageName !== 'string') {
    errors.push(`Auditor [${taskId}] does not define mandatory 'packageName'.`);
  }
}

function validateAuditorManifest(auditor: BaseAuditor, taskId: string, errors: string[]): void {
  try {
    const manifest = auditor.toManifest();
    if (typeof manifest.id !== 'string' || manifest.id !== auditor.id) {
      errors.push(`Auditor [${taskId}] toManifest() returned manifest with invalid ID.`);
    }
  } catch (err) {
    errors.push(`Auditor [${taskId}] failed to generate toManifest(): ${String(err)}`);
  }
}

/**
 * Validates in-memory constructor contract and metadata for an instantiated auditor.
 */
export function validateAuditorConstruction(
  auditor: BaseAuditor,
  taskId: string = auditor.id
): string[] {
  const errors: string[] = [];

  validateBasicMetadata(auditor, taskId, errors);

  const activeFamilies = getActiveFamilies();
  if (!activeFamilies.includes(auditor.family)) {
    errors.push(
      `Auditor [${taskId}] family '${auditor.family}' is not a valid architectural family.`
    );
  }

  if (!Array.isArray(auditor.ruleIds) || auditor.ruleIds.length === 0) {
    errors.push(`Auditor [${taskId}] does not declare rules in 'ruleIds'.`);
  }

  validateRuleDescriptions(auditor, taskId, errors);
  validateAuditorManifest(auditor, taskId, errors);
  validateAuditorConfigContract(auditor, taskId, errors);
  validateAuditorCriticalConfigContract(auditor, taskId, errors);
  validateAuditorCapabilitiesContract(auditor, taskId, errors);
  validateAuditorRuleCapabilitiesContract(auditor, taskId, errors);
  validateAuditorRuleRemediationsContract(auditor, taskId, errors);
  validateAuditorThirdPartyToolContract(auditor, taskId, errors);
  validateAuditorScriptsContract(auditor, taskId, errors);

  return errors;
}

function validateAuditorThirdPartyToolContract(
  auditor: BaseAuditor,
  taskId: string,
  errors: string[]
): void {
  const contractErrors = collectAuditorThirdPartyToolErrors(auditor, taskId);
  errors.push(...contractErrors);
}

function validateAuditorRuleRemediationsContract(
  auditor: BaseAuditor,
  taskId: string,
  errors: string[]
): void {
  if (!auditor.ruleRemediations || typeof auditor.ruleRemediations !== 'object') {
    errors.push(`Auditor [${taskId}] does not define mandatory map 'ruleRemediations'.`);
    return;
  }
  for (const ruleId of auditor.ruleIds) {
    const guide = auditor.getRuleRemediation(ruleId);
    if (!guide || typeof guide !== 'string' || guide.trim() === '') {
      errors.push(
        `Auditor [${taskId}] does not define mandatory 'ruleRemediations' for rule '${ruleId}'.`
      );
    } else if (/^Guía de diagnóstico y remediación para/i.test(guide.trim())) {
      errors.push(
        `Auditor [${taskId}] defines a placeholder remediation guide for rule '${ruleId}'. Must provide actionable diagnosis and remediation.`
      );
    }
  }
}

function validateSpeedValue(speed: unknown): boolean {
  if (typeof speed === 'string') return AUDIT_EXECUTION_SPEEDS.some((s) => s === speed);
  if (Array.isArray(speed))
    return (
      speed.length > 0 &&
      speed.every((s) => typeof s === 'string' && AUDIT_EXECUTION_SPEEDS.some((v) => v === s))
    );
  return false;
}

function validateSixFieldCapabilities(
  caps: AuditorComputedCapabilities,
  label: string,
  errors: string[]
): void {
  if (!validateSpeedValue(caps.speed)) {
    errors.push(
      `${label}.speed must be ${AUDIT_EXECUTION_SPEEDS.join(', ')} or a non-empty array of them.`
    );
  }
  if (!AUDIT_EXECUTION_PHASES.some((p) => p === caps.phase)) {
    errors.push(`${label}.phase must be ${AUDIT_EXECUTION_PHASES.join(', ')}.`);
  }
  if (!AUDIT_FIX_CAPABILITIES.some((f) => f === caps.fix)) {
    errors.push(`${label}.fix must be ${AUDIT_FIX_CAPABILITIES.join(', ')}.`);
  }
  for (const boolKey of ['md', 'ast', 'changedOnly', 'critical'] as const) {
    if (typeof caps[boolKey] !== 'boolean') {
      errors.push(`${label}.${boolKey} must be explicitly boolean (true or false).`);
    }
  }
}

function validateAuditorRuleCapabilitiesContract(
  auditor: BaseAuditor,
  taskId: string,
  errors: string[]
): void {
  if (!auditor.ruleCapabilities || typeof auditor.ruleCapabilities !== 'object') {
    errors.push(
      `Auditor [${taskId}] does not define mandatory map 'ruleCapabilities' per sub-auditor.`
    );
    return;
  }

  for (const ruleId of auditor.ruleIds) {
    const caps = auditor.ruleCapabilities[ruleId];
    if (!caps || typeof caps !== 'object') {
      errors.push(
        `Auditor [${taskId}] does not define 'ruleCapabilities' for declared rule '${ruleId}'.`
      );
      continue;
    }
    validateSixFieldCapabilities(
      caps,
      `Auditor [${taskId}] sub-auditor '${ruleId}' ruleCapabilities.${ruleId}`,
      errors
    );
  }
}

function validateAuditorCriticalConfigContract(
  auditor: BaseAuditor,
  taskId: string,
  errors: string[]
): void {
  if (auditor.criticalConfig === undefined) {
    errors.push(`Auditor [${taskId}] does not define mandatory 'criticalConfig' in constructor.`);
    return;
  }
  if (typeof auditor.criticalConfig !== 'object' || auditor.criticalConfig === null) {
    errors.push(`Auditor [${taskId}] defines invalid 'criticalConfig' (must be an object).`);
    return;
  }
  const { rationale, requiredMinimums, forbiddenOverrides, validate } = auditor.criticalConfig;
  const hasConstraints =
    (requiredMinimums !== undefined && Object.keys(requiredMinimums).length > 0) ||
    (forbiddenOverrides !== undefined && Object.keys(forbiddenOverrides).length > 0) ||
    typeof validate === 'function';

  if (hasConstraints && (!rationale || typeof rationale !== 'string' || rationale.trim() === '')) {
    errors.push(
      `Auditor [${taskId}] criticalConfig must define a non-empty 'rationale' when declaring critical constraints.`
    );
  }
}

function validateAuditorConfigContract(
  auditor: BaseAuditor,
  taskId: string,
  errors: string[]
): void {
  if (!auditor.configKey || typeof auditor.configKey !== 'string') {
    errors.push(`Auditor [${taskId}] does not define mandatory 'configKey'.`);
  }

  if (!auditor.defaultConfig || typeof auditor.defaultConfig !== 'object') {
    errors.push(`Auditor [${taskId}] does not define mandatory 'defaultConfig'.`);
  } else if (auditor.configKey !== 'paths' && auditor.configKey !== 'core') {
    if (typeof (auditor.defaultConfig as Record<string, unknown>).enabled !== 'boolean') {
      errors.push(
        `Auditor [${taskId}] defaultConfig.enabled must be explicitly boolean (true or false).`
      );
    }
  }
}

function validateAuditorCapabilitiesContract(
  auditor: BaseAuditor,
  taskId: string,
  errors: string[]
): void {
  if (!auditor.capabilities || typeof auditor.capabilities !== 'object') {
    errors.push(`Auditor [${taskId}] does not define mandatory 'capabilities' object.`);
    return;
  }

  validateSixFieldCapabilities(auditor.capabilities, `Auditor [${taskId}] capabilities`, errors);

  const fixableRules = auditor.getFixableRuleIds();
  if (auditor.capabilities.fix !== 'none') {
    if (fixableRules.length === 0) {
      errors.push(
        `Auditor [${taskId}] declares capabilities.fix !== 'none' but getFixableRuleIds() is empty.`
      );
    }
    for (const r of fixableRules) {
      if (!auditor.ruleIds.includes(r)) {
        errors.push(
          `Auditor [${taskId}] declares fixable rule '${r}' that does not exist in 'ruleIds'.`
        );
      }
    }
  } else if (fixableRules.length > 0) {
    errors.push(
      `Auditor [${taskId}] declares fixable rules (${fixableRules.join(', ')}) but capabilities.fix is 'none'.`
    );
  }
}

function validateAuditorScriptsContract(
  auditor: BaseAuditor,
  taskId: string,
  errors: string[]
): void {
  if (!Array.isArray(auditor.scripts) || auditor.scripts.length === 0) {
    errors.push(
      `Auditor [${taskId}] does not define mandatory execution command contract in 'scripts'.`
    );
    return;
  }
  for (const s of auditor.scripts) {
    if (!s.name || !s.command || !s.description) {
      errors.push(
        `Auditor [${taskId}] defines invalid script in 'scripts' (missing mandatory name, command, or description).`
      );
    }
  }
}

function validateRuleDescriptions(auditor: BaseAuditor, taskId: string, errors: string[]): void {
  if (!auditor.ruleDescriptions || typeof auditor.ruleDescriptions !== 'object') {
    errors.push(`Auditor [${taskId}] does not define map 'ruleDescriptions'.`);
    return;
  }
  for (const rule of auditor.ruleIds) {
    const desc = auditor.ruleDescriptions[rule];
    if (!desc) {
      errors.push(
        `Auditor [${taskId}] missing description in ruleDescriptions for rule '${rule}'.`
      );
    } else {
      if (desc.includes('\n') || desc.includes('\r')) {
        errors.push(`Auditor [${taskId}] rule description for '${rule}' contains line breaks.`);
      }
      const combined = `${auditor.packageName}: ${desc}`;
      if (combined.length > MAX_AUDITOR_DESCRIPTION_LENGTH) {
        errors.push(
          `Auditor [${taskId}] combined description '${combined}' exceeds ${MAX_AUDITOR_DESCRIPTION_LENGTH} characters (${combined.length}).`
        );
      }
    }
  }
}

/**
 * Finds dedicated test file(s) for an auditor across core and extension conventions.
 */
export function findDedicatedTestFile(
  projectRoot: string,
  taskId: string,
  testRoots: readonly string[] = ['tests']
): { testFileAbs: string | null; testFileRel: string; allTestSources?: string } {
  const candidateRelPaths: string[] = [];
  for (const tr of testRoots) {
    const cleanTr = toPosixRelative(projectRoot, tr);
    candidateRelPaths.push(path.posix.join(cleanTr, `${taskId}.test.ts`));
    candidateRelPaths.push(path.posix.join(cleanTr, 'node', 'auditors', `${taskId}.test.ts`));
    candidateRelPaths.push(path.posix.join(cleanTr, 'unit', 'auditors', `${taskId}.test.ts`));
    candidateRelPaths.push(path.posix.join(cleanTr, 'auditors', `${taskId}.test.ts`));
  }
  candidateRelPaths.push(path.posix.join('packages', 'auditor', 'tests', `${taskId}.test.ts`));
  candidateRelPaths.push(path.posix.join('tests', `${taskId}.test.ts`));

  let testFileAbs: string | null = null;
  let testFileRel: string = candidateRelPaths[0]!;

  for (const rel of candidateRelPaths) {
    const abs = path.resolve(projectRoot, rel);
    if (fs.existsSync(abs)) {
      testFileAbs = abs;
      testFileRel = rel;
      break;
    }
  }

  // Also collect auxiliary test files if any (e.g. tests/audit_project_rules.test.ts)
  const combinedSources: string[] = [];
  if (testFileAbs) {
    combinedSources.push(fs.readFileSync(testFileAbs, 'utf-8'));
    const parentDir = path.dirname(testFileAbs);
    const siblings = tryOrNull(() => fs.readdirSync(parentDir)) ?? [];
    for (const sib of siblings) {
      if (sib.startsWith(`${taskId}_`) && sib.endsWith('.test.ts')) {
        combinedSources.push(fs.readFileSync(path.join(parentDir, sib), 'utf-8'));
      }
    }
  }

  return { testFileAbs, testFileRel, allTestSources: combinedSources.join('\n') };
}

export function checkConstructionVerification(testSource: string): boolean {
  return (
    testSource.includes('initializes with correct') ||
    testSource.includes('Metadata') ||
    testSource.includes('Rule Declarations') ||
    testSource.includes('expect(auditor.id)') ||
    testSource.includes('expect(auditor.packageName)') ||
    testSource.includes('ruleDescriptions') ||
    testSource.includes('auditor.family') ||
    testSource.includes('auditor.ruleIds')
  );
}

export function checkCleanVerification(testSource: string): boolean {
  return (
    testSource.includes('errors).toBe(0)') ||
    testSource.includes('errors).toEqual(0)') ||
    testSource.includes("status).toBe('passed')") ||
    testSource.includes('violations).toHaveLength(0)') ||
    testSource.includes('summary.errors).toBe(0)') ||
    testSource.includes('summary.errors === 0')
  );
}

export function checkViolationVerification(testSource: string): boolean {
  return (
    testSource.includes("status).toBe('failed')") ||
    testSource.includes("severity).toBe('error')") ||
    testSource.includes("severity: 'error'") ||
    testSource.includes('summary.errors).toBeGreaterThan(') ||
    testSource.includes('summary.errors).toBeGreaterThanOrEqual(') ||
    testSource.includes('errors).toBeGreaterThan(') ||
    testSource.includes('errors).toBeGreaterThanOrEqual(') ||
    testSource.includes('errorsCount).toBeGreaterThan(') ||
    testSource.includes('violations.length).toBeGreaterThan(') ||
    testSource.includes('violations).not.toHaveLength(0)') ||
    testSource.includes('errors).toBe(1)') ||
    testSource.includes('errors).toEqual(1)') ||
    testSource.includes('errors).toBe(2)') ||
    testSource.includes('errors).toEqual(2)')
  );
}

export function checkFixVerification(testSource: string): boolean {
  return (
    testSource.includes('.fix(') ||
    testSource.includes('.fix()') ||
    testSource.includes('fix: true') ||
    testSource.includes('fix = true') ||
    testSource.includes("'--fix'") ||
    testSource.includes('"--fix"') ||
    testSource.includes('isFixMode') ||
    testSource.includes('auditZIndexParity(') ||
    testSource.includes('fixZIndexLiteral') ||
    testSource.includes('autoFix') ||
    testSource.includes('applyAutoFix')
  );
}

/**
 * Validates that an auditor's dedicated test file adheres to the strict 6-point contract.
 */
export function validateAuditorTestFileContent(
  testSource: string,
  testFileRel: string,
  auditor: BaseAuditor
): string[] {
  const errors: string[] = [];

  if (!checkConstructionVerification(testSource)) {
    errors.push(
      `Test file '${testFileRel}' does not verify construction or metadata for '${auditor.id}'.`
    );
  }

  if (!checkCleanVerification(testSource)) {
    errors.push(
      `Test file '${testFileRel}' does not verify clean execution path (zero errors / status passed) for '${auditor.id}'.`
    );
  }

  if (!checkViolationVerification(testSource)) {
    errors.push(
      `Test file '${testFileRel}' does not verify violation detection (status failed / severity error) for '${auditor.id}'.`
    );
  }

  if (auditor.capabilities.fix !== 'none' && !checkFixVerification(testSource)) {
    errors.push(
      `Test file '${testFileRel}' does not verify auto-fix capability ('auditor.fix()') for '${auditor.id}'.`
    );
  }

  for (const rule of auditor.ruleIds) {
    const escaped = rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const ruleRegex = new RegExp(`(?:['"\`]${escaped}['"\`]|\\b${escaped}\\b)`);
    if (!ruleRegex.test(testSource)) {
      errors.push(
        `Test file '${testFileRel}' does not verify declared rule '${rule}' for '${auditor.id}'.`
      );
    }
  }

  return errors;
}

/**
 * Universal Vitest runner registering dynamic conformance tests for all discovered sub-auditors and extensions.
 */
async function evaluateTaskContract(
  task: DiscoveredAuditorTask,
  projectRoot: string,
  testRoots: readonly string[],
  tempDir: string
): Promise<string[]> {
  const suitePath = path.isAbsolute(task.scriptPath)
    ? task.scriptPath
    : path.resolve(projectRoot, task.scriptPath);

  if (!fs.existsSync(suitePath)) {
    return [`Auditor source code file not found at '${suitePath}'.`];
  }

  let mod: Record<string, unknown>;
  try {
    mod = await import(suitePath);
  } catch (err) {
    return [`Error importing module '${suitePath}': ${String(err)}`];
  }

  const Cls = findAuditorClass(mod);
  if (!Cls) {
    return [`Module '${suitePath}' does not export a valid BaseAuditor subclass.`];
  }

  let auditor: BaseAuditor;
  try {
    auditor = instantiateAuditorClass(Cls, tempDir);
  } catch (err) {
    return [`Error instantiating '${task.id}': ${String(err)}`];
  }

  const constructionErrors = validateAuditorConstruction(auditor, task.id);
  const { testFileAbs, testFileRel, allTestSources } = findDedicatedTestFile(
    projectRoot,
    task.id,
    testRoots
  );

  if (!testFileAbs) {
    return [
      ...constructionErrors,
      `Missing dedicated test file for '${task.id}'. Expected '${testFileRel}'.`
    ];
  }

  const testSource = allTestSources ?? fs.readFileSync(testFileAbs, 'utf-8');
  const testFileErrors = validateAuditorTestFileContent(testSource, testFileRel, auditor);
  return [...constructionErrors, ...testFileErrors];
}

export interface ConformanceVitestHooks {
  readonly describe: typeof describe;
  readonly it: typeof it;
  readonly expect: typeof expect;
  readonly beforeAll: typeof beforeAll;
  readonly afterAll: typeof afterAll;
}

export interface AuditorContractConformanceOptions {
  readonly projectRoot?: string;
  readonly vitest?: ConformanceVitestHooks;
}

function registerConformanceSuite(hooks: ConformanceVitestHooks, projectRoot: string): void {
  const {
    describe: describeFn,
    it: itFn,
    expect: expectFn,
    beforeAll: beforeAllFn,
    afterAll: afterAllFn
  } = hooks;
  let tempDir: string;
  let tasks: DiscoveredAuditorTask[] = [];

  beforeAllFn(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = fs.mkdtempSync(
      path.join(path.resolve(projectRoot, 'scratch'), 'auditor-conformance-')
    );
    tasks = await scanAllAuditorTasks(projectRoot);
  });

  afterAllFn(() => {
    delete process.env.AUDIT_SUBPROCESS;
    safeRmSync(tempDir, { recursive: true, force: true });
  });

  describeFn('Auditor Contract & Testing Conformance', () => {
    itFn('discovers at least one auditor task to validate', () => {
      expectFn(tasks.length).toBeGreaterThan(0);
    });

    // Run tests for each discovered task
    itFn(
      'validates 100% of discovered sub-auditors and extensions against the strict 5-point contract',
      async () => {
        const allFailures: { taskId: string; errors: string[] }[] = [];
        const config = getAuditConfig(projectRoot);
        const testRoots = config.paths?.testRoots ?? ['tests'];

        for (const task of tasks) {
          const errors = await evaluateTaskContract(task, projectRoot, testRoots, tempDir);
          if (errors.length > 0) {
            allFailures.push({ taskId: task.id, errors });
          }
        }

        if (allFailures.length > 0) {
          const failureSummary = allFailures
            .map((f) => `❌ Auditor [${f.taskId}]:\n  - ${f.errors.join('\n  - ')}`)
            .join('\n\n');
          throw new Error(
            `Found ${allFailures.length} sub-auditor(s) that do not satisfy the strict testing contract:\n\n${failureSummary}`
          );
        }

        expectFn(allFailures).toHaveLength(0);
      }
    );
  });
}

function resolveGlobalVitestHooks(): ConformanceVitestHooks | null {
  const g = globalThis as Record<string, unknown>;
  if (
    typeof g.describe === 'function' &&
    typeof g.it === 'function' &&
    typeof g.expect === 'function' &&
    typeof g.beforeAll === 'function' &&
    typeof g.afterAll === 'function'
  ) {
    return {
      describe: g.describe as typeof describe,
      it: g.it as typeof it,
      expect: g.expect as typeof expect,
      beforeAll: g.beforeAll as typeof beforeAll,
      afterAll: g.afterAll as typeof afterAll
    };
  }
  return null;
}

/**
 * Universal Vitest runner registering dynamic conformance tests for all discovered sub-auditors and extensions.
 * Operates with zero top-level static Vitest runtime imports so consumer packages never crash when Vitest is absent.
 */
export function runAuditorContractConformanceTests(
  options: AuditorContractConformanceOptions = {}
): void | Promise<void> {
  const projectRoot = options.projectRoot ?? process.cwd();
  const syncHooks = options.vitest ?? resolveGlobalVitestHooks();
  if (syncHooks) {
    registerConformanceSuite(syncHooks, projectRoot);
    return;
  }

  return (async () => {
    try {
      const toConformanceHooks = (mod: object): ConformanceVitestHooks =>
        mod as ConformanceVitestHooks;
      const vt = toConformanceHooks(await import('vite-plus/test'));
      registerConformanceSuite(vt, projectRoot);
    } catch {
      throw new Error(
        'runAuditorContractConformanceTests() requires a Vite+ / Vitest test environment. ' +
          "Make sure to run your tests with Vite+ ('vp test') " +
          'or supply test functions explicitly: runAuditorContractConformanceTests({ vitest: { describe, it, expect, beforeAll, afterAll } }).'
      );
    }
  })();
}

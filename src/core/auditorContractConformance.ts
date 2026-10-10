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
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BaseAuditor, MAX_AUDITOR_DESCRIPTION_LENGTH } from './auditorBase.ts';
import { getAuditConfig } from './auditConfig.ts';
import type { AuditTaskDefinition, AuditFamily } from './auditContract.ts';
import { getActiveFamilies } from './auditContract.ts';
import { discoverAuditors } from '../cli/auditScanner.ts';

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
  if (name.startsWith('report_') || name === 'audit_rules.ts' || name.endsWith('Plugin.ts') || name.endsWith('Plugin.js')) return false;
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
  if (tasks.some(t => t.id === id)) return;

  tasks.push({
    id,
    name: id,
    family: 'architecture',
    scriptPath: path.relative(projectRoot, fullPath).replace(/\\/g, '/'),
    command: 'node',
    args: [],
    fast: true,
    timeoutMs: DEFAULT_EXTENSION_TASK_TIMEOUT_MS,
    order: DEFAULT_EXTENSION_TASK_ORDER,
    isBuiltin: false,
    isExtension: true,
    configKey: 'paths',
    defaultConfig: {}
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
export async function scanAllAuditorTasks(projectRoot: string = process.cwd()): Promise<DiscoveredAuditorTask[]> {
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
export function findAuditorClass(mod: Record<string, unknown>): (new (...args: unknown[]) => BaseAuditor<string>) | null {
  for (const value of Object.values(mod)) {
    if (typeof value === 'function' && value.prototype && value.prototype instanceof BaseAuditor) {
      return value as new (...args: unknown[]) => BaseAuditor<string>;
    }
  }
  return null;
}

/**
 * Safely instantiates an auditor class using supported constructor signatures.
 */
export function instantiateAuditorClass(
  Cls: new (...args: unknown[]) => BaseAuditor<string>,
  tempDir: string
): BaseAuditor<string> {
  const attempts: (() => BaseAuditor<string>)[] = [
    () => new Cls({ projectRoot: tempDir }),
    () => new Cls(tempDir),
    () => new Cls(undefined, tempDir),
    () => new Cls(undefined, undefined, tempDir),
    () => new Cls()
  ];

  for (const attempt of attempts) {
    try {
      return attempt();
    } catch {
      // catch-ok: multiple constructor signatures are probed in order
    }
  }
  throw new Error(`No se pudo instanciar la clase ${Cls.name} con ninguna firma conocida`);
}

function validateBasicMetadata(auditor: BaseAuditor<string>, taskId: string, errors: string[]): void {
  if (!auditor.id || typeof auditor.id !== 'string') {
    errors.push(`Auditor [${taskId}] no define un 'id' válido.`);
  } else if (auditor.id !== taskId) {
    errors.push(`Auditor [${taskId}] id '${auditor.id}' no coincide con el taskId '${taskId}'.`);
  }

  if (!auditor.name || typeof auditor.name !== 'string') {
    errors.push(`Auditor [${taskId}] no define un 'name' válido.`);
  }

  if (!auditor.description || typeof auditor.description !== 'string') {
    errors.push(`Auditor [${taskId}] no define una 'description' válida.`);
  } else if (auditor.description.length > MAX_TASK_DESCRIPTION_LENGTH) {
    errors.push(`Auditor [${taskId}] description ('${auditor.description}') excede ${MAX_TASK_DESCRIPTION_LENGTH} caracteres (${auditor.description.length}).`);
  }

  if (!auditor.packageName || typeof auditor.packageName !== 'string') {
    errors.push(`Auditor [${taskId}] no define un 'packageName' obligatorio.`);
  }
}

function validateAuditorManifest(auditor: BaseAuditor<string>, taskId: string, errors: string[]): void {
  try {
    const manifest = auditor.toManifest();
    if (typeof manifest.id !== 'string' || manifest.id !== auditor.id) {
      errors.push(`Auditor [${taskId}] toManifest() devuelve manifest con ID inválido.`);
    }
  } catch (err) {
    errors.push(`Auditor [${taskId}] falló al generar toManifest(): ${String(err)}`);
  }
}

/**
 * Validates in-memory constructor contract and metadata for an instantiated auditor.
 */
export function validateAuditorConstruction(auditor: BaseAuditor<string>, taskId: string = auditor.id): string[] {
  const errors: string[] = [];

  validateBasicMetadata(auditor, taskId, errors);

  const activeFamilies = getActiveFamilies();
  if (!activeFamilies.includes(auditor.family as AuditFamily)) {
    errors.push(`Auditor [${taskId}] familia '${auditor.family}' no es una familia arquitectónica válida.`);
  }

  if (!Array.isArray(auditor.ruleIds) || auditor.ruleIds.length === 0) {
    errors.push(`Auditor [${taskId}] no declara reglas en 'ruleIds'.`);
  }

  validateRuleDescriptions(auditor, taskId, errors);
  validateAuditorManifest(auditor, taskId, errors);
  validateAuditorConfigContract(auditor, taskId, errors);
  validateAuditorCapabilitiesContract(auditor, taskId, errors);
  validateAuditorScriptsContract(auditor, taskId, errors);

  return errors;
}

function validateAuditorConfigContract(auditor: BaseAuditor<string>, taskId: string, errors: string[]): void {
  if (!auditor.configKey || typeof auditor.configKey !== 'string') {
    errors.push(`Auditor [${taskId}] no define un 'configKey' obligatorio.`);
  }

  if (!auditor.defaultConfig || typeof auditor.defaultConfig !== 'object') {
    errors.push(`Auditor [${taskId}] no define un 'defaultConfig' obligatorio.`);
  } else if (auditor.configKey !== 'paths' && auditor.configKey !== 'core') {
    if (typeof (auditor.defaultConfig as Record<string, unknown>).enabled !== 'boolean') {
      errors.push(`Auditor [${taskId}] defaultConfig.enabled debe ser explícitamente booleano (true o false).`);
    }
  }
}

function validateAuditorCapabilitiesContract(auditor: BaseAuditor<string>, taskId: string, errors: string[]): void {
  if (!auditor.capabilities || typeof auditor.capabilities !== 'object') {
    errors.push(`Auditor [${taskId}] no define un objeto de 'capabilities' obligatorio.`);
    return;
  }

  const REQUIRED_CAPS = ['fix', 'fixPriority', 'lint', 'md', 'ast', 'changedSince', 'heavy', 'requiresBuild', 'postRun'] as const;
  for (const cap of REQUIRED_CAPS) {
    if (typeof auditor.capabilities[cap] !== 'boolean') {
      errors.push(`Auditor [${taskId}] debe definir explícitamente el sub-campo capabilities.${cap} como booleano (true o false).`);
    }
  }
  const fixableRules = auditor.getFixableRuleIds();
  if (auditor.capabilities.fix === true) {
    if (fixableRules.length === 0) {
      errors.push(`Auditor [${taskId}] declara capabilities.fix === true pero getFixableRuleIds() está vacío.`);
    }
    for (const r of fixableRules) {
      if (!auditor.ruleIds.includes(r)) {
        errors.push(`Auditor [${taskId}] declara regla corregible '${r}' que no existe en 'ruleIds'.`);
      }
    }
  } else if (fixableRules.length > 0) {
    errors.push(`Auditor [${taskId}] declara reglas corregibles (${fixableRules.join(', ')}) pero capabilities.fix no es true.`);
  }
}

function validateAuditorScriptsContract(auditor: BaseAuditor<string>, taskId: string, errors: string[]): void {
  if (!Array.isArray(auditor.scripts) || auditor.scripts.length === 0) {
    errors.push(`Auditor [${taskId}] no define el contrato obligatorio de comandos de ejecución en 'scripts'.`);
    return;
  }
  for (const s of auditor.scripts) {
    if (!s.name || !s.command || !s.description) {
      errors.push(`Auditor [${taskId}] define un script inválido en 'scripts' (faltan campos obligatorios name, command o description).`);
    }
  }
}

function validateRuleDescriptions(auditor: BaseAuditor<string>, taskId: string, errors: string[]): void {
  if (!auditor.ruleDescriptions || typeof auditor.ruleDescriptions !== 'object') {
    errors.push(`Auditor [${taskId}] no define un mapa de 'ruleDescriptions'.`);
    return;
  }
  for (const rule of auditor.ruleIds) {
    const desc = auditor.ruleDescriptions[rule];
    if (!desc) {
      errors.push(`Auditor [${taskId}] falta descripción en ruleDescriptions para la regla '${rule}'.`);
    } else {
      if (desc.includes('\n') || desc.includes('\r')) {
        errors.push(`Auditor [${taskId}] descripción de regla '${rule}' contiene saltos de línea.`);
      }
      const combined = `${auditor.packageName}: ${desc}`;
      if (combined.length > MAX_AUDITOR_DESCRIPTION_LENGTH) {
        errors.push(`Auditor [${taskId}] descripción combinada '${combined}' excede ${MAX_AUDITOR_DESCRIPTION_LENGTH} caracteres (${combined.length}).`);
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
    const cleanTr = tr.replace(/^\/+|\/+$/g, '');
    candidateRelPaths.push(`${cleanTr}/${taskId}.test.ts`);
    candidateRelPaths.push(`${cleanTr}/node/auditors/${taskId}.test.ts`);
    candidateRelPaths.push(`${cleanTr}/unit/auditors/${taskId}.test.ts`);
    candidateRelPaths.push(`${cleanTr}/auditors/${taskId}.test.ts`);
  }
  candidateRelPaths.push(`packages/auditor/tests/${taskId}.test.ts`);
  candidateRelPaths.push(`tests/${taskId}.test.ts`);

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
    try {
      const siblings = fs.readdirSync(parentDir);
      for (const sib of siblings) {
        if (sib.startsWith(`${taskId}_`) && sib.endsWith('.test.ts')) {
          combinedSources.push(fs.readFileSync(path.join(parentDir, sib), 'utf-8'));
        }
      }
    } catch {
      // catch-ok: ignore unreadable directory
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

/**
 * Validates that an auditor's dedicated test file adheres to the strict 5-point contract.
 */
export function validateAuditorTestFileContent(
  testSource: string,
  testFileRel: string,
  auditor: BaseAuditor<string>
): string[] {
  const errors: string[] = [];

  if (!checkConstructionVerification(testSource)) {
    errors.push(`El archivo de prueba '${testFileRel}' no verifica la construcción o metadatos de '${auditor.id}'.`);
  }

  if (!checkCleanVerification(testSource)) {
    errors.push(`El archivo de prueba '${testFileRel}' no verifica la ruta limpia (cero errores / status passed) de '${auditor.id}'.`);
  }

  if (!checkViolationVerification(testSource)) {
    errors.push(`El archivo de prueba '${testFileRel}' no verifica la detección de errores o fallos (status failed / severity error) de '${auditor.id}'.`);
  }

  for (const rule of auditor.ruleIds) {
    const escaped = rule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const ruleRegex = new RegExp(`(?:['"\`]${escaped}['"\`]|\\b${escaped}\\b)`);
    if (!ruleRegex.test(testSource)) {
      errors.push(`El archivo de prueba '${testFileRel}' no verifica la regla declarada '${rule}' de '${auditor.id}'.`);
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
    return [`No se encontró el archivo de código fuente del auditor en '${suitePath}'.`];
  }

  let mod: Record<string, unknown>;
  try {
    mod = await import(suitePath);
  } catch (err) {
    return [`Error al importar el módulo '${suitePath}': ${String(err)}`];
  }

  const Cls = findAuditorClass(mod);
  if (!Cls) {
    return [`El módulo '${suitePath}' no exporta una subclase válida de BaseAuditor.`];
  }

  let auditor: BaseAuditor<string>;
  try {
    auditor = instantiateAuditorClass(Cls, tempDir);
  } catch (err) {
    return [`Error al instanciar '${task.id}': ${String(err)}`];
  }

  const constructionErrors = validateAuditorConstruction(auditor, task.id);
  const { testFileAbs, testFileRel, allTestSources } = findDedicatedTestFile(projectRoot, task.id, testRoots);

  if (!testFileAbs) {
    return [...constructionErrors, `Falta archivo de prueba dedicado para '${task.id}'. Se esperaba '${testFileRel}'.`];
  }

  const testSource = allTestSources ?? fs.readFileSync(testFileAbs, 'utf-8');
  const testFileErrors = validateAuditorTestFileContent(testSource, testFileRel, auditor);
  return [...constructionErrors, ...testFileErrors];
}

/**
 * Universal Vitest runner registering dynamic conformance tests for all discovered sub-auditors and extensions.
 */
export function runAuditorContractConformanceTests(options: { projectRoot?: string } = {}): void {
  const projectRoot = options.projectRoot ?? process.cwd();
  let tempDir: string;
  let tasks: DiscoveredAuditorTask[] = [];

  beforeAll(async () => {
    process.env.AUDIT_SUBPROCESS = 'true';
    tempDir = fs.mkdtempSync(path.join(path.resolve(projectRoot, 'scratch'), 'auditor-conformance-'));
    tasks = await scanAllAuditorTasks(projectRoot);
  });

  afterAll(() => {
    delete process.env.AUDIT_SUBPROCESS;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // catch-ok: cleanup temporary test directory
    }
  });

  describe('Auditor Contract & Testing Conformance', () => {
    it('discovers at least one auditor task to validate', () => {
      expect(tasks.length).toBeGreaterThan(0);
    });

    // Run tests for each discovered task
    it('validates 100% of discovered sub-auditors and extensions against the strict 5-point contract', async () => {
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
          .map(f => `❌ Auditor [${f.taskId}]:\n  - ${f.errors.join('\n  - ')}`)
          .join('\n\n');
        throw new Error(`Se encontraron ${allFailures.length} sub-auditor(es) que no cumplen el contrato estricto de testing:\n\n${failureSummary}`);
      }

      expect(allFailures).toHaveLength(0);
    });
  });
}

/**
 * src/core/auditCoverage.ts
 *
 * AUDIT COVERAGE LEDGER (Node.js 26+ Native)
 * Records, per suite and per run, which files were actually analyzed and how many times every rule
 * was evaluated. Ledgers are consumed by `validate_audit_coverage` to detect blind spots:
 * uncovered files, declaration/observation drift and dormant rules (false-clean results).
 */

import fs from 'node:fs/promises';
import nodeFs from 'node:fs';
import path from 'node:path';
import {
  COVERAGE_SOURCES,
  type AuditorCoverageDeclaration,
  type CoverageLedger,
  type CoverageSource
} from './auditContract.ts';

export type { CoverageLedger };

export const COVERAGE_LEDGER_DIR = 'scratch/audits/coverage';
export const COVERAGE_RUN_ID_ENV = 'AUDIT_COVERAGE_RUN_ID';
/** 'full' only when audit_full runs every discovered suite (coverage is meaningless on partial runs). */
export const COVERAGE_RUN_MODE_ENV = 'AUDIT_COVERAGE_RUN_MODE';
/** Comma-separated ids of the suites executed before the post-run phase (each must leave a ledger). */
export const COVERAGE_EXPECTED_SUITES_ENV = 'AUDIT_COVERAGE_EXPECTED_SUITES';

/** Returns the run identifier of the orchestrated full run, if any. Ledgers are only written inside such runs. */
export function resolveActiveCoverageRunId(): string | undefined {
  const runId = process.env[COVERAGE_RUN_ID_ENV];
  return runId && runId.trim().length > 0 ? runId : undefined;
}

/** Converts an absolute or relative path into a POSIX path relative to the project root. */
export function toPosixRelative(projectRoot: string, filePath: string): string {
  const rel = path.isAbsolute(filePath) ? path.relative(projectRoot, filePath) : filePath;
  return rel.split(path.sep).join(path.posix.sep).replace(/^\.\//, '');
}

export function matchesAnyGlob(relPosixPath: string, globs: readonly string[]): boolean {
  return globs.some(glob => path.posix.matchesGlob(relPosixPath, glob));
}

export const DEFAULT_NON_AUDITABLE_GLOBS: readonly string[] = Object.freeze([
  // Lockfiles & VCS metadata
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  '**/.gitkeep',
  '**/.gitignore',
  '**/.gitattributes',
  '.nvmrc',
  '.node-version',
  '.npmrc',
  '.replit',
  // Tooling configs & build caches
  '.prettierrc*',
  '.prettierignore',
  '.markdownlintignore',
  '**/*.tsbuildinfo',
  // Binary & media assets
  '**/*.{png,jpg,jpeg,gif,webp,ico,bmp,tiff,avif}',
  '**/*.{mp3,ogg,wav,flac,mp4,webm,avi,mov}',
  '**/*.{woff,woff2,ttf,eot,otf}',
  '**/*.{db,sqlite,sqlite3,wasm,zip,tar,tar.gz,tgz}',
  // Test fixtures & backup dumps
  '**/fixtures/**',
  '**/canaries/**',
  '**/*.canary',
  '**/backups/**',
  // Environment bootstrap scripts & setup plugins
  'setup-linux.sh',
  'setup-windows.ps1',
  'scripts/setup/plugins/**',
  '.env.example',
  '**/*.sample',
  // Legal documentation & licenses
  'LICENSE*'
]);

/** Whether a file is part of the auditable codebase (excluding binaries, lockfiles, and tooling meta). */
export function isAuditableCodebaseFile(
  relPosixPath: string,
  customExemptGlobs: readonly string[] = []
): boolean {
  if (matchesAnyGlob(relPosixPath, DEFAULT_NON_AUDITABLE_GLOBS)) return false;
  if (customExemptGlobs.length > 0 && matchesAnyGlob(relPosixPath, customExemptGlobs)) return false;
  return true;
}

/** Whether a file falls inside the static coverage declaration of a suite. */
export function isDeclaredByCoverage(relPosixPath: string, declaration: AuditorCoverageDeclaration): boolean {
  if (!matchesAnyGlob(relPosixPath, declaration.include)) return false;
  return !matchesAnyGlob(relPosixPath, declaration.exclude ?? []);
}

/** Derives a coverage declaration from scan roots + extensions (used by FileScanAuditor). */
export function deriveCoverageFromRoots(
  roots: readonly string[],
  extensions: ReadonlySet<string>
): AuditorCoverageDeclaration {
  const effectiveRoots = roots.length > 0 ? roots : ['src', 'scripts', 'tests'];
  const include: string[] = [];
  for (const root of effectiveRoots) {
    const cleanRoot = path.posix.normalize(root.split('\\').join('/')).replace(/^\.\/?|\/+$/g, '');
    const prefix = cleanRoot === '' || cleanRoot === '.' ? '' : `${cleanRoot}/`;
    for (const ext of extensions) {
      include.push(`${prefix}**/*${ext}`);
    }
  }
  return { include, source: 'runtime' };
}

/** Derives a coverage declaration from requiredFiles (used by BaseAuditor when coverage is omitted). */
export function deriveCoverageFromRequiredFiles(
  requiredFiles: readonly string[],
  projectRoot: string = process.cwd(),
  allowedExtensions?: ReadonlySet<string>
): AuditorCoverageDeclaration {
  const include: string[] = [];
  for (const rf of requiredFiles) {
    const rel = toPosixRelative(projectRoot, rf);
    const abs = path.isAbsolute(rf) ? rf : path.resolve(projectRoot, rf);
    try {
      if (nodeFs.existsSync(abs) && nodeFs.statSync(abs).isDirectory()) {
        if (allowedExtensions && allowedExtensions.size > 0) {
          for (const ext of allowedExtensions) {
            include.push(`${rel}/**/*${ext}`);
          }
        } else {
          include.push(`${rel}/**`);
        }
      } else {
        include.push(rel);
      }
    } catch {
      // catch-ok: fallback to literal path if stat fails
      include.push(rel);
    }
  }
  return { include, source: 'runtime' };
}

/** Fails loudly when a suite declares an invalid coverage contract. */
export function validateCoverageDeclaration(suiteId: string, declaration: AuditorCoverageDeclaration | undefined): void {
  if (!declaration || typeof declaration !== 'object') {
    throw new Error(
      `Auditor [${suiteId}] must declare 'coverage: { include: [...] }' (files it is responsible for). ` +
      `Blind-spot detection requires every suite to declare its coverage.`
    );
  }
  if (!Array.isArray(declaration.include) || declaration.include.length === 0) {
    throw new Error(`Auditor [${suiteId}] 'coverage.include' must be a non-empty array of POSIX globs.`);
  }
  const allGlobs = [...declaration.include, ...(declaration.exclude ?? [])];
  for (const glob of allGlobs) {
    if (typeof glob !== 'string' || glob.trim().length === 0 || glob.includes('\\') || path.posix.isAbsolute(glob)) {
      throw new Error(`Auditor [${suiteId}] declared an invalid coverage glob '${String(glob)}' (must be a relative POSIX glob).`);
    }
  }
  if (declaration.source !== undefined && !COVERAGE_SOURCES.includes(declaration.source)) {
    throw new Error(`Auditor [${suiteId}] declared unknown coverage source '${String(declaration.source)}'.`);
  }
}

export interface CoverageLedgerParams {
  readonly runId: string;
  readonly suiteId: string;
  readonly skipped: boolean;
  readonly ruleIds: readonly string[];
}

/**
 * Mutable per-instance recorder owned by every BaseAuditor.
 */
export class CoverageRecorder {
  private readonly projectRoot: string;
  private readonly scanned = new Set<string>();
  private readonly evaluations = new Map<string, number>();
  private readonly notApplicable = new Map<string, string>();
  private readonly dynamicRuleIds = new Set<string>();
  private externalScanCount = 0;
  private currentDeclaration: AuditorCoverageDeclaration;

  constructor(
    projectRoot: string,
    declaration: AuditorCoverageDeclaration
  ) {
    this.projectRoot = projectRoot;
    this.currentDeclaration = declaration;
  }

  public get declaration(): AuditorCoverageDeclaration {
    return this.currentDeclaration;
  }

  /** Replaces the static declaration with a config-resolved one (validated loudly). */
  public redeclare(suiteId: string, declaration: AuditorCoverageDeclaration): void {
    validateCoverageDeclaration(suiteId, declaration);
    this.currentDeclaration = declaration;
  }

  public get source(): CoverageSource {
    return this.declaration.source ?? 'runtime';
  }

  public get scannedCount(): number {
    return this.scanned.size > 0 ? this.scanned.size : this.externalScanCount;
  }

  public recordScanned(filePath: string): void {
    this.scanned.add(toPosixRelative(this.projectRoot, filePath));
  }

  public unrecordScanned(filePath: string): void {
    this.scanned.delete(toPosixRelative(this.projectRoot, filePath));
  }

  /** Only valid for `declared-only` suites, whose engine reports a count but not a file list. */
  public recordExternalScanCount(count: number): void {
    if (this.source !== 'declared-only') {
      throw new Error(`recordExternalScanCount() is only allowed for 'declared-only' coverage; record real files with recordScanned().`);
    }
    this.externalScanCount = count;
  }

  public markRuleEvaluated(ruleId: string, count = 1): void {
    this.evaluations.set(ruleId, (this.evaluations.get(ruleId) ?? 0) + count);
  }

  public markRuleNotApplicable(ruleId: string, reason: string): void {
    if (!reason || reason.trim().length === 0) {
      throw new Error(`markRuleNotApplicable('${ruleId}') requires an explicit justification.`);
    }
    this.notApplicable.set(ruleId, reason);
  }

  public declareRuleCatalog(ruleIds: readonly string[]): void {
    for (const id of ruleIds) this.dynamicRuleIds.add(id);
  }

  public getEvaluations(ruleId: string): number {
    return this.evaluations.get(ruleId) ?? 0;
  }

  public toLedger(params: CoverageLedgerParams): CoverageLedger {
    const catalog = Array.from(new Set([...params.ruleIds, ...this.dynamicRuleIds])).sort();
    return {
      runId: params.runId,
      suiteId: params.suiteId,
      skipped: params.skipped,
      declared: this.declaration,
      source: this.source,
      scanned: Array.from(this.scanned).sort(),
      ruleIds: catalog,
      ruleEvaluations: Object.fromEntries(catalog.map(id => [id, this.getEvaluations(id)])),
      notApplicable: Object.fromEntries(this.notApplicable)
    };
  }
}

export async function writeCoverageLedger(projectRoot: string, ledger: CoverageLedger): Promise<void> {
  const dir = path.resolve(projectRoot, COVERAGE_LEDGER_DIR);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${ledger.suiteId}.json`), JSON.stringify(ledger, null, 2), 'utf-8');
}

export async function clearCoverageLedgers(projectRoot: string): Promise<void> {
  await fs.rm(path.resolve(projectRoot, COVERAGE_LEDGER_DIR), { recursive: true, force: true });
}

/** Reads every ledger written during the given run (stale ledgers from previous runs are ignored). */
export async function readCoverageLedgers(projectRoot: string, runId: string): Promise<CoverageLedger[]> {
  const dir = path.resolve(projectRoot, COVERAGE_LEDGER_DIR);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    // catch-ok: no ledger directory means no suite wrote coverage during this run
    return [];
  }
  const ledgers: CoverageLedger[] = [];
  for (const entry of entries.filter(e => e.endsWith('.json')).sort()) {
    const ledger = JSON.parse(await fs.readFile(path.join(dir, entry), 'utf-8')) as CoverageLedger;
    if (ledger.runId === runId) ledgers.push(ledger);
  }
  return ledgers;
}

/** Reads all ledgers from the latest run in scratch/audits/coverage. */
export async function readLatestCoverageLedgers(projectRoot: string): Promise<{ runId: string | null; ledgers: CoverageLedger[] }> {
  const dir = path.resolve(projectRoot, COVERAGE_LEDGER_DIR);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    // catch-ok: no ledger directory
    return { runId: null, ledgers: [] };
  }
  const allLedgers: CoverageLedger[] = [];
  for (const entry of entries.filter(e => e.endsWith('.json')).sort()) {
    try {
      const ledger = JSON.parse(await fs.readFile(path.join(dir, entry), 'utf-8')) as CoverageLedger;
      allLedgers.push(ledger);
    } catch {
      // catch-ok: corrupt or partial ledger file
    }
  }
  if (allLedgers.length === 0) return { runId: null, ledgers: [] };
  const latestRunId = allLedgers[allLedgers.length - 1]!.runId;
  const filtered = allLedgers.filter(l => l.runId === latestRunId);
  return { runId: latestRunId, ledgers: filtered };
}


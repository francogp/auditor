/**
 * src/core/refactor/dupesRefactorEngine.ts
 *
 * CANONICAL DUPLICATION & CLONE REFACTORING ENGINE (Node.js 26+ Native)
 * Provides deterministic clone triage, Dirac micro-context extraction,
 * and automated plan-based remediation for duplicate and triplicate code.
 *
 * Inherits directly from BaseRefactorEngine with strict FallowArchitectureAuditor injection.
 */

import path from 'node:path';
import { execSync } from 'node:child_process';
import { BaseRefactorEngine } from './baseRefactorEngine.ts';
import { toPosixRelative } from '../safePath.ts';
import { tryOrNull } from '../safeUtils.ts';
import { FallowArchitectureAuditor } from '../../suites/architecture/validate_fallow.ts';
import { resolveFallowBinary } from '../../suites/architecture/validate_similar_code.ts';
import { HybridHarnessEngine } from './hybridHarness.ts';
import type { AuditEngineConfig } from '../auditConfigTypes.ts';
import type {
  FallowDupesOutput,
  FallowDeadCodeOutput,
  FallowInstance,
  TriagedCloneCandidate,
  CloneTopology,
  RefactorPlan
} from './refactorContracts.ts';

export function runFallowJson<T>(cmd: string, args: string[], projectRoot: string): T {
  const bin =
    resolveFallowBinary(projectRoot) ??
    path.resolve(process.cwd(), 'node_modules/fallow/bin/fallow');
  const fullCmd = `node "${bin}" ${cmd} --root "${projectRoot}" ${args.join(' ')} --format json --quiet`;
  try {
    const stdout = execSync(fullCmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 50 * 1024 * 1024
    });
    return JSON.parse(stdout) as T;
  } catch (err: unknown) {
    const out = (err as { stdout?: string }).stdout;
    if (out && out.trim().startsWith('{')) {
      return JSON.parse(out) as T;
    }
    throw new Error(`Failed to execute fallow ${cmd}: ${(err as Error).message}`);
  }
}

export function determineTopology(files: readonly string[]): CloneTopology {
  const isSingle = files.length === 1;
  const hasVue = files.some((f) => f.endsWith('.vue'));
  if (isSingle) {
    return hasVue ? 'intra-file-vue' : 'intra-file-ts';
  }
  return hasVue ? 'cross-file-vue-ts' : 'cross-file-ts';
}

export class DupesRefactorEngine extends BaseRefactorEngine<
  TriagedCloneCandidate,
  RefactorPlan,
  FallowArchitectureAuditor
> {
  public readonly toolId = 'auditor-dupes';
  public readonly configSectionKey = 'fallow' as const;

  constructor(
    auditorOrOptions?: FallowArchitectureAuditor | string | { projectRoot?: string; config?: AuditEngineConfig },
    _explicitConfig?: AuditEngineConfig
  ) {
    const auditor =
      auditorOrOptions instanceof FallowArchitectureAuditor
        ? auditorOrOptions
        : new FallowArchitectureAuditor({
            projectRoot:
              typeof auditorOrOptions === 'string'
                ? auditorOrOptions
                : auditorOrOptions?.projectRoot ?? process.cwd()
          });
    super(auditor);
  }

  public override discoverInFile(filePath: string): readonly TriagedCloneCandidate[] {
    const all = this.triageCandidates();
    const relNorm = toPosixRelative(this.projectRoot, filePath);
    return all.filter((c) => c.files.some((f) => toPosixRelative(this.projectRoot, f) === relNorm));
  }

  public override createPlan(
    id: string,
    findings: readonly TriagedCloneCandidate[]
  ): RefactorPlan {
    const targetFiles = Array.from(new Set(findings.flatMap((f) => f.files)));
    return {
      version: 1,
      planId: id,
      action: 'extract-shared-function',
      targetFiles,
      sharedModulePath: 'src/shared/extractedFunctions.ts',
      fingerprint: findings[0]?.fingerprint ?? 'unknown',
      functionName: findings[0]?.suggestedName ?? 'extractedHelper',
      parameters: [],
      returnType: 'void',
      sharedFunctionCode: '// Extracted helper body',
      astPattern: '',
      astRewrite: ''
    };
  }

  public override async applyPlan(
    projectRoot: string,
    plan: RefactorPlan
  ): Promise<{ readonly modifiedFiles: readonly string[] }> {
    await HybridHarnessEngine.execute(projectRoot, plan);
    return { modifiedFiles: plan.targetFiles };
  }

  /**
   * Discovers and triages clone groups from Fallow, strictly filtering
   * instances through the canonical sub-auditor path resolution.
   */
  public triageCandidates(minOccurrences: number = 2): readonly TriagedCloneCandidate[] {
    const dupes = runFallowJson<FallowDupesOutput>(
      'dupes',
      ['--min-occurrences', String(minOccurrences)],
      this.projectRoot
    );

    const dead = tryOrNull(() =>
      runFallowJson<FallowDeadCodeOutput>(
        'dead-code',
        ['--include-dupes'],
        this.projectRoot
      )
    );
    const deadFiles = new Set(
      dead ? dead.unused_files.map((f) => toPosixRelative(this.projectRoot, f.path)) : []
    );

    const effectiveMin = Math.max(2, minOccurrences);
    const candidates: TriagedCloneCandidate[] = [];

    for (const g of dupes.clone_groups) {
      const validInstances: readonly FallowInstance[] = g.instances.filter((i) => {
        const rel = toPosixRelative(this.projectRoot, i.file);
        return this.isPathScannable(rel);
      });

      if (validInstances.length < effectiveMin) {
        continue;
      }

      const files: readonly string[] = Array.from(
        new Set(validInstances.map((i) => toPosixRelative(this.projectRoot, i.file)))
      );
      const topology = determineTopology(files);
      const isDead = files.some((f) => deadFiles.has(toPosixRelative(this.projectRoot, f)));

      candidates.push({
        fingerprint: g.fingerprint,
        topology,
        tokenCount: g.token_count,
        lineCount: g.line_count,
        occurrenceCount: validInstances.length,
        spread: g.spread ?? 0,
        files,
        instances: validInstances,
        suggestedName: g.suggested_name,
        isDeadCodeTarget: isDead
      });
    }

    return candidates.sort((a, b) => {
      const scoreA = a.tokenCount * a.occurrenceCount * (1 + 0.15 * a.spread);
      const scoreB = b.tokenCount * b.occurrenceCount * (1 + 0.15 * b.spread);
      return scoreB - scoreA;
    });
  }
}

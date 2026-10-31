/**
 * src/core/refactor/baseRefactorEngine.ts
 *
 * CANONICAL BASE REFACTOR ENGINE (Node.js 26+ Native)
 * Enforces pure configuration-driven resolution and strict sub-auditor inheritance
 * across all refactoring CLI tools (auditor-magic, auditor-domain, auditor-motion, auditor-o1, auditor-types, auditor-dupes).
 *
 * Mandate: Every refactoring engine constructor requires a canonical sub-auditor instance.
 * File discovery, roots, allowed extensions, and exclusions are delegated 100% to the sub-auditor,
 * guaranteeing absolute 1:1 parity between audit findings and refactoring tool targets.
 */

import path from 'node:path';

import { getAuditConfig } from '../auditConfig.ts';
import type { AuditEngineConfig } from '../auditConfigTypes.ts';
import { BaseAuditor } from '../auditorBase.ts';
import { isTestPath } from '../auditTestPredicates.ts';
import { isPathExempt } from '../reportUtils.ts';
import { isPathContained, stripGlobSuffix } from '../safePath.ts';

export interface ScannedFileFindings<TFinding> {
  readonly file: string;
  readonly fullPath: string;
  readonly findings: readonly TFinding[];
}

export interface RefactorEngineOptions<TAuditor extends BaseAuditor = BaseAuditor> {
  readonly auditor?: TAuditor;
  readonly projectRoot?: string;
}

export function assertValidRefactorEngineOptions<TAuditor extends BaseAuditor = BaseAuditor>(
  options?: RefactorEngineOptions<TAuditor>
): RefactorEngineOptions<TAuditor> {
  const isString = typeof options === 'string';
  if (isString) {
    throw new Error(
      `[BaseRefactorEngine Contract Violation]: Positional string shortcuts are strictly prohibited. Pass an options object: { projectRoot?: string; auditor?: TAuditor }`
    );
  }
  return options ?? {};
}

export interface IRefactorEngine<
  TFinding = unknown,
  TPlan = unknown,
  TAuditor extends BaseAuditor = BaseAuditor
> {
  readonly toolId: string;
  readonly configSectionKey?: keyof AuditEngineConfig;
  readonly projectRoot: string;
  readonly config: AuditEngineConfig;
  readonly allowedExtensions: ReadonlySet<string>;
  getAuditor(): TAuditor;
  resolveTargetRoots(): readonly string[];
  shouldIncludeTests(): boolean;
  shouldIncludeDataPaths(): boolean;
  resolveGlobalIgnorePatterns(): readonly string[];
  resolveSectionIgnorePatterns(): readonly string[];
  resolveCombinedIgnorePatterns(): readonly string[];
  resolveSectionExemptPaths(): readonly string[];
  isToolEnabled(): boolean;
  getScannableFiles(): readonly string[];
  isPathScannable(relPath: string): boolean;
  discoverInFile(filePath: string): readonly TFinding[];
  discoverAll(): readonly ScannedFileFindings<TFinding>[];
  createPlan(id: string, findings: readonly TFinding[]): TPlan;
  applyPlan(
    projectRoot: string,
    plan: TPlan
  ):
    | Promise<{ readonly modifiedFiles: readonly string[] }>
    | { readonly modifiedFiles: readonly string[] };
}

export abstract class BaseRefactorEngine<
  TFinding = unknown,
  TPlan = unknown,
  TAuditor extends BaseAuditor = BaseAuditor
> implements IRefactorEngine<TFinding, TPlan, TAuditor> {
  protected readonly auditor: TAuditor;

  /**
   * Unique identifier of this refactoring tool (e.g. 'auditor-magic', 'auditor-domain').
   */
  public abstract readonly toolId: string;

  /**
   * Configuration section key in AuditEngineConfig (e.g. 'constants', 'domain', 'animation').
   */
  public abstract readonly configSectionKey?: keyof AuditEngineConfig;

  public constructor(auditor: TAuditor) {
    if (!auditor) {
      throw new Error(
        '[BaseRefactorEngine]: Constructor requires a canonical sub-auditor instance.'
      );
    }
    this.auditor = auditor;
  }

  public get projectRoot(): string {
    return this.auditor.projectRoot;
  }

  public get config(): AuditEngineConfig {
    return getAuditConfig(this.projectRoot);
  }

  public get allowedExtensions(): ReadonlySet<string> {
    return this.auditor.allowedExtensions;
  }

  public getAuditor(): TAuditor {
    return this.auditor;
  }

  public resolveTargetRoots(): readonly string[] {
    const codeRoots = this.config.paths?.codeRoots;
    if (codeRoots && codeRoots.length > 0) {
      return codeRoots;
    }
    return this.auditor.roots;
  }

  public shouldIncludeTests(): boolean {
    return this.config.paths.includeTestsInCodeAudit === true;
  }

  public shouldIncludeDataPaths(): boolean {
    return true;
  }

  public resolveGlobalIgnorePatterns(): readonly string[] {
    const globs = this.config.paths?.ignoreGlobs ?? [];
    const patterns = this.config.paths?.ignoredPatterns ?? [];
    return Array.from(new Set([...globs, ...patterns]));
  }

  public resolveSectionIgnorePatterns(): readonly string[] {
    return this.auditor.extraIgnorePatterns;
  }

  public resolveCombinedIgnorePatterns(): readonly string[] {
    const combined = [
      ...this.resolveGlobalIgnorePatterns(),
      ...this.resolveSectionIgnorePatterns()
    ];
    return Array.from(new Set(combined));
  }

  public resolveSectionExemptPaths(): readonly string[] {
    return this.auditor.exemptPaths;
  }

  public isToolEnabled(): boolean {
    if (!this.configSectionKey) return true;
    const section = this.config[this.configSectionKey] as Record<string, unknown> | undefined;
    if (!section || typeof section !== 'object') return true;
    return section.enabled !== false;
  }

  private isPathInRoots(relPath: string, roots: readonly string[]): boolean {
    const absPath = path.resolve(this.projectRoot, relPath);
    return roots.some((root) => {
      const cleanRoot = stripGlobSuffix(root);
      const absRoot = path.resolve(this.projectRoot, cleanRoot);
      return isPathContained(absRoot, absPath);
    });
  }

  /**
   * Resolves scannable files strictly delegated to the canonical sub-auditor,
   * enforcing target roots (paths.codeRoots) and data directory exclusions when shouldIncludeDataPaths is false.
   */
  public getScannableFiles(): readonly string[] {
    return this.auditor.getScannableFiles().filter((f) => this.isPathScannable(f));
  }

  /**
   * Checks whether a given project-relative path is scannable by the sub-auditor,
   * enforcing target roots (paths.codeRoots) and data directory exclusions when shouldIncludeDataPaths is false.
   */
  public isPathScannable(relPath: string): boolean {
    if (!this.auditor.isPathScannable(relPath)) {
      return false;
    }
    if (!this.shouldIncludeTests() && isTestPath(relPath, this.projectRoot)) {
      return false;
    }
    const codeRoots = this.resolveTargetRoots();
    if (codeRoots && codeRoots.length > 0 && !this.isPathInRoots(relPath, codeRoots)) {
      return false;
    }
    const combinedIgnores = this.resolveCombinedIgnorePatterns();
    if (combinedIgnores.length > 0 && isPathExempt(relPath, combinedIgnores)) {
      return false;
    }
    const exemptPaths = this.resolveSectionExemptPaths();
    if (exemptPaths.length > 0 && isPathExempt(relPath, exemptPaths)) {
      return false;
    }
    if (!this.shouldIncludeDataPaths()) {
      const dataRoots = this.config.paths.dataRoots ?? [];
      if (dataRoots.length > 0 && this.isPathInRoots(relPath, dataRoots)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Scans an individual file to discover refactoring opportunities.
   */
  public abstract discoverInFile(filePath: string): readonly TFinding[];

  /**
   * Discovers refactoring opportunities across all scannable files in the project.
   */
  public discoverAll(): readonly ScannedFileFindings<TFinding>[] {
    const files = this.getScannableFiles();
    const results: ScannedFileFindings<TFinding>[] = [];

    for (const relFile of files) {
      const fullPath = path.resolve(this.projectRoot, relFile);
      const findings = this.discoverInFile(fullPath);
      if (findings.length > 0) {
        results.push({
          file: relFile,
          fullPath,
          findings
        });
      }
    }

    return results;
  }

  /**
   * Creates a structured refactor plan for an individual file.
   */
  public abstract createPlan(id: string, findings: readonly TFinding[]): TPlan;

  /**
   * Applies a refactor plan to source code deterministically.
   */
  public abstract applyPlan(
    projectRoot: string,
    plan: TPlan
  ):
    | Promise<{ readonly modifiedFiles: readonly string[] }>
    | { readonly modifiedFiles: readonly string[] };
}
